# Offorest Project Context

## Project Purpose
Offorest is a desktop-first image production app for internal design workflows. It supports multiple product modes (Holoarcylic, Suncatcher, Sticker, Mockup, Patch, Redesign), generates or transforms artwork with AI, and pushes results to Google Drive and Google Sheets through a WordPress REST backend.

## Tech Stack
- Desktop shell: Electron 40 (main process in `main.js`, preload bridge in `preload.cjs`)
- Frontend: React 19 + React Router 7 + Vite 7
- Styling: Tailwind CSS 4
- Linting: ESLint 9 (flat config)
- Image and PSD processing: `ag-psd`, `@napi-rs/canvas`, `pngjs`, `psd`, `pixi.js`
- AI/image tooling: backend Gemini endpoints + Electron Gemini web automation bridge
- Integrations: WordPress REST API, Google Drive API, Google Sheets API
- Packaging and release: `electron-builder`, `electron-updater`

## Main Modules
- Authentication and authorization:
  - `src/services/authService.js`
  - `src/contexts/AuthContext.jsx`
  - product/role permission mapping and route defaulting
- Navigation and app modes:
  - `src/config/nav.modes.js`, `src/config/nav.config.js`
  - dynamic page loading in `src/App.jsx`
- Feature pages:
  - `src/pages/*Page.jsx` (Admin, Sticker, Redesign, Mockup, etc.)
- API and data services:
  - `src/services/googleDriveService.js` (upload/update and connection test)
  - `src/services/geminiService.js` (backend AI calls with retry/queue)
  - `src/services/adminUserService.js`
  - `src/services/sheetConfigService.js`
- Desktop/Electron bridges:
  - `preload.cjs` exposes `window.offorest*` APIs
  - `main.js` registers IPC handlers, PSD rendering, Gemini window/session logic, updater hooks
- Prompt management:
  - `src/prompt/Prompts.ts`
  - `src/prompt/PromptsMoiService.js`

## How To Run Locally
- Install dependencies:
  - `npm install`
- Frontend only:
  - `npm run dev`
- Electron only (expects built frontend or external dev URL):
  - `npm run electron`
- Full desktop dev (recommended):
  - `npm run start`
  - this runs Vite + Electron concurrently and uses `OFFOREST_DEV_SERVER_URL`

## Build and Release Commands
- Web build to `app-dist/`:
  - `npm run build`
- Electron distributable (current OS):
  - `npm run dist`
- Windows package:
  - `npm run dist:win`
- macOS package (must run on macOS runner/machine):
  - `npm run dist:mac`
- Patch release version helper:
  - `npm run release:patch`

## Test Strategy (Current State)
- No unit/integration test framework is currently configured in `package.json`.
- Current validation methods in repo:
  - lint: `npm run lint`
  - API manual testing: Postman collection `Offorest_Postman_Collection.json`
  - upload scripts: `test_upload.bat` and `test_upload.sh`
  - docs: `API_TESTING_README.md`, `DEBUG_UPLOAD.md`, `CONSOLE_LOGGING_GUIDE.md`

## Important Environment Variables
Detected in `main.js`:
- `OFFOREST_DEV_SERVER_URL`
- `OFFOREST_GEMINI_DEBUG_PORT`
- `OFFOREST_ENABLE_CUSTOM_EFFECTS`
- `OFFOREST_CHROME_EXE`
- `OFFOREST_PHOTOSHOP_EXE`
- `OFFOREST_REPLACE_ALL_DESIGN_LAYERS`
- `OFFOREST_PSD_RENDERER`
- `OFFOREST_PSD_PREFER_PHOTOSHOP`
- `OFFOREST_UPDATE_URL`

## Important Runtime Data (Not env files)
- WordPress login token stored in localStorage user payload
- Google API access token stored in localStorage `googleDriveAccessToken`
- Per-page Google Sheet URL/IDs stored in localStorage keys like `holoarcylicSheetUrl`, `mockupSheetUrl`, `comboStickerSheetData`

## What AI Must Know Before Editing
- This is a mixed desktop + frontend app; renderer changes may depend on preload/main IPC contracts.
- Do not break `window.offorest*` bridge names without synchronized updates in both `preload.cjs` and frontend service files.
- Permission and routing behavior is tightly coupled to product type mappings in `authService` and `nav.modes`.
- API calls include auth and Google token flows; preserve current fallback behavior and error messages.
- `main.js` is large and central. Keep edits scoped and minimal.
- Avoid introducing new frameworks unless explicitly requested.
