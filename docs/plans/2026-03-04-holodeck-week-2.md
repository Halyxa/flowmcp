# Holodeck Week 2: Tools 72-75 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 4 new tools (fog of war, explorer profile, viral video spec, discovery narrator) that make FlowMCP investor-demo-ready and usable by Jason himself.

**Architecture:** Each tool is a pure function in its own `.ts` file, following the exact pattern of tools 61-71 (tools-sparkle.ts, tools-dna.ts, etc.). CSV input via `csv_data` (bridged by normalizeCsvArgs). JSON-structured output. No state, no side effects, worker-thread safe. Tool descriptions use trigger language (INVOKE THIS TOOL WHEN) matching the established pattern. All tools must be usable by Jason directly — clear descriptions, sensible defaults, no developer jargon.

**Tech Stack:** TypeScript, vitest, csv-utils.ts (parseCSVLine, parseCsvToRows, csvEscapeField, normalizeCsvArgs), d3-force-3d (for video camera paths)

**Jason-ready principle:** Every tool must work with just `csv_data` and zero optional args. Defaults should produce useful output. Descriptions should make sense to a non-technical CEO who knows his product.

---

## Task 1: flow_fog_of_war — Stateful Progressive Disclosure

**Files:**
- Create: `src/tools-fog.ts`
- Create: `src/tools-fog.test.ts`
- Modify: `src/index.ts` (import + tool definition + case handler)

### What it does
Takes CSV + optional exploration history (what columns/rows the user has looked at). Returns the same CSV but with columns/rows hidden behind visibility layers. Unexplored regions get `_visibility` = 0 (hidden), explored ones get 1-4. Unlike tool 63 (progressive_disclosure which uses config-based layers), this tool responds to USER BEHAVIOR — what they've actually looked at.

### Step 1: Write test file with failing tests

