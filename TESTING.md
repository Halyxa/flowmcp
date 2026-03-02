# Flow MCP — Testing Guide

## Quick Commands

```bash
npm test                          # Full test suite (153 tests: 116 unit + 23 integration + 2 benchmark + 12 perf-profile)
npm run build && node scripts/smoke-test.mjs  # Standalone smoke test (no vitest)
```

## Test Layers

### 1. Unit Tests (`src/index.test.ts`)
- **116 tests** covering all 17 tools, 3 prompts, 5 resources
- Tests exported functions directly (fast, no server spawn)
- Run: `npm test` or `npx vitest run src/index.test.ts`

### 2. Integration Tests (`src/integration.test.ts`)
- **23 tests** over real MCP JSON-RPC stdio transport
- Spawns `node dist/index.js`, connects via MCP SDK client
- Validates tool discovery, prompt/resource listing, and tool execution
- Run: `npx vitest run src/integration.test.ts`

### 3. Benchmark Tests (`src/benchmark.test.ts`)
- **2 tests** for force layout performance with varying graph sizes
- Measures computation time for 10–5000 node graphs
- Run: `npx vitest run src/benchmark.test.ts`

### 4. Performance Profile Tests (`src/perf-profile.test.ts`)
- **12 tests** profiling tool response times under load
- Covers 10 local tools with p50/p95/max latency measurements
- Run: `npx vitest run src/perf-profile.test.ts`

### 5. Smoke Test (`scripts/smoke-test.mjs`)
- Standalone Node.js script — no test framework needed
- Validates the compiled server works as a standalone MCP process
- Tests: handshake, tool/prompt/resource discovery, 3 tool executions
- Run: `node scripts/smoke-test.mjs`
- Exit code: 0 = all pass, 1 = failures

### 6. MCP Inspector (Interactive)
The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) provides a web UI for interacting with MCP servers.

```bash
# Launch Inspector pointing at our server
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens a browser UI where you can:
- Browse all 17 tools with their schemas
- Execute any tool with custom arguments
- View prompts and resources
- See raw JSON-RPC messages

#### Inspector Test Checklist

**Discovery**
- [ ] All 17 tools appear in the tools panel
- [ ] All 3 prompts appear (analyze-data-for-flow, quick-start-flow, flow-network-guide)
- [ ] All 5 resources appear (sample CSVs)

**Offline Tools (no auth/network needed)**
- [ ] `validate_csv_for_flow` — paste any CSV, verify valid/invalid response
- [ ] `analyze_data_for_flow` — describe data, verify scoring response
- [ ] `suggest_flow_visualization` — provide column metadata, verify recommendation
- [ ] `transform_to_network_graph` — provide edge list, verify id+connections output
- [ ] `get_flow_template` — try each: basic_scatter, network_force, geo_map, time_series, comparison
- [ ] `flow_extract_from_text` — paste article text, verify entity/relationship extraction
- [ ] `generate_flow_python_code` — verify Python code generation
- [ ] `flow_precompute_force_layout` — provide nodes+edges, verify CSV with x,y,z positions
- [ ] `flow_scale_dataset` — provide large CSV, verify reduced output
- [ ] `flow_compute_graph_metrics` — provide graph, verify degree/pagerank/component/clustering columns

**Live API Tools (no auth, requires network)**
- [ ] `flow_browse_flows` — browse public catalog, verify flow list
- [ ] `flow_list_templates` — verify 36 templates returned
- [ ] `flow_list_categories` — verify 35 categories returned
- [ ] `flow_get_flow` — try selector "gpk7hh" or any known flow

**Auth-Required Tools**
- [ ] `flow_authenticate` — test with real credentials
- [ ] `flow_upload_data` — upload CSV after auth
- [ ] `flow_query_graph` — requires FalkorDB instance

#### Sample Inspector Inputs

**validate_csv_for_flow:**
```json
{
  "csv_content": "name,revenue,employees,city\nAcme,1000000,50,NYC\nBeta,500000,25,SF\nGamma,2000000,100,Austin"
}
```

**flow_precompute_force_layout:**
```json
{
  "nodes": [{"id":"A"},{"id":"B"},{"id":"C"},{"id":"D"}],
  "edges": [{"source":"A","target":"B"},{"source":"B","target":"C"},{"source":"C","target":"D"},{"source":"A","target":"D"}],
  "iterations": 200
}
```

**flow_extract_from_text:**
```json
{
  "text": "Apple and Google compete in the AI space. Microsoft acquired Activision. Tim Cook leads Apple from Cupertino. Satya Nadella leads Microsoft from Redmond.",
  "output_mode": "network",
  "source_type": "article"
}
```

## Continuous Integration

For CI pipelines:
```bash
npm run build && npm test && node scripts/smoke-test.mjs
```

All three must pass for a green build.
