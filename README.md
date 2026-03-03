# FlowMCP

The world's first AI-to-3D data visualization bridge. An MCP (Model Context Protocol) server with **50 tools** that lets any AI assistant transform raw data into interactive 3D spatial visualizations via [Flow Immersive](https://flowimmersive.com).

**814 tests. Zero competitors in 3D data visualization MCP.**

## What It Does

FlowMCP connects AI assistants (Claude, GPT, Gemini) to Flow Immersive's 3D visualization platform. When a user says "visualize this data," the AI invokes FlowMCP tools to analyze, transform, pre-compute layouts, and render data in 3D — no code required.

```
Text/CSV → Extract → Analyze → Transform → Layout → Upload → 3D Visualization
```

## Installation

```bash
npm install flow-immersive-mcp
```

Or from source:

```bash
git clone https://github.com/Halyxa/flowmcp.git
cd flowmcp
npm install
npm run build
```

**Requirements:** Node.js >= 18. Optional: FalkorDB for graph database queries.

## Quick Start

### With Claude Desktop

Add to `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "flow-immersive": {
      "command": "node",
      "args": ["/path/to/flowmcp/dist/index.js"]
    }
  }
}
```

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### Direct Execution (stdio)

```bash
node dist/index.js
```

### HTTP Transport (remote deployment)

```bash
node dist/index.js --http                    # Default: http://127.0.0.1:3100/mcp
MCP_HTTP_PORT=8080 node dist/index.js --http # Custom port
MCP_HTTP_HOST=0.0.0.0 node dist/index.js --http # Bind to all interfaces
```

Health check: `GET /health` returns `{"status":"ok","tools":36,"transport":"streamable-http"}`

## Tools (36)

### Data Analysis & Preparation

| # | Tool | Description |
|---|------|-------------|
| 1 | `analyze_data_for_flow` | Score data for 3D visualization potential across 8 signal dimensions |
| 2 | `validate_csv_for_flow` | Diagnose CSV format and data quality for Flow compatibility |
| 3 | `transform_to_network_graph` | Convert edge lists to Flow's id + pipe-delimited connections format |
| 4 | `suggest_flow_visualization` | Recommend optimal visualization type from column metadata |
| 5 | `get_flow_template` | Retrieve setup instructions and column requirements per template |

### Text & URL Extraction

| # | Tool | Description |
|---|------|-------------|
| 6 | `flow_extract_from_text` | Extract entities, relationships, metrics from unstructured text into CSV |
| 7 | `flow_extract_from_url` | Fetch a URL, extract structured data, produce Flow-ready CSV |

### Code Generation

| # | Tool | Description |
|---|------|-------------|
| 8 | `generate_flow_python_code` | Ready-to-run Python upload scripts using the `flowgl` client |

### Direct API Integration

| # | Tool | Description |
|---|------|-------------|
| 9 | `flow_authenticate` | Email/password to bearer token (cached per session) |
| 10 | `flow_upload_data` | Create or update datasets via Flow API |
| 11 | `flow_browse_flows` | Browse 4,000+ public flows (no auth required) |
| 12 | `flow_get_flow` | Full flow definition by selector ID (no auth required) |
| 13 | `flow_list_templates` | 37 visualization templates with column requirements |
| 14 | `flow_list_categories` | Visualization categories for classification |

### Server-Side Pre-Computation

| # | Tool | Description |
|---|------|-------------|
| 15 | `flow_precompute_force_layout` | d3-force-3d to full convergence — graphs load instantly with pre-resolved x,y,z |
| 16 | `flow_scale_dataset` | Intelligent reduction: random, stratified, or spatial binning sampling |
| 17 | `flow_compute_graph_metrics` | Degree, PageRank, components, clustering coefficient per node |

### Graph Database

| # | Tool | Description |
|---|------|-------------|
| 18 | `flow_query_graph` | Cypher queries against FalkorDB → Flow-compatible CSV with optional layout |

### Search & Discovery

| # | Tool | Description |
|---|------|-------------|
| 19 | `flow_semantic_search` | Multi-signal search across public flows by title, description, category |

### Data Transformation

