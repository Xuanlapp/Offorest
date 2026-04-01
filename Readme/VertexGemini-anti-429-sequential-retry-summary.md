# Vertex Gemini anti-429 update summary

## File updated
- `src/services/geminiService.js`

## What was added
- Global sequential request queue (1 request at a time).
- Minimum gap between requests: 1200ms.
- Retry strategy for transient failures:
  - Retryable statuses: 429, 500, 502, 503, 504.
  - Retry network errors.
  - Max attempts: 5.
  - Exponential backoff with jitter.
  - Respect `Retry-After` header when server provides it.

## Design notes
- Queue is centralized in the service layer, so all existing Gemini/Vertex flows automatically use the safer behavior.
- Error parsing and API response handling are preserved.
- Existing page-level code does not need to change to benefit from anti-429 behavior.

## Tunable values
Inside `REQUEST_CONFIG` in `src/services/geminiService.js`:
- `minGapMs`
- `maxAttempts`
- `baseBackoffMs`
- `maxBackoffMs`

## Expected impact
- Strong reduction of burst traffic.
- Fewer 429 failures.
- More stable completion for batch-like UI flows.
