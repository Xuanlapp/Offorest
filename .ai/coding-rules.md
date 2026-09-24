# Offorest Coding Rules

## Scope and Safety
- Edit only files required by the assigned task.
- Do not refactor unrelated modules in the same commit/task.
- Keep existing architecture unchanged unless task explicitly requests architecture changes.

## Code Style Rules
- Follow existing style per file:
  - most `src/**/*.js|jsx` files use no semicolons and single quotes
  - `main.js` uses semicolons and Node/Electron style
- Respect existing ESLint config in `eslint.config.js`.
- Keep functions small and explicit. Prefer early returns for validation failures.

## Naming Rules
- Pages: PascalCase + `Page` suffix, in `src/pages/` (example: `RedesignPage.jsx`).
- Services: camelCase + `Service` suffix, in `src/services/` (example: `googleDriveService.js`).
- Config modules: lower-case names in `src/config/`.
- Constants: UPPER_SNAKE_CASE.
- Permission keys and app mode keys must stay consistent with existing maps.

## Function and Module Placement
- UI/state logic in page/component files.
- API and business request logic in `src/services/`.
- Route and mode metadata in `src/config/`.
- Auth and permission checks in `authService` and `AuthContext`.
- Electron-only operations must stay behind preload bridge APIs.

## Error Handling Rules
- Validate input at function entry.
- Throw or surface user-readable errors when operations fail.
- Keep current convention of explicit status/message checks for fetch responses.
- In Electron bridge calls, keep desktop-only guard errors clear (feature only available in Electron).

## Input Validation Rules
- Validate required params before API calls (file list, sheetId, token, image URL/data).
- Normalize and trim string inputs.
- When processing structured data, use safe fallbacks for malformed JSON/response payloads.

## Logging Rules
- Keep meaningful log prefixes for troubleshooting (module-scoped labels).
- Do not remove critical logs in upload, auth, and AI request flows without replacement.
- Never log full secrets/tokens; use masked previews where needed.
- Renderer logs may be persisted via `window.offorestLogger`; do not break that flow.

## Security and Config Rules
- Never hard-code new secrets, API keys, or credentials.
- Do not commit real tokens in docs, code, screenshots, or examples.
- If adding configurable values, wire them through environment variables or safe runtime config.
- Preserve auth headers and permission gating behavior.

## Non-Goals for Routine Tasks
- Do not add dependencies unless the task explicitly requires it.
- Do not rename public IPC channels or exported service APIs unless all call sites are updated and tested.
- Do not alter build/release configuration for feature-only tasks.
