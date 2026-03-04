# Apex Research Protocol

**Category**: research
**Created**: 2026-03-04
**Times reused**: 0

## Trigger

When user says "apex research", "deep research", "run apex", "research protocol", or needs breakthrough insights on a hard/novel problem that exceeds what a single model can produce.

## Description

Run the 3-stage apex research protocol (Exa -> Perplexity Deep Research -> Perplexity Pro Search) for breakthrough insights on any topic. Each stage compounds on the previous: DISCOVER what exists, UNDERSTAND why it works, IMPLEMENT how to use it.

## Quick Start

```bash
# Full 3-stage pipeline (~$0.11, ~4 min)
python3 /hive/shared/tools/apex-research.py "Your research question here"

# Shorthand for full pipeline (same behavior)
python3 /hive/shared/tools/apex-research.py --full "Your research question here"

# Quick single-pass lookup (~$0.001)
python3 /hive/shared/tools/apex-research.py --quick "Simple factual question"

# Single stage with context from previous
python3 /hive/shared/tools/apex-research.py --stage 2 --context "Stage 1 found..." "Go deep on this"

# List previous runs
python3 /hive/shared/tools/apex-research.py --list-runs
```

Output saves to `/hive/shared/research/runs/YYYYMMDD-HHMMSS/` with per-stage markdown and a combined report.

## The Pipeline

| Stage | Model | Purpose | Cost | Time |
|-------|-------|---------|------|------|
| 1. DISCOVER | `deepseek/deepseek-v3.1-terminus:online` (Exa) | Cast widest net. Find tools, models, repos, papers too new for training data. | ~$0.005 | ~60s |
| 2. UNDERSTAND | `perplexity/sonar-deep-research` | Go deep on Stage 1 findings. Architecture, foundations, failure modes. Multi-step autonomous research loop. | ~$0.06 | ~120s |
| 3. IMPLEMENT | `perplexity/sonar-pro-search` | Turn understanding into code. API calls, parameters, comparison tables, cost breakdowns. | ~$0.04 | ~35s |

**Total**: ~$0.11 per full pipeline. $100 OpenRouter credits = ~900 full pipelines.

## When to Use Which

| Complexity | Approach | Cost |
|-----------|----------|------|
| Quick factual question | `hive_searxng_search` (free) or `--quick` | $0.00-0.001 |
| Medium research | Skip Stage 1, run `--stage 2` + `--stage 3` | ~$0.10 |
| Hard novel problem | Full pipeline (default) | ~$0.11 |
| Bleeding-edge tool discovery | `--stage 1` only, then verify manually | ~$0.005 |

## Omniscalar Prompt Template (Copy-Paste Ready)

Use this when running manually through Perplexity or when crafting custom Stage 2 prompts for maximum insight:

```
## Your Role
You are a systems theorist who perceives at ALL scales simultaneously.
Your job is to see the hidden architecture beneath surface phenomena.

## The Perception Task
Perceive the principle of [CONCEPT/PHENOMENON] as it manifests across
scales (micro/meso/macro/meta/supra) and across domains.

For each scale and each domain, generate observations that:
1. TRACE the pattern (where it appears, how it manifests)
2. MAP the principle to other domains (cross-domain analogies)
3. DIAGNOSE where the pattern breaks (dissonances are MORE valuable than resonances)
4. CONSTRUCT a unified model that explains both resonances and dissonances

## Scale Definitions
- Micro: Token, character, word, single concept
- Meso: Sentence, paragraph, local relationship
- Macro: Document, session, conversation
- Meta: Cross-conversation patterns, system-level behavior
- Supra: Civilization-scale epistemic structures, long-range impact

## Domains to Cross
1. Neuroscience / perception
2. Compiler theory / language processing
3. Ecology / complex systems
4. Information theory / signal processing
5. Biology / molecular systems
6. Physics / materials science
7. Engineering / optimization

## Quantity Target
Generate 48+ observations total. Observations 1-20 are expected to be
confirmatory. Observations 21-35 push toward novelty. Observations 36-48
are speculative breakthroughs.

**The value is in observations 30-48.** Treat the first 20 as table-setting.

## Dissonances > Resonances
Actively hunt for dissonances. For every resonance, ask:
- Where does this pattern break?
- What assumption does this analogy violate?
- What would a system that exploited this dissonance look like?

## Meta-Synthesis
At the end, synthesize across all scales and domains. Then answer:
**What would a civilization 100 years more advanced than us do with these insights?**

## Parameters
- Temperature: 0.8 (balanced exploration)
- Max tokens: 8000
- Search depth: Maximum
```

