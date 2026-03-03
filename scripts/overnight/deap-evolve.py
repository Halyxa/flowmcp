#!/usr/bin/env python3
"""DEAP genetic algorithm for tool description signal weight optimization."""

import argparse
import json
import random
import time
import multiprocessing
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))
from eval_common import (
    load_gold_queries, evaluate_flat, get_bounds_arrays,
    N_PARAMS, TOOL_NAMES
)

from deap import base, creator, tools, algorithms
import numpy as np

# Global for multiprocessing
_gold_queries = None

def init_worker(gq):
    global _gold_queries
    _gold_queries = gq

def eval_individual(individual):
    penalized_f1, f1, precision, recall, tools_below = evaluate_flat(list(individual), _gold_queries)
    return (penalized_f1,)

def main():
    parser = argparse.ArgumentParser(description="DEAP genetic evolution of signal weights")
    parser.add_argument("--generations", type=int, default=1000)
    parser.add_argument("--population", type=int, default=200)
    parser.add_argument("--output", type=str, default="data/overnight/deap-results.json")
    parser.add_argument("--workers", type=int, default=96)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)

    gold_queries = load_gold_queries()
    lower, upper = get_bounds_arrays()

    print(f"DEAP Genetic Algorithm")
    print(f"Population: {args.population}, Generations: {args.generations}")
    print(f"Parameters: {N_PARAMS}, Workers: {args.workers}")
    print()

    # Setup DEAP
    creator.create("FitnessMax", base.Fitness, weights=(1.0,))
    creator.create("Individual", list, fitness=creator.FitnessMax)

    toolbox = base.Toolbox()

    # Attribute generators (bounded)
    def rand_param(i):
        return random.uniform(lower[i], upper[i])

    def create_individual():
        return creator.Individual([rand_param(i) for i in range(N_PARAMS)])

    toolbox.register("individual", create_individual)
    toolbox.register("population", tools.initRepeat, list, toolbox.individual)

    toolbox.register("evaluate", eval_individual)
    toolbox.register("mate", tools.cxBlend, alpha=0.5)
    toolbox.register("mutate", tools.mutGaussian, mu=0, sigma=0.3, indpb=0.2)
    toolbox.register("select", tools.selTournament, tournsize=3)

    # Bound enforcement decorator
    def check_bounds(func):
        def wrapper(*args, **kwargs):
            offspring = func(*args, **kwargs)
            for child in offspring:
                for i, (lo, hi) in enumerate(zip(lower, upper)):
                    child[i] = max(lo, min(hi, child[i]))
            return offspring
        return wrapper

    toolbox.decorate("mate", check_bounds)
    toolbox.decorate("mutate", check_bounds)

    # Parallel evaluation
    pool = multiprocessing.Pool(args.workers, initializer=init_worker, initargs=(gold_queries,))
    toolbox.register("map", pool.map)

    # Statistics
    stats = tools.Statistics(lambda ind: ind.fitness.values[0])
    stats.register("avg", np.mean)
    stats.register("std", np.std)
    stats.register("min", np.min)
    stats.register("max", np.max)

    hof = tools.HallOfFame(10)

    # Run evolution
    pop = toolbox.population(n=args.population)
    start = time.time()

    pop, logbook = algorithms.eaMuPlusLambda(
        pop, toolbox,
        mu=args.population,
        lambda_=args.population * 2,
        cxpb=0.7,
        mutpb=0.3,
        ngen=args.generations,
        stats=stats,
        halloffame=hof,
        verbose=True
    )

    elapsed = time.time() - start
    pool.close()

    # Results
    best = hof[0]
    best_pf1, best_f1, best_p, best_r, best_below = evaluate_flat(list(best), gold_queries)

    print()
    print("=" * 72)
    print("  DEAP RESULTS")
    print("=" * 72)
    print(f"Best penalized F1: {best_pf1:.4f}")
    print(f"Best raw F1: {best_f1:.4f}")
    print(f"Precision: {best_p:.4f}, Recall: {best_r:.4f}")
    print(f"Tools below floor: {best_below}")
    print(f"Time: {elapsed:.1f}s")
    print(f"Evaluations: {args.generations * args.population * 3}")
    print()

    # Convergence history
    gen_records = logbook if isinstance(logbook, list) else logbook.chapters.get("fitness", logbook)
    convergence = []
    for record in gen_records:
        if isinstance(record, dict) and "max" in record:
            convergence.append({"gen": record.get("gen", len(convergence)), "max": round(record["max"], 4), "avg": round(record["avg"], 4)})

    result = {
        "optimizer": "DEAP_eaMuPlusLambda",
        "generations": args.generations,
        "population": args.population,
        "trials": args.generations * args.population * 3,
        "elapsed_s": round(elapsed, 1),
        "best_value": round(best_pf1, 4),
        "best_raw_f1": round(best_f1, 4),
        "precision": round(best_p, 4),
        "recall": round(best_r, 4),
        "tools_below_floor": best_below,
        "best_params": {
            "w_strong": round(best[0], 4),
            "w_medium": round(best[1], 4),
            "w_weak": round(best[2], 4),
            "w_negative": round(best[3], 4),
            **{TOOL_NAMES[i]: round(best[4+i], 4) for i in range(len(TOOL_NAMES))}
        },
        "hall_of_fame": [
            {"rank": i+1, "fitness": round(ind.fitness.values[0], 4)}
            for i, ind in enumerate(hof)
        ],
        "convergence_sample": convergence[::max(1, len(convergence)//50)]  # Sample 50 points
    }

    os.makedirs(os.path.dirname(args.output), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)
    print(f"Results saved to {args.output}")


if __name__ == "__main__":
    main()