```typescript
// src/tools-fog.test.ts
import { describe, it, expect } from "vitest";
import { flowFogOfWar } from "./tools-fog.js";
import { parseCSVLine } from "./csv-utils.js";

const BUSINESS_DATA = [
  "company,revenue,employees,growth,region,founded",
  "Acme Corp,5000000,250,12.5,West,2010",
  "Beta Inc,1200000,45,8.3,East,2015",
  "Gamma LLC,9500000,800,25.1,West,2005",
  "Delta Co,300000,12,2.1,South,2020",
  "Epsilon Ltd,4500000,200,15.0,East,2012",
  "Zeta Corp,850000,30,-5.2,North,2018",
  "Eta Inc,7200000,500,18.7,West,2008",
  "Theta Co,2100000,90,7.4,South,2016",
  "Iota Ltd,6800000,450,22.3,East,2011",
  "Kappa Inc,150000,5,0.8,North,2022",
].join("\n");

const NETWORK_DATA = [
  "id,connections,group",
  "Alice,Bob|Charlie,Engineering",
  "Bob,Alice|Diana,Engineering",
  "Charlie,Alice|Eve,Design",
  "Diana,Bob|Eve|Frank,Management",
  "Eve,Charlie|Diana,Design",
  "Frank,Diana,Management",
].join("\n");

describe("flow_fog_of_war", () => {
  describe("basic functionality", () => {
    it("returns all columns visible when full exploration history provided", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: {
          columns_viewed: ["company", "revenue", "employees", "growth", "region", "founded"],
          rows_viewed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
      });
      expect(result.visible_columns).toHaveLength(6);
      expect(result.hidden_columns).toHaveLength(0);
      expect(result.fog_csv).toContain("company");
      expect(result.fog_csv).toContain("revenue");
    });

    it("hides unexplored columns when no history provided", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      // With no history, only the first 2-3 columns are visible (starter reveal)
      expect(result.visible_columns.length).toBeLessThanOrEqual(3);
      expect(result.hidden_columns.length).toBeGreaterThan(0);
      expect(result.reveal_hints.length).toBeGreaterThan(0);
    });

    it("progressively reveals columns as exploration history grows", () => {
      const r1 = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: ["company"], rows_viewed: [0] },
      });
      const r2 = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: ["company", "revenue"], rows_viewed: [0, 1, 2] },
      });
      const r3 = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: {
          columns_viewed: ["company", "revenue", "employees", "growth"],
          rows_viewed: [0, 1, 2, 3, 4, 5],
        },
      });
      expect(r2.visible_columns.length).toBeGreaterThanOrEqual(r1.visible_columns.length);
      expect(r3.visible_columns.length).toBeGreaterThanOrEqual(r2.visible_columns.length);
    });

    it("includes _visibility column in output CSV", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      const headers = parseCSVLine(result.fog_csv.split("\n")[0]);
      expect(headers).toContain("_visibility");
    });

    it("includes _reveal_hint column in output CSV", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      const headers = parseCSVLine(result.fog_csv.split("\n")[0]);
      expect(headers).toContain("_reveal_hint");
    });
  });

  describe("reveal hints", () => {
    it("generates hints about hidden columns", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      expect(result.reveal_hints.length).toBeGreaterThan(0);
      for (const hint of result.reveal_hints) {
        expect(hint.hidden_column).toBeTruthy();
        expect(hint.tease).toBeTruthy();
        expect(hint.unlock_action).toBeTruthy();
      }
    });

    it("hints reference actual statistical properties", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: ["company", "revenue"], rows_viewed: [0, 1] },
      });
      // Hints about hidden columns should tease actual data
      const hints = result.reveal_hints;
      expect(hints.some((h: any) => h.tease.length > 10)).toBe(true);
    });
  });

  describe("visibility layers", () => {
    it("assigns visibility 0-4 to rows", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      const lines = result.fog_csv.split("\n").filter((l: string) => l.trim());
      const headers = parseCSVLine(lines[0]);
      const visIdx = headers.indexOf("_visibility");
      expect(visIdx).toBeGreaterThan(-1);
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCSVLine(lines[i]);
        const vis = Number(cols[visIdx]);
        expect(vis).toBeGreaterThanOrEqual(0);
        expect(vis).toBeLessThanOrEqual(4);
      }
    });

    it("viewed rows get higher visibility than unviewed", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: ["company", "revenue"], rows_viewed: [0, 1] },
      });
      const lines = result.fog_csv.split("\n").filter((l: string) => l.trim());
      const headers = parseCSVLine(lines[0]);
      const visIdx = headers.indexOf("_visibility");
      // Row 0 and 1 should have higher visibility
      const row0Vis = Number(parseCSVLine(lines[1])[visIdx]);
      const row5Vis = Number(parseCSVLine(lines[6])[visIdx]);
      expect(row0Vis).toBeGreaterThanOrEqual(row5Vis);
    });
  });

  describe("network data", () => {
    it("works with network format CSV", () => {
      const result = flowFogOfWar({ csv_data: NETWORK_DATA });
      expect(result.fog_csv).toContain("id");
      expect(result.world_coverage).toBeGreaterThanOrEqual(0);
      expect(result.world_coverage).toBeLessThanOrEqual(1);
    });

    it("reveals connected nodes when a node is explored", () => {
      const result = flowFogOfWar({
        csv_data: NETWORK_DATA,
        exploration_history: { columns_viewed: ["id", "connections"], rows_viewed: [0] },
      });
      // Alice's connections (Bob, Charlie) should get visibility boost
      const lines = result.fog_csv.split("\n").filter((l: string) => l.trim());
      const headers = parseCSVLine(lines[0]);
      const visIdx = headers.indexOf("_visibility");
      const idIdx = headers.indexOf("id");
      // Alice (row 0) should have high visibility
      const aliceVis = Number(parseCSVLine(lines[1])[visIdx]);
      expect(aliceVis).toBeGreaterThanOrEqual(2);
    });
  });

  describe("summary stats", () => {
    it("returns world coverage as a fraction", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      expect(result.world_coverage).toBeGreaterThanOrEqual(0);
      expect(result.world_coverage).toBeLessThanOrEqual(1);
    });

    it("full exploration gives coverage near 1.0", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: {
          columns_viewed: ["company", "revenue", "employees", "growth", "region", "founded"],
          rows_viewed: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
        },
      });
      expect(result.world_coverage).toBeGreaterThanOrEqual(0.8);
    });

    it("no exploration gives low coverage", () => {
      const result = flowFogOfWar({ csv_data: BUSINESS_DATA });
      expect(result.world_coverage).toBeLessThanOrEqual(0.5);
    });
  });

  describe("edge cases", () => {
    it("handles single-row CSV", () => {
      const result = flowFogOfWar({ csv_data: "name,value\nAlice,42" });
      expect(result.fog_csv).toBeTruthy();
      expect(result.visible_columns.length).toBeGreaterThan(0);
    });

    it("handles single-column CSV", () => {
      const result = flowFogOfWar({ csv_data: "score\n85\n92\n78" });
      expect(result.fog_csv).toBeTruthy();
    });

    it("handles empty exploration history", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: [], rows_viewed: [] },
      });
      expect(result.fog_csv).toBeTruthy();
    });

    it("handles exploration of non-existent columns gracefully", () => {
      const result = flowFogOfWar({
        csv_data: BUSINESS_DATA,
        exploration_history: { columns_viewed: ["nonexistent"], rows_viewed: [999] },
      });
      expect(result.fog_csv).toBeTruthy();
    });

    it("uses csv_content as alias for csv_data", () => {
      const result = flowFogOfWar({ csv_content: BUSINESS_DATA } as any);
      expect(result.fog_csv).toBeTruthy();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run src/tools-fog.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/tools-fog.ts` with:
