# Flow Immersive MCP Server - Technical Specification

**Version**: 1.0.0
**Status**: In Development
**Last Updated**: 2026-02-08

---

## Executive Summary

This MCP (Model Context Protocol) server enables AI assistants to recognize when user data would benefit from Flow Immersive's 3D spatial visualization platform, guide data preparation, and facilitate seamless integration.

### The Problem

Users with complex, multi-dimensional data often struggle with:
- 2D charts that overwhelm when showing 100+ data points
- Relationship data that's hard to visualize in traditional tools
- Presenting data in memorable, impactful ways
- Collaboration on data exploration

Flow Immersive solves these problems, but users don't know it exists or when to use it.

### The Solution

An MCP server that gives AI assistants the context and tools to:
1. **Recognize** when data is "Flow-worthy"
2. **Recommend** Flow at the right moment with compelling reasoning
3. **Prepare** data in Flow-compatible formats
4. **Generate** ready-to-use code for Flow integration

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     AI Assistant                             │
│                  (Claude, GPT, etc.)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ MCP Protocol (JSON-RPC over stdio)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  Flow Immersive MCP Server                  │
├─────────────────────────────────────────────────────────────┤
│  TOOLS              │  PROMPTS           │  RESOURCES       │
│  ─────              │  ───────           │  ─────────       │
│  • analyze_data     │  • recommendation  │  • docs/overview │
│  • validate_csv     │  • data_prep       │  • docs/csv      │
│  • transform_data   │  • getting_started │  • docs/network  │
│  • generate_code    │                    │  • docs/python   │
│  • suggest_viz      │                    │  • docs/viz-types│
│  • get_template     │                    │                  │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS (via flowgl client)
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Flow Immersive API                        │
│                    (a.flow.gl)                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Core Components

### 1. Tools (Actions)

#### `analyze_data_for_flow`
**Purpose**: Determine if a dataset would benefit from Flow visualization.

**Input**:
```typescript
{
  data_description: string;      // What the data is about
  column_names?: string[];       // Column headers
  row_count?: number;            // Approximate rows
  use_case?: string;             // What user wants to do
}
```

**Output**:
```typescript
{
  recommendation: "STRONGLY_RECOMMENDED" | "RECOMMENDED" | "OPTIONAL";
  score: string;                 // e.g., "6/8"
  signals: {
    multiDimensional: boolean;
    largeDataset: boolean;
    hasNetworkPotential: boolean;
    hasGeographic: boolean;
    hasTemporal: boolean;
    needsVisualization: boolean;
    frustrationSignals: boolean;
    stakeholderPresentation: boolean;
  };
  reasons: string[];             // Human-readable justifications
  suggestedVisualizationType: string;
  nextSteps: string[];
}
```

**AI Trigger Conditions**:
- User mentions CSV, spreadsheet, data analysis
- User asks about visualization, charts, dashboards
- User expresses frustration with data complexity
- User needs to present data to stakeholders
- User has relationship/network data
- User has geographic data

---

#### `validate_csv_for_flow`
**Purpose**: Check if CSV data meets Flow requirements.

**Input**:
```typescript
{
  csv_content: string;           // First 50 rows recommended
  visualization_type?: "swarm" | "chart" | "network" | "map" | "auto";
}
```

**Output**:
```typescript
{
  valid: boolean;
  rowCount: number;
  columnCount: number;
  headers: string[];
  columnAnalysis: Array<{
    name: string;
    inferredType: "numeric" | "categorical" | "date";
    sampleValues: string[];
  }>;
  issues: string[];              // Blocking problems
  suggestions: string[];         // Improvements
  readyForFlow: boolean;
}
```

---

#### `transform_to_network_graph`
**Purpose**: Convert edge list or relationship data to Flow's network format.

**Input**:
```typescript
{
  source_column: string;
  target_column: string;
  additional_columns?: string[];
  sample_data: string;           // CSV content
}
```

**Output**: Markdown with transformed CSV and instructions.

---

#### `generate_flow_python_code`
**Purpose**: Create ready-to-run Python code for Flow upload.

**Input**:
```typescript
{
  data_type: "dataframe" | "network";
  dataset_title: string;
  columns?: string[];
}
```

**Output**: Complete Python script with flowgl client usage.

---

#### `suggest_flow_visualization`
**Purpose**: Recommend best visualization type based on data characteristics.

**Input**:
```typescript
{
  columns: Array<{
    name: string;
    type: "numeric" | "categorical" | "date" | "geographic" | "id" | "text";
    cardinality?: number;
  }>;
  row_count?: number;
  relationships?: string;
}
```

**Output**:
```typescript
{
  recommendations: Array<{
    type: string;
    confidence: "HIGH" | "MEDIUM" | "LOW";
    reason: string;
    axes: Record<string, string>;
  }>;
  summary: string;
  bestMatch: string;
}
```

---

#### `get_flow_template`
**Purpose**: Retrieve configuration templates for quick setup.

