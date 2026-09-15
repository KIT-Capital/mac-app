# Claude Code setup on Windows

**Tier: REFERENCE** · Last verified: 2026-07-31

This is the simple Windows path.

## 1. Make sure Claude Code works

Run:

```powershell
claude /doctor
```

## 2. Create the local Claude folders

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.claude" | Out-Null
New-Item -ItemType Directory -Force -Path "$HOME\.claude\skills" | Out-Null
```

## 3. Copy Norfolk starter files into place

From the root of this repo run:

```powershell
Copy-Item ".\claude-code\settings.template.json" "$HOME\.claude\settings.json" -Force
Copy-Item ".\claude-code\skills\*" "$HOME\.claude\skills" -Recurse -Force
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

Most problems come from:

- files not copied into `$HOME\.claude`
- Claude Code not restarted after copying files
- missing plugin refresh or auth
