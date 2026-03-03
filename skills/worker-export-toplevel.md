# Worker Thread Exports Must Be Top-Level

**Category**: code
**Created**: 2026-02-11 (cycle 0)
**Times reused**: 0

## Trigger

When worker thread module exports are undefined or worker fails to start.

## Solution

Worker thread exports must be at module top level, not inside conditional blocks (`if/else`, `try/catch`). Move exports outside any conditions.

## Files affected

- `src/worker-force.ts`