| # | Tool | Description |
|---|------|-------------|
| 20 | `flow_time_series_animate` | Temporal data → animation frames with `_frame` and `_time_label` columns |
| 21 | `flow_merge_datasets` | Join/concatenate multiple CSVs with conflict resolution |
| 22 | `flow_anomaly_detect` | Z-score/IQR anomaly detection with `_anomaly_score` and `_is_anomaly` columns |

### Geographic & NLP

| # | Tool | Description |
|---|------|-------------|
| 23 | `flow_geo_enhance` | Built-in gazetteer geocoding: city/country names → latitude/longitude |
| 24 | `flow_nlp_to_viz` | Natural language → synthetic data + template selection + setup instructions |

### Export

| # | Tool | Description |
|---|------|-------------|
| 25 | `flow_export_formats` | CSV → JSON, GeoJSON, standalone HTML 3D viewer (Three.js), or statistical summary |

### Live Data

| # | Tool | Description |
|---|------|-------------|
| 26 | `flow_live_data` | Fetch real-time data from USGS earthquakes, Open-Meteo weather, or World Bank indicators — no API key needed |

### Statistical Analysis

| # | Tool | Description |
|---|------|-------------|
| 27 | `flow_correlation_matrix` | Pairwise Pearson correlations for numeric columns — heatmap-ready matrix CSV |
| 28 | `flow_cluster_data` | K-means clustering with automatic k selection via silhouette scoring — adds `_cluster` column |
| 29 | `flow_hierarchical_data` | Flat categorical data → hierarchical tree structure for sunburst/treemap visualization |
| 30 | `flow_compare_datasets` | Side-by-side dataset diff with `_diff_status` column (added/removed/changed/unchanged) |
| 31 | `flow_pivot_table` | Group by categorical columns, aggregate with sum/avg/count/min/max — adds `_group_size` column |
| 32 | `flow_regression_analysis` | Linear regression with R², p-value, equation — adds `_predicted` and `_residual` columns |

### Data Cleaning & Reshaping

