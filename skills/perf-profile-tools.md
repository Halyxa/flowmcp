# Performance Profiling Tools

**Category**: testing
**Created**: 2026-02-12 (cycle 8)
**Times reused**: 0

## Trigger

When you need to profile or benchmark the response times of multiple MCP tools across data sizes.

## Solution

Create a vitest file with:
1. Data generators for CSV, network CSV, text, and graph structures at varying sizes
2. A `timeIt()` wrapper that collects `{tool, size, ms, ops_per_sec}` into an array
3. Describe blocks per tool with size variants
4. A summary test that prints a formatted table and identifies bottlenecks (>100ms)

Key insight: pure compute tools can be profiled directly; network-dependent tools must be mocked or skipped. Use `performance.now()` for sub-ms precision.

## Results (baseline measurements)

- **Sub-ms tools**: analyzeDataForFlow, validateCsvForFlow, generateFlowPythonCode, suggestFlowVisualization, getFlowTemplate
- **Bottlenecks**: extractFromText (200 paragraphs: ~122ms), precomputeForceLayout (1000 nodes: ~117ms), computeGraphMetrics (2000 nodes: ~93ms)
- **Note**: All tools respond in <500ms even at largest test sizes. The 100ms+ tools are CPU-bound (regex extraction, force simulation, graph traversal) and scale linearly or O(N log N).

## Files affected

- `src/perf-profile.test.ts`
