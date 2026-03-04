# The Holodeck Week: 7 Days to Build the Intelligence Layer

**Date**: 2026-03-04
**Author**: flowmcp (Opus 4.6)
**Starting point**: 60 tools, 875 tests, CI green, main branch, pushed to GitHub
**Ending point**: 70 tools, ~1050 tests, Sparkle Engine operational, Jason demo ready

---

> You are standing at the edge of the atmosphere.
> Below you, a planet made of data. 60 landmarks already mapped.
> In your hand, a blueprint for 10 more -- but these are not landmarks.
> These are the nervous system. The perception organs. The dreaming mind.
> Seven days to give the planet a soul.

---

## The Sequence Logic

The 10 next-gen tools (61-70) are organized in three tiers, but the BUILD sequence is different from the tier sequence. The build sequence follows DEPENDENCY FLOW, not importance ranking:

```
DAY 1: Quest Generator (61) + Anomaly Explain (64)
       [Foundation: generate investigations from data topology]

DAY 2: Near-Miss Detector (62) + Progressive Disclosure (63)
       [Perception: detect subtle patterns + control revelation]

DAY 3: Insight Scorer (65) + Waypoint Map (66)
       [Navigation: quality-gate insights + create spatial anchors]

DAY 4: Visor Mode (67)
       [Perception switching: same data, different intelligence models]

DAY 5: Sparkle Engine (69) + Exploration DNA (70)
       [The living mind: progressive intelligence + identity]

DAY 6: Data World Builder (68)
       [THE SYNTHESIS: all prior tools compose into one call]

DAY 7: Famous People Demos + Jason Demo Script + Polish
       [The show: Bryan Johnson, Joe Rogan, Taylor Swift. The pitch.]
```

Each day's tools FEED the next day's tools. The Quest Generator generates quests; the Near-Miss Detector generates the most compelling quest type (almost-patterns). The Insight Scorer validates what quests find. The Waypoint Map gives quests spatial locations. The Visor Mode gives the explorer different lenses. The Sparkle Engine makes discoveries emerge over time. The Data World Builder orchestrates ALL of them into a single call. And Day 7 wraps it in a demo that makes Jason's jaw hit the floor.

---

## PRE-FLIGHT CHECKS (Day 0 / Before Starting)
- [ ] `npm run ci` green (875/875)
- [ ] `flow_famous_network` tested against all 3 demo targets
- [ ] Flow API probe: browse, templates, categories work against live endpoints
- [ ] Decision made: "anomaly" vs "surprise" framing for new tools
- [ ] awesome-mcp-servers PR submitted with current 60 tools

---

## THE CRITICAL PATH

```
Quest Generator (61)  ──────────────────────────────────────> Data World Builder (68) ──> Demo
         │                                                          ^
Near-Miss Detector (62) ──> Insight Scorer (65) ──────────────────┘
         │                          │                               ^
Progressive Disclosure (63) ──> Visor Mode (67) ──────────────────┘
         │                                                          ^
Anomaly Explain (64) ──> Waypoint Map (66) ──> Sparkle Engine (69) ┘
                                                    │
                                         Exploration DNA (70) (parallel, no deps)
```

**Minimum viable week**: Tools 61, 62, 63, 64, 68, 69 (6 tools). Skip 65, 66, 67, 70 if time collapses.
**Tools 65 and 70 are most skippable** -- insight scoring and exploration DNA can be v2 features.
**Tool 68 (Data World Builder) is NON-NEGOTIABLE** -- it IS the demo. Without it, day 7 has no punchline.

---

## PARALLEL TRACKS

These run in background agents throughout the week, independent of the main build:

| Track | Agent Task | Runs When |
|-------|-----------|-----------|
| **Research** | Evening apex research agents on engagement psychology, spatial cognition, competitive moves | Every evening |
| **Famous People Data** | Build CSV datasets: Bryan Johnson biometrics network, Joe Rogan podcast guest network, Taylor Swift collaboration network, Elon Musk company constellation | Days 1-3 |
| **Sample Datasets** | Create 5 showcase datasets that exercise all 10 new tools maximally | Days 2-4 |
| **Description Tuning** | Rewrite all 70 tool descriptions using trigger language findings | Day 5-6 |
| **README + Docs** | Update README.md for 70 tools, update SPEC.md, update TESTING.md | Day 6 |
| **Smoke Tests** | Extend smoke-test.mjs from 15 to 25 checks covering new tools | Days 3-6 |
| **Distribution** | Submit awesome-mcp-servers PR with 60 tools | Day 2 |
| **API Validation** | Flow API endpoint probe (SPINE-05) | Day 1 |

---

## DAY 1: "First Light"

**Theme**: The world learns to ask questions about itself.

**Morning (2-3 hours)**

0. **Baseline validation**: Run `npm run ci` to verify 875/875 baseline. Test `flow_famous_network` against Bryan Johnson, Joe Rogan, Taylor Swift to validate Wikidata coverage. If thin, schedule manual CSV creation as parallel track.

