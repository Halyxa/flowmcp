# MCP Schema Mismatch

**Category**: testing
**Created**: 2026-02-11 (cycle 0)
**Times reused**: 1

## Trigger

When an integration test gets `undefined` for a tool argument or unexpected response shape.

## Solution

Check the tool's `inputSchema` in `index.ts` for the exact argument names (not what you'd guess). Check the handler's return value shape -- it may be wrapped (e.g., `{templates, count}` not raw array). Integration tests catch what unit tests miss.

## Files affected

- `src/integration.test.ts`
- `src/index.ts`