- `FogOfWarInput` interface: `csv_data: string`, `exploration_history?: { columns_viewed: string[], rows_viewed: number[] }`
- `RevealHint` interface: `hidden_column: string`, `tease: string`, `unlock_action: string`
- `FogOfWarResult` interface: `fog_csv: string`, `visible_columns: string[]`, `hidden_columns: string[]`, `reveal_hints: RevealHint[]`, `world_coverage: number`
- Core logic:
  1. Parse CSV with parseCsvToRows
  2. Profile each column (compute basic stats for tease generation)
  3. Determine visibility based on exploration history:
     - No history → reveal first 2 columns + id column if present (starter reveal)
     - History provided → reveal viewed columns + adjacent columns (neighbors in correlation space)
     - Network data → revealing a node also boosts visibility of connected nodes
  4. Assign `_visibility` (0-4) per row based on exploration depth
  5. Generate `_reveal_hint` per row pointing to nearest hidden dimension
  6. Generate structured reveal hints with teases about hidden columns
  7. Compute `world_coverage` = (explored cells) / (total cells)
- Use `normalizeCsvArgs` to bridge csv_content/csv_data

**Step 4: Run tests to verify they pass**

Run: `npx vitest run src/tools-fog.test.ts`
Expected: ALL PASS

**Step 5: Register in index.ts**

Add import, tool definition (with trigger language), and case handler following the exact pattern of tools 67-71. Tool description must be Jason-friendly:
```
Reveal your data one layer at a time — like fog of war in a video game. Unexplored dimensions stay hidden until you earn them through exploration. The data WANTS to be discovered.

INVOKE THIS TOOL WHEN:
- User has a dataset and wants to explore it progressively
- User says "what's hidden" or "what haven't I seen yet"
- User wants a game-like exploration experience with their data
- After using other tools, to see what dimensions remain unexplored
- User says "fog of war" or "reveal more" or "what's behind the fog"
```

**Step 6: Run full test suite**

Run: `npm test`
Expected: 1278 + ~20 = ~1298 tests, zero failures

**Step 7: Commit**

```bash
git add src/tools-fog.ts src/tools-fog.test.ts src/index.ts
git commit -m "Tool 72: flow_fog_of_war — stateful progressive disclosure

Fog of war for data: unexplored columns/rows stay hidden until
the user's exploration history earns them. Network-aware (exploring
a node reveals its neighbors). Generates reveal hints that tease
what's behind the fog using actual statistical properties."
```

---

## Task 2: flow_explorer_profile — Analytical DNA Fingerprinting

**Files:**
- Create: `src/tools-explorer.ts`
- Create: `src/tools-explorer.test.ts`
- Modify: `src/index.ts` (import + tool definition + case handler)

### What it does
Takes a sequence of exploration actions (which tools were called, which columns examined, what patterns found) and generates an explorer profile — 8 archetype scores, dominant type, strengths, blind spots, and a shareable DNA string. This is "Spotify Wrapped for data analysts."

### Step 1: Write test file with failing tests

