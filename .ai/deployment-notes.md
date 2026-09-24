# Deployment Notes

## Build and Packaging
- Install dependencies:
  - `npm install`
- Build renderer:
  - `npm run build`
  - output goes to `app-dist/`
- Build desktop packages:
  - `npm run dist`
  - `npm run dist:win`
  - `npm run dist:mac`

## Release Artifacts
- Electron builder output directory is `release/`.
- Windows NSIS artifact name pattern:
  - `Offorest-Setup-${version}.${ext}`

## Auto Update Notes
- `electron-updater` is enabled only for packaged app.
- Default publish provider is GitHub (`owner: Xuanlapp`, `repo: Offorest`).
- Optional runtime override via env:
  - `OFFOREST_UPDATE_URL` (generic provider URL)

## Required Runtime Config
- For desktop dev: `OFFOREST_DEV_SERVER_URL` is used by `electron:dev` script.
- Optional env for special desktop integrations:
  - `OFFOREST_CHROME_EXE`, `OFFOREST_GEMINI_DEBUG_PORT`
  - `OFFOREST_PHOTOSHOP_EXE`
  - `OFFOREST_PSD_RENDERER`, `OFFOREST_PSD_PREFER_PHOTOSHOP`

## External Dependencies to Verify Before Release
- WordPress backend endpoints reachable.
- Google Drive/Sheets API access token flow works.
- Gemini desktop session flow works (if release scope includes redesign automation).

## Pre-Deploy Checklist
- [ ] `npm run lint` passed.
- [ ] `npm run build` passed.
- [ ] Smoke test `npm run start` on key pages.
- [ ] API upload/update manual verification completed.
- [ ] Version in `package.json` is correct.
- [ ] Release notes/changelog prepared.
- [ ] No real secrets in repository.

## macOS Specific Notes
- `dist:mac` must run on macOS or macOS CI runner.
- Unsigned build may require right-click open on first launch.
- Signing/notarization is needed for frictionless public distribution.

## Rollback Notes
- Keep previous installer in release storage.
- If update is broken:
  - stop promoting latest release
  - re-publish previous known-good version
  - if using generic update feed, point feed back to previous version metadata
- Record root cause and affected versions after rollback.
