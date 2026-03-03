# Retry Logic with Exponential Backoff

**Category**: hardening
**Created**: 2026-02-12
**Times reused**: 0

## Trigger

When API calls need resilience against transient failures (429, 502, 503, 504, timeouts).

## Solution

Create `fetchWithRetry` wrapper:
- Max 3 retries
- Base delay 1s with `2^attempt` multiplier
- Retry on `RETRYABLE_STATUS` (429/502/503/504) and transient errors (timeout, ECONNRESET)
- Do NOT retry on permanent failures (ECONNREFUSED, ENOTFOUND)
- Do NOT retry non-idempotent operations (POST with side effects)
- Separate `fetchWithTimeout` (AbortController) from `fetchWithRetry` (retry loop)

## Anti-pattern

Retrying ALL errors including ECONNREFUSED burns 7+ seconds of delays in tests. Non-idempotent operations (upload, delete) should never be retried.

## Source

flow-mcp session 09 -- retry logic caused test timeout because ECONNREFUSED was being retried.

## Files affected

- `src/index.ts`
