#!/usr/bin/env bash
# Watch for optimizer completion, then run cross-analysis
ROOT="/hive/flowmcp"
OUT="$ROOT/data/overnight"

echo "[$(date)] Watcher started. Waiting for optimizers to finish..."

while true; do
  # Count running optimizer processes
  RUNNING=$(ps aux | grep -E "deap-evolve|nevergrad-optimize|cmaes-optimize|hyperopt-optimize|random-optimize|pymoo-pareto" | grep -v grep | wc -l)
  RESULTS=$(ls $OUT/*-results.json 2>/dev/null | wc -l)
  echo "[$(date)] Running: $RUNNING processes, Results: $RESULTS files"
  
  if [ "$RUNNING" -eq 0 ] && [ "$RESULTS" -gt 0 ]; then
    echo "[$(date)] All optimizers finished! Running analysis..."
    
    # Run DuckDB cross-analysis
    python3 "$ROOT/scripts/overnight/duckdb-analyze.py" \
      --overnight-dir "$OUT" \
      --output "$OUT/cross-optimizer-analysis.json" \
      2>&1 | tee "$OUT/duckdb-analysis.log"
    
    # Generate summary
    python3 "$ROOT/scripts/overnight/generate-summary.py" \
      --overnight-dir "$OUT" \
      2>&1 | tee "$OUT/final-summary.log"
    
    echo "[$(date)] Analysis complete! Results in $OUT/"
    echo "[$(date)] Check: cat $OUT/summary.json"
    break
  fi
  
  sleep 60
done
