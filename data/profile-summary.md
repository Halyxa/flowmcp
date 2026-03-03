# FlowMCP Stress Profile Report

Generated: 2026-03-03T09:54:07.373Z
Node: v22.22.0
Platform: linux x64
GC exposed: false
Tools profiled: 17 (sync/local) + 8 (network, skipped)

## 1. Memory Leak Detection (50 iterations @ 500 rows)

| Tool | Heap Before (MB) | Heap After (MB) | Delta (MB) | Growth % | Status |
|------|------------------|-----------------|------------|----------|--------|
| analyze_data_for_flow | 41.01 | 41.16 | 0.15 | 0.35% | OK |
| validate_csv_for_flow | 41.16 | 49.79 | 8.62 | 20.95% | **LEAK?** |
| transform_to_network_graph | 49.79 | 49.1 | -0.69 | -1.39% | OK |
| generate_flow_python_code | 49.1 | 49.17 | 0.07 | 0.14% | OK |
| suggest_flow_visualization | 49.17 | 49.4 | 0.23 | 0.47% | OK |
| get_flow_template | 49.41 | 49.49 | 0.09 | 0.18% | OK |
| flow_extract_from_text | 49.5 | 48.38 | -1.11 | -2.25% | OK |
| flow_precompute_force_layout | 48.38 | 70.39 | 22 | 45.48% | **LEAK?** |
| flow_scale_dataset | 70.39 | 71.42 | 1.03 | 1.47% | OK |
| flow_compute_graph_metrics | 71.42 | 88.32 | 16.9 | 23.66% | **LEAK?** |
| flow_anomaly_detect | 88.32 | 78.47 | -9.86 | -11.16% | OK |
| flow_time_series_animate | 78.47 | 79.13 | 0.66 | 0.85% | OK |
| flow_merge_datasets | 79.13 | 86.72 | 7.59 | 9.59% | OK |
| flow_geo_enhance | 86.72 | 97.03 | 10.31 | 11.89% | OK |
| flow_nlp_to_viz | 97.04 | 93.69 | -3.34 | -3.45% | OK |
| flow_export_formats | 93.69 | 100.73 | 7.04 | 7.51% | OK |
| flow_semantic_search | 100.74 | 96.9 | -3.84 | -3.81% | OK |

## 2. CPU Timing at Scale

### 100 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 2.97 | 2.77 | 4.54 | 4.54 |
| flow_compute_graph_metrics | 2.83 | 2.4 | 3.92 | 3.92 |
| flow_precompute_force_layout | 2.23 | 1.86 | 5.8 | 5.8 |
| flow_extract_from_text | 2.1 | 1.94 | 3.19 | 3.19 |
| flow_anomaly_detect | 0.8 | 0.78 | 0.9 | 0.9 |
| flow_scale_dataset | 0.77 | 0.57 | 2.46 | 2.46 |
| flow_export_formats | 0.75 | 0.66 | 1.47 | 1.47 |
| flow_time_series_animate | 0.58 | 0.55 | 0.71 | 0.71 |
| flow_semantic_search | 0.56 | 0.54 | 0.74 | 0.74 |
| flow_merge_datasets | 0.47 | 0.46 | 0.59 | 0.59 |
| flow_nlp_to_viz | 0.45 | 0.44 | 0.49 | 0.49 |
| validate_csv_for_flow | 0.35 | 0.33 | 0.48 | 0.48 |
| transform_to_network_graph | 0.13 | 0.12 | 0.18 | 0.18 |
| analyze_data_for_flow | 0.01 | 0 | 0.05 | 0.05 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.04 | 0.04 |
| generate_flow_python_code | 0 | 0 | 0.02 | 0.02 |
| get_flow_template | 0 | 0 | 0.02 | 0.02 |

