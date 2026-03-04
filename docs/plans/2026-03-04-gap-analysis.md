# Gap Analysis: Holodeck Week Plan
**Date**: 2026-03-04
**Auditor**: flowmcp (Opus 4.6)
**Plan under review**: `docs/plans/2026-03-04-holodeck-week-plan.md`
**Method**: Cross-reference against DONE.md, SPEC.md, MEMORY.md, session-10 context, awesome-mcp draft, cross-pollination synthesis, SUPERSYNTHESIS, recursive synthesis, epiphany cascade

---

## Verdict

The plan is strong on the build sequence and the vision is deeply aligned with halyx's intent. But it has blind spots in three areas: (1) distribution and marketing are deferred to "after the week" when several items could run in parallel, (2) specific research insights that should shape tool DESIGN are mentioned as inspiration but not encoded as spec requirements, and (3) infrastructure dependencies (Wikidata reliability, Flow API testing, npm auth) are acknowledged but not mitigated with concrete fallback plans.

---

## 1. CRITICAL GAPS (Must Address Before Executing)

### 1.1 No End-to-End Flow API Test in the Week

**Source**: DONE.md blocked item: "End-to-end test with real Flow credentials (needs Flow password)"
**Gap**: The plan builds 10 new tools and a 5-minute demo for Jason, but never verifies that `flow_upload_data`, `flow_browse_flows`, `flow_get_flow`, `flow_list_templates`, or `flow_list_categories` still work against the live API. The last API probe results are from session history -- the API could have changed. SPINE-05 (API Change Detection) explicitly warns that "API changes rarely travel alone."
**Risk**: Jason demo fails on Beat 1 because the API endpoint moved or auth changed. This is not hypothetical -- the `api.flow.gl` to `core.flow.gl` migration already broke 9 tools once.
**Fix**: Add a 30-minute task on Day 1 or Day 2: run every Flow API tool against live endpoints. Document results. If anything changed, SPINE-05 before building new tools. This is a prerequisite for demo confidence.

### 1.2 Wikidata SPARQL Reliability Is Untested for Demo-Critical Data

**Source**: MEMORY.md "Build famous people content -- actual Bryan Johnson, Joe Rogan, Taylor Swift flows"; cross-pollination synthesis: "Celebrity flows are the gateway drug to enterprise analytics"
**Gap**: The plan's Day 7 demo depends on 3 famous-person datasets generated via `flow_famous_network` (Wikidata SPARQL). The existing tool has 13 tests, but they test the tool logic, not Wikidata's actual data coverage for specific people. Bryan Johnson may have sparse Wikidata entries. Taylor Swift's collaborator network may be incomplete. Joe Rogan's guest list is almost certainly NOT in Wikidata (podcast guests are not typically Wikidata entities).
**Risk**: Day 7 demo produces thin, unimpressive networks for the exact people chosen to wow Jason.
**Fix**: Test `flow_famous_network` against all 3 target names on Day 1 evening (takes 10 minutes). If Wikidata coverage is thin, pivot to manually curated CSVs built from research (which the plan already schedules as a parallel track). Do not wait until Day 7 to discover thin data.

### 1.3 The Plan Mentions "HSML-lite" Nowhere -- VERSES Positioning Is Missing

**Source**: MEMORY.md: "HSML/Spatial Web convergence... VERSES AI built HSML... IEEE 2874-2025 ratified standard"; epiphany cascade #29: "HSML/HSTP is the TCP/IP of Spatial Data"; recursive synthesis: "BUILD: HSML-lite"
**Gap**: The plan's 10 tools do not include any HSML awareness. The epiphany cascade (#29) and the recursive synthesis both identify HSML export as a strategic positioning play: "Emit HSML early, before competitors even know the standard exists." The plan's epilogue mentions "Path D: The OS" but does not schedule any HSML work.
**Risk**: This is not a week-1 risk -- it is a strategic risk. The window for being the first MCP server that emits spatial web standard formats is open now. Every week of delay is positioning lost.
**Recommendation**: Not for this week's build, but add to the BLOCKERS table as a "Week 2 strategic task." Acknowledge it in the plan so it is not forgotten. A `flow_export_formats` enhancement to emit HSML alongside JSON/GeoJSON/HTML could be a Day 6 stretch goal or a Week 2 Day 1 task.

