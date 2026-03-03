# Extra Tools Installation Report

**Date**: 2026-03-03
**Server**: 96-core AMD EPYC, 1TB RAM, Ubuntu 24.04.4 LTS

## Python Packages (pip3 install --break-system-packages)

| Package | Version | Status |
|---------|---------|--------|
| duckdb | 1.4.4 | Installed, verified |
| pymoo | 0.6.1.6 | Already installed, verified |
| polars | 1.38.1 | Installed, verified |
| hyperopt | 0.2.7 | Installed, verified |
| scikit-optimize | 0.10.2 | Installed, verified |
| scikit-learn | 1.8.0 | Already installed, verified |

## Node.js Packages (npm install -g)

| Package | Version | Status |
|---------|---------|--------|
| @biomejs/biome | 2.4.5 | Installed, verified |

## System Tools

| Tool | Version | Method | Status |
|------|---------|--------|--------|
| DuckDB CLI | v1.4.4 (Andium) | Direct binary from GitHub releases | Installed at /usr/local/bin/duckdb, verified |

## Verification Commands

```bash
python3 -c "import duckdb; print(duckdb.__version__)"        # 1.4.4
python3 -c "import pymoo; print(pymoo.__version__)"           # 0.6.1.6
python3 -c "import polars; print(polars.__version__)"         # 1.38.1
python3 -c "import hyperopt; print(hyperopt.__version__)"     # 0.2.7
python3 -c "import skopt; print(skopt.__version__)"           # 0.10.2
python3 -c "import sklearn; print(sklearn.__version__)"       # 1.8.0
biome --version                                                # 2.4.5
duckdb --version                                               # v1.4.4
```

## Notes

- pymoo and scikit-learn were already installed from prior optimizer zoo setup
- DuckDB CLI downloaded as static binary from GitHub releases (not in apt repos)
- All packages installed system-wide (matching existing pattern with Optuna, CMA-ES, etc.)
