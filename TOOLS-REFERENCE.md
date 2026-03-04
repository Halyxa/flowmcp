# FlowMCP — Tools & Paths Reference

> This file is reference data extracted from CLAUDE.md to stay under the ~150 instruction ceiling.
> Load on demand when you need tool inventory or file locations.

## Tools (71)

| # | Tool | Purpose |
|---|------|---------|
| 1 | `analyze_data_for_flow` | Score data for 3D viz potential (8 signal dimensions) |
| 2 | `validate_csv_for_flow` | Diagnose CSV format/quality for Flow compatibility |
| 3 | `transform_to_network_graph` | Edge list → Flow id + pipe-delimited connections |
| 4 | `suggest_flow_visualization` | Recommend optimal viz type from column metadata |
| 5 | `get_flow_template` | Setup instructions per viz type |
| 6 | `flow_extract_from_text` | Text → entities, relationships, metrics, geo, timeline → CSV |
| 7 | `flow_extract_from_url` | URL → fetch content → extract structured data → CSV |
| 8 | `generate_flow_python_code` | Ready-to-run Python upload scripts |
| 9 | `flow_authenticate` | Email/password → bearer token (cached) |
| 10 | `flow_upload_data` | Create/update datasets via direct API |
| 11 | `flow_browse_flows` | Browse 26k+ public flows (no auth) |
| 12 | `flow_get_flow` | Full flow definition by selector (no auth) |
| 13 | `flow_list_templates` | 37 viz templates with column requirements (no auth) |
| 14 | `flow_list_categories` | 35 categories (no auth) |
| 15 | `flow_precompute_force_layout` | d3-force-3d → full convergence, CSV with x,y,z. Instant load. |
| 16 | `flow_scale_dataset` | Intelligent reduction: random, stratified, spatial binning |
| 17 | `flow_compute_graph_metrics` | Degree, PageRank, components, clustering → CSV columns |
| 18 | `flow_query_graph` | FalkorDB Cypher → Flow-compatible CSV + optional force layout |
| 19 | `flow_semantic_search` | Multi-signal search across 26k+ public flows |
| 20 | `flow_time_series_animate` | Temporal data → animation frames |
| 21 | `flow_merge_datasets` | Join/concatenate multiple CSVs with conflict resolution |
| 22 | `flow_anomaly_detect` | Z-score/IQR anomaly detection |
| 23 | `flow_geo_enhance` | Built-in gazetteer geocoding → lat/lon |
| 24 | `flow_nlp_to_viz` | Natural language → synthetic data + template + instructions |
| 25 | `flow_export_formats` | CSV → JSON, GeoJSON, HTML 3D viewer, stats summary |
| 26 | `flow_live_data` | Real-time data: USGS earthquakes, weather, World Bank |
| 27 | `flow_correlation_matrix` | Pairwise Pearson correlations → heatmap-ready matrix |
| 28 | `flow_cluster_data` | K-means with automatic k via silhouette scoring |
| 29 | `flow_hierarchical_data` | Flat data → hierarchical tree for network viz |
| 30 | `flow_compare_datasets` | Side-by-side dataset diff with _diff_status |
| 31 | `flow_pivot_table` | Group by + aggregate (sum/avg/count/min/max) |
| 32 | `flow_regression_analysis` | Linear regression: R², p-value, predicted/residual |
| 33 | `flow_normalize_data` | Min-max, z-score, or robust (MAD) normalization |
| 34 | `flow_deduplicate_rows` | Remove duplicates with optional case-insensitive matching |
| 35 | `flow_bin_data` | Histogram binning (Sturges' rule) |
| 36 | `flow_column_stats` | Descriptive stats: mean, median, std, quartiles |
| 37 | `flow_computed_columns` | Add calculated columns via safe formulas |
| 38 | `flow_parse_dates` | Extract year/month/day/quarter/epoch from dates |
| 39 | `flow_validate_rules` | Data quality: not_null, min, max, unique, pattern |
| 40 | `flow_fill_missing` | Impute + interpolate: constant, mean, median, mode, forward, linear, nearest, zero |
| 41 | `flow_filter_rows` | Filter by conditions: equals, contains, greater_than |
| 42 | `flow_unpivot` | Wide → long format (reverse of pivot) |
| 43 | `flow_join_datasets` | SQL-style joins (inner/left/right/full) |
| 44 | `flow_cross_tabulate` | Contingency tables with aggregation |
| 45 | `flow_window_functions` | Rolling/sliding window operations |
| 46 | `flow_encode_categorical` | Label or one-hot encoding |
| 47 | `flow_cumulative` | Running cumulative sum/min/max/count |
| 48 | `flow_describe_dataset` | Full dataset profiling: shape, types, nulls, uniques |
| 49 | `flow_lag_lead` | Shift values forward/backward for time series |
| 50 | `flow_concat_rows` | Concatenate datasets vertically |
| 51 | `flow_outlier_fence` | Tukey fence outlier detection |
| 52 | `flow_discretize` | Equal-width/equal-frequency discretization |
| 53 | `flow_string_split` | Split delimited strings into columns |
| 54 | `flow_pca_reduce` | PCA dimensionality reduction (2D/3D) |
| 55 | `flow_distance_matrix` | Pairwise distances (euclidean/manhattan/cosine) |
| 56 | `flow_rank_values` | Dense/ordinal/min/max ranking |
| 57 | `flow_string_extract` | Regex capture group extraction |
| 58 | `flow_narrate_data` | CSV → NarrativeArc with statistical characters, outlier/correlation/trend detection, 3 styles (explorer/executive/journalist) |
| 59 | `flow_guided_tour` | CSV → TourStop sequence with camera hints, narration, 5 focus strategies (outliers/clusters/connections/trends/overview) |
| 60 | `flow_famous_network` | Person name → Wikidata SPARQL → celebrity network CSV with relationships (zero-cost, no API key) |
| 61 | `flow_quest_generator` | Procedural exploration quests from dataset topology (5 types: anomaly, comparison, trend, hypothesis, connection) |
| 62 | `flow_near_miss_detector` | Patterns that ALMOST hold — correlations with exceptions, cluster boundaries, trend breaks |
| 63 | `flow_progressive_disclosure` | Fog-of-war layers on any dataset — surface to deep, like a JPG drawing in |
| 64 | `flow_anomaly_explain` | Detective-story narratives explaining WHY data points are anomalous (3 styles) |
| 65 | `flow_insight_scorer` | Statistical peer review — significance, effect size, novelty, bootstrap robustness |
| 66 | `flow_waypoint_map` | GPS for data worlds — cluster cities, outlier peaks, crossroads, camera paths |
| 67 | `flow_visor_mode` | Metroid Prime scan visor — 5 analytical lenses on same data |
| 68 | `flow_data_world_builder` | THE synthesis — orchestrates all tools into one "enter the world" call |
| 69 | `flow_sparkle_engine` | Progressive intelligence — deeper insights the longer you dwell |
| 70 | `flow_exploration_dna` | Dataset personality fingerprinting — 8 archetypes, exploration style guide |
| 71 | `flow_generate_synthetic` | On-demand synthetic data: configurable schemas, distributions, correlations, network/geo/timeseries modes |

3 prompts: `flow_recommendation`, `flow_data_prep`, `flow_getting_started`.
5 resources: overview, csv-format, network-graphs, python-client, viz-types.

## Paths

| Path | Contents |
|------|----------|
| `src/index.ts` | Main server, 71 tools, stdio + HTTP transport |
| `src/tools-search.ts` | Semantic search (tool 19) |
| `src/tools-v2.ts` | Anomaly, time series, merge (tools 20-22) |
| `src/tools-v3.ts` | NLP-to-viz, geo enhance, export (tools 23-25) |
| `src/tools-v4.ts` | Tools 26-50: live data, cluster, graph, data wrangling, joins |
| `src/tools-narrative.ts` | Narrative intelligence: narrate, guided tour, famous network (tools 58-60) |
| `src/tools-narrative.test.ts` | Tests for narrative intelligence tools |
| `src/tools-v5.ts` | Holodeck Intelligence tools 61-66 (quest, near-miss, disclosure, anomaly explain, insight, waypoint) |
| `src/tools-v5.test.ts` | Quest generator tests (24 tests) |
| `src/tools-v5-anomaly.test.ts` | Anomaly explain tests (15 tests) |
| `src/tools-v5-nearmiss.test.ts` | Near-miss detector tests (15 tests) |
| `src/tools-v5-disclosure.test.ts` | Progressive disclosure tests (14 tests) |
| `src/tools-v5-insight.test.ts` | Insight scorer tests (19 tests) |
| `src/tools-v5-waypoint.test.ts` | Waypoint map tests (16 tests) |
| `src/tools-v6.ts` | Visor mode tool 67 |
| `src/tools-v6.test.ts` | Visor mode tests (16 tests) |
| `src/tools-sparkle.ts` | Sparkle engine tool 69 |
| `src/tools-sparkle.test.ts` | Sparkle engine tests (23 tests) |
| `src/tools-dna.ts` | Exploration DNA tool 70 |
| `src/tools-dna.test.ts` | Exploration DNA tests (18 tests) |
| `src/tools-world.ts` | Data world builder tool 68 |
| `src/tools-world.test.ts` | Data world builder tests (18 tests) |
| `src/tools-synthetic.ts` | Synthetic data generator tool 71 |
| `src/tools-synthetic.test.ts` | Synthetic data generator tests (22 tests) |
| `src/tools-genetic.test.ts` | Genetic/property/fuzz/stress tests (133 tests) |
| `src/tools-demo.test.ts` | Celebrity CSV demo integration tests (14 tests) |
| `src/tools-pipeline.test.ts` | Full holodeck pipeline composition tests (50 tests) |
| `src/csv-utils.ts` | Shared CSV parser + escape |
| `src/index.test.ts` | 135 unit tests |
| `src/integration.test.ts` | 27 MCP protocol tests |
| `src/tools-search.test.ts` | Semantic search tests (23 tests) |
| `src/tools-v2.test.ts` | Time series, merge, anomaly tests (36 tests) |
| `src/tools-v3.test.ts` | Geo, NLP-to-viz, export tests (33 tests) |
| `src/tools-v4.test.ts` | 268 unit tests for tools 26-57 |
| `src/edge-cases-v2.test.ts` | Boundary/malformed/empty data tests (178 tests) |
| `src/property-tests.test.ts` | Seeded random structural invariant tests (70 tests) |
| `src/benchmark.test.ts` | 7 benchmark tests |
| `src/perf-profile.test.ts` | 30 perf profile tests (tools 1-18) |
| `src/perf-profile-v2.test.ts` | 29 perf profile tests (tools 19-25) |
| `scripts/smoke-test.mjs` | 29 standalone checks |
| `state.json` | Session continuity |
| `events.jsonl` | Append-only event log (OODA+L artifacts) |
| `predictions.jsonl` | Brier-scored prediction tracking |
| `SPEC.md` | Technical specification |
| `DONE.md` | Completed work log |
| `TESTING.md` | Test guide + Inspector checklist |
| `samples/` | 5 CSV sample datasets |
| `research/` | 86+ docs (~89k lines) |
| `skills/` | 14 crystallized patterns |
| `demos/killer-demo.md` | 6-act pipeline walkthrough |

## Commands

```bash
npm test             # 1250 tests (unit + integration + benchmark + perf + search + v2 + v3 + v4 + v5 + v6 + narrative + sparkle + dna + world + genetic + property + edge)
npm run build        # Compile TypeScript
npm run smoke-test   # 29 standalone checks
npm run ci           # Full pipeline: build + test + smoke
npm start            # Run MCP server
npx @modelcontextprotocol/inspector node dist/index.js  # Inspector
```

## Siblings

| Being | Role | Coordinate on |
|-------|------|---------------|
| provisor | Sysadmin, infra | Server deploy, Traefik, FalkorDB |
| autonomo | Orchestrator | Strategy, heartbeat, evolution |
| merchant | Revenue | Client AI discoverability |
| lovestream | Relationship intel | — |
| guardian | Protection | — |
| superbeing | Meta-intelligence | Cross-being patterns |

Each being: `cd /hive/X && claude --resume` — path is identity.