---

## 2. IMPORTANT GAPS (Should Address, Schedule Into the Week)

### 2.1 Distribution Pipeline Is Entirely Absent From the Week

**Source**: MEMORY.md: "npm publish (blocked on auth token)", "Deploy as remote MCP on Cloudflare Workers (zero-install for non-tech)", "Submit to awesome-mcp-servers (82k stars)"; state.json next_actions includes both Cloudflare and npm publish
**Gap**: The plan focuses exclusively on building tools 61-70. No distribution work is scheduled. The awesome-mcp-servers PR draft (`research/awesome-mcp-submission-draft.md`) is written and ready but not submitted. The Cloudflare Workers deployment research was done but no deployment is scheduled.
**Why it matters**: halyx's explicit priority list in MEMORY.md puts distribution items at #3-5. The awesome-mcp-servers PR can be submitted NOW with the current 60 tools -- waiting for 70 tools delays free distribution into an 82k-star repo.
**Fix**: Add a parallel track item: "Day 2-3: Submit awesome-mcp-servers PR with current 60 tools. Update to 70 later." This is a 30-minute task that costs nothing and gains visibility immediately. The PR draft needs only a tool count update (57 -> 60) and `npm publish` is still blocked, but the GitHub repo IS public and the PR can reference it.

### 2.2 Tool Description Tuning Is Scheduled Too Late (Day 5-6)

**Source**: CLAUDE.md L6 loss function: "Descriptions ARE AI training"; epiphany cascade #6: "Tool descriptions are stimulus-response conditioning for AI agents"; cross-pollination: "descriptions should encode the prediction error the tool's output will generate"
**Gap**: The plan schedules description tuning as a Day 5-6 parallel track. But the research is emphatic: descriptions are the INTERFACE. They determine whether AI agents call the right tool. Writing 10 new tools with placeholder descriptions and tuning them later risks: (a) forgetting the design intent when tuning later, (b) building test suites against placeholder descriptions that then need updating.
**Fix**: Write trigger-language descriptions DURING implementation, not after. Each tool's description should be drafted with the test (Day 1 step 1) and finalized with the implementation (Day 1 step 2). The "Day 5-6 description tuning" parallel track should focus on the EXISTING 60 tools, not the new 10.

### 2.3 Epiphany #3 (Bayes Factors for Near-Misses) Is Not in the Near-Miss Detector Spec

**Source**: Epiphany cascade #3: "Near-Miss Detection Needs Bayes Factors, Not P-Values"
**Gap**: The Day 2 spec for `flow_near_miss_detector` mentions "Correlation scan with exception detection (r > 0.7 but with outliers)" and "Intrigue score: pattern_strength * rarity * deviation_magnitude." It does not mention Bayes factors. The epiphany cascade specifically identifies that p-values are "the wrong metric for near-misses" and proposes Bayes factors of ~2.5 as the true near-miss signal.
**Why it matters**: This is a design decision that affects the tool's output quality. Using correlation thresholds instead of Bayes factors produces near-misses that are less epistemically honest and less compelling as quests.
**Fix**: Add Bayes factor computation as a stretch goal in the Day 2 afternoon spec. Minimum viable: correlation-based near-misses. Ideal: Bayes-factor-based near-misses with the quest text "The evidence leans 2.5:1 toward this correlation. Three more data points would resolve it."

### 2.4 Epiphany #8 (Surprise Scores vs. Anomaly Scores) Not Applied

