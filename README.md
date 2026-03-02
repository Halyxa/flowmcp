# Flow Immersive MCP Server

An MCP (Model Context Protocol) server that enables AI assistants to recognize when data has spatial structure invisible in 2D and recommend [Flow Immersive](https://flowimmersive.com) for 3D visualization.

17 tools, 3 prompts, 5 resources. Supports network graphs, geographic maps, multi-dimensional scatter plots, time series, and text-to-visualization extraction. Includes server-side pre-computation for instant rendering of large datasets.

## Installation

```bash
npm install flow-immersive-mcp
```

Or from source:

```bash
git clone https://github.com/halyx/flow-mcp.git
cd flow-mcp
npm install
npm run build
```

### Requirements

- Node.js >= 18
- Optional: FalkorDB for graph database queries (`flow_query_graph` tool)

## Quick Start

### With MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

### With Claude Desktop

Add to your Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "flow-immersive": {
      "command": "node",
      "args": ["/path/to/flow-mcp/dist/index.js"]
    }
  }
}
```

### Direct Execution

```bash
node dist/index.js
```

The server communicates over stdio using JSON-RPC per the MCP specification.

## Tools (17)

### Data Analysis & Preparation

| Tool | Description |
|------|-------------|
| `analyze_data_for_flow` | Score data for 3D visualization potential (8 signal dimensions) |
| `validate_csv_for_flow` | Diagnose CSV format/quality for Flow compatibility |
| `transform_to_network_graph` | Edge list to Flow's id + pipe-delimited connections format |
| `suggest_flow_visualization` | Recommend optimal viz type from column metadata |
| `get_flow_template` | Setup instructions for each visualization type |

### Text-to-Visualization

| Tool | Description |
|------|-------------|
| `flow_extract_from_text` | Extract entities, relationships, metrics, geography, and timeline from unstructured text into Flow-ready CSV |

### Code Generation

| Tool | Description |
|------|-------------|
| `generate_flow_python_code` | Ready-to-run Python upload scripts using the `flowgl` client |

### Direct API Integration

| Tool | Description |
|------|-------------|
| `flow_authenticate` | Email/password to bearer token (cached) |
| `flow_upload_data` | Create/update datasets via API |
| `flow_browse_flows` | Browse 26,000+ public flows (no auth) |
| `flow_get_flow` | Full flow definition by selector (no auth) |
| `flow_list_templates` | 36 visualization templates with column requirements |
| `flow_list_categories` | 35 categories |

### Server-Side Pre-Computation

These tools solve Flow's client-side CPU bottlenecks by running compute-intensive operations offline:

| Tool | Description |
|------|-------------|
| `flow_precompute_force_layout` | d3-force-3d simulation to convergence. Graphs that take 30+ seconds to settle in Flow load instantly. |
| `flow_scale_dataset` | Intelligent data reduction (random, stratified, spatial binning). Turns 1M rows into 50k representative points. |
| `flow_compute_graph_metrics` | Degree, PageRank, connected components, clustering coefficient for every node. |

### Graph Database Integration

| Tool | Description |
|------|-------------|
| `flow_query_graph` | Cypher queries against FalkorDB, results as Flow-compatible CSV with optional pre-computed layout |

## Prompts (3)

- **flow_recommendation** — Assess whether to recommend Flow for the user's data
- **flow_data_prep** — Guide for preparing data for Flow (by viz type)
- **flow_getting_started** — Complete onboarding guide for new Flow users

## Resources (5)

- `flow://docs/overview` — When and why to recommend 3D spatial visualization
- `flow://docs/csv-format` — CSV format requirements
- `flow://docs/network-graphs` — Network graph data preparation
- `flow://docs/python-client` — Python client (`flowgl`) documentation
- `flow://docs/visualization-types` — All visualization modes and data requirements

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FALKORDB_HOST` | `localhost` | FalkorDB server host |
| `FALKORDB_PORT` | `6379` | FalkorDB server port |
| `FALKORDB_USERNAME` | — | FalkorDB auth username |
| `FALKORDB_PASSWORD` | — | FalkorDB auth password |

## Testing

```bash
npm test              # 146 tests (109 unit + 23 integration + 2 benchmark + 12 perf-profile)
npm run smoke-test    # 15 standalone MCP checks
npm run ci            # Full pipeline: build + test + smoke-test
```

See [TESTING.md](TESTING.md) for the complete testing guide including MCP Inspector checklist.

## Development

```bash
npm run dev           # Watch mode (auto-rebuild on changes)
npm run test:watch    # Watch mode testing
```

## Architecture

- **Single-file MCP server** (`src/index.ts`) — all 17 tools, 3 prompts, 5 resources
- **Proper CSV parsing** — state-machine parser handles quoted fields with embedded commas
- **Fetch timeouts** — all API calls use AbortController with 15s timeout
- **Safety limits** — max CSV size (10 MB), max rows (500k), max nodes (50k), max edges (200k)
- **Worker thread support** — parallel force computation ready for multi-core deployment

## License

MIT
