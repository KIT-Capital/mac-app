# Claude Code setup on Replit

**Tier: REFERENCE** · Last verified: 2026-07-31

Replit can reset or lose local Claude files, so keep setup lightweight and easy to restore.

## 1. Make sure Claude Code works

Run:

```bash
claude /doctor
```

## 2. Create the local Claude folders

```bash
mkdir -p ~/.claude
mkdir -p ~/.claude/skills
```

## 3. Copy Norfolk starter files into place

From the repo root run:

```bash
cp ./claude-code/settings.template.json ~/.claude/settings.json
cp -R ./claude-code/skills/* ~/.claude/skills/
```

## 4. Restart Claude Code

Then test:

```text
/nai-help
/nai-update
/nai-feature
```

## 5. Replit warning

Replit environments can lose local setup state.

That means you should keep the source-of-truth files in the repo and copy them back into `~/.claude` when needed.
