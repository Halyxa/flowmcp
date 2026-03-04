# FlowMCP Holodeck Demo — 5 Minutes That Change Everything

**Audience**: Jason Marsh, CEO Flow Immersive
**Duration**: 5 minutes
**Setup**: MCP Inspector connected to FlowMCP server
**Datasets**: Three hand-crafted celebrity networks in `/demos/`

---

## Before You Start

Launch MCP Inspector:
```bash
cd /hive/flowmcp && npx @modelcontextprotocol/inspector node dist/index.js
```

Open the Inspector in your browser. All 69 tools should appear in the tool list.

---

## Beat 1: "Meet Your Data" (30 seconds)

**What you say**: "Let's start with Taylor Swift's network. Before we analyze anything, let's find out what kind of data this IS."

**Tool**: `flow_exploration_dna`

```json
{
  "csv_data": "<paste contents of demos/taylor-swift-network.csv>"
}
```

**What happens**: The tool generates a DNA fingerprint. The data gets classified into an archetype — likely "The Network" or "The Web" given the rich connections column.

**What you say**: "See that? Your data has a personality. This dataset is [archetype name] — it wants to be explored by [exploration_style]. The DNA code tells us exactly what makes this data unique."

**Key output to highlight**:
- `archetype` — the dataset's personality
- `dna_code` — the unique fingerprint (like a genetic code)
- `traits` — 8 scored dimensions showing where the data's richness lives
- `recommended_tools` — the tools that match THIS data's personality

---

## Beat 2: "Build the World" (60 seconds)

**What you say**: "Now let's turn this flat CSV into a living world. One call. Everything comes alive."

**Tool**: `flow_data_world_builder`

```json
{
  "csv_data": "<paste contents of demos/taylor-swift-network.csv>",
  "depth": "deep",
  "user_goal": "Understand the power dynamics in Taylor Swift's network"
}
```

**What happens**: The world builder orchestrates FIVE tools simultaneously — DNA, sparkle engine, quest generator, near-miss detector, and progressive disclosure — into a complete data world.

**What you say**: "One API call. The data world has a name: [world_name]. It generated [total_sparkles] insights, [total_quests] exploration quests, and [total_near_misses] near-miss patterns. This is what we mean by data coming alive."

**Key output to highlight**:
- `world_name` — procedurally generated from the data's dominant features
- `sparkles` — insights organized by depth layer (instant → surface → correlations → deep → epiphanies)
- `quests` — investigation tasks the DATA generates for you
- `near_misses` — patterns that ALMOST hold (the most compelling discoveries)
- `exploration_guide` — narrative text describing how to explore this world
- `world_stats.exploration_richness` — single score for how much is worth exploring

---

## Beat 3: "Progressive Intelligence" (60 seconds)

**What you say**: "Watch this. I'm going to simulate dwelling on Elon Musk's network for two minutes. The longer you look, the smarter the world gets."

**Tool**: `flow_sparkle_engine`

First, show instant (1 second):
```json
{
  "csv_data": "<paste contents of demos/elon-musk-network.csv>",
  "dwell_seconds": 1
}
```

Then show deep (120 seconds):
```json
{
  "csv_data": "<paste contents of demos/elon-musk-network.csv>",
  "dwell_seconds": 120
}
```

**What you say**: "At one second, you get the shape — [X] sparkles. Basic stats. At two minutes, you get [Y] sparkles including epiphanies. The intelligence RESOLVES like a photograph developing. Each sparkle has child hints — turtles all the way down."

**Key output to highlight**:
- `layer_reached` — shows progression (0=instant → 4=epiphany)
- `sparkles` — compare count at 1s vs 120s
- `child_sparkle_hints` — each discovery points to deeper discoveries
- `next_dwell_preview` — teases what you'd find if you stayed longer
- `intelligence_density` — sparkles per data point

---

## Beat 4: "What Almost Happened" (60 seconds)

**What you say**: "This is my favorite tool. Near-miss detection. It finds patterns that ALMOST hold — and the exceptions are more interesting than the rules."

