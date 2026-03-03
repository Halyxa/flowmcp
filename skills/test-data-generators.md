# Test Data Generators

**Category**: testing
**Created**: 2026-02-12 (cycle 9)
**Times reused**: 0

## Trigger

When writing tests that need CSV, network, text, or graph data of varying sizes for parameterized or scaling tests.

## Solution

Use inline generator functions at the top of the test file:
- `generateCsv(rows, cols=5)` -- tabular CSV with id/value/x/y/category columns
- `generateNetworkCsv(rows)` -- source/target/weight edge lists
- `generateText(paragraphs)` -- multi-paragraph text with embedded entities
- `generateGraph(nodeCount)` -- `{nodes, edges}` objects with random connections

Each generator should produce deterministic structure with randomized values. Use `Array.from()` for efficient generation.

Keep generators inside the test file (no shared test utils) -- each test file is self-contained.

## Files affected

- `src/perf-profile.test.ts`
- `src/benchmark.test.ts`
- `src/index.test.ts`