### 500 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 15.06 | 13.89 | 23.61 | 23.61 |
| flow_compute_graph_metrics | 11.72 | 11.14 | 17.08 | 17.08 |
| flow_precompute_force_layout | 10.06 | 9.58 | 18.37 | 18.37 |
| flow_extract_from_text | 10.02 | 10.28 | 11.1 | 11.1 |
| flow_anomaly_detect | 3.97 | 3.73 | 5.39 | 5.39 |
| flow_export_formats | 3.13 | 2.84 | 5.76 | 5.76 |
| flow_scale_dataset | 2.72 | 2.32 | 5.46 | 5.46 |
| flow_merge_datasets | 2.05 | 1.87 | 3.41 | 3.41 |
| flow_time_series_animate | 1.88 | 1.75 | 2.82 | 2.82 |
| flow_nlp_to_viz | 1.69 | 1.46 | 3.04 | 3.04 |
| validate_csv_for_flow | 0.88 | 0.76 | 1.8 | 1.8 |
| transform_to_network_graph | 0.82 | 0.61 | 2.49 | 2.49 |
| analyze_data_for_flow | 0.01 | 0 | 0.01 | 0.01 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.01 | 0.01 |

### 1000 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 28.22 | 28.28 | 28.95 | 28.95 |
| flow_extract_from_text | 20.22 | 20.17 | 21.11 | 21.11 |
| flow_precompute_force_layout | 8.87 | 7.79 | 11.17 | 11.17 |
| flow_anomaly_detect | 8.46 | 7.91 | 13.91 | 13.91 |
| flow_export_formats | 6.28 | 4.5 | 17.71 | 17.71 |
| flow_compute_graph_metrics | 6.17 | 4.64 | 13.24 | 13.24 |
| flow_scale_dataset | 4.97 | 4.41 | 6.63 | 6.63 |
| flow_merge_datasets | 4.74 | 3.93 | 6.6 | 6.6 |
| flow_time_series_animate | 3.74 | 3.42 | 5.13 | 5.13 |
| validate_csv_for_flow | 1.39 | 1.37 | 1.59 | 1.59 |
| transform_to_network_graph | 1.34 | 1.3 | 1.5 | 1.5 |
| flow_nlp_to_viz | 1.23 | 1.26 | 1.45 | 1.45 |
| suggest_flow_visualization | 0.02 | 0.01 | 0.14 | 0.14 |
| analyze_data_for_flow | 0 | 0 | 0.01 | 0.01 |

### 5000 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 146.42 | 142.78 | 164.07 | 164.07 |
| flow_extract_from_text | 50.8 | 49.77 | 53.86 | 53.86 |
| flow_anomaly_detect | 35.14 | 34.93 | 36.48 | 36.48 |
| flow_scale_dataset | 28.92 | 28.27 | 32.21 | 32.21 |
| flow_export_formats | 25.66 | 25.65 | 27.54 | 27.54 |
| flow_merge_datasets | 22.79 | 23.01 | 23.76 | 23.76 |
| flow_time_series_animate | 17.26 | 17.33 | 20.8 | 20.8 |
| flow_precompute_force_layout | 10.83 | 9.41 | 20.02 | 20.02 |
| validate_csv_for_flow | 8.02 | 6.42 | 20.66 | 20.66 |
| transform_to_network_graph | 7.92 | 7.61 | 11.12 | 11.12 |
| flow_compute_graph_metrics | 5.11 | 4.79 | 6.58 | 6.58 |
| flow_nlp_to_viz | 1.39 | 1.41 | 1.61 | 1.61 |
| analyze_data_for_flow | 0.01 | 0 | 0.01 | 0.01 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.02 | 0.02 |

### Slowest Tools @ 5000 rows (ranked)

| Rank | Tool | Mean (ms) |
|------|------|-----------|
| 1 | flow_geo_enhance | 146.42 |
| 2 | flow_extract_from_text | 50.8 |
| 3 | flow_anomaly_detect | 35.14 |
| 4 | flow_scale_dataset | 28.92 |
| 5 | flow_export_formats | 25.66 |
| 6 | flow_merge_datasets | 22.79 |
| 7 | flow_time_series_animate | 17.26 |
| 8 | flow_precompute_force_layout | 10.83 |
| 9 | validate_csv_for_flow | 8.02 |
| 10 | transform_to_network_graph | 7.92 |
| 11 | flow_compute_graph_metrics | 5.11 |
| 12 | flow_nlp_to_viz | 1.39 |
| 13 | analyze_data_for_flow | 0.01 |
| 14 | suggest_flow_visualization | 0.01 |

