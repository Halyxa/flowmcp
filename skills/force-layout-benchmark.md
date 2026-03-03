# Force Layout Benchmarking

**Category**: testing
**Created**: 2026-02-12 (cycle 6)
**Times reused**: 0

## Trigger

When you need to benchmark or profile the performance of `precomputeForceLayout` at different graph sizes, or when performance regression testing is needed.

## Solution

Create a vitest test file that:
1. Generates graphs at varying sizes (10, 50, 100, 500, 1000, 5000 nodes) with ~2 edges/node (chain + random for realistic topology)
2. Uses `generateGraph(N)` helper to create nodes with id/label/group and edges
3. Runs `precomputeForceLayout` with 300 iterations (default)
4. Asserts correctness (no errors, correct node count, CSV line count = N+1)
5. Sets generous performance guardrails: <2s for <=100 nodes, <10s for <=1000, <60s for <=5000
6. Prints a summary table (nodes, edges, time_ms, ms_per_node)
7. Checks scaling factor: ms_per_node at largest size vs smallest should be <100x (d3-force is O(N log N) per tick)

## Files affected

- `src/benchmark.test.ts`
