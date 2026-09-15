# Product OS adoption

**Tier: CONTRACT** · Last verified: 2026-08-16

Kit is the executable reference for the proposed private Product OS `0.3.0-candidate.1`; the lock remains `proposed` until U11 validates and a trusted release environment publishes the candidate. Product OS owns reusable WHAT/WHY. Kit implements HOW and cannot amend doctrine.

The adopter fetches a pinned private release, verifies trusted signature and every hash, checks the compatibility matrix and repository-specific payload, then plans a deterministic `adoption/product-os-<version>` branch. Local edits become conflicts. Unknown organizations receive only `client-safe` tooling. Deletions are emitted as separate unexecuted proposals. A repository-scoped short-lived identity and release-environment approval are mandatory before any write or PR.

Normal rollback covers code/configuration only in the declared expand-and-contract window. Irreversible data work needs a separate approved recovery plan. Current Kit candidate exceptions: none.

## File ownership before any adoption write

Inventory the target before changing files. A file absent from the installed
manifest is FOREIGN whenever it already exists, including when its bytes equal
the incoming file. `planFile()` returns `foreign`, never `add` or `unchanged`,
for that case. Only absent files may be added; unchanged managed files may be
updated; edited or missing managed files remain conflicts.

Manifest generation requires a reviewed explicit `--files` list. The former
`--discover` option fails before reading or writing target files because matching
a sensitivity marker is not proof of Kit ownership. Stop on unresolved managed
edits rather than rehashing them into a new baseline. Hashing is byte evidence,
not trusted release verification or permission to overwrite a local file.

The fixture tests exercise the actual planner, read-only assessment command and
Git restoration of synthetic changes. They do not certify a production adopter,
signed release, service provisioning or editor/plugin activation.

## Existing report-output adoption

Financial reports and exports are adopted as an expand-and-contract migration,
not a stylesheet replacement. Kit first inventories every report surface,
format, renderer, font source, theme, stable download URL, storage key, and
known SDK/plugin limit. It then captures the currently approved artifacts and
semantic fixtures before proposing any write.

Each existing surface receives one disposition from
`planReportOutputSurface()`:

- `compliant` — already on the target profile;
- `parallel-adoption` — generate the Norfolk profile beside the approved legacy
  artifact, preserving its URL and code until semantic and visual approval;
- `conflict` — a locally edited Kit-managed surface needs human reconciliation;
- `inventory-required` or `blocked` — renderer facts are absent or insufficient;
- `exception` — retain a specifically approved legacy or regulatory form with
  a recorded reason and review condition; or
- `adopt` — no approved legacy artifact exists, but cutover still requires
  approval.

The adoption branch does not overwrite shared application theme tokens, replace
existing report routes, delete renderers, or mutate canonical financial math.
New output tokens are namespaced, and the target renderer is capability-checked
before side-by-side generation. Cutover happens one surface at a time only after
the old and new artifacts pass the same semantic fixture, layout probe, and
human visual review. The former surface remains the rollback target until the
declared window closes; deletion is a separate proposal.

Products with multiple theme implementations first replace interpretation by
color name, rank, or description prefix with a stable screen-theme ID to
report-theme ID registry. Existing screen themes remain untouched. The registry
may initially map every financial-statement family to the conservative Kit
default; branded mappings are added only after their format-specific fixtures
pass. Parallel renderers keep their current URLs and storage keys until the
registry, font embedding, and visual baselines are verified together.

`preflightReportOutputAdoption()` fails closed unless the inventory, approved
visual baselines, semantic fixtures, renderer capabilities, adoption branch, and
surface-level rollback are all present. This is how Kit is imposed on an
existing product without pretending that consistency justifies breakage.
