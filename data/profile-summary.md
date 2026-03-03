# FlowMCP Stress Profile Report

Generated: 2026-03-03T09:45:09.917Z
Node: v22.22.0
Platform: linux x64
GC exposed: false
Tools profiled: 17 (sync/local) + 8 (network, skipped)

## 1. Memory Leak Detection (50 iterations @ 500 rows)

| Tool | Heap Before (MB) | Heap After (MB) | Delta (MB) | Growth % | Status |
|------|------------------|-----------------|------------|----------|--------|
| analyze_data_for_flow | 32.22 | 32.36 | 0.15 | 0.45% | OK |
| validate_csv_for_flow | 32.37 | 37.3 | 4.93 | 15.22% | OK |
| transform_to_network_graph | 37.3 | 36.45 | -0.85 | -2.27% | OK |
| generate_flow_python_code | 36.45 | 36.52 | 0.07 | 0.19% | OK |
| suggest_flow_visualization | 36.52 | 36.75 | 0.23 | 0.63% | OK |
| get_flow_template | 36.76 | 36.85 | 0.09 | 0.24% | OK |
| flow_extract_from_text | 36.85 | 40.71 | 3.86 | 10.48% | OK |
| flow_precompute_force_layout | 40.71 | 71.78 | 31.07 | 76.32% | **LEAK?** |
| flow_scale_dataset | 71.78 | 72.57 | 0.79 | 1.1% | OK |
| flow_compute_graph_metrics | 72.57 | 87.89 | 15.32 | 21.11% | **LEAK?** |
| flow_anomaly_detect | 87.89 | 93.92 | 6.04 | 6.87% | OK |
| flow_time_series_animate | 93.93 | 79.06 | -14.86 | -15.83% | OK |
| flow_merge_datasets | 79.06 | 86.65 | 7.59 | 9.6% | OK |
| flow_geo_enhance | 86.65 | 96.88 | 10.23 | 11.8% | OK |
| flow_nlp_to_viz | 96.88 | 93.74 | -3.14 | -3.24% | OK |
| flow_export_formats | 93.74 | 100.59 | 6.85 | 7.31% | OK |
| flow_semantic_search | 100.6 | 96.66 | -3.93 | -3.91% | OK |

## 2. CPU Timing at Scale

### 100 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 3.93 | 4.03 | 4.53 | 4.53 |
| flow_compute_graph_metrics | 2.45 | 2.2 | 3.99 | 3.99 |
| flow_precompute_force_layout | 2.09 | 1.66 | 4.94 | 4.94 |
| flow_extract_from_text | 2.07 | 1.95 | 2.94 | 2.94 |
| flow_scale_dataset | 1.12 | 0.46 | 6.93 | 6.93 |
| flow_anomaly_detect | 0.82 | 0.81 | 0.97 | 0.97 |
| flow_semantic_search | 0.76 | 0.6 | 1.86 | 1.86 |
| flow_time_series_animate | 0.74 | 0.61 | 1.79 | 1.79 |
| flow_export_formats | 0.49 | 0.46 | 0.69 | 0.69 |
| flow_merge_datasets | 0.48 | 0.48 | 0.61 | 0.61 |
| validate_csv_for_flow | 0.34 | 0.31 | 0.47 | 0.47 |
| flow_nlp_to_viz | 0.33 | 0.31 | 0.44 | 0.44 |
| transform_to_network_graph | 0.12 | 0.12 | 0.15 | 0.15 |
| analyze_data_for_flow | 0.01 | 0 | 0.04 | 0.04 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.07 | 0.07 |
| generate_flow_python_code | 0 | 0 | 0.01 | 0.01 |
| get_flow_template | 0 | 0 | 0.01 | 0.01 |