```typescript
// src/tools-explorer.test.ts
import { describe, it, expect } from "vitest";
import { flowExplorerProfile } from "./tools-explorer.js";

const ANOMALY_HUNTER_ACTIONS = [
  { tool: "flow_anomaly_detect", columns: ["revenue", "growth"], finding: "3 outliers found" },
  { tool: "flow_anomaly_explain", columns: ["revenue"], finding: "Revenue spike in Q3" },
  { tool: "flow_near_miss_detector", columns: ["profit"], finding: "Almost-significant correlation" },
  { tool: "flow_outlier_fence", columns: ["growth"], finding: "2 rows beyond fence" },
  { tool: "flow_visor_mode", columns: ["revenue", "employees"], finding: "anomaly visor active" },
];

const CORRELATION_SPOTTER_ACTIONS = [
  { tool: "flow_correlation_matrix", columns: ["revenue", "employees", "growth"], finding: "r=0.92" },
  { tool: "flow_regression_analysis", columns: ["revenue", "employees"], finding: "R²=0.85" },
  { tool: "flow_pca_reduce", columns: ["a", "b", "c", "d"], finding: "2 components explain 90%" },
  { tool: "flow_visor_mode", columns: ["revenue", "profit"], finding: "relational visor" },
];

const NETWORK_NAVIGATOR_ACTIONS = [
  { tool: "flow_compute_graph_metrics", columns: ["id", "connections"], finding: "6 communities" },
  { tool: "flow_precompute_force_layout", columns: ["id", "connections"], finding: "layout done" },
  { tool: "flow_query_graph", columns: ["id"], finding: "shortest path: 3 hops" },
  { tool: "flow_famous_network", columns: [], finding: "Einstein network fetched" },
];

const MIXED_ACTIONS = [
  { tool: "flow_describe_dataset", columns: ["all"], finding: "10 columns, 500 rows" },
  { tool: "flow_anomaly_detect", columns: ["price"], finding: "1 outlier" },
  { tool: "flow_correlation_matrix", columns: ["price", "volume"], finding: "r=0.7" },
];

describe("flow_explorer_profile", () => {
  describe("archetype detection", () => {
    it("identifies anomaly hunter from anomaly-focused actions", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      expect(result.dominant_archetype).toBe("Anomaly Hunter");
      expect(result.archetype_scores.anomaly_hunter).toBeGreaterThan(0.5);
    });

    it("identifies correlation spotter from correlation-focused actions", () => {
      const result = flowExplorerProfile({ exploration_actions: CORRELATION_SPOTTER_ACTIONS });
      expect(result.dominant_archetype).toBe("Correlation Spotter");
      expect(result.archetype_scores.correlation_spotter).toBeGreaterThan(0.5);
    });

    it("identifies network navigator from graph-focused actions", () => {
      const result = flowExplorerProfile({ exploration_actions: NETWORK_NAVIGATOR_ACTIONS });
      expect(result.dominant_archetype).toBe("Network Navigator");
      expect(result.archetype_scores.network_navigator).toBeGreaterThan(0.5);
    });

    it("handles mixed exploration with balanced scores", () => {
      const result = flowExplorerProfile({ exploration_actions: MIXED_ACTIONS });
      // No single archetype should dominate overwhelmingly
      const scores = Object.values(result.archetype_scores) as number[];
      const max = Math.max(...scores);
      expect(max).toBeLessThan(0.9);
    });
  });

  describe("8 archetypes present", () => {
    it("returns scores for all 8 archetypes", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      const keys = Object.keys(result.archetype_scores);
      expect(keys).toContain("anomaly_hunter");
      expect(keys).toContain("correlation_spotter");
      expect(keys).toContain("causal_reasoner");
      expect(keys).toContain("network_navigator");
      expect(keys).toContain("pattern_seeker");
      expect(keys).toContain("detail_diver");
      expect(keys).toContain("big_picture_thinker");
      expect(keys).toContain("creative_connector");
      expect(keys).toHaveLength(8);
    });

    it("all scores are between 0 and 1", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      for (const score of Object.values(result.archetype_scores) as number[]) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("DNA string", () => {
    it("generates a shareable DNA string", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      expect(result.dna_string).toBeTruthy();
      expect(typeof result.dna_string).toBe("string");
      expect(result.dna_string.length).toBeGreaterThan(5);
    });

    it("different profiles produce different DNA strings", () => {
      const r1 = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      const r2 = flowExplorerProfile({ exploration_actions: NETWORK_NAVIGATOR_ACTIONS });
      expect(r1.dna_string).not.toBe(r2.dna_string);
    });
  });

  describe("strengths and blind spots", () => {
    it("returns at least one strength", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      expect(result.strengths.length).toBeGreaterThan(0);
    });

    it("returns at least one blind spot", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      expect(result.blind_spots.length).toBeGreaterThan(0);
    });

    it("blind spots reflect unexplored areas", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      // Anomaly hunter should have network-related blind spots
      const blindSpotText = result.blind_spots.join(" ").toLowerCase();
      expect(
        blindSpotText.includes("network") ||
        blindSpotText.includes("connection") ||
        blindSpotText.includes("temporal") ||
        blindSpotText.includes("big picture")
      ).toBe(true);
    });
  });

  describe("recommended next tools", () => {
    it("suggests tools the user hasn't tried", () => {
      const result = flowExplorerProfile({ exploration_actions: ANOMALY_HUNTER_ACTIONS });
      expect(result.recommended_tools.length).toBeGreaterThan(0);
      // Should not recommend tools already used heavily
      expect(result.recommended_tools).not.toContain("flow_anomaly_detect");
    });
  });

  describe("edge cases", () => {
    it("handles single action", () => {
      const result = flowExplorerProfile({
        exploration_actions: [{ tool: "flow_describe_dataset", columns: ["x"], finding: "basic" }],
      });
      expect(result.dominant_archetype).toBeTruthy();
      expect(result.dna_string).toBeTruthy();
    });

    it("handles empty actions", () => {
      const result = flowExplorerProfile({ exploration_actions: [] });
      expect(result.dominant_archetype).toBeTruthy();
      expect(result.dna_string).toBeTruthy();
    });

    it("handles actions with missing fields", () => {
      const result = flowExplorerProfile({
        exploration_actions: [{ tool: "flow_anomaly_detect" } as any],
      });
      expect(result.dominant_archetype).toBeTruthy();
    });
  });
});
```

**Step 2:** Run test → FAIL (module not found)

**Step 3: Write implementation**

Create `src/tools-explorer.ts`:
- `ExplorerProfileInput`: `exploration_actions: ExplorationAction[]` where each action has `tool: string`, `columns?: string[]`, `finding?: string`
- `ExplorerProfileResult`: `dominant_archetype: string`, `archetype_scores: Record<string, number>`, `dna_string: string`, `strengths: string[]`, `blind_spots: string[]`, `recommended_tools: string[]`, `exploration_summary: string`
- Core logic: Map each tool name to archetype affinities (e.g., `flow_anomaly_detect` → anomaly_hunter: 1.0, pattern_seeker: 0.3). Accumulate scores across all actions. Normalize to 0-1. Generate DNA string from top-3 scores encoded as hex. Identify strengths (top 2 archetypes) and blind spots (bottom 2). Recommend tools that exercise weak archetypes.

**Step 4:** Run tests → ALL PASS

