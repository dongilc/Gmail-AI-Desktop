# Gmail Desktop v2 - Migration & Setup Notes

This note helps you move the project to another PC and continue working without losing context.

## 1) What to copy
- Copy the entire project folder.
- You do **not** need to copy `node_modules/`.
- If you want to preserve login sessions, copy `tokens/` (but treat as sensitive).
- If you want a clean login on the new PC, delete/skip `tokens/`.

## 2) Prerequisites on the new PC
- Install Node.js (recommended 18+).
- Ensure `npm` is available in PATH.

## 3) First-time setup on new PC
```powershell
npm install
```

## 4) Run (dev)
```powershell
npm run electron:dev
```

If PowerShell cannot find `npm`, use:
```powershell
$env:PATH="C:\Program Files\nodejs;" + $env:PATH
& "C:\Program Files\nodejs\npm.cmd" run electron:dev
```

## 5) Common issue: app window not opening
Cause: `ELECTRON_RUN_AS_NODE=1` environment variable.

Fix:
```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Then run again:
```powershell
$env:PATH="C:\Program Files\nodejs;" + $env:PATH
$env:VITE_DEV_SERVER_URL="http://localhost:5174"
.\node_modules\.bin\electron .
```

## 6) Build (installer + portable)
Configured in `package.json`:
- Windows target: `nsis` + `portable`

Build command:
```powershell
npm run build
```

Output:
- Installer: `release\Gmail Desktop Setup *.exe`
- Portable: `release\Gmail Desktop *.exe`

## 7) Git versioning
Local git repo initialized.
- Tag `v1` exists.
- Current working branch: `v2`

Basic commands:
```powershell
git status -sb
git log --oneline --decorate -5
```

## 8) Feature summary (current state)
- Email list: summary card UI (2~3 lines) with action chips.
- Actions: keyword-based extraction (submit/meeting/payment/reservation/review/approval/survey).
- Summary toggle: Settings > General > "요약 카드 표시".
- Action chips: "+할일" works, "+일정" opens a dialog and creates calendar event.
- Email list wrapping improved for dynamic width.
- Calendar: day/week/month views + month popup + tasks display.
- Todo list: sorting controls (created/due + asc/desc).
- Email view: print/PDF buttons + action buttons near reply row.
- Multi-select email: bulk read/unread/trash via right-click menu.

## 9) Files added/changed recently (v2)
- `src/components/EmailList.tsx` (summary/actions UI, event dialog)
- `src/components/SettingsDialog.tsx` (General tab + summary toggle)
- `src/stores/preferences.ts` (new preference store)
- `src/types/index.ts` (EmailSummary / EmailAction types)
- `src/index.css` (summary clamp + wrap)

## 10) Security/credentials notes
- `tokens/` contains OAuth tokens. Treat as sensitive.
- `ref_google_calendar_widget/credentials.json` exists (also sensitive).

## 11) Optional: quick sanity checks
1) Open Settings -> General -> toggle summary
2) In email list, action chips appear (submit/meeting/payment etc.)
3) Click "일정" in a chip -> dialog -> create event
4) Calendar should show created event

---

## 12) Handoff prompt (for future Codex sessions)
Copy/paste this block when you start a new session on another PC:

```
Project: Gmail Desktop (Electron + React + TS)
Repo path: C:\Users\<user>\Downloads\Gmail_AI_Desktop
Branch: v2
Version tag: v1 (base snapshot)

Current focus:
- v2 UI features for AI assistant (summary card UI + action chips).
- Action chips from keywords, summary toggle, +calendar event flow.

Recent changes (important):
- Email list now shows summary snippet + action chips.
- Action keyword types: submit/meeting/payment/reservation/review/approval/survey.
- Settings dialog: "General" tab has summary on/off toggle.
- Action chip "일정" opens dialog and creates a Calendar event.
- Email list wrapping improved for variable width.
- Todo list sorting (created/due + asc/desc).

Key files touched:
- src/components/EmailList.tsx
- src/components/SettingsDialog.tsx
- src/stores/preferences.ts
- src/types/index.ts
- src/index.css

Known setup issue:
- If app window doesn't show, check env var:
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue

Run dev:
- npm install
- npm run electron:dev

If npm not found:
$env:PATH="C:\Program Files\nodejs;" + $env:PATH
& "C:\Program Files\nodejs\npm.cmd" run electron:dev

Immediate next steps:
1) Improve action keywords/labels (more categories + better matching).
2) Add summary on/off toggle persistence (already in preferences store).
3) Hook action chip +event into better event time extraction.
4) Add “summary card display” toggle in Settings (already added).
5) Plan AI server integration later (C-architecture).
```