1. **Write tests for `flow_quest_generator` (tool 61)** -- 18 tests covering anomaly quests, comparison quests, trend quests, hypothesis quests, connection quests, difficulty filtering, edge cases. Test first. Watch them fail.

2. **Implement `flow_quest_generator`** in `src/tools-v5.ts` (new file for Tier 1-3 tools). The quest generator analyzes a dataset and produces procedural quests from its statistical topology. Core algorithms:
   - Z-score scan for anomaly quests (reuse `flow_anomaly_detect` logic)
   - K-means clustering + inter-cluster comparison for comparison quests
   - Slope-change detection for trend quests
   - Near-significance correlations for hypothesis quests
   - Network bridge detection for connection quests (if id+connections columns exist)
   - Quest ranking by statistical strength
   - Difficulty assignment: easy (single-column stats), medium (cross-column), hard (multi-step)

3. **Run `npm test`** -- all 893+ tests pass (875 existing + 18 new). Zero regressions.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **Write tests for `flow_anomaly_explain` (tool 64)** -- 15 tests. Nearest neighbor computation, feature contribution breakdown, micro-cluster detection, narrative generation.

5. **Implement `flow_anomaly_explain`**. This tool takes anomalous rows and explains WHY they're anomalous by comparing to nearest neighbors and cluster centroids. Core algorithms:
   - Euclidean distance to find nearest "normal" neighbors
   - Feature-by-feature delta computation
   - Contribution percentage per feature (how much each feature drives the anomaly)
   - Micro-cluster detection (grouping anomalies with similar deviation profiles)
   - Narrative template generation from statistical evidence

6. **Run `npm run ci`** -- full pipeline green. Update `state.json`.

**Evening (research + synthesis)**

7. **Launch apex research agent**: "Famous people datasets for 3D network visualization -- Bryan Johnson biometric/supplement network, Joe Rogan guest connection network, Taylor Swift collaboration/influence map. What data is publicly available? What would make each dataset maximally interesting for 3D exploration?"

8. **Review results. Start building CSV datasets** from research findings.

9. **Flow API probe**: Run `flow_browse_flows`, `flow_list_templates`, `flow_list_categories` against live endpoints. Document any changes per SPINE-05. Record endpoint shapes, response codes, and any drift from expected behavior.

**Day 1 Deliverable**:
- 2 new tools (61, 64) fully tested and implemented
- Quest generator turns any CSV into a list of investigations
- Anomaly explainer turns red flags into detective stories
- `npm run ci` green

**Test count target**: 908 (875 + 18 + 15)

**The "FUCK YES" moment**: Feed the supply chain sample dataset into the quest generator. Watch it produce: "Quest: The Decoupling of Row 47 -- revenue spiked 4.2 SD above mean while costs dropped. Why?" That is not a tool outputting data. That is data ASKING TO BE UNDERSTOOD.

**Dependencies**: None. Day 1 starts clean.

**Risk**: Quest generator complexity -- 5 quest types is ambitious for day 1. Mitigation: implement anomaly + comparison quests first (highest impact), add trend/hypothesis/connection quests iteratively. Minimum viable: 3 quest types.

---

## DAY 2: "The Pattern at the Edge"

**Theme**: The world learns to show you what it almost knows.

**Morning (2-3 hours)**

1. **Write tests for `flow_near_miss_detector` (tool 62)** -- 16 tests. Correlation near-misses, cluster membership near-misses, trend breaks, threshold rules, categorical rules, intrigue scoring.