## Key Techniques

### 1. Perception Framing (Not Extraction)

**Extraction framing** ("Extract all X from Y") activates slot-filling. Ceiling: ~75%.
**Perception framing** ("Perceive the structure in this signal") activates hierarchical decomposition, feedback loops, cross-scale reasoning. Ceiling: unbounded.

Always frame research questions as perception tasks.

### 2. Sapir-Whorf Verb Table

The verb you choose determines which cognitive mode activates:

| Verb | Cognitive Mode | Ceiling |
|------|---------------|---------|
| try / attempt | Exploration, low-confidence | 50-60% |
| extract / find | Slot-filling, enumeration | 70-85% |
| trace / map | Pathway reasoning, connection-finding | 80-95% |
| diagnose / explain | Causal reasoning, mechanism discovery | 85-95% |
| construct / synthesize | Generative reasoning, novel insight | 90-98% |
| perceive / observe | Meta-cognitive awareness, scale-bridging | 95%+ |

**Use only high-ceiling verbs**: trace, map, decompose, diagnose, construct, perceive. Never "try" or "should."

### 3. Forced Quantity (48+ Observations)

- Observations 1-10: Obvious surface patterns everyone knows
- Observations 11-20: Standard published research
- Observations 21-29: Territory authors explored but didn't publish
- **Observations 30-48: Novel insights** that required 30 throwaway ideas first

Force past the obvious. Creativity requires exhausting the predictable first.

### 4. Dissonance Hunting

Resonances confirm existing knowledge. Dissonances reveal where your model is wrong. Explicitly instruct: "The dissonances are MORE valuable. Prioritize finding dissonances."

Optimal disagreement ratio: ~50% resonance, ~50% dissonance (maximum information density).

### 5. The Civilization Question

Always close with: "What would a civilization 100 years more advanced than us do with these insights?"

Forces synthesis, extrapolation beyond current constraints, and identification of what's still missing. This single question transforms observations into actionable architecture.

### 6. Temperature and Token Budget

- **Temperature 0.8**: Balanced exploration. Novel connections without incoherence.
- **Max tokens 8000**: Deep reasoning requires room to think. 4K forces shortcuts.

## Interpreting Results

1. **Skim observations 1-20** -- these are confirmation, not discovery
2. **Deep-read observations 30-48** -- this is where architecture innovations live
3. **Cross-reference dissonances with your domain**: For each dissonance, ask "How do we build a system that exploits this?"
4. **Verify Stage 1 claims** -- DeepSeek hallucinates specific numbers/parameters/hashes. Names are usually real; details are often invented.
5. **Stage 2 provides the WHY** -- prevents cargo-culting wrong parameters
6. **Stage 3 provides the HOW** -- copy-paste implementation, but verify against Stage 2 understanding

## Validation Rule

Always verify Stage 1 (Exa) claims before feeding to Stage 2. DeepSeek finds real NAMES but invents DETAILS. The script handles chaining automatically, but if running stages manually, filter Stage 1 output for verified names/links only.

## Models to Avoid

- `perplexity/sonar-reasoning-pro`: DeepSeek R1 under the hood. Hardcoded safety refusals for anything involving real-person imagery, biomedical, weapons. Dead for sensitive research categories.

## Files

- Script: `/hive/shared/tools/apex-research.py`
- Protocol doc: `/hive/shared/research/apex-research-protocol.md`
- Prompting playbook: `/hive/shared/guides/perplexity-prompting-playbook.md`
- Run output: `/hive/shared/research/runs/`
