# MCP Error Return Pattern

**Category**: code
**Created**: 2026-02-12 (cycle 9)
**Times reused**: 0

## Trigger

When implementing or testing MCP tool functions that can fail on invalid input.

## Solution

MCP tool functions in this project return error objects instead of throwing exceptions.

Pattern: if input exceeds limits or is invalid, return an object with an `error` string property (and empty/missing success properties).

Tests should use:
```typescript
expect(result.error).toContain('descriptive text')
```
Not:
```typescript
expect(() => fn()).toThrow()
```

For functions returning strings (like `transformToNetworkGraph`), the error is the string itself starting with `'Error:'`.

For functions returning objects (like `precomputeForceLayout`, `validateCsvForFlow`, `extractFromText`), the error is in `result.error` or `result.issues[]`.

The `valid`/`readyForFlow` booleans are `false` when issues exist.

## Files affected

- `src/index.ts`
- `src/index.test.ts`
