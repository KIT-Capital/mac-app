# Letting a Codespace read the kit

**Tier: REFERENCE** · Last verified: 2026-07-31

## The problem this solves

A Codespace gets an automatic token, but it is scoped to **its own repository only**. So a Codespace opened on any repo cannot read `Norfolk-Group/norfolk-kit`, and equip fails its pre-flight with "cannot see the kit."

The workaround is signing in by hand (`unset GITHUB_TOKEN` then `gh auth login`) on **every new Codespace**. This page removes that.

## What does NOT work — checked, so nobody tries it again

`devcontainer.json` has a `customizations.codespaces.repositories` block that looks like it grants access to other repos. **It cannot cross organizations.** GitHub's docs: you may only reference repositories belonging to the same account or organization as the repo you are working in. A Codespace in `KIT-Capital` can never reach `Norfolk-Group/norfolk-kit` this way — and it fails *silently*, with no error, just no access.

Source: [Managing access to other repositories within your codespace](https://docs.github.com/en/codespaces/managing-your-codespaces/managing-repository-access-for-your-codespaces)

## What we use: a classic token as a Codespaces secret

Ricardo's decision, 2026-07-31: a **classic** personal access token covering the whole account.

Why classic rather than fine-grained, on the evidence:

| | Classic | Fine-grained |
|---|---|---|
| Org approval queue | **Not subject to it** | Owner must approve; only a *daily digest* email announces the request — easy to miss, and the token silently fails until approved |
| Blocked by org PAT policy | No | Yes, if the org restricts fine-grained tokens |
| Scope | Whole account | Can be one repo, read-only |

The fine-grained token is tighter but has two silent-failure modes. For an account with one human, the classic token's reliability wins.

### Steps

1. **Mint the token** — github.com → profile photo → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token. Scope: `repo`. Copy it.
2. **Install it in Norfolk-Group** — `https://github.com/organizations/Norfolk-Group/settings/secrets/codespaces` → **New secret**. Name it `GH_TOKEN`. Paste the value. Repository access: all repositories.
3. **Install it on the personal account** — Settings → Codespaces → Codespaces secrets → New secret. Same name, same value.
4. **KIT-Capital** — same path under that org, *only if* you accept the tripwire below.

`GH_TOKEN` is the name the GitHub CLI reads automatically, so `gh` and `git` both work with no further setup. Nothing needs configuring inside the Codespace.

### Verifying it worked

In a fresh Codespace:

```bash
gh repo view Norfolk-Group/norfolk-kit --json name
```

Returns the repo name → done. Errors → the secret is missing from *that* org, or not scoped to that repo.

## ⚠️ The tripwire — read before adding a person to any repo

An organization Codespaces secret is readable by **anyone who opens a Codespace on a repo it is scoped to**. A whole-account classic token in the `KIT-Capital` org therefore grants any KIT Capital collaborator read access to **every Norfolk repository**.

Today Ricardo is the only person in these orgs, so this is safe.

**Before adding any client, contractor, or collaborator to a KIT-Capital repo, remove that secret.** This is the one failure that would defeat the entire boundary architecture — `kit-guard` stops files crossing between repos, but it cannot stop a token handing someone the keys directly.

## Renewal

Classic tokens expire. When one does, everything fails at once with an auth error and no advance warning. Re-mint and update the secret in each place it was installed.
