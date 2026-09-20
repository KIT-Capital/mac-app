# Concepts

**Tier: REFERENCE** · Last verified: 2026-09-20

Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all. Product lifecycle words live in `docs/workflows.md`. Visual chrome lives in `docs/design-system.md`.

## Environment mapping

### APP_ENV
The process label that selects which Neon database this process may talk to. It is not the Railway service name, not the Doppler config name, and not the live-book flag.

A value must match the database URL it is paired with. Changing the label without changing the URL is a mapping failure, not a way to turn fixture behavior on.

### Fixture environment
A process that is allowed to skip live runtime gates so isolation tests can run: local development and GitHub Actions `test:db`. Fixture environments may omit a signed desk session, skip live-unavailability, and accept HTTP localhost magic-link origins.

A fixture environment is not a served Railway runtime. The GitHub Actions mapping must never start the collector or desk app.

### Neon ci
The dedicated Neon branch used only for GitHub Actions database isolation tests. It is a known live branch like development, staging, and production — not a disposable preview and not a restore-drill target.

GitHub Actions injects this branch’s URLs as repo secrets. Development, staging, and production URLs must never appear in that job.

### Live book
The server-backed operations book for collectors and the desk, turned on by the live-book flag. When the flag is off, collection state stays in the browser store. It is not QuickBooks and not the third-party inventory book.

The flag may be turned on inside isolation tests on a fixture environment. The GitHub Actions database job itself leaves the flag off.

## Flagged ambiguities

- "development" had been used for both the Neon development mapping and "this process is a fixture." Fixture environments are development and ci.