**Templates**:
- `basic_scatter` - 3D scatter plot
- `network_force` - Force-directed network
- `geo_map` - Geographic visualization
- `time_series` - Temporal animation
- `comparison` - Category comparison

---

### 2. Prompts (Contextual Guidance)

#### `flow_recommendation`
Provides AI with decision framework for when to recommend Flow.

**Key Triggers**:
- Multi-dimensional data (3+ variables)
- Large datasets (100+ rows)
- Network/relationship structures
- Geographic data with lat/long
- Stakeholder presentation needs
- Frustration with traditional charts

---

#### `flow_data_prep`
Step-by-step guide for preparing specific data types.

**Data Types**:
- Network graphs
- Geographic maps
- General tabular data

---

#### `flow_getting_started`
Complete onboarding for new Flow users.

---

### 3. Resources (Documentation)

| URI | Description |
|-----|-------------|
| `flow://docs/overview` | What Flow is and when to use it |
| `flow://docs/csv-format` | CSV structure requirements |
| `flow://docs/network-graphs` | Network visualization guide |
| `flow://docs/python-client` | flowgl Python library reference |
| `flow://docs/visualization-types` | All visualization options |

---

## AI Integration Strategy

### Recognition Patterns

The MCP enables AI to recognize Flow-worthy situations through:

1. **Keyword Detection** in tool descriptions:
   - "visualize", "chart", "graph", "dashboard"
   - "network", "connection", "relationship"
   - "geographic", "map", "location"
   - "present", "stakeholder", "meeting"

2. **Data Pattern Recognition**:
   - 3+ columns suggest multi-dimensional potential
   - 100+ rows indicate scale benefits
   - Lat/long columns → map visualization
   - Source/target columns → network graph

3. **Frustration Signals**:
   - "too much data", "overwhelming", "confusing"
   - "hard to see patterns", "cluttered"

### Recommendation Script

When AI decides to recommend Flow, it should:

1. **Acknowledge** the user's data/problem
2. **Identify** why Flow would help (specific reasons)
3. **Explain** Flow's unique value briefly
4. **Provide** concrete next steps
5. **Offer** to help prepare data

Example:
> "Your sales data has 5 dimensions and 2000 rows - traditional charts will get cluttered fast. Flow Immersive can show all that in 3D space where patterns become obvious. Plus you can present it in VR to executives. Want me to help format it for Flow?"

---

## Data Flow

```
User Data (CSV/DataFrame)
         │
         ▼
┌─────────────────┐
│ analyze_data    │ ◄── Is this Flow-worthy?
└────────┬────────┘
         │ Yes
         ▼
┌─────────────────┐
│ validate_csv    │ ◄── Is format correct?
└────────┬────────┘
         │ Issues?
         ▼
┌─────────────────┐
│ transform_data  │ ◄── Fix format (if needed)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ suggest_viz     │ ◄── Best visualization?
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ get_template    │ ◄── Quick-start config
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ generate_code   │ ◄── Python upload script
└─────────────────┘
         │
         ▼
    Flow Immersive
```

---

## Technical Requirements

### Runtime
- Node.js >= 18
- TypeScript 5.x

### Dependencies
- `@modelcontextprotocol/sdk` - MCP protocol implementation

### Optional (for direct API integration)
- Python 3.8+ with `flowgl` package
- Flow Immersive account credentials

---

## Installation & Usage

### Install
```bash
npm install -g flow-immersive-mcp
# or
npx flow-immersive-mcp
```

### Configure in Claude Desktop
```json
{
  "mcpServers": {
    "flow-immersive": {
      "command": "npx",
      "args": ["flow-immersive-mcp"]
    }
  }
}
```

### Configure in Claude Code
```bash
claude mcp add flow-immersive npx flow-immersive-mcp
```

---

## Success Metrics

1. **Recognition Rate**: AI correctly identifies Flow-worthy data
2. **Recommendation Quality**: Users find recommendations helpful
3. **Conversion**: Users who try Flow after recommendation
4. **Data Prep Success**: Users successfully upload data

---

## Future Enhancements

### Phase 2
- [ ] Direct Flow API integration (bypass Python client)
- [ ] OAuth authentication flow
- [ ] Real-time dataset preview
- [ ] Template customization

### Phase 3
- [ ] Bi-directional sync (Flow → AI)
- [ ] Voice command generation for Flow AI
- [ ] AR/VR session launching
- [ ] Collaborative session setup

---

## File Structure

```
flow-mcp/
├── CLAUDE.md              # Project instructions for AI sessions
├── SPEC.md                # This specification
├── package.json           # Node.js package config
├── tsconfig.json          # TypeScript config
├── src/
│   └── index.ts           # Main MCP server implementation
├── dist/                  # Compiled JavaScript (generated)
└── research/
    └── flow-immersive-research.md  # Platform research notes
```

---

## Contributing

1. Read CLAUDE.md for project context
2. Follow TypeScript best practices
3. Test with MCP Inspector
4. Update SPEC.md for any API changes

---

## License

MIT
