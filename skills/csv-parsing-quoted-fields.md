# CSV Parsing: Quoted Fields

**Category**: hardening
**Created**: 2026-02-11 (cycle 4)
**Times reused**: 0

## Trigger

When CSV tools use naive `.split(',')` and break on quoted fields containing commas like `"Hello, World"`.

## Solution

Replace `.split(',')` with a proper state-machine CSV parser (`parseCSVLine`) that tracks `inQuotes` state. Handle:
- Escaped quotes (`""`)
- Commas inside quotes
- Field trimming

Place as a shared helper near LIMITS constant and use across all CSV-consuming functions.

## Anti-pattern

Using `.split(',')` anywhere in CSV processing. It will break on the first quoted field containing a comma.

## Files affected

- `src/index.ts`
- `src/csv-utils.ts`