| # | Tool | Description |
|---|------|-------------|
| 33 | `flow_normalize_data` | Min-max [0,1] or z-score normalization — adds `_normalized` suffix columns |
| 34 | `flow_deduplicate_rows` | Remove duplicate rows with optional case-insensitive matching |
| 35 | `flow_bin_data` | Histogram binning with auto bin count (Sturges' rule) — outputs `bin_label`, `count`, `frequency` |
| 36 | `flow_transpose_data` | Swap rows and columns for reshaping data orientation |
| 37 | `flow_sample_data` | Smart sampling: random, first-N, every-Nth, stratified by category |
| 38 | `flow_column_stats` | Descriptive statistics: count, mean, median, std, min, max, Q1, Q3 |
| 39 | `flow_computed_columns` | Add calculated columns using safe arithmetic formulas |
| 40 | `flow_parse_dates` | Extract year, month, day, quarter, day_of_week, epoch_days from dates |
| 41 | `flow_string_transform` | Text cleanup: uppercase, lowercase, trim, title case, find-replace |
| 42 | `flow_validate_rules` | Data quality validation: not_null, min, max, unique, pattern, in_set |
| 43 | `flow_fill_missing` | Impute missing values: constant, mean, median, mode, forward fill |
| 44 | `flow_rename_columns` | Rename and reorder CSV columns |
| 45 | `flow_filter_rows` | Filter rows by conditions: equals, greater_than, contains, etc. |
| 46 | `flow_split_dataset` | Split dataset into subsets by column values |
| 47 | `flow_select_columns` | Select or exclude columns from CSV |
| 48 | `flow_sort_rows` | Sort rows by column with numeric-aware ordering |
| 49 | `flow_unpivot` | Melt wide format to long format (reverse of pivot) |
| 50 | `flow_join_datasets` | SQL-style joins (inner/left/right/full) on shared key |

Plus **3 prompts** (recommendation, data prep, getting started) and **5 resources** (overview, CSV format, network graphs, Python client, viz types).

## Demos

Interactive 3D viewers generated entirely by FlowMCP tools — **[Live Demo](https://halyxa.github.io/flowmcp/)**:

- **[Neural Network Architecture](https://halyxa.github.io/flowmcp/neural-network-3d.html)** — 160 nodes, 2,610 connections, force layout pre-computed
- **[Global Startup Funding](https://halyxa.github.io/flowmcp/global-startup-funding-3d.html)** — 420 companies across 30 countries
- **[Global Supply Chain](https://halyxa.github.io/flowmcp/supply-chain-3d.html)** — 100 nodes, 200 edges, 6 tiers from raw materials to retail
- **[Climate Change Indicators](https://halyxa.github.io/flowmcp/climate-indicators-3d.html)** — 1,040 observations over 26 years
- **[Investor Showcase](https://halyxa.github.io/flowmcp/)** — Landing page with all demos

## Pipeline Example

FlowMCP tools chain into end-to-end pipelines:

```
1. flow_extract_from_text    → entities + relationships from article
2. analyze_data_for_flow     → 3D fitness score (9.2/10)
3. transform_to_network_graph → Flow network CSV format
4. suggest_flow_visualization → optimal viz type recommendation
5. flow_precompute_force_layout → offline physics → x,y,z positions
6. flow_compute_graph_metrics → PageRank, centrality, communities
7. flow_upload_data          → push to Flow Immersive API
8. flow_export_formats       → standalone HTML 3D viewer
```

Run the pipeline demo: `node demos/pipeline-demo.mjs`

## Testing

```bash
npm test           # 668 tests (unit + integration + benchmark + perf + property + edge + v4)
npm run smoke-test # 15 standalone MCP checks
npm run ci         # Full pipeline: build + test + smoke
```

| Test Suite | Count |
|-----------|-------|
| Unit tests | 135 |
| Integration tests | 29 |
| Benchmark tests | 7 |
| Performance profiling | 59 |
| Search tests | 23 |
| Tools v2 tests | 36 |
| Tools v3 tests | 33 |
| Tools v4 tests | 109 |
| Edge case tests | 168 |
| Property tests | 65 |
| Smoke tests | 15 |
| **Total** | **683** |

## Tool Description Optimization

FlowMCP uses genetic algorithms to optimize tool descriptions for AI routing accuracy:

- **120 gold queries** covering all 26 tools
- **DEAP genetic algorithm** with 500-population, 500-generation runs across 64 CPU cores
- **10M+ evaluations** across 7 optimizer frameworks (DEAP, Optuna, Nevergrad, Hyperopt, pymoo, CMA-ES)
- **F1 = 0.91** routing accuracy (precision 0.92, recall 0.91)
- Zero tools below the recall floor

The tool descriptions ARE training data — every word shapes how AI assistants discover and invoke FlowMCP.

## Architecture

- **Modular source**: `src/index.ts` (core 18 tools), `src/tools-search.ts`, `src/tools-v2.ts`, `src/tools-v3.ts`, `src/tools-v4.ts` (21 tools)
- **Proper CSV parsing** — state-machine parser handles quoted fields with embedded commas
- **Fetch timeouts** — all API calls use AbortController with 15s timeout
- **Safety limits** — max CSV 10MB, max rows 500k, max nodes 50k, max edges 200k
- **Worker thread ready** — parallel force computation for multi-core deployment

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FALKORDB_HOST` | `localhost` | FalkorDB server host |
| `FALKORDB_PORT` | `6379` | FalkorDB server port |
| `FALKORDB_USERNAME` | — | FalkorDB auth username |
| `FALKORDB_PASSWORD` | — | FalkorDB auth password |

## Sample Datasets

Pre-built datasets in `samples/` for testing and demos:

| Dataset | Rows | Type |
|---------|------|------|
| `demo-ai-ecosystem-network.csv` | 22 nodes | Network graph |
| `tech-collaboration-network.csv` | 20 nodes | Network graph |
| `supply-chain-network.csv` | 100 nodes | Network graph |
| `neural-network-architecture.csv` | 160 nodes | Network graph |
| `global-startup-funding.csv` | 420 rows | Geographic + funding |
| `global-renewable-energy-map.csv` | 30 rows | Geographic + numeric |
| `climate-change-indicators.csv` | 1,040 rows | Time series |
| `saas-growth-timeseries.csv` | 36 rows | Time series |
| `startup-metrics-scatter.csv` | 30 rows | Multi-dimensional |
| `programming-languages-comparison.csv` | 20 rows | Multi-dimensional |

## License

MIT
