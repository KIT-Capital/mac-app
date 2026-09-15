# Agent identity and naming

**Tier: CONTRACT** · Last verified: 2026-09-13

This contract applies the persona-first pattern used in H-Analytics without
copying its implementation, customer data, palette or access policy. It extends
the existing [naming decision](https://github.com/Norfolk-Group/norfolk-kit/blob/main/docs/decisions/0012-naming-agents-orchestrators-specialists-minions.md).
AGENTS.md remains the agent rule entry point.

## Names people can recognize

- Persistent agents have human first names. Systems and infrastructure have
  descriptive thing names. A model/provider name is neither an agent identity
  nor a permanent role.
- New Norfolk agent names use Italian first names under decision 0012 unless an
  explicit approved exception applies. Preserve approved existing names, including other languages and accents;
  this is not permission to rename agents in adopted applications.
- Lead with the human name; show the role second: `Gustavo · Analyst`,
  `Rebecca · AI Co-Pilot`. Do not present a technical slug as the normal label.
- An orchestrator owns the outcome and delegates; a specialist has a narrow
  responsibility. A team groups agents; a swarm describes collective work.
  Ephemeral minions are never surfaced; they stay implementation details.
  Existing internal names may remain for compatibility. Changing this boundary
  requires an explicit approved exception or superseding decision.
- Check the project registry before assigning a name. Reuse an established
  persona only for the same responsibility; avoid ambiguous duplicates in the
  same product. A name never grants permission or proves a real human acted.

## One registry, one resolver

Use one project identity catalog with stable IDs, approved display names, roles,
visibility and ownership. Kit's existing seed is `src/lib/agent-taxonomy.ts`;
select it only when needed, not as a mandatory fleet of agents for every app.
Do not create parallel hardcoded name maps in screens, prompts or exporters.

Where administrator naming overrides are supported, a shared resolver chooses:

1. Authorized, non-empty administrator display-name override.
2. Catalog human name.
3. Catalog role/display label.
4. Short technical name.
5. Stable ID only as a diagnostic fallback, never a blank or broken label.

Apply the same resolver to headings, navigation, status messages, mentions,
notifications and report/export attribution wherever those surfaces expose an
agent. Keep the stable ID in structured audit records alongside the display
name. Validate overrides for length and control characters, escape output, and
invalidate cached labels after a successful change. Do not interpolate a name
as executable markup or instructions. Approved pronouns are catalog data;
never infer them from a name.

## Visibility and compatibility

Each project declares which identities are customer-facing versus admin-only.
H-Analytics' admin-only specialists are an example, not a rule that makes every
Norfolk agent admin-only. Enforce that boundary in the shared authorized API as
well as the UI; hiding a label is not authorization. Do not expose hidden agents
through exports, notifications or diagnostic fallbacks.

Renaming a display label must not change database keys, API IDs, permissions,
job routing, saved references or historical attribution. Changing identity or
role is a separate reviewed migration. Use existing theme and accessibility
tokens for avatars and role badges; names do not introduce another palette.

## Acceptance evidence

For projects implementing named agents, test the fallback order, blank/unknown
values, Unicode names, escaped untrusted labels, authorized override propagation,
stable IDs after rename, visibility restrictions, and consistent UI/export labels.
Record exceptions explicitly. This contract alone does not implement a resolver
or add agents to an existing application.