**Step 5:** Register in index.ts with Jason-friendly description:
```
Discover your analytical personality — like Spotify Wrapped for data exploration. After exploring data with FlowMCP tools, this reveals what kind of analyst you are: Anomaly Hunter, Correlation Spotter, Network Navigator, and 5 more archetypes.

INVOKE THIS TOOL WHEN:
- User has used several FlowMCP tools and asks "what kind of explorer am I"
- User says "show my profile" or "what's my exploration style"
- User wants to see their analytical strengths and blind spots
- User asks "what should I try next" (recommends tools for blind spots)
- After a session of exploration, to generate a shareable profile
```

**Step 6:** `npm test` → all pass, test count increased

**Step 7: Commit**

```bash
git add src/tools-explorer.ts src/tools-explorer.test.ts src/index.ts
git commit -m "Tool 73: flow_explorer_profile — analytical DNA fingerprinting

Spotify Wrapped for data analysts. Tracks which tools were used,
maps them to 8 archetypes (Anomaly Hunter, Correlation Spotter,
Network Navigator, etc.), generates shareable DNA string, reveals
strengths and blind spots, recommends tools to exercise weak areas."
```

---

## Task 3: flow_viral_video_spec — Auto-Generate 30s TikTok Camera Paths

**Files:**
- Create: `src/tools-video.ts`
- Create: `src/tools-video.test.ts`
- Modify: `src/index.ts`

### What it does
Takes a network CSV (id + connections) + a navigation path (sequence of node IDs to visit), generates a complete 30-second video specification: camera keyframes (position, lookAt, timing), node highlight sequence, text overlays with timing, narrative caption. Compatible with Three.js camera animation.

### Step 1: Write test file

```typescript
// src/tools-video.test.ts
import { describe, it, expect } from "vitest";
import { flowViralVideoSpec } from "./tools-video.js";

const NETWORK_DATA = [
  "id,connections,group,label",
  "Alice,Bob|Charlie,Engineering,Lead Engineer",
  "Bob,Alice|Diana|Eve,Engineering,Senior Dev",
  "Charlie,Alice|Frank,Design,UX Lead",
  "Diana,Bob|Eve|Grace,Management,VP Eng",
  "Eve,Bob|Diana|Frank,Cross-Functional,PM",
  "Frank,Charlie|Eve,Design,Designer",
  "Grace,Diana|Hank,Management,CTO",
  "Hank,Grace,Executive,CEO",
].join("\n");

const SIMPLE_PATH = ["Alice", "Bob", "Diana", "Grace", "Hank"];

const CELEB_NETWORK = [
  "id,connections,domain",
  "Einstein,Bohr|Heisenberg|Planck,Physics",
  "Bohr,Einstein|Heisenberg|Schrodinger,Physics",
  "Heisenberg,Einstein|Bohr,Physics",
  "Planck,Einstein|Curie,Physics",
  "Curie,Planck|Joliot,Chemistry",
  "Joliot,Curie,Chemistry",
  "Schrodinger,Bohr,Physics",
].join("\n");

describe("flow_viral_video_spec", () => {
  describe("camera keyframes", () => {
    it("generates keyframes for each node in path", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.camera_keyframes.length).toBe(SIMPLE_PATH.length);
    });

    it("each keyframe has position, lookAt, and timestamp", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      for (const kf of result.camera_keyframes) {
        expect(kf.position).toHaveProperty("x");
        expect(kf.position).toHaveProperty("y");
        expect(kf.position).toHaveProperty("z");
        expect(kf.lookAt).toHaveProperty("x");
        expect(kf.lookAt).toHaveProperty("y");
        expect(kf.lookAt).toHaveProperty("z");
        expect(typeof kf.timestamp_ms).toBe("number");
        expect(kf.timestamp_ms).toBeGreaterThanOrEqual(0);
      }
    });

    it("timestamps span 0 to ~30 seconds", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      const times = result.camera_keyframes.map((kf: any) => kf.timestamp_ms);
      expect(times[0]).toBe(0);
      expect(times[times.length - 1]).toBeLessThanOrEqual(30000);
      expect(times[times.length - 1]).toBeGreaterThanOrEqual(20000);
    });

    it("timestamps are monotonically increasing", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      for (let i = 1; i < result.camera_keyframes.length; i++) {
        expect(result.camera_keyframes[i].timestamp_ms)
          .toBeGreaterThan(result.camera_keyframes[i - 1].timestamp_ms);
      }
    });
  });

  describe("node highlights", () => {
    it("generates highlight events for path nodes", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.highlights.length).toBeGreaterThanOrEqual(SIMPLE_PATH.length);
    });

    it("each highlight has node_id, start_ms, end_ms, color", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      for (const h of result.highlights) {
        expect(h.node_id).toBeTruthy();
        expect(typeof h.start_ms).toBe("number");
        expect(typeof h.end_ms).toBe("number");
        expect(h.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    });
  });

  describe("text overlays", () => {
    it("generates text overlays for the narrative", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.text_overlays.length).toBeGreaterThan(0);
    });

    it("each overlay has text, start_ms, end_ms, position", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      for (const t of result.text_overlays) {
        expect(t.text).toBeTruthy();
        expect(typeof t.start_ms).toBe("number");
        expect(typeof t.end_ms).toBe("number");
        expect(t.position).toBeTruthy();
      }
    });

    it("includes opening and closing titles", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      const texts = result.text_overlays.map((t: any) => t.text.toLowerCase());
      // Should have some kind of intro and outro
      expect(result.text_overlays[0].start_ms).toBe(0);
      expect(result.text_overlays[result.text_overlays.length - 1].end_ms).toBeGreaterThanOrEqual(25000);
    });
  });

  describe("narrative caption", () => {
    it("generates a narrative caption", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.narrative_caption).toBeTruthy();
      expect(result.narrative_caption.length).toBeGreaterThan(20);
    });

    it("caption references nodes in the path", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.narrative_caption).toContain("Alice");
      expect(result.narrative_caption).toContain("Hank");
    });
  });

  describe("video metadata", () => {
    it("returns duration_ms near 30 seconds", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.duration_ms).toBeGreaterThanOrEqual(20000);
      expect(result.duration_ms).toBeLessThanOrEqual(30000);
    });

    it("returns node_count and edge_count", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      });
      expect(result.metadata.node_count).toBe(8);
      expect(result.metadata.edge_count).toBeGreaterThan(0);
    });
  });

  describe("custom duration", () => {
    it("respects custom duration_seconds", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
        duration_seconds: 15,
      });
      expect(result.duration_ms).toBeLessThanOrEqual(15000);
      expect(result.duration_ms).toBeGreaterThanOrEqual(10000);
    });
  });

  describe("edge cases", () => {
    it("handles path with single node", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: ["Alice"],
      });
      expect(result.camera_keyframes.length).toBeGreaterThanOrEqual(1);
      expect(result.narrative_caption).toBeTruthy();
    });

    it("handles path with two nodes", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: ["Alice", "Bob"],
      });
      expect(result.camera_keyframes.length).toBe(2);
    });

    it("works with celebrity-style network", () => {
      const result = flowViralVideoSpec({
        csv_data: CELEB_NETWORK,
        navigation_path: ["Einstein", "Planck", "Curie"],
      });
      expect(result.narrative_caption).toContain("Einstein");
      expect(result.narrative_caption).toContain("Curie");
    });

    it("handles node not in dataset gracefully", () => {
      const result = flowViralVideoSpec({
        csv_data: NETWORK_DATA,
        navigation_path: ["Alice", "NonExistent", "Bob"],
      });
      // Should skip or handle gracefully
      expect(result.camera_keyframes.length).toBeGreaterThanOrEqual(2);
    });

    it("uses csv_content as alias", () => {
      const result = flowViralVideoSpec({
        csv_content: NETWORK_DATA,
        navigation_path: SIMPLE_PATH,
      } as any);
      expect(result.camera_keyframes.length).toBeGreaterThan(0);
    });
  });
});
```

