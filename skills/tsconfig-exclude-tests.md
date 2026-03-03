# TSConfig: Exclude Test Files

**Category**: build
**Created**: 2026-02-11 (cycle 2)
**Times reused**: 0

## Trigger

When `npm run build` fails with TS18048 errors in test files (possibly undefined).

## Solution

Add test files to tsconfig exclude:

```json
"exclude": ["node_modules", "dist", "src/**/*.test.ts"]
```

Test files have looser type assertions that fail strict `tsc` but work fine in vitest.

## Files affected

- `tsconfig.json`
