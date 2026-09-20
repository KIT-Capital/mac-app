---
title: Extracted async helper cannot setState from useEffect
date: 2026-09-20
category: build-errors
module: agreements
problem_type: build_error
component: development_workflow
symptoms:
  - "GitHub Actions npm run lint failed with react-hooks/set-state-in-effect at loadDocuments() on the extract commit"
  - "First PR commit with inline fetch plus .then(setState) stayed lint-clean"
root_cause: wrong_api
resolution_type: code_fix
severity: medium
related_components:
  - tooling
tags:
  - eslint
  - react-hooks
  - set-state-in-effect
  - useeffect
  - agreements
  - ci
  - quality
---

# Extracted async helper cannot setState from useEffect

**Tier: REFERENCE** · Last verified: 2026-09-20

## Problem

[PR #65](https://github.com/KIT-Capital/mac-app/pull/65) extracted a shared `loadDocuments()` helper so Sign could re-read the stored proposal hash. Calling that helper from `useEffect` failed `npm run lint` with `react-hooks/set-state-in-effect`, even though `setState` sat after `await fetch`. Quality stayed red until fetch wrote no React state and the effect applied state in `.then()`.

## Symptoms

- After the extract, GitHub Actions `quality` failed on `npm run lint` with `react-hooks/set-state-in-effect` pointing at `loadDocuments()` on that commit.
- The first PR #65 commit used inline `fetch` plus `.then(setState)` in the effect and stayed lint-clean.

## What Didn't Work

- **One stateful helper for mount and Sign.** Re-fetching before Sign was the right product fix, but the helper wrote `setBookMode` / `setDocuments` / `setThreadEvents`. Invoking it from the effect body tripped the rule.
- **Leaving `setState` after `await fetch` inside that helper.** ESLint follows the call from the effect body. An `await` inside the helper does not take the writes outside the effect.
- **Copying `queueMicrotask` from `WatchPhoto`.** That deferral is only for the cached-sync path (`components/watch-photo.tsx:69-71`). It is not the model for an async document fetch.

## Solution

[PR #65](https://github.com/KIT-Capital/mac-app/pull/65) split fetch from React state.

**Fetch lives outside the component and writes no React state.** `fetchAgreementDocuments(agreementId)` returns `{ mode, documents, events }` (`app/agreements/[id]/page.tsx:42-69`). Password rotation still redirects with `window.location.replace` (`app/agreements/[id]/page.tsx:53-55`); that is not React state.

**Mount applies state in `.then()`, the same pattern that passed on the first commit.** The effect depends on `[agreement]`, calls the pure fetch, then writes state only inside the promise callbacks (`app/agreements/[id]/page.tsx:156-175`):

```156:175:app/agreements/[id]/page.tsx
  useEffect(() => {
    if (!agreement) return;
    let cancelled = false;
    fetchAgreementDocuments(agreement.id)
      .then((loaded) => {
        if (cancelled) return;
        setBookMode(loaded.mode);
        setDocuments(loaded.documents);
        if (loaded.mode === "live") setThreadEvents(loaded.events);
      })
      .catch(() => {
        if (!cancelled) {
          setBookMode("browser");
          setDocuments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agreement]);
```

**Sign still re-reads, then applies, on the click path.** `applyDocuments` writes the three setters (`app/agreements/[id]/page.tsx:143-147`). `loadDocuments` awaits the pure fetch, then applies (`app/agreements/[id]/page.tsx:149-154`). `onSign` awaits that reload before choosing a hash (`app/agreements/[id]/page.tsx:366-372`).

**Live Sign waits for a stored 64-hex `snapshotHash`.** After the re-fetch, Sign takes the listed row's hash only when it matches `/^[0-9a-f]{64}$/i` (`app/agreements/[id]/page.tsx:374-378`). In live mode with no such hash, it stops and tells the collector the agreement is still preparing (`app/agreements/[id]/page.tsx:381-384`). `hashSnapshot` runs only when the book is not live and no valid 64-hex stored hash exists (`app/agreements/[id]/page.tsx:386-390`). A present stored hash is used as-is.

Verified on the lint-fix commit of PR #65: quality, database, kit-guard, and CodeQL were green. PR #65 squash-merged.

## Why This Works

`react-hooks/set-state-in-effect` treats a helper invoked from the effect body as part of the effect, including `setState` after an `await` inside that helper. The first-commit pattern already passed: call fetch from the effect, apply `setState` in `.then()`. Restoring that for mount, and keeping `loadDocuments` / `applyDocuments` on the click path only, satisfies the rule while Sign still re-reads the stored proposal.

`WatchPhoto` uses `queueMicrotask` solely when a cached preview is already in memory and would otherwise `setState` synchronously in the effect (`components/watch-photo.tsx:64-75`). Its async miss already uses `.then(setRequest)` (`components/watch-photo.tsx:77-88`). Document loading is always async HTTP, so the photo cache deferral is the wrong copy target.

## Prevention

- **Keep fetch pure.** New agreement-document (or similar) loaders should live outside the component, return data, and write no React state. Follow `fetchAgreementDocuments` (`app/agreements/[id]/page.tsx:42-69`).
- **Apply state in `.then()` from `useEffect`.** Reuse the pattern already on this page (`app/agreements/[id]/page.tsx:156-175`). Do not call a setState helper from the effect body.
- **Keep `loadDocuments` / `applyDocuments` on the click path.** Those writers are for Sign (`app/agreements/[id]/page.tsx:143-154`, `app/agreements/[id]/page.tsx:366`). The effect must not invoke them.
- **Do not copy `queueMicrotask` from `WatchPhoto` for async fetch.** That call is only the cached-sync path (`components/watch-photo.tsx:69-71`).
- **Keep live Sign bound to the stored 64-hex hash.** Do not restore a client `hashSnapshot` fallback for `mode === "live"` when the listed row has no `snapshotHash` (`app/agreements/[id]/page.tsx:376-384`).

## Related Issues

- [PR #65](https://github.com/KIT-Capital/mac-app/pull/65) — U6 collector request UI; Greptile P1 on client-built snapshot hash; lint-fix restored pure fetch plus `.then(setState)`.
