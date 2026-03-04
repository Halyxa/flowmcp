# Flow MCP — Testing Guide

## Quick Commands

```bash
npm test             # Full test suite (1250 tests across 24 test files)
npm run build        # Compile TypeScript
npm run smoke-test   # 29 standalone MCP protocol checks
npm run ci           # Full pipeline: build + test + smoke
```

## Test Layers

### 1. Core Unit Tests (`src/index.test.ts`)
- **135 tests** covering tools 1-18, 3 prompts, 5 resources
- Tests exported functions directly (fast, no server spawn)
- Run: `npx vitest run src/index.test.ts`

### 2. Integration Tests (`src/integration.test.ts`)
- **27 tests** over real MCP JSON-RPC stdio transport
- Spawns `node dist/index.js`, connects via MCP SDK client
- Validates 70 tools listed, prompt/resource discovery, tool execution
- Run: `npx vitest run src/integration.test.ts`

### 3. Search Tests (`src/tools-search.test.ts`)
- **23 tests** for `flow_semantic_search` (tool 19)
- Run: `npx vitest run src/tools-search.test.ts`

### 4. V2 Tests (`src/tools-v2.test.ts`)
- **36 tests** for tools 20-22: time series, merge, anomaly detect
- Run: `npx vitest run src/tools-v2.test.ts`

### 5. V3 Tests (`src/tools-v3.test.ts`)
- **33 tests** for tools 23-25: geo enhance, NLP-to-viz, export formats
- Run: `npx vitest run src/tools-v3.test.ts`

### 6. V4 Tests (`src/tools-v4.test.ts`)
- **268 tests** for tools 26-57: data wrangling, joins, PCA, etc.
- Run: `npx vitest run src/tools-v4.test.ts`

### 7. Narrative Tests (`src/tools-narrative.test.ts`)
- **39 tests** for tools 58-60: narrate, guided tour, famous network
- Run: `npx vitest run src/tools-narrative.test.ts`

### 8. Holodeck Intelligence Tests
| File | Tests | Tools |
|------|-------|-------|
| `src/tools-v5.test.ts` | 24 | quest_generator (61) |
| `src/tools-v5-anomaly.test.ts` | 15 | anomaly_explain (62) |
| `src/tools-v5-nearmiss.test.ts` | 15 | near_miss_detector (63) |
| `src/tools-v5-disclosure.test.ts` | 14 | progressive_disclosure (64) |
| `src/tools-v5-insight.test.ts` | 19 | insight_scorer (65) |
| `src/tools-v5-waypoint.test.ts` | 16 | waypoint_map (66) |
| `src/tools-v6.test.ts` | 16 | visor_mode (67) |
| `src/tools-world.test.ts` | 18 | data_world_builder (68) |
| `src/tools-sparkle.test.ts` | 23 | sparkle_engine (69) |
| `src/tools-dna.test.ts` | 18 | exploration_dna (70) |

### 9. Edge Case Tests (`src/edge-cases-v2.test.ts`)
- **178 tests** for boundary conditions, malformed input, empty data
- Run: `npx vitest run src/edge-cases-v2.test.ts`

### 10. Property-Based Tests (`src/property-tests.test.ts`)
- **70 tests** using seeded random data to verify structural invariants
- Run: `npx vitest run src/property-tests.test.ts`

### 11. Genetic Tests (`src/tools-genetic.test.ts`)
- **133 tests**: property-based (10 seeds x 7 tools), fuzz (13 garbage inputs x 5 tools), stress (500-2000 rows), cross-tool composition, determinism
- Uses seeded PRNG (mulberry32) for reproducibility
- Run: `npx vitest run src/tools-genetic.test.ts`

### 12. Demo Integration Tests (`src/tools-demo.test.ts`)
- **14 tests** running 3 celebrity CSVs through holodeck tool pipelines
- Run: `npx vitest run src/tools-demo.test.ts`

