# 0001 — Preserve the Mechanical Art Capital stack during Kit equip

Date: 2026-09-14
Status: Accepted

## Decision

Phase 1 Norfolk Kit equip adds client-safe tooling, editor config, and project-owned docs. It does not replace Next.js, custom auth, `localStorage`, Railway, Resend, MAC branding, or the Limus design reference.

## Why

Kit’s reference app is Vite/Express/tRPC/WorkOS/Neon. MAC is a shipped Next.js prototype. The owners guide says preserve an existing framework until migration is approved.

## What this rules out

- Copying Kit `src/**`, brand trees, or Kit `design-system.md` as this app’s contract.
- Overwriting `CLAUDE.md`, `.env.example`, `docs/design-reference.md`, `docs/hosting.md`, or Railway config.
- Claiming `product-os.lock.json` as signed or adopted (it stays `proposed`).
- Changing desk credentials or `DESK_SESSION_SECRET` behavior in the equip PR.

## Reversal conditions

A later approved project that explicitly migrates auth, data, or framework.