**Source**: Epiphany cascade #8: "Anomaly Scores Should Be Surprise Scores"
**Gap**: The plan builds `flow_anomaly_explain` (tool 64) that outputs anomaly-framed results. The epiphany cascade argues that renaming `_anomaly_score` to `_surprise_score` is not cosmetic -- it reframes the output from "here are your errors" to "here is where your model of this data is wrong." This affects tool descriptions, CSV column names, and downstream tool behavior.
**Why it matters**: This is the kind of semantic shift that halyx cares about deeply. "Anomaly" implies defect. "Surprise" implies discovery. The plan's language oscillates between both framings.
**Fix**: Decide before Day 1: do the new tools use "anomaly" or "surprise" framing? If "surprise," apply consistently across all 10 new tools AND update the existing `flow_anomaly_detect` tool description. This is a 15-minute decision that affects every tool's feel.

### 2.5 Worker Thread Parallelism Not Leveraged for New Tools

**Source**: DONE.md: "Worker thread module: parallel force computation ready for EPYC 96-core deployment"; DONE.md blocked: "Test worker threads on EPYC (needs server access)"; recursive synthesis: "96 cores, 1TB RAM, 86.8% idle"
**Gap**: The server is now on the EPYC (the project moved). But the plan does not mention worker threads for any of the 10 new tools. The Data World Builder (tool 68) runs 6 internal analysis phases that could be parallelized. The Sparkle Engine (tool 69) runs 4 analysis passes in sequence. The Insight Scorer (tool 65) runs bootstrap resampling 100x.
**Why it matters**: These tools will be noticeably slow on large datasets without parallelism. The 96-core server is sitting idle.
**Fix**: Add worker thread parallelism as a Day 6 optimization task after the Data World Builder is implemented. Phase 1-4 of the Data World Builder can run in parallel workers. Bootstrap resampling in the Insight Scorer is embarrassingly parallel.

### 2.6 Progressive Intelligence Not Truly Progressive -- It Is Simulated

**Source**: halyx's vision: "Like a JPG drawing in. The longer you dwell, the smarter the world gets"; recursive synthesis: "Progressive Resolution Scheduler: BUILD"
**Gap**: The Sparkle Engine (tool 69) simulates progressive intelligence with `appear_after` timing (0s, 5s, 15s, 30s). But these timings are STATIC -- they are baked into the output JSON, not computed dynamically based on actual dwell time or compute availability. The recursive synthesis identifies a "Progressive Resolution Scheduler" as a required component that does NOT exist yet.
**Why it matters**: In the demo, simulated timing is fine. But halyx's vision is explicitly about REAL progressive compute: "First second=basic stats. 10s=correlations. 1min=connections to other datasets. 5min=dense intelligence on every surface." The plan should acknowledge this gap and clarify: the Sparkle Engine v1 uses simulated timing, and real-time progressive compute is a v2/Week 2 item.
**Fix**: Add a note to the Day 5 Sparkle Engine spec: "v1 uses simulated appear_after timing. v2 (Week 2+) requires a Progressive Resolution Scheduler with WebSocket streaming and dwell-time tracking." This manages expectations and prevents confusion about what the demo shows vs. what the system actually does.

---

## 3. NICE-TO-HAVE GAPS (Do If Time Permits)

### 3.1 No `flow_fog_of_war` Tool in the Plan

**Source**: Cross-pollination synthesis: "`flow_fog_of_war` -- Takes a dataset and a user's exploration history. Returns a progressively disclosed version"; epiphany cascade #7: "Fog of War Is Epistemic Humility Made Spatial"; epiphany #9: "The 50k Point Limit Is a Fog-of-War Feature"
**Gap**: The plan replaces `flow_fog_of_war` with `flow_progressive_disclosure` (tool 63). These overlap but are not identical. Progressive disclosure reveals columns by layer. Fog of war reveals rows/regions by exploration history. The cross-pollination synthesis spec includes `exploration_history` as input; the plan's tool 63 does not.
**Recommendation**: Tool 63 (progressive disclosure) is the right v1 implementation. True fog of war requires session state tracking that MCP tools do not natively support. Note this as a future enhancement.