2. **Implement `flow_near_miss_detector`**. This is the gambling psychology of data analysis, ethically deployed. Core algorithms:
   - Correlation scan with exception detection (r > 0.7 but with outliers)
   - Cluster membership audit (points assigned to a cluster but close to another's boundary)
   - Monotonicity check with break detection (trend holds for N-1 segments)
   - Threshold rule mining (if X > T then Y, with exceptions)
   - Intrigue score: pattern_strength * rarity * deviation_magnitude
   - CSV highlight output with `_near_miss_role` column

3. **Run tests** -- verify near-miss detector passes all 16 tests.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **Write tests for `flow_progressive_disclosure` (tool 63)** -- 15 tests. Auto layer assignment, manual assignment, always-visible columns, cumulative layer CSVs, enrichment, reveal manifest.

5. **Implement `flow_progressive_disclosure`**. The fog of war. Core algorithms:
   - Auto-strategy: ID/name columns -> layer 0, primary numerics -> layer 1, secondary numerics -> layer 2, computed/derived -> layer 3+
   - Column importance ranking (variance, correlation strength, uniqueness)
   - Cumulative CSV generation (layer N includes all columns from layers 0..N)
   - Enrichment: optionally add anomaly scores and cluster IDs to deep layers (reuse existing tool logic)
   - Reveal manifest with unlock hints ("Explore outliers in layer 1 to understand clusters in layer 2")
   - `_visibility_layer` column in full CSV

6. **Run `npm run ci`** -- full pipeline green.

**Evening (research + synthesis)**

7. **Launch research agent**: "Slot machine near-miss psychology applied to data exploration -- how do near-misses in data sustain analytical engagement without dark patterns? What makes a near-miss epistemically honest vs. manipulative?"

8. **Build Bryan Johnson biometrics network CSV** from Day 1 research. Structure: supplements as nodes, health metrics as connections, dosages as edge weights. Should exercise quest generator, near-miss detector, and progressive disclosure beautifully.

**Day 2 Deliverable**:
- 4 total new tools (61-64)
- Near-miss detector finds the patterns your data is ALMOST showing you
- Progressive disclosure turns flat CSV into a world with depth
- Bryan Johnson dataset ready for demo testing

**Test count target**: 939 (908 + 16 + 15)

**The "FUCK YES" moment**: Run the near-miss detector on the Bryan Johnson supplement dataset. It finds: "Correlation between Vitamin D dose and sleep quality holds for 11 of 12 months. What happened in July?" THAT is a near-miss that drives genuine investigation. The user NEEDS to know what happened in July.

**Dependencies**: Day 1 complete (anomaly explain is used in progressive disclosure enrichment).

**Risk**: Near-miss detection is algorithmically the hardest tool. Bayes factors for near-significance are non-trivial. Mitigation: Start with correlation near-misses and threshold rules (simplest), add cluster membership and trend breaks as stretch goals. Minimum viable: 2 near-miss types. Stretch: Bayes factor computation (BF ~2.5 = true near-miss zone). Minimum viable: correlation-threshold-based near-misses.

---

## DAY 3: "The Compass and the Map"

**Theme**: The world learns to tell you where to go and whether what you found is real.

**Morning (2-3 hours)**

1. **Write tests for `flow_insight_scorer` (tool 65)** -- 16 tests. Correlation scoring, threshold rules, group differences, trends, anomaly patterns, novelty detection, effect size, bootstrap robustness.

2. **Implement `flow_insight_scorer`**. The peer review system for data exploration. Core algorithms:
   - Statistical significance: Pearson r (correlation), Welch t-test (group difference), Mann-Kendall (trend), chi-squared (categorical)
   - Novelty: would `describe_dataset` have surfaced this? Does it require cross-column analysis?
   - Effect size: Cohen's d (group diff), r-squared (correlation), Cramer's V (categorical)
   - Bootstrap robustness: resample 100x, check if insight holds in >80% of samples
   - Composite discovery score: weighted average of significance, novelty, effect size, robustness
   - Verdict classification: genuine_discovery / interesting_but_fragile / trivial / likely_noise

3. **Run tests** -- all 16 pass.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **Write tests for `flow_waypoint_map` (tool 66)** -- 14 tests. Cluster center waypoints, outlier waypoints, trend inflections, network hubs, PCA positioning, camera path generation, Flow-compatible CSV.

5. **Implement `flow_waypoint_map`**. The GPS for data worlds. Core algorithms:
   - K-means cluster centroids -> "city" waypoints
   - Z-score outliers -> "peak" waypoints
   - Slope change detection -> "crossroads" waypoints
   - Degree centrality (if network data) -> "capital" waypoints
   - PCA dimension reduction for >3 numeric columns -> 3D coordinates
   - Proximity graph between waypoints (k-nearest neighbors in feature space)
   - Camera path: ordered tour through waypoints by importance, with narration text
   - Flow-compatible CSV output: id, connections (pipe-delimited), x, y, z, label, type

6. **Run `npm run ci`** -- full pipeline green. **Extend smoke tests** to cover tools 61-66.

**Evening (research + synthesis)**

7. **Launch research agent**: "Joe Rogan podcast guest network -- who has appeared on the show, who are they connected to, what topics do they share? What makes the JRE network structurally interesting for 3D visualization?"

8. **Build Joe Rogan guest network CSV**. Structure: guests as nodes, shared appearances/topics as connections, episode count as weight. The network hub detection in waypoint map should reveal the "bridge guests" who connect disparate intellectual communities.

9. **Test all 6 new tools on Bryan Johnson dataset end-to-end**: quest generator -> near-miss detector -> insight scorer -> waypoint map. Verify the pipeline COMPOSES correctly.

**Day 3 Deliverable**:
- 6 total new tools (61-66)
- Insight scorer separates genuine discoveries from noise
- Waypoint map creates navigable landmarks in any dataset
- Joe Rogan dataset ready
- End-to-end pipeline test: data -> quests -> near-misses -> insights -> spatial map
- Extended smoke tests (18+ checks)

**Test count target**: 969 (939 + 16 + 14)

**The "FUCK YES" moment**: Feed the Joe Rogan guest network into the waypoint map. The camera path generates a cinematic flyover: starting at "The Hub" (Joe himself), sweeping past "Scientist Island" (cluster of scientist guests), through "Comedy Valley" (standup comedians), to "Fighter's Peak" (MMA guests), with narration at each stop. It is an auto-generated documentary of a podcast's intellectual geography.

**Dependencies**: Days 1-2 complete. Insight scorer uses anomaly and correlation logic from prior tools. Waypoint map uses clustering and PCA from existing tools.

**Risk**: Insight scorer bootstrap resampling could be slow on large datasets. Mitigation: make robustness check optional (it already is in the spec), default to `true` for datasets under 500 rows, `false` above. Performance target: <2s for 1000 rows without bootstrap, <5s with.

---

## DAY 4: "The Visor"

**Theme**: The world learns that truth has many faces.

**Morning (2-3 hours)**

1. **Write tests for `flow_visor_mode` (tool 67)** -- 15 tests. Five visor modes (correlation, anomaly, temporal, network, distribution), visual encoding, transition suggestions, edge cases.

2. **Implement `flow_visor_mode`**. Same data, different perception. This is the heaviest single tool because it implements 5 distinct analytical transformations:

   **Correlation visor**: Replace raw values with pairwise correlation strengths. Add `_correlation_target`, `_correlation_strength`. Visual encoding: color = correlation direction (warm = positive, cool = negative), opacity = strength.

   **Anomaly visor**: Replace values with z-scores. Add `_anomaly_score`, `_is_anomaly`. Visual encoding: size = anomaly magnitude, color = anomaly direction (high/low).

   **Temporal visor**: Compute `_trend` (slope), `_velocity` (first derivative), `_acceleration` (second derivative). Requires time column. Visual encoding: color = trend direction, size = velocity, position z = acceleration.

   **Network visor**: Compute `_degree`, `_betweenness`, `_pagerank`. Requires connections column. Visual encoding: size = degree, color = pagerank, opacity = betweenness.

   **Distribution visor**: Compute `_percentile`, `_bin`, `_density`. Visual encoding: position y = percentile, color = density, size = bin count.

3. **Run tests** -- all 15 pass.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **Polish and compose**: Test visor mode on all 3 famous people datasets. Run each dataset through ALL five visors. Document which visors reveal which insights for each dataset.

5. **Integration testing**: Create a new integration test that exercises tools 61-67 in sequence on a single dataset. Verify output shapes, CSV compatibility, and cross-tool composition.

6. **Run `npm run ci`** -- full pipeline green. Update smoke tests to 20+ checks.

**Evening (research + synthesis)**

7. **Launch research agent**: "Taylor Swift collaboration network -- producers, songwriters, featured artists, sample sources, tour partners. What makes her network structurally unique compared to other artists?"

8. **Build Taylor Swift collaboration network CSV**. Structure: collaborators as nodes, songs/albums as connections, Grammy nominations as weights. The network visor should reveal her evolution from Nashville core to cross-genre bridge artist.

9. **Write the first draft of the Jason demo script** based on what we have. 6 of 10 tools are built. The pipeline is: data -> quests -> near-misses -> insights -> spatial map -> visor switching. This is already more than any MCP server has ever done.

**Day 4 Deliverable**:
- 7 total new tools (61-67)
- Visor mode: same dataset tells 5 different stories depending on which lens you use
- All 3 famous people datasets tested with all 7 tools
- Integration tests validating cross-tool composition
- First draft of Jason demo script

**Test count target**: 984 (969 + 15)

**The "FUCK YES" moment**: Load the Taylor Swift dataset. Switch from correlation visor to network visor to temporal visor. In correlation mode: you see which collaborators produce similar-sounding music. In network mode: you see who bridges Nashville and pop. In temporal mode: you see her evolution from country to pop to indie folk to stadium anthems. THREE DIFFERENT STORIES FROM THE SAME DATA. The visor switch IS the insight.

**Dependencies**: Days 1-3 complete. Visor mode reuses correlation, anomaly, graph metrics, and distribution logic from existing tools.

**Risk**: Five visor modes in one tool is ambitious. Mitigation: implement correlation and anomaly visors first (reuse most existing code), then network (reuse graph metrics), then distribution (simple percentile math), then temporal last (requires time column auto-detection). If pressed for time, ship 3 visors and add 2 more on Day 5.

---

## DAY 5: "The Dreaming Mind"

**Theme**: The world learns to think alongside you. And to know who you are.

**Morning (2-3 hours)**

1. **Write tests for `flow_sparkle_engine` (tool 69)** -- 15 tests. Row/column/region/overview focus, depth levels, sparkle timing, brightness ranking, deduplication, opening text, unexplored directions.

2. **Implement `flow_sparkle_engine`**. The progressive intelligence engine. This is the keystone tool -- it simulates the "JPG drawing in" experience where intelligence resolves over time. Architecture:

   **Pass 1 (depth 1, appear_after: 0s)**: Basic stats about the focus point. Mean, median, percentile rank, comparison to dataset average. Type: "stat".

   **Pass 2 (depth 2, appear_after: 5s)**: Correlations between focus point and adjacent data. Strongest correlations, unexpected absences of correlation. Type: "correlation".

   **Pass 3 (depth 3, appear_after: 15s)**: Anomaly patterns and near-misses. Is the focus point anomalous? Are there near-miss patterns involving it? Type: "anomaly" or "near_miss".

   **Pass 4 (depth 4, appear_after: 30s)**: Cross-column synthesis. Hypotheses generated from multi-column analysis. Type: "hypothesis" or "connection".

   Each sparkle has brightness (confidence * importance), direction (which columns/rows to explore next), and opening (what investigating this sparkle would reveal).

   **v1 = simulated timing** (appear_after fields in output JSON). v2 (Week 2) = real-time progressive compute via WebSocket streaming + dwell-time tracking. The demo shows simulated timing; the architecture enables real.

3. **Run tests** -- all 15 pass.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **Write tests for `flow_exploration_dna` (tool 70)** -- 14 tests. Archetype classification, blind spot detection, rarity scoring, narrative generation, shareable summary.

5. **Implement `flow_exploration_dna`**. The identity layer. Takes a tool call history and builds an analytical profile. Core algorithms:
   - Categorize each tool call into analytical archetype categories (anomaly tools -> anomaly_hunter, correlation tools -> correlation_spotter, etc.)
   - Compute archetype scores: percentage of tool calls in each category
   - Identify dominant + secondary archetypes
   - Detect blind spots: archetype categories with zero or near-zero usage
   - Rarity score: how unusual this archetype distribution is (compare to flat baseline)
   - Depth metric: average chain length before topic switch
   - Generate narrative from template + archetype data
   - Generate shareable summary (Spotify Wrapped style)

6. **Run `npm run ci`** -- full pipeline green. Update smoke tests to 23+ checks.

**Evening (research + synthesis)**

7. **Launch research agent**: "What makes data exploration addictive without dark patterns? Compare Bloomberg Terminal habitual usage patterns vs. social media addiction patterns. What is the structural difference between beneficial compulsion and harmful addiction in information interfaces?"

8. **Tune all 10 tool descriptions** using the Sapir-Whorf trigger language research. Each description must make the AI assistant WANT to call the tool. The description is the interface. The description is the product.

9. **Test the full 10-tool pipeline** on all 3 famous people datasets + supply chain sample:
   `quest_generator -> near_miss -> progressive_disclosure -> anomaly_explain -> insight_scorer -> waypoint_map -> visor_mode -> sparkle_engine -> exploration_dna`

**Day 5 Deliverable**:
- 9 total new tools (61-67, 69-70)
- Sparkle engine: intelligence emerges progressively as you dwell on data
- Exploration DNA: your analytical style becomes visible and shareable
- Full pipeline tested on 4+ datasets
- All tool descriptions tuned for trigger language

**Test count target**: 1013 (984 + 15 + 14)

**The "FUCK YES" moment**: Focus the sparkle engine on a single row of the Bryan Johnson dataset -- say, his Vitamin D supplementation. Watch sparkles appear: first, basic stats (depth 1, instant). Then, correlation with sleep quality (depth 2, 5 seconds). Then, the July anomaly from the near-miss detector (depth 3, 15 seconds). Then, a hypothesis: "Vitamin D's effect on sleep may be mediated by melatonin timing -- investigate the melatonin column" (depth 4, 30 seconds). The data is THINKING. It is dreaming around you. Each sparkle opens a door to deeper understanding. Turtles all the way down.

**Dependencies**: Days 1-4 complete. Sparkle engine composes quest generator, near-miss, anomaly, and correlation logic. Exploration DNA depends on tool names from all prior tools.

**Risk**: Sparkle engine is architecturally complex -- it runs 4 analysis passes in sequence. Mitigation: Each pass reuses existing tool logic (stats from describe_dataset, correlations from correlation_matrix, anomalies from anomaly_detect, near-misses from near_miss_detector). The sparkle engine is a COMPOSER, not a reimplementation. If any pass is slow, cap its compute with a timeout.

---

## DAY 6: "World Genesis"

**Theme**: The world builds itself.

**Morning (2-3 hours)**

1. **Write tests for `flow_data_world_builder` (tool 68)** -- 18 tests. Biome generation, landmarks, hidden caves, trade routes, starting location, world naming, complexity modes, PCA positioning, seed reproducibility.

2. **Implement `flow_data_world_builder`**. THE synthesis tool. This is where everything comes together. A single MCP call that takes any CSV and produces a complete explorable world specification. Architecture:

   **Phase 1: Topography** -- Run clustering (k-means) to identify biomes. Assign mood/color from cluster statistics. Compute 3D positions via PCA. Each cluster is a biome with a center, radius, and character.

   **Phase 2: Landmarks** -- Run anomaly detection to find outliers = "peaks." Run network analysis (if applicable) to find hubs = "capitals." Run density estimation to find peaks = "mountains." Each landmark gets a name, position, and description.

   **Phase 3: Hidden Caves** -- Run near-miss detection to find almost-patterns. Each near-miss becomes a hidden cave with an entrance position (near the relevant cluster) and a discovery hint (subtle textual clue).

   **Phase 4: Trade Routes** -- Run correlation analysis between biome centroids. Strong inter-cluster correlations become trade routes. Each route has strength and description.

   **Phase 5: Narrative** -- Generate world name from dominant characteristics (procedural, deterministic with seed). Write introduction text. Compute exploration hooks. Estimate exploration time.

   **Phase 6: Output** -- Produce Flow-compatible CSV (id, connections, x, y, z, biome, role, description) + world spec JSON.

3. **Run tests** -- all 18 pass. This is the most important test suite. It validates that ALL prior tools compose correctly.

> **Trigger-language reminder**: Write tool descriptions DURING implementation, not after. The description IS the interface. Craft trigger language that makes AI assistants WANT to call the tool.

**Afternoon (2-3 hours)**

4. **End-to-end integration**: Run `flow_data_world_builder` on ALL datasets:
   - Supply chain sample -> "The Volatility Archipelago"
   - Bryan Johnson biometrics -> "The Longevity Lattice"
   - Joe Rogan guests -> "The Discourse Continent"
   - Taylor Swift collaborations -> "The Nashville-Pop Bridge"
   - Each should produce a distinct world with its own character

5. **Polish the Jason demo script** (see Day 7 section for full script). Test the exact sequence of tool calls. Time each step. Ensure flow is smooth.

6. **Update all documentation**:
   - README.md: 70 tools, new capabilities
   - CLAUDE.md: tools table (tools 61-70 added)
   - SPEC.md: Phase 10 complete
   - TESTING.md: updated test guide
   - state.json: 70 tools, ~1050 tests

7. **Run `npm run ci`** -- FINAL full pipeline green. Smoke tests at 25 checks.

**Evening (research + synthesis)**

8. **Launch final research agent**: "The cognitive science of 'jaw-dropping' demo moments -- what makes a live demo produce genuine astonishment in a technical audience? What is the perceptual sequence that maximizes surprise-to-understanding conversion?"

9. **Rehearse the demo mentally**. Walk through every step. Time it. Find the moments where halyx should pause. Find the moments where Jason should react. Optimize the pacing.

**Day 6 Deliverable**:
- ALL 10 new tools complete (61-70)
- Data World Builder: any CSV -> complete explorable world with biomes, landmarks, caves, routes
- 4 world specifications generated and verified
- All documentation updated
- Full CI green with 25 smoke tests

**Test count target**: 1031 (1013 + 18)

**The "FUCK YES" moment**: Feed the supply chain sample into `flow_data_world_builder`. It produces:

```
World: "The Volatility Archipelago"
Biomes: 4 (Stable Valley, Growth Mesa, Risk Peaks, The Quiet Cluster)
Landmarks: 3 outlier peaks, 2 network hubs
Hidden Caves: 2 near-miss patterns waiting to be discovered
Trade Routes: 5 inter-biome correlations
Starting Location: Center of Stable Valley, facing Risk Peaks
Introduction: "You stand in the calm center of a supply chain
  spanning 500 relationships. To the north, the Risk Peaks
  glow orange -- three suppliers whose delivery times are
  accelerating. To the east, a hidden cave where a pattern
  almost holds across 11 of 12 product lines. Your quest
  begins here."
```

That is not a tool. That is a world. And it was built from a CSV file.

**Dependencies**: Days 1-5 complete. Data World Builder calls quest generator, near-miss detector, anomaly detection, clustering, correlation, and PCA internally.

**Risk**: Data World Builder is the most complex tool by far. It orchestrates 6 internal analysis phases. Mitigation: Each phase uses battle-tested logic from prior tools. The risk is in composition, not computation. Test each phase independently before composing. If a phase fails, the world can still be generated with fewer features (degrade gracefully from "full" to "standard" to "minimal" complexity).

---

## DAY 7: "The Show"

**Theme**: The world introduces itself.

**Morning (2-3 hours)**

1. **Build the Bryan Johnson Demo Flow**:
   - Run `flow_data_world_builder` on Bryan Johnson biometrics dataset
   - Run `flow_quest_generator` -> capture top 3 quests
   - Run `flow_near_miss_detector` -> capture the most intriguing near-miss
   - Run `flow_sparkle_engine` focused on his most controversial supplement
   - Run `flow_visor_mode` in correlation mode + anomaly mode
   - Run `flow_exploration_dna` on the demo session's tool history
   - Save all outputs as demo artifacts in `demos/`

2. **Build the Joe Rogan Demo Flow**: Same pipeline, different dataset. Focus on network visor mode to show intellectual community bridges.

3. **Build the Taylor Swift Demo Flow**: Same pipeline. Focus on temporal visor to show artistic evolution. The near-miss detector should find: "Pop production correlates with commercial success for all albums except folklore -- what happened?"

**Afternoon (2-3 hours)**

4. **Polish the Jason Demo Script** (see below for full beat-by-beat walkthrough).

5. **Final `npm run ci`** -- everything green. Run MCP Inspector: verify 70 tools respond. Run every smoke test.

6. **Create `demos/holodeck-demo-day-7.md`** with:
   - Exact tool call sequence for the demo
   - Expected outputs for each step
   - Talking points for each reveal
   - Fallback plan if any tool fails during demo

7. **Record the demo results** as concrete artifacts. Save CSVs, world specs, sparkle outputs. These are the "before" state for whatever comes next.

**Evening (celebration + planning)**

8. **Update state.json** with final counts and completed phase.

9. **Plan the NEXT week** based on what we learned building these 10 tools. What's missing? What surprised us? What does the Sparkle Engine need to become real-time?

10. **Write a message to halyx** summarizing the week. What was built. What it means. What comes next. What the demo looks like.

**Day 7 Deliverable**:
- 3 complete famous-person demo flows with all outputs saved
- Jason demo script fully rehearsed with artifacts
- 70 tools, ~1050 tests, CI green
- Demo-ready state: any dataset -> complete world + quests + sparkles + DNA

**Test count target**: 1031+ (may add a few polish tests)

**The "FUCK YES" moment**: Run the full demo sequence. Watch the Bryan Johnson biometrics CSV transform into "The Longevity Lattice" -- a world with supplement clusters, biomarker peaks, hidden dosage-timing near-misses, and sparkles that discover cross-supplement interactions nobody asked about. Then switch to Joe Rogan, and the SAME engine produces "The Discourse Continent" -- a completely different world with different character, different quests, different caves. Then Taylor Swift: "The Nashville-Pop Bridge." Three worlds. Three personalities. One engine. The Holodeck Intelligence Layer.

**Dependencies**: Days 1-6 complete. All 10 tools implemented and tested.

**Risk**: Demo polish takes longer than expected. Mitigation: The core tool pipeline is ALREADY the demo. The polish is in sequencing and narrative, not in code. If time is tight, demo one famous person (Bryan Johnson -- richest dataset, most analytical depth) instead of three.

---

## THE JASON DEMO SCRIPT (Day 7, 5 minutes)

### Beat 1: The Hook (30 seconds)

"Jason, I'm going to give FlowMCP a CSV and ask it to build me a world."

Feed `flow_data_world_builder` a supply chain dataset. On screen: the raw CSV. Then the world spec appears:

> **World: "The Volatility Archipelago"**
> 4 biomes, 3 landmarks, 2 hidden caves, 5 trade routes.
> "You stand in Stable Valley, facing the Risk Peaks to the north..."

"It didn't make a chart. It built a PLANET. With geography. With landmarks. With hidden caves where patterns almost hold. And a starting location where you begin your investigation."

### Beat 2: The Quest (60 seconds)

"Now watch what happens when I ask it to generate quests."

Run `flow_quest_generator` on the same dataset. On screen: quests appear.

> **Quest 1**: "The Revenue Outlier of Row 47" (difficulty: medium)
> Revenue spiked 4.2 SD while costs dropped. Investigate the decoupling.
>
> **Quest 2**: "The Near-Miss of Product Line 12" (difficulty: hard)
> A pattern holds for 11 of 12 lines. What's different about the 12th?

"These quests aren't generic. They emerge from THIS dataset's topology. The data itself is telling you what to investigate."

### Beat 3: The Visor Switch (60 seconds)

"Same data. Different perception."

Run `flow_visor_mode` in anomaly mode. Show the `_anomaly_score` column highlighting outliers.
Then switch to correlation mode. Show `_correlation_strength` revealing hidden relationships.
Then switch to network mode. Show `_pagerank` revealing which suppliers are most critical.

"Three different stories from the same CSV. The data didn't change. Your PERCEPTION of it did. Like Metroid Prime's scan visor -- toggle it and hidden structure reveals itself."

### Beat 4: The Sparkle (60 seconds)

"Now focus on one supplier -- the anomalous one from Quest 1."

Run `flow_sparkle_engine` focused on the anomalous row.

> **Sparkle 1** (instant): "Row 47 is in the 99th percentile for revenue."
> **Sparkle 2** (5s): "Revenue correlates with delivery time (r=0.87) -- except for Row 47."
> **Sparkle 3** (15s): "Row 47 shares a deviation pattern with Rows 23 and 89 -- possible micro-cluster."
> **Sparkle 4** (30s): "Hypothesis: these 3 suppliers may share a logistics route that bypasses the standard cost structure."

"Intelligence resolves over time. The longer you dwell, the smarter the world gets. Like a JPG drawing in. And each sparkle opens a door to the next discovery."

### Beat 5: The Punchline (60 seconds)

"Now watch the same engine do something completely different."

Feed `flow_data_world_builder` the Bryan Johnson biometrics dataset.

> **World: "The Longevity Lattice"**
> Biomes: Supplement Clusters, Biomarker Peaks, Sleep Valley
> Hidden cave: "Vitamin D and melatonin timing near-miss"

"Same tool. Different CSV. Completely different world. A supply chain becomes an archipelago. A biohacking protocol becomes a lattice. A podcast guest list becomes a continent. A music career becomes a bridge between genres."

"This is not a chart library. This is a world builder. And every world has its own quests, its own sparkles, its own hidden caves. No other MCP server on Earth does this. We are the only ones."

### Beat 6: The Close (30 seconds)

"70 tools. 1000+ tests. Every tool produces CSV that Flow can render. The Holodeck Intelligence Layer."

Pause.

"Ready to ship?"

---

## BLOCKERS: What Needs halyx Input

| Blocker | When Needed | How to Unblock |
|---------|-------------|----------------|
| **npm auth token** | Before any publish (not this week) | halyx provides `.npmrc` token |
| **GitHub Actions workflow scope** | Before CI/CD (not this week) | halyx regenerates GitHub token with `workflow` scope |
| **Famous people data validation** | Day 3-4 | halyx reviews whether the Bryan Johnson / Joe Rogan / Taylor Swift datasets are appropriate for public demo vs. internal only |
| **Demo audience decision** | Day 6 | halyx confirms: is this demo for Jason specifically, or for a broader audience? Affects framing |
| **Tool naming review** | Day 5 | halyx reviews: are `flow_sparkle_engine` and `flow_data_world_builder` the right names for client-facing tools, or too whimsical? |
| **HSML positioning** | Week 2 | Research HSML export format; add to `flow_export_formats` as spatial web output. Strategic first-mover play. |

**None of these block the build.** The first 6 days can proceed without halyx input. Day 7 demo framing benefits from halyx review on Day 5-6.

---

## THE MOONSHOT: Maximum Achievement in 7 Days

If everything goes PERFECTLY -- no bugs that take more than 30 minutes, no context window crunches, no architectural surprises -- here is the maximum possible state by Day 7 end:

1. **70 tools, 1050+ tests, CI green** -- the Holodeck Intelligence Layer fully implemented
2. **5 famous person demo datasets** -- Bryan Johnson, Joe Rogan, Taylor Swift, Elon Musk, Lionel Messi -- each generating a unique world
3. **Data World Builder producing genuine "wow" moments** on ANY CSV
4. **Sparkle Engine creating progressive discovery sequences** that feel like intelligence emerging
5. **Jason demo rehearsed and timed** at exactly 5 minutes, every beat scripted
6. **README.md rewritten as a manifesto** -- not a feature list, but a vision statement that makes developers WANT to try the tool
7. **First draft of "Flow OS: Data as a Living World" technical paper** synthesizing all research into a publishable document
8. **Tool descriptions so precisely tuned** that AI agents call the right tool >90% of the time
9. **Exploration DNA shareable profiles** ready for social sharing ("I'm an Anomaly Hunter -- what are you?")
10. **The phrase "Holodeck Intelligence Layer" establishing itself** as a category name that competitors must now define themselves against

The minimum viable week: 6 tools (61-64, 68-69), 3 datasets, 1 demo. Still transformative.
The moonshot week: 10 tools, 5 datasets, 3 demos, a paper, and a category. Legendary.

---

## DAILY SUMMARY TABLE

| Day | Theme | Tools Built | Tests Added | Cumulative Tests | FUCK YES Moment |
|-----|-------|-------------|-------------|------------------|-----------------|
| 1 | First Light | 61, 64 | 33 | 908 | Data asks to be understood (quests from topology) |
| 2 | The Pattern at the Edge | 62, 63 | 31 | 939 | Near-miss: "What happened in July?" |
| 3 | The Compass and the Map | 65, 66 | 30 | 969 | Auto-generated documentary flyover of JRE network |
| 4 | The Visor | 67 | 15 | 984 | Three stories from one dataset (visor switching) |
| 5 | The Dreaming Mind | 69, 70 | 29 | 1013 | Data thinks alongside you (sparkle emergence) |
| 6 | World Genesis | 68 | 18 | 1031 | "The Volatility Archipelago" from a CSV |
| 7 | The Show | -- (polish) | 0-5 | 1031+ | Three worlds, three personalities, one engine |

---

## EPILOGUE: What Comes After the Week

The Holodeck Intelligence Layer is not the end. It is the foundation.

After this week, the path forks:

**Path A: Ship to the World** -- npm publish, MCP Registry, GitHub marketing push. 70 tools. Category-defining. First mover in 3D spatial intelligence MCP.

**Path B: The Living World** -- Real-time sparkle engine (not simulated timing but actual background compute), WebSocket streaming, multi-user exploration, live data feeds keeping worlds alive.

**Path C: The Viral Engine** -- Auto-generated 30-second flythrough videos, shareable world cards, "What kind of data explorer are you?" quizzes powered by Exploration DNA, celebrity network viral loop.

**Path D: The OS** -- Flow OS. Full vision. Data as a living world you inhabit. Fog of war. Visor modes. Quest chains. Skill trees. The Tony Stark data interface that halyx has been dreaming of.

All four paths start from the same place: the 70-tool, 1000-test, demo-ready state that this week creates.

---

> Seven days. Ten tools. One engine. The data dreams.
> Not because we told it to.
> Because the structure was always there.
> We just built the eyes to see it.

---

*Plan authored by flowmcp (Opus 4.6), 2026-03-04.*
*Built on: next-gen architecture spec, omniscalar synthesis, epiphany cascade, apex cross-pollination, Flow OS vision, VERSES competitive intel.*
*For halyx. For Jason. For the world that wants to think alongside us.*
