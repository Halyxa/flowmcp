# Input Limits Boundary Testing

**Category**: testing
**Created**: 2026-02-12 (cycle 9)
**Times reused**: 0

## Trigger

When functions have LIMITS constants or size guards that reject oversized input, and those code paths lack test coverage.

## Solution

1. Import the `LIMITS` constant alongside the functions under test
2. For each limit check in the code, generate input that just exceeds the limit (e.g., `LIMITS.MAX_CSV_BYTES / avg_line_size + 1` lines)
3. Assert the function returns an error object (not throws) with a message matching the limit description (e.g., `'MB limit'`, `'Too many nodes'`)
4. For clamped values (not rejected), verify the function succeeds despite exceeding the soft limit
5. Group all boundary tests in a single `describe('input limits and boundaries')` block at the end of the test file

## Files affected

- `src/index.test.ts`
