# Installed Tools Report

Generated: 2026-03-03
Server: 96-core AMD EPYC, 1TB RAM, Ubuntu 24.04.4 LTS

## npm Global Tools

| Tool | Version | Status | Purpose |
|------|---------|--------|---------|
| autocannon | 8.0.0 | Installed | HTTP load testing |
| clinic | 13.0.0 | Installed | Node.js performance profiling (flamegraph, doctor, bubbleprof) |
| 0x | 6.0.0 | Installed | Flamegraph generation for Node.js |
| tsx | 4.21.0 | Installed | TypeScript execution without compilation |

## System Tools (apt)

| Tool | Version | Status | Purpose |
|------|---------|--------|---------|
| hyperfine | 1.18.0 | Installed | CLI command benchmarking |
| perf | 6.17.9 | Installed | CPU profiling (linux-tools-6.17.0-14-generic) |
| stress-ng | 0.17.06 | Installed | System stress testing |

## npm Dev Dependencies (/hive/flowmcp)

| Package | Version | Status | Purpose |
|---------|---------|--------|---------|
| fast-check | 4.5.3 | Installed | Property-based testing |
| @fast-check/vitest | 0.2.4 | Installed | Vitest integration for fast-check |

## Python Tools (pip3)

| Package | Version | Status | Purpose |
|---------|---------|--------|---------|
| optuna | 4.7.0 | Already installed | Bayesian hyperparameter optimization |
| cmaes | 0.12.0 | Installed | CMA Evolution Strategy |
| nevergrad | 1.0.12 | Installed | Gradient-free optimization |
| deap | 1.4 | Installed | Distributed evolutionary algorithms |
| ax-platform | 1.2.3 | Installed | Adaptive experimentation platform (Meta) |
| botorch | 0.17.0 | Installed | Bayesian optimization in PyTorch |
| gpytorch | 1.15.2 | Installed | Gaussian processes in PyTorch |
| torch | 2.10.0+cu128 | Installed | PyTorch (CUDA 12.8) |
| ConfigSpace | 1.2.2 | Installed | Configuration space definitions (for BOHB) |
| cma | 4.4.4 | Installed (dependency) | CMA-ES reference implementation |

## Notes

- All tools verified working via version check / import test
- ax-platform: SQL storage warning (needs sqlalchemy <2.0 for SQL features, not needed for our use)
- PyTorch installed with CUDA 12.8 support (via ax-platform dependency)
- Node.js: v22.22.0

## Usage Examples

```bash
# HTTP load test the MCP server
autocannon -c 10 -d 30 http://localhost:3000

# Generate flamegraph
clinic flame -- node dist/index.js

# Benchmark a command
hyperfine 'node dist/index.js --help'

# Stress test CPU (96 cores)
stress-ng --cpu 96 --timeout 60

# CPU profiling
perf stat node dist/index.js

# Run property-based tests
npx vitest run --grep "property"

# Python optimization
python3 -c "import optuna, cmaes, nevergrad, deap, ax; print('All frameworks ready')"
```
