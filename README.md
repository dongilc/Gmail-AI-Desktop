# Gmail AI Desktop

A feature-rich Gmail desktop client built with Electron, React, and TypeScript. Manage multiple Gmail accounts, get AI-powered email summaries, and integrate calendar and tasks in one app.

## Features

### Core
- **Multi-Account Gmail** - Manage up to 4 Gmail accounts with OAuth2 authentication
- **Email Compose & Reply** - Full compose, reply, reply-all, forward with BCC support
- **Draft Auto-Save** - Automatic draft saving with proper MIME/base64 encoding
- **Email Search** - Search emails across your mailbox
- **Email Print / PDF Export** - Print or save emails as PDF
- **Dark / Light Mode** - Full theme support with improved light theme contrast
- **Auto Refresh** - Configurable periodic email sync (1/3/5/10/15/30 min intervals)

### AI Features (Ollama)
- **AI Email Summary** - Summarize emails using a local LLM (right-click context menu)
- **AI Mail Recommendations** - AI prioritizes unread emails that need your attention
- **AI Calendar Extraction** - Automatically parse event details from emails
- **AI Weather & News Briefing** - Local LLM-powered daily information panel
- **AI Chat & Translation** - Built-in AI assistant with translation support

### Document Preview
- **PDF Preview** - HiDPI-aware rendering for sharp display on high-resolution screens
- **HWP/HWPX Preview** - Korean Hangul document preview via native Rust parser (@ohah/hwpjs)
- **HTML Attachment Preview** - Preview HTML file attachments inline
- **Office Document Preview** - Preview Word, Excel, PowerPoint files via LibreOffice

### Productivity
- **Calendar** - Day/week/month views, create and edit events, synced with Google Calendar
- **Tasks / Todo** - Sortable task list with quick-add from emails
- **Contact Autocomplete** - Auto-collected contacts with name/email search in compose
- **Action Chips** - Detects actionable keywords (submit, meeting, payment, reservation, review, approval, survey)

## Prerequisites

### Required