## 3. Peak RSS at 5000 rows

| Tool | RSS Before (MB) | RSS After (MB) | Peak RSS (MB) |
|------|-----------------|----------------|---------------|
| flow_extract_from_text | 279.89 | 286.31 | 286.31 |
| flow_precompute_force_layout | 286.31 | 286.31 | 286.31 |
| flow_scale_dataset | 286.31 | 280.18 | 286.31 |
| flow_export_formats | 281.65 | 282.39 | 282.39 |
| flow_semantic_search | 282.39 | 282.39 | 282.39 |
| flow_geo_enhance | 280.92 | 281.65 | 281.65 |
| flow_nlp_to_viz | 281.65 | 281.65 | 281.65 |
| flow_merge_datasets | 280.18 | 280.92 | 280.92 |
| flow_compute_graph_metrics | 280.18 | 280.18 | 280.18 |
| flow_anomaly_detect | 280.18 | 280.18 | 280.18 |
| flow_time_series_animate | 280.18 | 280.18 | 280.18 |
| analyze_data_for_flow | 279.89 | 279.89 | 279.89 |
| validate_csv_for_flow | 279.89 | 279.89 | 279.89 |
| transform_to_network_graph | 279.89 | 279.89 | 279.89 |
| generate_flow_python_code | 279.89 | 279.89 | 279.89 |
| suggest_flow_visualization | 279.89 | 279.89 | 279.89 |
| get_flow_template | 279.89 | 279.89 | 279.89 |

## 4. Concurrent Execution (Top 5 slowest @ 1000 rows)

- **Tools**: flow_geo_enhance, flow_extract_from_text, flow_precompute_force_layout, flow_anomaly_detect, flow_export_formats
- **Sequential**: 68.83ms
- **Parallel**: 68.62ms
- **Speedup**: 1x
- **Efficiency**: 20.06%

Note: Node.js is single-threaded, so CPU-bound sync tools show ~1x speedup.
Async tools (I/O-bound) benefit from Promise.all concurrency.

## 5. GC Pressure (30 iterations @ 1000 rows)

| Tool | No GC (MB) | With GC (MB) | Reclaimed (MB) |
|------|------------|--------------|----------------|
| validate_csv_for_flow | 14.91 | -115.29 | 130.2 |
| flow_export_formats | 5.95 | -101.49 | 107.44 |
| flow_time_series_animate | 7.62 | -10 | 17.63 |
| flow_geo_enhance | 2.12 | -13.96 | 16.08 |
| flow_anomaly_detect | 12.7 | -2.73 | 15.43 |
| flow_scale_dataset | 8.46 | 6.79 | 1.67 |
| flow_nlp_to_viz | 0.81 | -0.28 | 1.1 |
| flow_merge_datasets | 10.02 | 9.32 | 0.7 |
| flow_compute_graph_metrics | 0.07 | -0.17 | 0.24 |
| transform_to_network_graph | 5.64 | 5.48 | 0.17 |
| analyze_data_for_flow | 0.06 | 0.06 | 0 |
| generate_flow_python_code | 0.04 | 0.04 | 0 |
| suggest_flow_visualization | 0.13 | 0.13 | 0 |
| get_flow_template | 0.05 | 0.05 | 0 |
| flow_semantic_search | -0.07 | 0.1 | -0.16 |
| flow_precompute_force_layout | 14.54 | 20.96 | -6.42 |
| flow_extract_from_text | 3.74 | 16.58 | -12.84 |

> **Note**: --expose-gc flag not set. GC comparison uses natural collection only.
> Re-run with: `node --expose-gc $(npx -y tsx --tsconfig tsconfig.json scripts/stress-profile.ts)` for accurate GC data.

## 6. Network Tools (Not Profiled)

The following tools require live API access and were excluded:
- flow_authenticate
- flow_upload_data
- flow_browse_flows
- flow_get_flow
- flow_list_templates
- flow_list_categories
- flow_extract_from_url
- flow_query_graph