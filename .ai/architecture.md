# Offorest Architecture

## Main Folder Structure
```text
.
|- main.js                    # Electron main process
|- preload.cjs                # Electron preload bridge (window.offorest*)
|- src/
|  |- App.jsx                 # Router + auth-aware page switching
|  |- main.jsx                # React bootstrap + prompt hydration + log hook
|  |- components/             # Shared UI components (Navbar, ProtectedRoute)
|  |- config/                 # App modes, nav config, permissions
|  |- contexts/               # React contexts (Auth)
|  |- hooks/                  # Reusable hooks (sheet auto-refresh)
|  |- layouts/                # Shared layout wrappers
|  |- modals/                 # Modal UI and editing flows
|  |- pages/                  # Feature pages by product/workflow
|  |- prompt/                 # Prompt sources and prompt override service
|  |- services/               # API services, Gemini, Drive, mockup, auth
|- public/                    # Static assets (logo)
|- app-dist/                  # Vite output for packaged app
|- release/                   # Electron build artifacts
```

## Role of Key Layers
- Electron main process (`main.js`):
  - creates BrowserWindow
  - registers IPC handlers for prompt store, mockup rendering, logs, Gemini app automation
  - handles auto-updater behavior
- Preload (`preload.cjs`):
  - exposes safe bridge APIs to renderer via `contextBridge`
- Renderer app (`src/`):
  - route/page rendering, local state, user interactions
  - service layer for backend requests and bridge calls

## Frontend Flow
1. `src/main.jsx` bootstraps app and hydrates prompt overrides.
2. `src/App.jsx` selects Router type (BrowserRouter vs HashRouter for file protocol).
3. `AuthProvider` restores user from storage.
4. Routes and visible pages are determined by permissions and app mode config.
5. Feature pages call service functions for backend APIs and optional Electron bridge functions.

## API and Backend Flow
1. User logs in via `authService.login` to WordPress backend.
2. Token is persisted in localStorage user payload.
3. Services attach auth token to requests (`Authorization: Bearer ...`).
4. Upload/update services send multipart/form-data to backend endpoints.
5. Gemini backend service uses queued + retrying requests for reliability on 429/5xx.

## Gemini Desktop Automation Flow
1. Renderer calls `geminiAppService`.
2. Service calls `window.offorestGeminiApp.*` from preload.
3. `main.js` ensures Gemini window/session.
4. Image + prompt are submitted through automation helpers.
5. Generated output is captured and returned to renderer.

## Data and Persistence
- Browser storage:
  - auth user payload
  - Google token
  - per-page sheet config
  - Gemini project URL
- App userData (Electron):
  - prompt override file (`PromptsMoi.ts`)
  - renderer log file (`log.txt`)
  - Gemini session metadata

## Database or Migrations
- No local database/migration layer in this repository.
- Data persistence is delegated to WordPress backend and Google services.

## Placement Rules
- Add new API request logic in `src/services/`.
- Keep page-specific composition/state inside page files.
- Add new IPC channels only when renderer truly needs desktop capabilities.
- Update preload + renderer together when adding/changing bridge methods.
- Keep permission rules centralized in `src/config/permission.js` and `src/services/authService.js`.