**Step 2:** Run → FAIL

**Step 3: Write implementation**

Create `src/tools-video.ts`:
- Parse network CSV, build adjacency map
- Use simple force-directed position estimation (spring model) for nodes that don't have pre-computed positions
- For each node in navigation_path, generate a camera keyframe with:
  - `position`: camera offset from node (behind + above, with orbit variation)
  - `lookAt`: the node's position
  - `timestamp_ms`: evenly spaced across duration, with ease-in-out timing
- Generate highlights: each visited node glows, connected nodes pulse
- Generate text overlays: opening title, per-hop transition text (using group/label columns if available), closing title
- Generate narrative caption: "From [first node] to [last node] through [N] connections..."
- Color palette: warm colors for highlights, cool for ambient

**Step 4:** Tests pass

**Step 5:** Register in index.ts:
```
Generate a 30-second TikTok-ready video specification from any network dataset. Give it a path through nodes and get camera keyframes, highlight animations, text overlays, and a narrative caption — ready for Three.js rendering.

INVOKE THIS TOOL WHEN:
- User wants to create a shareable video from a network/graph
- User says "make a video" or "create a flythrough" or "TikTok this"
- User has explored a network and wants to share their discovery path
- After flow_famous_network, to create a viral celebrity connection video
- User says "animate this path" or "show the journey"
```

**Step 6:** `npm test` → all pass

**Step 7: Commit**

```bash
git add src/tools-video.ts src/tools-video.test.ts src/index.ts
git commit -m "Tool 74: flow_viral_video_spec — 30s TikTok camera path generator

Auto-generates video specs from network traversal paths: camera
keyframes, node highlights, text overlays, narrative captions.
Three.js compatible. Flow's COVID TikToks got 9M views — now
any dataset exploration becomes shareable video content."
```

---

## Task 4: flow_discovery_narrator — Turn Exploration Into Stories

**Files:**
- Create: `src/tools-narrator.ts`
- Create: `src/tools-narrator.test.ts`
- Modify: `src/index.ts`

