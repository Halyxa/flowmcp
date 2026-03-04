# FlowMCP

The world's first AI-to-3D data visualization bridge. An MCP server with **60 tools** that lets any AI assistant transform raw data into interactive 3D spatial visualizations via [Flow Immersive](https://flowimmersive.com).

**875 tests. Zero competitors in 3D viz MCP.**

> *"Turn any data into an interactive 3D visualization from your AI assistant."*

## What It Does

FlowMCP connects AI assistants (Claude, GPT, Gemini) to Flow Immersive's 3D visualization platform. Say "visualize this data" and the AI analyzes, transforms, pre-computes layouts, and renders data in 3D — no code required.

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
MCP_AUTH_TOKEN=mysecret node dist/index.js --http # With bearer auth
```

Health check: `GET /health` returns `{"status":"ok","tools":60,"transport":"streamable-http"}`

## Tools (60)

### Intelligence & Analysis (5)

| Tool | What it does |
|------|-------------|
| `analyze_data_for_flow` | Score data for 3D viz potential across 8 signal dimensions |
| `validate_csv_for_flow` | Diagnose CSV format and data quality for Flow |
| `suggest_flow_visualization` | Recommend optimal viz type from column metadata |
| `get_flow_template` | Setup instructions and column requirements per template |
| `flow_nlp_to_viz` | Natural language → synthetic data + template + instructions |

### Data Extraction (2)

| Tool | What it does |
|------|-------------|
| `flow_extract_from_text` | Extract entities, relationships, metrics from text → CSV |
| `flow_extract_from_url` | Fetch URL → extract structured data → Flow-ready CSV |

### Flow API Gateway (8)

| Tool | What it does |
|------|-------------|
| `flow_authenticate` | Email/password → bearer token (cached) |
| `flow_upload_data` | Create/update datasets via Flow API |
| `flow_browse_flows` | Browse 26k+ public flows (no auth) |
| `flow_get_flow` | Full flow definition by selector (no auth) |
| `flow_list_templates` | 36 viz templates with column requirements |
| `flow_list_categories` | 35 categories for classification |
| `flow_semantic_search` | Multi-signal search across public flows |
| `generate_flow_python_code` | Ready-to-run Python upload scripts |

### Compute-Intensive (6)

| Tool | What it does |
|------|-------------|
| `flow_precompute_force_layout` | d3-force-3d → full convergence, instant-load x,y,z |
| `flow_scale_dataset` | Intelligent reduction: random, stratified, spatial binning |
| `flow_compute_graph_metrics` | Degree, PageRank, components, clustering per node |
| `flow_cluster_data` | K-means with auto k via silhouette scoring |
| `flow_pca_reduce` | Principal component analysis (2D or 3D projection) |
| `flow_distance_matrix` | Pairwise distance computation (euclidean/manhattan/cosine) |

### Graph & Network (2)

| Tool | What it does |
|------|-------------|
| `transform_to_network_graph` | Edge list → Flow id + pipe-delimited connections |
| `flow_query_graph` | FalkorDB Cypher → Flow CSV + optional force layout |

### Statistical Analysis (5)

| Tool | What it does |
|------|-------------|
| `flow_correlation_matrix` | Pairwise Pearson correlations → heatmap-ready matrix |
| `flow_regression_analysis` | Linear regression: slope, R², p-value, predicted/residual |
| `flow_anomaly_detect` | Z-score/IQR anomaly detection with scoring |
| `flow_outlier_fence` | Tukey fence outlier detection |
| `flow_rank_values` | Dense/ordinal/min/max ranking |

### Data Transformation (17)

| Tool | What it does |
|------|-------------|
| `flow_normalize_data` | Min-max, z-score, or robust (MAD) normalization |
| `flow_fill_missing` | Impute: constant, mean, median, mode, forward fill, linear/nearest/zero interpolation |
| `flow_deduplicate_rows` | Remove duplicates with optional case-insensitive matching |
| `flow_bin_data` | Histogram binning (Sturges' rule) |
| `flow_discretize` | Equal-width/equal-frequency discretization |
| `flow_computed_columns` | Add calculated columns via safe formulas |
| `flow_parse_dates` | Extract year/month/day/quarter/epoch from dates |
| `flow_validate_rules` | Data quality: not_null, min, max, unique, pattern |
| `flow_filter_rows` | Filter by conditions: equals, contains, greater_than |
| `flow_encode_categorical` | Label or one-hot encoding |
| `flow_string_split` | Split delimited strings into columns |
| `flow_string_extract` | Regex capture group extraction |
| `flow_column_stats` | Descriptive stats: mean, median, std, quartiles |
| `flow_describe_dataset` | Full dataset profiling: shape, types, nulls, uniques |
| `flow_lag_lead` | Shift values forward/backward for time series |
| `flow_concat_rows` | Concatenate datasets vertically |
| `flow_unpivot` | Wide → long format transformation |

### Aggregation & Reshaping (5)

| Tool | What it does |
|------|-------------|
| `flow_pivot_table` | Group by + aggregate (sum/avg/count/min/max) |
| `flow_cross_tabulate` | Contingency tables with aggregation |
| `flow_window_functions` | Rolling/sliding window operations |
| `flow_cumulative` | Running cumulative sum/min/max/count |
| `flow_hierarchical_data` | Flat data → hierarchical tree for network viz |

### Spatial & Temporal (4)

| Tool | What it does |
|------|-------------|
| `flow_geo_enhance` | Geocoding: city/country → latitude/longitude |
| `flow_time_series_animate` | Temporal data → animation frames |
| `flow_live_data` | Real-time: USGS earthquakes, weather, World Bank |
| `flow_compare_datasets` | Side-by-side dataset diff |

### Export & Integration (3)

| Tool | What it does |
|------|-------------|
| `flow_export_formats` | CSV → JSON, GeoJSON, HTML 3D viewer, stats summary |
| `flow_merge_datasets` | Join/concatenate CSVs with conflict resolution |
| `flow_join_datasets` | SQL-style joins (inner/left/right/full) |

### Narrative Intelligence (3)

| Tool | What it does |
|------|-------------|
| `flow_narrate_data` | CSV → narrative arc with statistical characters, 3 styles |
| `flow_guided_tour` | CSV → tour stops with camera hints, narration, 5 focus strategies |
| `flow_famous_network` | Person name → Wikidata celebrity network CSV (zero-cost) |

Plus **3 prompts** and **5 resources** for guided workflows.

## Demos

Interactive 3D viewers generated by FlowMCP — **[Live Demo](https://halyxa.github.io/flowmcp/)**:

- **[Neural Network Architecture](https://halyxa.github.io/flowmcp/neural-network-3d.html)** — 160 nodes, 2,610 connections
- **[Global Startup Funding](https://halyxa.github.io/flowmcp/global-startup-funding-3d.html)** — 420 companies, 30 countries
- **[Global Supply Chain](https://halyxa.github.io/flowmcp/supply-chain-3d.html)** — 100 nodes, 200 edges, 6 tiers
- **[Climate Change Indicators](https://halyxa.github.io/flowmcp/climate-indicators-3d.html)** — 1,040 observations, 26 years

## Pipeline Example

```
1. flow_extract_from_text       → entities + relationships from article
2. analyze_data_for_flow        → 3D fitness score (9.2/10)
3. transform_to_network_graph   → Flow network CSV format
4. flow_precompute_force_layout → offline physics → x,y,z positions
5. flow_compute_graph_metrics   → PageRank, centrality, communities
6. flow_upload_data             → push to Flow Immersive
7. flow_export_formats          → standalone HTML 3D viewer
```

## Testing

```bash
npm test           # 875 tests
npm run smoke-test # 15 standalone MCP checks
npm run ci         # Full pipeline: build + test + smoke
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FALKORDB_HOST` | `localhost` | FalkorDB server host |
| `FALKORDB_PORT` | `6379` | FalkorDB server port |
| `FALKORDB_USERNAME` | — | FalkorDB auth username |
| `FALKORDB_PASSWORD` | — | FalkorDB auth password |
| `MCP_AUTH_TOKEN` | — | Bearer token for HTTP transport auth |
| `MCP_HTTP_PORT` | `3100` | HTTP transport port |
| `MCP_HTTP_HOST` | `127.0.0.1` | HTTP transport bind address |

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