### 500 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 16.85 | 16.71 | 23.38 | 23.38 |
| flow_compute_graph_metrics | 10.69 | 10.56 | 13.11 | 13.11 |
| flow_extract_from_text | 10.05 | 10.34 | 10.92 | 10.92 |
| flow_precompute_force_layout | 9 | 9.33 | 10.3 | 10.3 |
| flow_anomaly_detect | 3.96 | 3.63 | 5.7 | 5.7 |
| flow_scale_dataset | 2.72 | 2.45 | 4.79 | 4.79 |
| flow_export_formats | 2.23 | 2.08 | 3.44 | 3.44 |
| flow_merge_datasets | 2.06 | 1.88 | 3.01 | 3.01 |
| flow_time_series_animate | 1.9 | 1.72 | 2.79 | 2.79 |
| flow_nlp_to_viz | 1.12 | 1.16 | 1.25 | 1.25 |
| transform_to_network_graph | 1.04 | 0.75 | 2.82 | 2.82 |
| validate_csv_for_flow | 0.86 | 0.77 | 1.63 | 1.63 |
| analyze_data_for_flow | 0.01 | 0 | 0.02 | 0.02 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.01 | 0.01 |

### 1000 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 28.57 | 28.56 | 29.5 | 29.5 |
| flow_extract_from_text | 20.52 | 20.58 | 20.99 | 20.99 |
| flow_precompute_force_layout | 8.73 | 7.8 | 10.51 | 10.51 |
| flow_anomaly_detect | 7.19 | 6.99 | 9 | 9 |
| flow_compute_graph_metrics | 5.84 | 4.71 | 11.88 | 11.88 |
| flow_scale_dataset | 5.11 | 5.18 | 8.23 | 8.23 |
| flow_export_formats | 4.58 | 4.37 | 5.83 | 5.83 |
| flow_merge_datasets | 4.01 | 3.65 | 5.17 | 5.17 |
| flow_time_series_animate | 3.61 | 3.23 | 4.63 | 4.63 |
| validate_csv_for_flow | 1.37 | 1.37 | 1.41 | 1.41 |
| transform_to_network_graph | 1.32 | 1.21 | 2.12 | 2.12 |
| flow_nlp_to_viz | 0.99 | 0.99 | 1.03 | 1.03 |
| suggest_flow_visualization | 0.02 | 0.01 | 0.15 | 0.15 |
| analyze_data_for_flow | 0 | 0 | 0.01 | 0.01 |

### 5000 rows

| Tool | Mean (ms) | P50 (ms) | P95 (ms) | P99 (ms) |
|------|-----------|----------|----------|----------|
| flow_geo_enhance | 156.19 | 147.65 | 182.44 | 182.44 |
| flow_extract_from_text | 50.75 | 48.98 | 59.94 | 59.94 |
| flow_anomaly_detect | 36.94 | 36.9 | 39.53 | 39.53 |
| flow_scale_dataset | 30.48 | 29.2 | 38.84 | 38.84 |
| flow_export_formats | 26.44 | 26.11 | 29.57 | 29.57 |
| flow_merge_datasets | 22.23 | 22.01 | 24.58 | 24.58 |
| flow_time_series_animate | 17.69 | 17.26 | 26.47 | 26.47 |
| flow_precompute_force_layout | 9.99 | 9.31 | 17.79 | 17.79 |
| transform_to_network_graph | 8.05 | 7.76 | 11.28 | 11.28 |
| validate_csv_for_flow | 6.78 | 6.44 | 8.39 | 8.39 |
| flow_compute_graph_metrics | 4.52 | 4.08 | 6.25 | 6.25 |
| flow_nlp_to_viz | 1.1 | 0.99 | 2.02 | 2.02 |
| analyze_data_for_flow | 0.01 | 0 | 0.01 | 0.01 |
| suggest_flow_visualization | 0.01 | 0.01 | 0.01 | 0.01 |

### Slowest Tools @ 5000 rows (ranked)

