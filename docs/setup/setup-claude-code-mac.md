# Claude Code setup on Mac

**Tier: REFERENCE** · Last verified: 2026-07-31

This is the simple Mac path.

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

From the root of this repo run:

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

## 5. If something is broken

Run:

```text
/doctor
/plugins
/nai-update
```
