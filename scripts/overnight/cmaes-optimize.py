#!/usr/bin/env python3
"""CMA-ES optimizer via Optuna for tool description signal weights."""

import argparse
import json
import time
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from eval_common import load_gold_queries, TOOL_NAMES, TOOL_SIGNALS, evaluate_f1

import optuna
from optuna.samplers import CmaEsSampler


def create_objective(gold_queries):
    def objective(trial):
        w_strong = trial.suggest_float("w_strong", 1.0, 6.0)
        w_medium = trial.suggest_float("w_medium", 0.3, 3.0)
        w_weak = trial.suggest_float("w_weak", 0.1, 1.5)
        w_negative = trial.suggest_float("w_negative", -5.0, -0.5)

        thresholds = {}
        for tool_name in TOOL_NAMES:
            thresholds[tool_name] = trial.suggest_float(f"thresh_{tool_name}", 0.3, 5.0)

        penalized_f1, raw_f1, precision, recall, per_tool, tools_below = evaluate_f1(
            gold_queries, thresholds, w_strong, w_medium, w_weak, w_negative
        )

        trial.set_user_attr("raw_f1", raw_f1)
        trial.set_user_attr("precision", precision)
        trial.set_user_attr("recall", recall)
        trial.set_user_attr("tools_below_floor", tools_below)

        return penalized_f1

    return objective


def main():
    parser = argparse.ArgumentParser(description="CMA-ES optimization via Optuna")
    parser.add_argument("--trials", type=int, default=50000)
    parser.add_argument("--output", type=str, default="data/overnight/optuna-cmaes-results.json")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    gold_queries = load_gold_queries()

    print(f"CMA-ES via Optuna")
    print(f"Trials: {args.trials} (sequential — CMA-ES needs sequential feedback)")
    print(f"Parameters: {4 + len(TOOL_NAMES)}")
    print()

    study = optuna.create_study(
        direction="maximize",
        sampler=CmaEsSampler(seed=args.seed)
    )
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    objective = create_objective(gold_queries)

    start = time.time()
    study.optimize(objective, n_trials=args.trials)
    elapsed = time.time() - start

    best = study.best_trial

    print()
    print("=" * 72)
    print("  CMA-ES RESULTS")
    print("=" * 72)
    print(f"Best penalized F1: {best.value:.4f}")
    print(f"Best raw F1: {best.user_attrs.get('raw_f1', 'N/A')}")
    print(f"Precision: {best.user_attrs.get('precision', 'N/A')}")
    print(f"Recall: {best.user_attrs.get('recall', 'N/A')}")
    print(f"Tools below floor: {best.user_attrs.get('tools_below_floor', 'N/A')}")
    print(f"Time: {elapsed:.1f}s ({elapsed/len(study.trials)*1000:.2f}ms/trial)")
    print()

    result = {
        "optimizer": "Optuna_CmaEsSampler",
        "trials": len(study.trials),
        "elapsed_s": round(elapsed, 1),
        "best_value": round(best.value, 4),
        "best_raw_f1": round(best.user_attrs.get("raw_f1", 0), 4),
        "precision": round(best.user_attrs.get("precision", 0), 4),
        "recall": round(best.user_attrs.get("recall", 0), 4),
        "tools_below_floor": best.user_attrs.get("tools_below_floor", 0),
        "best_params": {k: round(v, 4) for k, v in best.params.items()},
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
