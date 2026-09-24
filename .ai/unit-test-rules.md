# Unit Test Rules

## Current Reality in This Repo
- No dedicated unit test framework is configured yet (`package.json` has no `test` script).
- Current quality gates are lint + manual functional validation.

## When Tests Are Required
- Any change in service business logic (auth, permission mapping, API payload building, retry behavior).
- Any bug fix that can regress.
- Any parsing/normalization function with branching logic.
- Any security-relevant behavior (auth headers, token handling, permission checks).

## Current Validation Commands
- `npm run lint`
- `npm run start` for end-to-end desktop smoke test
- API verification with Postman collection and upload scripts

## Recommended Test Direction (When Team Enables Unit Tests)
- Preferred framework: Vitest + React Testing Library (natural fit with Vite/React).
- Test file placement:
  - colocated: `*.test.js` near source
  - or grouped under `src/__tests__/`
- Keep tests deterministic; mock network and Electron bridge boundaries.

## Test Types to Cover
- Success cases:
  - valid login response normalization
  - valid upload/update request payload creation
  - successful Gemini backend response extraction
- Failure cases:
  - non-OK API responses
  - malformed JSON/text responses
  - missing required inputs
- Edge cases:
  - empty arrays/objects
  - missing optional fields
  - token missing/expired signals
- Permission/auth cases:
  - role/product permission mapping
  - forbidden route behavior
- Regression cases:
  - bug reproducer converted to test spec before/with fix

## Example Test Scenarios (Project Specific)
- `authService`:
  - map product types to permissions correctly
  - return `/no-permission` when user has no valid products
  - detect auth expiry signals and trigger logout flow
- `googleDriveService`:
  - throw on missing files/sheetId/accessToken
  - enforce page sheet context mismatch errors
- `geminiService`:
  - retry on 429/5xx and stop retry on non-retryable statuses
  - parse image response from alternative payload shapes

## Minimum Rule Before Closing a Task
- If automated tests are not available, provide explicit manual verification steps and observed outcomes.
- For bug fixes, always include a regression checklist item in the task summary.
