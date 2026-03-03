# Fix API Test Timeouts

**Category**: testing
**Created**: 2026-02-11 (cycle 0)
**Times reused**: 0

## Trigger

When a test calling a live API (Flow, external) times out at the default 5s.

## Solution

Add explicit timeout as the last parameter to the test: `}, 15000);` -- Flow API endpoints are slow (3-10s typical).

## Files affected

- `src/index.test.ts`
- `src/integration.test.ts`