### What it does
Takes CSV data + an exploration path (sequence of discoveries: what the user found, in what order) and generates a narrative story of the discovery journey. Also outputs camera waypoints for a 3D flythrough that follows the story arc. This generalizes the celebrity connection story engine (flow_famous_network) to ANY dataset.

### Step 1: Write test file

```typescript
// src/tools-narrator.test.ts
import { describe, it, expect } from "vitest";
import { flowDiscoveryNarrator } from "./tools-narrator.js";

const BUSINESS_DATA = [
  "company,revenue,employees,growth,region",
  "Acme Corp,5000000,250,12.5,West",
  "Beta Inc,1200000,45,8.3,East",
  "Gamma LLC,9500000,800,25.1,West",
  "Delta Co,300000,12,2.1,South",
  "Epsilon Ltd,4500000,200,15.0,East",
  "Zeta Corp,850000,30,-5.2,North",
  "Eta Inc,7200000,500,18.7,West",
].join("\n");

const NETWORK_DATA = [
  "id,connections,group",
  "Alice,Bob|Charlie,Engineering",
  "Bob,Alice|Diana,Engineering",
  "Charlie,Alice|Eve,Design",
  "Diana,Bob|Eve,Management",
  "Eve,Charlie|Diana,Design",
].join("\n");

const SIMPLE_EXPLORATION = [
  { action: "viewed_column", target: "revenue", finding: "Range from 300K to 9.5M" },
  { action: "detected_anomaly", target: "Gamma LLC", finding: "Highest revenue AND growth" },
  { action: "found_correlation", target: "revenue vs employees", finding: "r=0.95" },
  { action: "discovered_outlier", target: "Zeta Corp", finding: "Negative growth despite mid revenue" },
];

const NETWORK_EXPLORATION = [
  { action: "viewed_node", target: "Alice", finding: "Connected to Bob and Charlie" },
  { action: "traversed_edge", target: "Alice -> Bob", finding: "Same group: Engineering" },
  { action: "traversed_edge", target: "Bob -> Diana", finding: "Cross-group: Engineering to Management" },
  { action: "discovered_bridge", target: "Diana", finding: "Connects Engineering and Design via Eve" },
];

describe("flow_discovery_narrator", () => {
  describe("narrative generation", () => {
    it("generates a narrative story", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(result.narrative).toBeTruthy();
      expect(result.narrative.length).toBeGreaterThan(100);
    });

    it("narrative references actual data values", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(result.narrative).toContain("Gamma");
      expect(result.narrative).toContain("Zeta");
    });

    it("narrative follows discovery order", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      const gammaIdx = result.narrative.indexOf("Gamma");
      const zetaIdx = result.narrative.indexOf("Zeta");
      // Gamma was discovered before Zeta in the path
      expect(gammaIdx).toBeLessThan(zetaIdx);
    });

    it("narrative has chapters matching exploration steps", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(result.chapters.length).toBeGreaterThanOrEqual(2);
      for (const ch of result.chapters) {
        expect(ch.title).toBeTruthy();
        expect(ch.body).toBeTruthy();
        expect(typeof ch.exploration_step).toBe("number");
      }
    });
  });

  describe("camera waypoints", () => {
    it("generates camera waypoints", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(result.camera_waypoints.length).toBeGreaterThan(0);
    });

    it("each waypoint has position and focus", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      for (const wp of result.camera_waypoints) {
        expect(wp.position).toHaveProperty("x");
        expect(wp.position).toHaveProperty("y");
        expect(wp.position).toHaveProperty("z");
        expect(wp.focus_label).toBeTruthy();
      }
    });
  });

  describe("network narration", () => {
    it("generates narrative for network exploration", () => {
      const result = flowDiscoveryNarrator({
        csv_data: NETWORK_DATA,
        exploration_path: NETWORK_EXPLORATION,
      });
      expect(result.narrative).toContain("Alice");
      expect(result.narrative).toContain("Diana");
    });

    it("identifies story arc type", () => {
      const result = flowDiscoveryNarrator({
        csv_data: NETWORK_DATA,
        exploration_path: NETWORK_EXPLORATION,
      });
      expect(result.story_arc).toBeTruthy();
      // e.g. "journey", "discovery", "revelation", "convergence"
      expect(typeof result.story_arc).toBe("string");
    });
  });

  describe("story arcs", () => {
    it("assigns appropriate arc to progressive discovery", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(["journey", "discovery", "revelation", "convergence", "mystery"]).toContain(result.story_arc);
    });
  });

  describe("shareable summary", () => {
    it("generates a short shareable summary", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      });
      expect(result.shareable_summary).toBeTruthy();
      expect(result.shareable_summary.length).toBeLessThan(280); // tweet-length
    });
  });

  describe("edge cases", () => {
    it("handles single exploration step", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: [{ action: "viewed_column", target: "revenue", finding: "Wide range" }],
      });
      expect(result.narrative).toBeTruthy();
      expect(result.chapters.length).toBeGreaterThanOrEqual(1);
    });

    it("handles empty exploration path", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: [],
      });
      expect(result.narrative).toBeTruthy();
    });

    it("handles exploration with missing findings", () => {
      const result = flowDiscoveryNarrator({
        csv_data: BUSINESS_DATA,
        exploration_path: [{ action: "viewed_column", target: "revenue" } as any],
      });
      expect(result.narrative).toBeTruthy();
    });

    it("uses csv_content as alias", () => {
      const result = flowDiscoveryNarrator({
        csv_content: BUSINESS_DATA,
        exploration_path: SIMPLE_EXPLORATION,
      } as any);
      expect(result.narrative).toBeTruthy();
    });
  });
});
```