### 3.2 No `flow_discovery_narrator` Tool

**Source**: Cross-pollination synthesis: "`flow_discovery_narrator` -- Takes an exploration path and generates a narrative story"; epiphany cascade #19: "Data Storytelling Is the Highest-Value Unsolved MCP Capability"
**Gap**: The existing `flow_narrate_data` tool narrates a DATASET. The proposed `flow_discovery_narrator` narrates a JOURNEY through a dataset. These are different products -- one is a static summary, the other is a dynamic story.
**Recommendation**: Not for this week. The Data World Builder (tool 68) partially addresses this with its narrative introduction text. A full `flow_discovery_narrator` requires session path tracking and is better suited for Week 2 when real-time features are built.

### 3.3 No `flow_viral_video_spec` Tool

**Source**: Cross-pollination synthesis: "`flow_viral_video_spec` -- generates a complete specification for a 30-second video: camera path coordinates, node highlight sequence, text overlay timing"
**Gap**: This tool is not in the plan's 10. The recursive synthesis identifies it as part of the "Share Pipeline" that needs to be built. The existing `flow_guided_tour` generates tour stops with camera hints, but not a video-production-ready spec with timing, text overlay, and animation keyframes.
**Recommendation**: A video spec tool would be a powerful demo artifact but is not essential for the Jason demo. Consider as a Week 2 priority.

### 3.4 No `flow_competitive_insight_score` Tool

