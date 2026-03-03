# Centralized LIMITS Constant

**Category**: code
**Created**: 2026-02-12 (cycle 9)
**Times reused**: 0

## Trigger

When adding new tool functions that process user input and need size guards to prevent resource exhaustion.

## Solution

All input size limits are centralized in the exported `LIMITS` constant (`src/index.ts`). Add new limits there (e.g., `MAX_CSV_BYTES`, `MAX_NODES`, `MAX_TEXT_LENGTH`). Reference via `LIMITS.KEY_NAME` in guard clauses at the top of each function.

Guard pattern:
```typescript
if (input.length > LIMITS.MAX_X)
  return { error: `Exceeds ${LIMITS.MAX_X / scale} unit limit (got ${actual})` };
```

Export `LIMITS` so tests can reference the exact values.

For soft limits (clamped, not rejected), use `Math.min(input, LIMITS.MAX_X)`.

Always include the actual input size in the error message so users know by how much they exceeded.

## Files affected

- `src/index.ts`