| Rank | Tool | Mean (ms) |
|------|------|-----------|
| 1 | flow_geo_enhance | 156.19 |
| 2 | flow_extract_from_text | 50.75 |
| 3 | flow_anomaly_detect | 36.94 |
| 4 | flow_scale_dataset | 30.48 |
| 5 | flow_export_formats | 26.44 |
| 6 | flow_merge_datasets | 22.23 |
| 7 | flow_time_series_animate | 17.69 |
| 8 | flow_precompute_force_layout | 9.99 |
| 9 | transform_to_network_graph | 8.05 |
| 10 | validate_csv_for_flow | 6.78 |
| 11 | flow_compute_graph_metrics | 4.52 |
| 12 | flow_nlp_to_viz | 1.1 |
| 13 | analyze_data_for_flow | 0.01 |
| 14 | suggest_flow_visualization | 0.01 |

## 3. Peak RSS at 5000 rows

| Tool | RSS Before (MB) | RSS After (MB) | Peak RSS (MB) |
|------|-----------------|----------------|---------------|
| flow_extract_from_text | 290.35 | 296.73 | 296.73 |
| flow_precompute_force_layout | 296.73 | 296.73 | 296.73 |
| flow_scale_dataset | 296.73 | 290.6 | 296.73 |
| flow_export_formats | 292.07 | 292.8 | 292.8 |
| flow_semantic_search | 292.8 | 292.8 | 292.8 |
| flow_geo_enhance | 291.33 | 292.07 | 292.07 |
| flow_nlp_to_viz | 292.07 | 292.07 | 292.07 |
| flow_merge_datasets | 290.6 | 291.33 | 291.33 |
| flow_compute_graph_metrics | 290.6 | 290.6 | 290.6 |
| flow_anomaly_detect | 290.6 | 290.6 | 290.6 |
| flow_time_series_animate | 290.6 | 290.6 | 290.6 |
| analyze_data_for_flow | 290.35 | 290.35 | 290.35 |
| validate_csv_for_flow | 290.35 | 290.35 | 290.35 |
| transform_to_network_graph | 290.35 | 290.35 | 290.35 |
| generate_flow_python_code | 290.35 | 290.35 | 290.35 |
| suggest_flow_visualization | 290.35 | 290.35 | 290.35 |
| get_flow_template | 290.35 | 290.35 | 290.35 |

## 4. Concurrent Execution (Top 5 slowest @ 1000 rows)

- **Tools**: flow_geo_enhance, flow_extract_from_text, flow_precompute_force_layout, flow_anomaly_detect, flow_compute_graph_metrics
- **Sequential**: 73.88ms
- **Parallel**: 72.24ms
- **Speedup**: 1.02x
- **Efficiency**: 20.45%

Note: Node.js is single-threaded, so CPU-bound sync tools show ~1x speedup.
Async tools (I/O-bound) benefit from Promise.all concurrency.

## 5. GC Pressure (30 iterations @ 1000 rows)

| Tool | No GC (MB) | With GC (MB) | Reclaimed (MB) |
|------|------------|--------------|----------------|
| flow_export_formats | 5.33 | -98.42 | 103.75 |
| validate_csv_for_flow | -0.21 | -99.06 | 98.85 |
| flow_time_series_animate | 7.36 | -10.66 | 18.02 |
| flow_anomaly_detect | 14.12 | -1.7 | 15.82 |
| flow_merge_datasets | 10.18 | -4.88 | 15.06 |
| flow_scale_dataset | 9.06 | 6.3 | 2.76 |
| flow_nlp_to_viz | 0.75 | -0.37 | 1.13 |
| flow_extract_from_text | 17.57 | 16.47 | 1.09 |
| flow_compute_graph_metrics | 0.12 | -0.48 | 0.6 |
| flow_geo_enhance | 1.94 | 1.62 | 0.31 |
| analyze_data_for_flow | 0.06 | 0.06 | 0 |
| generate_flow_python_code | 0.04 | 0.04 | 0 |
| suggest_flow_visualization | 0.13 | 0.13 | 0 |
| get_flow_template | 0.05 | 0.05 | 0 |
| flow_semantic_search | -0.03 | 0.12 | -0.15 |
| flow_precompute_force_layout | 12.21 | 20.97 | -8.76 |
| transform_to_network_graph | -10.09 | 5.5 | -15.6 |

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