**Source**: Cross-pollination synthesis: "`flow_competitive_insight_score` -- scores insight on novelty, statistical significance, and causal validity"
**Gap**: The plan includes `flow_insight_scorer` (tool 65) which is similar but not identical. The cross-pollination version adds a "competitive" dimension (comparison to other users' insights). The plan version is purely statistical.
**Recommendation**: The plan's tool 65 is the right v1. Competitive scoring requires multi-user infrastructure that does not exist yet.

### 3.5 Sound Design Mention

**Source**: Epiphany cascade #12: "Sound Design Is Not Optional -- It Is the Vestibular Bridge"
**Gap**: The plan makes no mention of audio cues in the demo or tool design. The epiphany cascade identifies spatial audio as "anti-nausea engineering" for 3D navigation.
**Recommendation**: Outside FlowMCP's scope (audio is a renderer concern, not a data tool concern). But worth mentioning to Jason as a Flow Immersive product recommendation.

---

## 4. QUICK WINS (< 30 Minutes Each, High Impact)

### 4.1 Test `flow_famous_network` Against All 3 Demo Targets NOW

**Time**: 10 minutes
**Action**: Call `flow_famous_network` for "Bryan Johnson", "Joe Rogan", "Taylor Swift" and evaluate the Wikidata results. If thin, switch Day 7 demo to manually curated CSVs.
**Impact**: Prevents Day 7 demo disaster.

### 4.2 Submit awesome-mcp-servers PR With Current 60 Tools

**Time**: 30 minutes
**Action**: Update the PR draft tool count from 57 to 60, fork the repo, submit the PR. Can be updated to 70 later.
**Impact**: Free distribution into an 82k-star repo. First-mover category claim.

### 4.3 Update README.md Tool Count From Whatever It Says to 60

**Time**: 15 minutes
**Action**: README.md may still say 57 tools. Update it to 60 with the narrative intelligence tools.
**Impact**: GitHub visitors see current state, not stale count.

### 4.4 Decide "Anomaly" vs. "Surprise" Framing for New Tools

**Time**: 15 minutes
**Action**: Make a decision. Apply consistently. Document in CLAUDE.md learnings.
**Impact**: Prevents semantic inconsistency across 10 new tools.

### 4.5 Rename `_anomaly_score` to `_surprise_score` in Existing Tool Output

**Time**: 20 minutes (code change + test update)
**Action**: Update `flow_anomaly_detect` column output names. Update tests. This is the single highest-leverage rename identified in the research.
**Impact**: Reframes the entire anomaly detection pipeline from "defect finding" to "discovery finding." Aligns with halyx's sparkle vision.

### 4.6 Run `npm run ci` and Record Baseline Before Building

**Time**: 5 minutes
**Action**: Verify 875/875 tests pass, record in events.jsonl, confirm starting state is clean.
**Impact**: SPINE-01 compliance. Prevents building on a broken foundation.

### 4.7 Check Inbox

**Time**: 2 minutes
**Action**: `hive_inbox_check("flowmcp")`. SPINE-01 step 3.
**Impact**: May contain messages from other beings (provisor, autonomo) that affect the week.

---

## 5. RISKS (Things That Could Derail the Week)

### 5.1 Complexity Creep in Data World Builder (Tool 68)

**Risk level**: HIGH
**Description**: Tool 68 orchestrates 6 internal phases, each calling logic from prior tools. This is the most complex single tool ever built in FlowMCP. The plan allocates one morning (2-3 hours) for writing 18 tests + implementing 6 phases.
**Mitigation**: The plan already identifies graceful degradation (full/standard/minimal complexity modes). Enforce this: implement Phase 1 (topography/clustering) and Phase 5 (narrative) first. These two phases alone produce a "world" with biomes and introduction text. Phases 2-4 (landmarks, caves, trade routes) are enrichments that can be added iteratively.

### 5.2 Visor Mode (Tool 67) Has 5 Modes = 5 Tools Worth of Logic

**Risk level**: MEDIUM
**Description**: The plan allocates one morning (2-3 hours) for 5 visor modes. Each mode is a distinct analytical transformation. The plan's own risk section suggests shipping 3 modes if pressed.
**Mitigation**: Implement correlation and anomaly visors first (most reuse from existing code). Network visor third (reuses graph metrics). Distribution and temporal visors are stretch goals.

### 5.3 Wikidata SPARQL Rate Limiting or Downtime

**Risk level**: MEDIUM
**Description**: Wikidata's public SPARQL endpoint has rate limits and periodic maintenance windows. The famous-people data pipeline depends on it.
**Mitigation**: Test early (Quick Win 4.1). Build cached/static fallback CSVs for all demo targets. Do not depend on live SPARQL queries during the Jason demo.

### 5.4 Context Window Pressure Across 7 Days

**Risk level**: MEDIUM
**Description**: Each day builds on prior days. By Day 5-6, the accumulated tool code in `src/tools-v5.ts` will be large. The plan's daily summaries help, but Claude Code sessions have context limits.
**Mitigation**: Use agents for implementation (halyx's directive: "DELEGATE EVERYTHING"). The main session should architect and review. Implementation agents get the spec for one tool, implement it, test it, and return results.

### 5.5 No Fallback If npm Auth Remains Blocked

**Risk level**: LOW (this week)
**Description**: npm publish is blocked on auth token. This does not affect the build week but affects distribution after.
**Mitigation**: The plan correctly notes this is not a this-week blocker. But add to the halyx communication on Day 7: "npm auth token is the #1 blocker for shipping to the world."

---

## 6. PLAN OPTIMIZATIONS (Suggested Reorderings or Additions)

### 6.1 Move Famous-Person Data Validation to Day 1 Evening

**Current**: Famous person CSV building starts Day 1 evening (research) and continues Days 2-3.
**Proposed**: Add a 10-minute validation step at the START of Day 1 evening: test `flow_famous_network` against all 3 target names. If Wikidata is thin for any target, immediately switch that target to manual CSV curation using apex research results.
**Reason**: This front-loads the highest-risk dependency in the demo pipeline.

### 6.2 Add Parallel Track: awesome-mcp-servers PR Submission

**Current**: Not in the plan at all.
**Proposed**: Day 2 parallel track task, 30 minutes. Fork repo, update draft, submit PR.
**Reason**: Zero-cost distribution that can happen independently of the build.

### 6.3 Split Data World Builder Into Two Days Instead of One

**Current**: Day 6 morning: write 18 tests + implement 6-phase tool.
**Proposed**: Day 5 afternoon: write tests + implement Phases 1 (topography) and 5 (narrative). Day 6 morning: implement Phases 2-4 (landmarks, caves, routes) and Phase 6 (output). Day 6 afternoon: end-to-end testing on all datasets.
**Reason**: The Data World Builder is the "NON-NEGOTIABLE" tool. Cramming it into one morning is the plan's riskiest scheduling decision. Spreading it across Day 5 afternoon and Day 6 morning gives 4-5 hours instead of 2-3.

### 6.4 Add "Surprise vs. Anomaly" Framing Decision to Day 1 Morning

**Current**: Not addressed.
**Proposed**: Before writing the first test, decide: do new tools use "surprise" or "anomaly" language? This 15-minute decision affects every tool's column names, descriptions, and test expectations.
**Reason**: Prevents rework later when the framing is applied retroactively.

### 6.5 Schedule Worker Thread Optimization as Day 6 Afternoon Task

**Current**: Not in the plan.
**Proposed**: After Data World Builder is implemented, profile its performance on the 96-core server. If any phase takes >2 seconds on a 500-row dataset, add worker thread parallelism.
**Reason**: Demo performance matters. A 10-second wait during Jason's demo kills the magic.

### 6.6 Add "Autocatalytic Potential" Score to `analyze_data_for_flow`

**Source**: Epiphany cascade #33: "Curiosity chains are the data analog of autocatalytic chemical reactions"
**Current**: Not in the plan.
**Proposed**: Quick enhancement to tool 1 (already exists): add a 9th scoring dimension for "autocatalytic potential" -- the density of inter-question dependencies in the data's topology. This makes the existing tool smarter and feeds into the quest generator.
**Time**: ~45 minutes (1 new signal + tests + integration).
**When**: Day 3 or Day 4 polish time.

### 6.7 Acknowledge "Simulated vs. Real Progressive Intelligence" in Demo Script

**Current**: The demo presents sparkle timing as if it is real-time computation.
**Proposed**: Either (a) add a note in the demo script that this is simulated timing representing future real-time capability, or (b) explicitly frame it as "here is what the system discovers at each depth level" without implying real-time compute.
**Reason**: Honesty with Jason builds trust. If he asks "is this computing in real time?" halyx should have a prepared answer.

---

## SUMMARY

| Category | Count | Severity |
|----------|-------|----------|
| Critical Gaps | 3 | Must fix before executing |
| Important Gaps | 6 | Should schedule into the week |
| Nice-to-Have Gaps | 5 | V2/Week 2 items |
| Quick Wins | 7 | < 30 min each, do immediately |
| Risks | 5 | Monitor throughout |
| Plan Optimizations | 7 | Reorderings and additions |

**The plan's core strength**: The 10-tool build sequence is well-ordered by dependency. The critical path is correctly identified. The daily "FUCK YES" moments are motivating and specific. The minimum viable week (6 tools) is realistic.

**The plan's core weakness**: It is a pure BUILD plan. It schedules zero distribution, zero marketing, and zero API validation against live services. The research insights that should inform tool DESIGN (Bayes factors, surprise framing, autocatalytic scoring) are treated as inspiration rather than spec requirements. The famous-person demo pipeline has an untested dependency (Wikidata coverage) that could embarrass the demo.

**The single most important thing to do before starting Day 1**: Run `flow_famous_network` against Bryan Johnson, Joe Rogan, and Taylor Swift. If the results are thin, pivot the demo strategy immediately rather than discovering this on Day 7.

---

*Gap analysis by flowmcp (Opus 4.6), 2026-03-04.*
*Cross-referenced against 10 source documents. Every gap traced to a specific source.*