### 13. Pipeline Composition Tests (`src/tools-pipeline.test.ts`)
- **50 tests** exercising every holodeck tool in sequence on Taylor Swift celebrity CSV
- Verifies cross-tool composition: DNA → disclosure → sparkle → quests → near-misses → insight → waypoints → visor → anomaly explain → world builder
- Proves progressive intelligence (sparkles increase with dwell time) and deterministic composition (standalone DNA matches world builder DNA)
- Run: `npx vitest run src/tools-pipeline.test.ts`

### 14. Benchmark Tests (`src/benchmark.test.ts`)
- **7 tests** for force layout performance with varying graph sizes
- Run: `npx vitest run src/benchmark.test.ts`

### 15. Performance Profile Tests
| File | Tests | Coverage |
|------|-------|----------|
| `src/perf-profile.test.ts` | 30 | Tools 1-18 latency (p50/p95/max) |
| `src/perf-profile-v2.test.ts` | 29 | Tools 19-25 latency |

### 16. Smoke Test (`scripts/smoke-test.mjs`)
- **29 checks** via standalone Node.js script (no vitest)
- Validates compiled `dist/index.js` as real MCP server
- Covers: handshake, 70-tool discovery, prompt/resource listing, 10 tool executions
- Run: `node scripts/smoke-test.mjs`
- Exit code: 0 = all pass, 1 = failures

## Test Count Summary

| Category | Tests |
|----------|-------|
| Core unit | 135 |
| Integration | 27 |
| Search | 23 |
| V2 (tools 20-22) | 36 |
| V3 (tools 23-25) | 33 |
| V4 (tools 26-57) | 268 |
| Narrative (tools 58-60) | 39 |
| Holodeck (tools 61-70) | 178 |
| Edge cases | 178 |
| Property-based | 70 |
| Genetic | 133 |
| Demo integration | 14 |
| Benchmark | 7 |
| Performance | 59 |
| Pipeline composition | 50 |
| **Total** | **1250** |
| Smoke checks | 29 |

## MCP Inspector (Interactive)

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Browse all 70 tools, execute with custom arguments, view prompts and resources.

### Inspector Checklist

**Discovery**
- [ ] 70 tools appear in the tools panel
- [ ] 3 prompts appear (flow_recommendation, flow_data_prep, flow_getting_started)
- [ ] 5 resources appear

**Offline Tools (no auth/network)**
- [ ] `validate_csv_for_flow` — paste CSV, verify validation response
- [ ] `analyze_data_for_flow` — describe data, verify 8-dimension scoring
- [ ] `flow_precompute_force_layout` — nodes+edges, verify x,y,z CSV
- [ ] `flow_extract_from_text` — paste text, verify entity extraction
- [ ] `flow_exploration_dna` — paste CSV, verify archetype + 8 traits
- [ ] `flow_sparkle_engine` — paste CSV with dwell_seconds, verify progressive sparkles
- [ ] `flow_data_world_builder` — paste CSV, verify complete world output

**Live API (no auth, requires network)**
- [ ] `flow_browse_flows` — verify flow catalog response
- [ ] `flow_list_templates` — verify 37 templates
- [ ] `flow_list_categories` — verify 35 categories

**Auth-Required**
- [ ] `flow_authenticate` — real credentials
- [ ] `flow_upload_data` — upload after auth

### Sample Inspector Inputs

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

**flow_data_world_builder:**
```json
{
  "csv_data": "name,value,category,score\nAlice,100,A,85\nBob,200,B,72\nCarol,300,A,91\nDave,150,C,68\nEve,250,B,95",
  "depth": "standard"
}
```

## Continuous Integration

```bash
npm run ci    # build && test && smoke-test
```

All three stages must pass for a green build. Build compiles TypeScript, test runs all 1250 vitest tests, smoke-test validates the compiled dist/ as a real MCP server with 29 protocol checks.
