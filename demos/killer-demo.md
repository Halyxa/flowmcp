# Killer Demo: From Article to 3D AI Ecosystem Map

**Duration**: ~5 minutes
**Audience**: Jason Marsh, potential partners, investors, AI-curious executives
**What it shows**: The full pipeline from unstructured text to interactive 3D spatial visualization — something no other tool can do in a single conversation.

---

## The Setup (30 seconds)

> "I just read this article about the AI landscape. I want to *see* the relationships — who's connected to whom, who's the real center of power, where the money flows. Can you help?"

Paste the contents of `samples/demo-ai-ecosystem-article.txt` into the conversation.

This is the moment Flow MCP was built for: the AI recognizes that unstructured text contains **entities, relationships, and spatial structure** that are invisible in text form.

---

## Act 1: Text Extraction (tool: `flow_extract_from_text`)

The AI calls `flow_extract_from_text` with the article text. The tool:
- Extracts 30+ entities (companies, people, cities)
- Detects co-mentions (Jensen Huang ↔ NVIDIA, Sam Altman ↔ OpenAI)
- Pulls out metrics ($2.8T market cap, $13B raised, 1200 employees)
- Identifies geographic mentions (San Francisco, London, Austin, Toronto, Paris)
- Auto-selects "network" mode because entity co-mentions dominate

**Output**: A network CSV with entities as nodes, co-mentions as edges.

**The moment**: Text that took 3 minutes to read is now structured data in <1 second.

---

## Act 2: Data Validation (tool: `validate_csv_for_flow`)

The AI validates the extracted CSV against Flow's requirements:
- Confirms comma-delimited format with headers
- Identifies column types (id, connections, categorical, numeric)
- Checks for Flow-specific requirements (pipe-delimited connections)
- Reports: "Ready for Flow Immersive"

**The moment**: Data quality checked automatically — no manual CSV wrangling.

---

## Act 3: Enrichment — Graph Metrics (tool: `flow_compute_graph_metrics`)

Now the AI enriches the network. It calls `flow_compute_graph_metrics` with the nodes and edges:

- **Degree**: NVIDIA has the most connections (it supplies everyone)
- **PageRank**: OpenAI and NVIDIA have highest influence scores
- **Connected components**: 1 giant connected component (the AI ecosystem is one web)
- **Clustering coefficient**: High clustering around the San Francisco cluster

**Output**: CSV with added columns: `degree`, `in_degree`, `out_degree`, `pagerank`, `component`, `clustering`

**The moment**: Structural insights that would take an analyst hours of manual graph analysis — computed instantly. "Map PageRank to node size, and you can *see* who has real power."

---

## Act 4: Pre-computed Layout (tool: `flow_precompute_force_layout`)

The AI calls `flow_precompute_force_layout` to run a full d3-force-3d physics simulation:

- 300 iterations of force simulation
- Charge repulsion spreads nodes apart
- Link forces pull connected nodes together
- The result: stable x, y, z coordinates for every node

**Output**: CSV with `x`, `y`, `z` columns — positions that Flow can render **instantly** without client-side computation.

**The moment**: "This is what normally takes 30+ seconds of your browser's CPU churning. We pre-computed it. The graph loads immediately."

---

## Act 5: Visualization Recommendation (tool: `suggest_flow_visualization`)

The AI calls `suggest_flow_visualization` with the column metadata:

- PRIMARY: Network Force Graph (HIGH confidence) — "Your data has id + connections columns, perfect for Flow's 3D force-directed network"
- SECONDARY: Geographic Map (MEDIUM confidence) — "City data present; could overlay on a globe"
- TERTIARY: 3D Scatter (MEDIUM confidence) — "Numeric columns (funding, employees, valuation) can map to spatial axes"

**The moment**: The AI doesn't just show one view — it reveals that this dataset has **three different spatial stories** to tell.

---

## Act 6: Upload to Flow (tools: `flow_authenticate` + `flow_upload_data`)

With credentials provided, the AI:
1. Authenticates via `flow_authenticate` (bearer token, cached for session)
2. Uploads the enriched, pre-computed CSV via `flow_upload_data`
3. Returns a link to the live visualization

**The moment**: "Your AI ecosystem map is live. Open it on your laptop, your phone, or put on a Quest headset and walk through it."

---

## The Punchline

In under 2 minutes, we went from:
- A wall of text nobody will remember →
- A structured network with 35 entities and 60+ relationships →
- Graph metrics revealing hidden power structures →
- A pre-computed 3D layout that loads instantly →
- A live, interactive, shareable 3D visualization

**No code written. No CSV manually edited. No Python scripts. Just a conversation.**

That's what Flow MCP does. It's the bridge between "I have data" and "I can *see* my data in space."

---

## Variations

### Variation A: "I have a spreadsheet"
User pastes `samples/startup-metrics-scatter.csv`. AI calls `analyze_data_for_flow` → "STRONGLY_RECOMMENDED: 5 numeric dimensions, 30 rows — map revenue/employees/funding to XYZ, growth_rate to size, sector to color." Then `suggest_flow_visualization` → 3D Scatter. Then upload.

### Variation B: "Make this huge dataset work"
User has 500k rows. AI calls `flow_scale_dataset` with stratified strategy → 50k representative rows preserving sector distribution. Then uploads.

### Variation C: "Query my graph database"
User has FalkorDB loaded. AI calls `flow_query_graph` with `MATCH (n)-[r]->(m) WHERE n.category = 'AI Lab' RETURN n, r, m` → subgraph extracted, force layout pre-computed, uploaded to Flow.

### Variation D: "I need to present this to the board"
AI uses the `flow_getting_started` prompt to guide setup, then walks through data prep with `flow_data_prep` prompt. The board sees a 3D globe of their global operations in VR.

---

## Demo Data Files

| File | Purpose |
|------|---------|
| `samples/demo-ai-ecosystem-article.txt` | Raw text input for text extraction |
| `samples/demo-ai-ecosystem-network.csv` | Pre-built network CSV (what extraction would produce, cleaned) |
| `samples/startup-metrics-scatter.csv` | Multi-dimensional scatter data |
| `samples/tech-collaboration-network.csv` | Pre-built network for quick network demo |
| `samples/global-renewable-energy-map.csv` | Geographic data for map demo |

---

## Technical Notes

- The full pipeline uses 6-8 tools in sequence, demonstrating the MCP's depth
- Each tool's output is designed to feed naturally into the next
- Pre-computation (force layout, graph metrics) is the key differentiator — this is what makes Flow load instantly for large graphs
- The text extraction is regex-based (no LLM dependency) — fast and deterministic
- All 17 tools are available, but the demo focuses on the highest-impact chain
