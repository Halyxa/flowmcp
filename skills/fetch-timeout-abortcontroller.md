# Fetch Timeout with AbortController

**Category**: hardening
**Created**: 2026-02-11 (cycle 4)
**Times reused**: 0

## Trigger

When `fetch()` calls to external APIs can hang indefinitely with no timeout.

## Solution

Create a `fetchWithTimeout` wrapper that uses `AbortController` with configurable timeout (default 15s). On timeout, throw descriptive error with hostname and timeout duration. Replace all raw `fetch()` calls with `fetchWithTimeout()`. Store default in `LIMITS.FETCH_TIMEOUT_MS`.

## Files affected

- `src/index.ts`