| Requirement | Details |
|---|---|
| **Node.js** | v18 or higher ([download](https://nodejs.org/)) |
| **Google OAuth Credentials** | `credentials.json` from Google Cloud Console (see [setup guide](#google-oauth-setup) below) |

### Optional (for AI features)

| Requirement | Details |
|---|---|
| **Ollama** | Local LLM server for AI features ([download](https://ollama.ai/)). Default URL: `http://localhost:11434` |
| **LLM Model** | After installing Ollama, pull a model: `ollama pull llama3.1:8b` |

### Optional (for Office document preview)

| Requirement | Details |
|---|---|
| **LibreOffice** | For previewing Word/Excel/PowerPoint attachments ([download](https://www.libreoffice.org/)) |

## Google OAuth Setup

To use this app, you need to create your own Google Cloud project and OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the following APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google Tasks API**
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth client ID**
6. Select **Desktop app** as the application type
7. Download the credentials JSON file
8. Rename it to `credentials.json` and place it in:
   ```
   <project-root>/oauth/credentials.json
   ```
9. Go to **APIs & Services > OAuth consent screen**
10. Add your Gmail addresses as **Test users** (required while the app is in "Testing" status)

> **Note:** The app requests the following scopes:
> `gmail.readonly`, `gmail.send`, `gmail.modify`, `calendar`, `tasks`, `userinfo.email`, `userinfo.profile`

## Installation

### From Source

```bash
# Clone the repository
git clone https://github.com/dongilc/Gmail-AI-Desktop.git
cd Gmail-AI-Desktop

# Install dependencies
npm install

# Place your credentials.json (see Google OAuth Setup above)
mkdir -p oauth
cp /path/to/your/credentials.json oauth/credentials.json
```

### From Release

1. Download from the [Releases](https://github.com/dongilc/Gmail-AI-Desktop/releases) page
2. Extract the zip file
3. Place your `credentials.json` in the `resources/oauth/` folder next to the exe
4. Run `Gmail Desktop.exe`

## Running (Development)

```bash
npm run dev
```

This starts the Vite dev server and launches the Electron app with hot reload.

### Troubleshooting

If the Electron window doesn't appear, try:

```powershell
# PowerShell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
npm run dev
```

## Building

```bash
npm run build
```

Output will be in the `release/` folder:
- `release/win-unpacked/` - Portable Windows app

## Configuration

### Ollama (AI Server)

AI features can be configured in **Settings > AI** within the app:

| Setting | Default | Description |
|---|---|---|
| Server URL | `http://localhost:11434` | Ollama server URL |
| Model | `llama3.1:8b` | LLM model name |
| Temperature | `0.2` | Generation temperature |
| Max Tokens | `1024` | Max tokens per response |

### Auto Refresh

Configure in **Settings > General**:
- Enable/disable periodic auto-refresh
- Set interval: 1, 3, 5, 10, 15, or 30 minutes

### AI Features Overview

| Feature | Trigger | Description |
|---|---|---|
| Email Summary | Right-click > "AI요약 생성" | Summarizes the selected email |
| Mail Recommendations | Header AI panel | AI picks top 5 important unread emails |
| Calendar Extraction | Right-click > "AI 캘린더 추가" | Parses date/time/location from email |
| Weather Briefing | AI Assistant panel | Local weather via Open-Meteo API + LLM |
| News Briefing | AI Assistant panel | Google News RSS + LLM summary |

## Project Structure

```
Gmail-AI-Desktop/
├── electron/                  # Electron main process
│   ├── main.ts                # IPC handlers, AI integration, sync logic
│   ├── preload.ts             # Context bridge (IPC to renderer)
│   ├── google-auth.ts         # OAuth2 flow and token management
│   └── services/
│       ├── gmail-service.ts   # Gmail API wrapper (MIME, draft, send)
│       ├── calendar-service.ts# Google Calendar API
│       ├── tasks-service.ts   # Google Tasks API
│       └── cache-service.ts   # Local email cache (electron-store)
├── src/                       # React frontend
│   ├── components/            # UI components
│   │   ├── Dashboard.tsx      # Main layout
│   │   ├── EmailList.tsx      # Email list with action chips
│   │   ├── EmailView.tsx      # Email detail, compose, attachment preview
│   │   ├── EmailCompose.tsx   # New email composition
│   │   ├── ContactInput.tsx   # Contact autocomplete input
│   │   ├── ContactsDialog.tsx # Contacts management dialog
│   │   ├── Calendar.tsx       # Calendar views
│   │   ├── TodoList.tsx       # Task management
│   │   ├── PdfViewer.tsx      # HiDPI PDF renderer
│   │   ├── SearchBar.tsx      # Email search
│   │   ├── SettingsDialog.tsx  # Settings UI
│   │   ├── AIAssistantPanel.tsx    # AI chat/briefing/translate
│   │   ├── AIMailRecommendations.tsx # AI email suggestions
│   │   └── ui/               # Reusable UI primitives (Radix-based)
│   ├── stores/                # Zustand state management
│   │   ├── emails.ts          # Email state with race condition guards
│   │   ├── accounts.ts        # Multi-account management
│   │   ├── contacts.ts        # Auto-collected contacts (localStorage)
│   │   ├── preferences.ts     # App settings (persist)
│   │   └── ...
│   ├── hooks/
│   │   └── useAutoRefresh.ts  # Periodic auto-refresh hook
│   ├── types/                 # TypeScript type definitions
│   └── lib/                   # Utility functions
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.cjs
```

## Tech Stack

- **Desktop:** Electron 28
- **Frontend:** React 18, TypeScript, Vite
- **Styling:** TailwindCSS, Radix UI
- **State:** Zustand (with localStorage persistence)
- **APIs:** Google APIs (Gmail, Calendar, Tasks), Ollama, Open-Meteo
- **Document:** @ohah/hwpjs (HWP), @ssabrojs/hwpxjs (HWPX), pdf.js
- **Storage:** electron-store

## License

This project is for personal use. See the repository for details.