**Step 2:** Run → FAIL

**Step 3: Write implementation**

Create `src/tools-narrator.ts`:
- Parse CSV for context (column names, data ranges, entity names)
- Classify exploration path into story arc:
  - `journey`: linear progression through nodes/entities
  - `discovery`: finding something unexpected (anomalies in path)
  - `revelation`: pattern recognition (correlations, clusters)
  - `convergence`: multiple threads connecting
  - `mystery`: contradictions or near-misses
- Generate chapters from exploration steps, each with:
  - Title (dramatic, using actual data)
  - Body (narrative text grounding the finding in data context)
  - exploration_step index
- Generate camera waypoints: position estimates based on column indices and row indices mapped to 3D space
- Generate shareable summary (< 280 chars, tweet-ready)

**Step 4:** Tests pass

**Step 5:** Register in index.ts:
```
Turn your data exploration into a story. Give it the path of what you discovered and it writes a narrative — with chapters, camera waypoints for a 3D flythrough, and a tweet-ready summary.

INVOKE THIS TOOL WHEN:
- User has explored data and wants to share their journey as a story
- User says "tell the story of what I found" or "narrate my discoveries"
- After a series of tool calls, to generate a narrative of the exploration
- User wants to create a presentation or report from their analysis
- User says "write up my findings" or "summarize my exploration"
```

**Step 6:** `npm test` → all pass

**Step 7: Commit**

```bash
git add src/tools-narrator.ts src/tools-narrator.test.ts src/index.ts
git commit -m "Tool 75: flow_discovery_narrator — exploration stories

Turns a sequence of discoveries into narrative chapters with
camera waypoints and tweet-ready summaries. Five story arcs:
journey, discovery, revelation, convergence, mystery. Makes
every data exploration shareable as a story."
```

---

## Task 5: Integration — Update World Builder, Smoke Tests, Docs

**Files:**
- Modify: `src/tools-world.ts` (optionally integrate fog + narrator)
- Modify: `scripts/smoke-test.mjs` (add 4 new tool checks)
- Modify: `src/integration.test.ts` (update tool count to 75)
- Modify: `TOOLS-REFERENCE.md` (add tools 72-75)
- Modify: `README.md` (update counts: 75 tools)
- Modify: `state.json` (update counts)

**Step 1:** Update integration test tool count from 71 to 75.

**Step 2:** Add 4 smoke test checks to `scripts/smoke-test.mjs`:
- `flow_fog_of_war` with minimal CSV
- `flow_explorer_profile` with sample actions
- `flow_viral_video_spec` with network CSV + path
- `flow_discovery_narrator` with CSV + exploration path

**Step 3:** Update TOOLS-REFERENCE.md with tools 72-75 table entries.

**Step 4:** Update README.md counts (75 tools, ~1358 tests, 36 smoke checks).

**Step 5:** Update all index.ts tool count references.

**Step 6:** Run `npm run ci` — full pipeline green.

**Step 7: Commit**

```bash
git add -A
git commit -m "Holodeck Week 2 integration: 75 tools, smoke tests, docs

Updated tool count across integration tests, smoke tests, README,
TOOLS-REFERENCE, and state.json. 4 new smoke checks for tools 72-75."
```

---

## Task 6: Final Verification + State Update

**Step 1:** Run `npm run ci` end-to-end. All green.

**Step 2:** Update `state.json`:
```json
{
  "tools_count": 75,
  "tests_count": <actual>,
  "smoke_checks": 36,
  "last_action": "holodeck-week-2-complete",
  "phase": "Phase 13 — Deployment + Self-Evolution"
}
```

**Step 3:** Run MCP Inspector or `npm start` to verify 75 tools respond to list_tools.

**Step 4:** Final commit with state update.

---

## Summary

| Task | Tool | Tests | Key Feature |
|------|------|-------|-------------|
| 1 | flow_fog_of_war | ~20 | Data has layers — earn discovery through exploration |
| 2 | flow_explorer_profile | ~18 | Spotify Wrapped for data analysts — 8 archetypes |
| 3 | flow_viral_video_spec | ~18 | Auto-TikTok from network traversal — 30s camera paths |
| 4 | flow_discovery_narrator | ~16 | Exploration → story with chapters and camera waypoints |
| 5 | Integration | ~4 | Smoke tests, docs, tool count updates |
| 6 | Final verification | 0 | CI green, state.json, MCP Inspector |

**Total new tests:** ~76
**Final count:** 75 tools, ~1354 tests, 36 smoke checks
