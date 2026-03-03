#!/usr/bin/env bash
# overnight-pipeline.sh — Autonomous overnight optimization + stress testing pipeline
# Runs for hours on 96-core EPYC with 1TB RAM. No human input needed.
# Usage: nohup bash scripts/overnight-pipeline.sh > data/overnight/pipeline.log 2>&1 &

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/data/overnight"
TIMESTAMP=$(date +%Y%m%dT%H%M%S)

mkdir -p "$OUT"

log() {
  echo "[$(date +%H:%M:%S)] $*" | tee -a "$OUT/pipeline.log"
}

log "============================================================"
log "  FLOWMCP OVERNIGHT PIPELINE — $TIMESTAMP"
log "  Server: $(nproc) cores, $(free -h | awk '/Mem:/{print $2}') RAM"
log "============================================================"

# ============================================================
# PHASE 1: OPTUNA — Multiple Samplers (TPE, CMA-ES, Random)
# ============================================================

log ""
log "PHASE 1: Optuna Multi-Sampler Optimization"
log "-------------------------------------------"

# 1a. TPE Sampler — 50K trials
log "1a. Running Optuna TPE — 50,000 trials on 96 workers..."
python3 "$ROOT/scripts/optuna-optimize.py" \
  --trials 50000 --workers 96 --study-name "overnight_tpe_$TIMESTAMP" \
  > "$OUT/optuna-tpe.log" 2>&1 || log "TPE failed: $?"
log "1a. TPE complete. Results in optuna-tpe.log"

# 1b. CMA-ES Sampler — 50K trials
log "1b. Running Optuna CMA-ES — 50,000 trials..."
python3 "$ROOT/scripts/overnight/cmaes-optimize.py" \
  --trials 50000 --output "$OUT/optuna-cmaes-results.json" \
  > "$OUT/optuna-cmaes.log" 2>&1 || log "CMA-ES failed: $?"
log "1b. CMA-ES complete."

# 1c. Random Sampler — 50K trials (baseline for comparison)
log "1c. Running Optuna Random — 50,000 trials on 96 workers..."
python3 "$ROOT/scripts/overnight/random-optimize.py" \
  --trials 50000 --output "$OUT/optuna-random-results.json" \
  > "$OUT/optuna-random.log" 2>&1 || log "Random failed: $?"
log "1c. Random complete."

# ============================================================
# PHASE 2: DEAP Genetic Algorithm
# ============================================================

log ""
log "PHASE 2: DEAP Genetic Algorithm"
log "--------------------------------"

log "2. Running DEAP GA — 1000 generations, population 200..."
python3 "$ROOT/scripts/overnight/deap-evolve.py" \
  --generations 1000 --population 200 --output "$OUT/deap-results.json" \
  > "$OUT/deap.log" 2>&1 || log "DEAP failed: $?"
log "2. DEAP complete."

# ============================================================
# PHASE 3: Nevergrad Multi-Strategy
# ============================================================

log ""
log "PHASE 3: Nevergrad Multi-Strategy"
log "----------------------------------"

log "3. Running Nevergrad — 50,000 evaluations..."
python3 "$ROOT/scripts/overnight/nevergrad-optimize.py" \
  --budget 50000 --output "$OUT/nevergrad-results.json" \
  > "$OUT/nevergrad.log" 2>&1 || log "Nevergrad failed: $?"
log "3. Nevergrad complete."

# ============================================================
# PHASE 4: pymoo Multi-Objective (F1 vs Brevity)
# ============================================================

log ""
log "PHASE 4: pymoo Multi-Objective Pareto"
log "--------------------------------------"

log "4. Running pymoo NSGA-II — 500 generations, population 200..."
python3 "$ROOT/scripts/overnight/pymoo-pareto.py" \
  --generations 500 --population 200 --output "$OUT/pymoo-results.json" \
  > "$OUT/pymoo.log" 2>&1 || log "pymoo failed: $?"
log "4. pymoo complete."

# ============================================================
# PHASE 5: Hyperopt (TPE comparison)
# ============================================================

log ""
log "PHASE 5: Hyperopt TPE (Independent Comparison)"
log "------------------------------------------------"

log "5. Running Hyperopt — 25,000 trials..."
python3 "$ROOT/scripts/overnight/hyperopt-optimize.py" \
  --trials 25000 --output "$OUT/hyperopt-results.json" \
  > "$OUT/hyperopt.log" 2>&1 || log "Hyperopt failed: $?"
log "5. Hyperopt complete."

# ============================================================
# PHASE 6: DuckDB Cross-Optimizer Analytics
# ============================================================

log ""
log "PHASE 6: DuckDB Cross-Optimizer Analytics"
log "------------------------------------------"

log "6. Analyzing all optimization results..."
python3 "$ROOT/scripts/overnight/duckdb-analyze.py" \
  --overnight-dir "$OUT" --output "$OUT/cross-optimizer-analysis.json" \
  > "$OUT/duckdb-analysis.log" 2>&1 || log "DuckDB analysis failed: $?"
log "6. Analysis complete."

# ============================================================
# PHASE 7: Summary Report
# ============================================================

log ""
log "PHASE 7: Final Summary"
log "----------------------"

python3 "$ROOT/scripts/overnight/generate-summary.py" \
  --overnight-dir "$OUT" \
  2>&1 | tee -a "$OUT/pipeline.log"

log ""
log "============================================================"
log "  PIPELINE COMPLETE — $(date)"
log "  Results in: $OUT/"
log "============================================================"