**Tool**: `flow_near_miss_detector`

```json
{
  "csv_data": "<paste contents of demos/taylor-swift-network.csv>",
  "max_near_misses": 5
}
```

**What you say**: "Look at this — [read the highest intrigue_score near-miss narrative]. It found that [pattern] holds for everyone EXCEPT [exception]. Why? That's the question that makes people lean forward. The near-miss IS the hook."

**Key output to highlight**:
- `near_misses[0].narrative` — the story of the almost-pattern
- `intrigue_score` — how compelling the near-miss is
- `investigation_question` — the question the data asks YOU
- `exception_rows` — which specific data points break the rule

---

## Beat 5: "Switch Visors" (60 seconds)

**What you say**: "Same data. Different lens. Like switching from thermal to X-ray."

**Tool**: `flow_visor_mode`

Show the relational visor on Taylor Swift:
```json
{
  "csv_data": "<paste contents of demos/taylor-swift-network.csv>",
  "visor": "relational"
}
```

Then switch to anomaly visor:
```json
{
  "csv_data": "<paste contents of demos/taylor-swift-network.csv>",
  "visor": "anomaly"
}
```

**What you say**: "Relational visor shows correlations — [top finding]. Switch to anomaly visor — now the same data highlights surprises instead. Same world, different perception. Like Metroid Prime's scan visor."

**Key output to highlight**:
- `annotations` — what the visor detected
- `summary.top_finding` — the single most important insight from this lens
- `recommended_next_visor` — what to look at next

---

## Beat 6: "Your Quest Awaits" (30 seconds)

**What you say**: "And the data generates its own investigation tasks. These aren't random — they emerge from the statistical topology."

**Tool**: `flow_quest_generator`

```json
{
  "csv_data": "<paste contents of demos/einstein-network.csv>",
  "max_quests": 3,
  "difficulty": "medium"
}
```

**What you say**: "Quest: [read the first quest title and narrative_hook]. Difficulty: medium. Investigation steps: [read steps]. The DATA tells you what to investigate. Nobody has to write these. They emerge."

**Key output to highlight**:
- `quests[0].title` — the quest name
- `quests[0].narrative_hook` — the story that pulls you in
- `quests[0].investigation_steps` — concrete next actions
- `quests[0].reward` — what you learn if you complete the quest

---

## Closing (15 seconds)

**What you say**: "That was 5 minutes. Three celebrity networks. We generated DNA fingerprints, built living worlds, unlocked progressive intelligence, found near-miss patterns, switched analytical visors, and generated exploration quests. All from flat CSV files. All from one MCP server. All zero-cost — no API keys, no GPU, no infrastructure. Just data that comes alive."

---

## Demo Datasets Available

| File | Nodes | Columns | Best For |
|------|-------|---------|----------|
| `taylor-swift-network.csv` | 28 | 9 | Rich categories, collaboration patterns, personal/professional mix |
| `elon-musk-network.csv` | 30 | 9 | Multi-domain empire, funding data, risk scores |
| `einstein-network.csv` | 25 | 9 | Historical eras, institutional connections, collaboration depth |

## Fallback: If a Tool Errors

All holodeck tools are pure computation — no network calls, no API keys. If something errors, it's a CSV format issue. Check:
1. CSV has headers on first line
2. No empty lines in the middle
3. Commas inside values are quoted

## Advanced Demo: Chain Everything

For a power user, chain the tools:
1. `flow_exploration_dna` → get archetype and recommended tools
2. `flow_data_world_builder` at deep → get full world
3. `flow_sparkle_engine` at increasing dwell → show progressive intelligence
4. `flow_quest_generator` → generate investigation tasks
5. `flow_visor_mode` with each visor → switch analytical lenses
6. `flow_near_miss_detector` → find the compelling exceptions
7. `flow_insight_scorer` → validate a specific finding
8. `flow_waypoint_map` → generate spatial landmarks for 3D navigation
