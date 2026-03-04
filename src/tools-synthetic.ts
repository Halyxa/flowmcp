/**
 * flow_generate_synthetic — Tool 71
 *
 * Generates configurable synthetic CSV datasets for testing, demos, and benchmarking.
 * Supports: numeric, categorical, date, id, text columns with optional correlations.
 * Modes: default (tabular), network (id + connections), geographic (lat/lon), timeseries.
 */

import { csvEscapeField } from "./csv-utils.js";

export interface ColumnSchema {
  name: string;
  type: "numeric" | "categorical" | "date" | "id" | "text";
  min?: number;
  max?: number;
  categories?: string[];
  correlate_with?: string;
  correlation?: number;
}

export interface GenerateSyntheticInput {
  rows: number;
  schema?: ColumnSchema[];
  mode?: "default" | "network" | "geographic" | "timeseries";
  seed?: number;
}

export interface GenerateSyntheticResult {
  csv: string;
  rows: number;
  columns: number;
  schema: { name: string; type: string }[];
  error?: string;
}

// Seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box-Muller for normal distribution
function normalRandom(rng: () => number, mean: number, std: number): number {
  const u1 = rng();
  const u2 = rng();
  const z = Math.sqrt(-2 * Math.log(u1 || 0.0001)) * Math.cos(2 * Math.PI * u2);
  return mean + z * std;
}

const NAMES = [
  "Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot", "Golf", "Hotel",
  "India", "Juliet", "Kilo", "Lima", "Mike", "November", "Oscar", "Papa",
  "Quebec", "Romeo", "Sierra", "Tango", "Uniform", "Victor", "Whiskey", "Xray",
  "Yankee", "Zulu", "Apex", "Bolt", "Cipher", "Drift", "Edge", "Flux",
  "Grid", "Haze", "Ion", "Jet", "Knox", "Lux", "Mesa", "Neon",
  "Orbit", "Pulse", "Quark", "Ridge", "Spark", "Tide", "Ultra", "Vibe",
];

const ADJECTIVES = [
  "rapid", "silent", "bright", "deep", "vast", "swift", "bold", "calm",
  "dark", "fierce", "gentle", "harsh", "keen", "light", "mild", "noble",
];

const DEFAULT_SCHEMA: ColumnSchema[] = [
  { name: "id", type: "id" },
  { name: "name", type: "text" },
  { name: "value", type: "numeric", min: 0, max: 1000 },
  { name: "category", type: "categorical", categories: ["A", "B", "C", "D"] },
  { name: "score", type: "numeric", min: 0, max: 100 },
  { name: "date", type: "date" },
];

function generateDate(rng: () => number, index?: number, total?: number): string {
  if (index !== undefined && total !== undefined) {
    // Sequential dates for timeseries
    const baseMs = new Date("2020-01-01").getTime();
    const daySpan = Math.max(total, 365);
    const dayOffset = Math.floor((index / total) * daySpan);
    const d = new Date(baseMs + dayOffset * 86400000);
    return d.toISOString().slice(0, 10);
  }
  // Random date 2015-2025
  const year = 2015 + Math.floor(rng() * 11);
  const month = 1 + Math.floor(rng() * 12);
  const day = 1 + Math.floor(rng() * 28);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function generateText(rng: () => number, index: number): string {
  const adj = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)];
  const name = NAMES[index % NAMES.length];
  const suffix = index >= NAMES.length ? `_${Math.floor(index / NAMES.length) + 1}` : "";
  return `${adj}_${name}${suffix}`;
}

export function flowGenerateSynthetic(input: GenerateSyntheticInput): GenerateSyntheticResult {
  const { rows, mode = "default", seed } = input;
  let { schema } = input;

  if (!rows || rows <= 0) {
    return { csv: "", rows: 0, columns: 0, schema: [], error: "rows must be a positive integer" };
  }

  const rng = mulberry32(seed ?? Date.now());

  // Use defaults if no schema or empty schema
  if (!schema || schema.length === 0) {
    if (mode === "network") {
      schema = [
        { name: "id", type: "id" },
        { name: "label", type: "text" },
        { name: "group", type: "categorical", categories: ["core", "peripheral", "bridge"] },
        { name: "weight", type: "numeric", min: 1, max: 100 },
      ];
    } else if (mode === "geographic") {
      schema = [
        { name: "id", type: "id" },
        { name: "name", type: "text" },
        { name: "latitude", type: "numeric", min: -90, max: 90 },
        { name: "longitude", type: "numeric", min: -180, max: 180 },
        { name: "value", type: "numeric", min: 0, max: 1000 },
      ];
    } else if (mode === "timeseries") {
      schema = [
        { name: "date", type: "date" },
        { name: "value", type: "numeric", min: 0, max: 100 },
        { name: "trend", type: "numeric", min: -10, max: 10 },
        { name: "category", type: "categorical", categories: ["baseline", "growth", "decline"] },
      ];
    } else {
      schema = [...DEFAULT_SCHEMA];
    }
  }

  // For network mode, ensure id and connections columns
  const isNetwork = mode === "network";
  const isGeo = mode === "geographic";
  const isTimeseries = mode === "timeseries";

  // Build headers
  const headers = schema.map(c => c.name);
  if (isNetwork && !headers.includes("connections")) {
    headers.push("connections");
  }
  if (isGeo && !headers.includes("latitude")) {
    headers.push("latitude");
    headers.push("longitude");
  }

  // Generate column data
  const colData: Map<string, string[]> = new Map();

  // First pass: generate independent columns
  for (const col of schema) {
    if (col.correlate_with) continue; // Skip correlated columns for now
    const values: string[] = [];
    for (let i = 0; i < rows; i++) {
      switch (col.type) {
        case "id":
          values.push(`${col.name}_${i + 1}`);
          break;
        case "numeric": {
          const min = col.min ?? 0;
          const max = col.max ?? 1000;
          const val = min + rng() * (max - min);
          values.push(val.toFixed(2));
          break;
        }
        case "categorical": {
          const cats = col.categories ?? ["A", "B", "C"];
          values.push(cats[Math.floor(rng() * cats.length)]);
          break;
        }
        case "date":
          values.push(
            isTimeseries
              ? generateDate(rng, i, rows)
              : generateDate(rng)
          );
          break;
        case "text":
          values.push(generateText(rng, i));
          break;
        default:
          values.push(`val_${i}`);
      }
    }
    colData.set(col.name, values);
  }

  // Second pass: generate correlated columns
  for (const col of schema) {
    if (!col.correlate_with) continue;
    const sourceVals = colData.get(col.correlate_with);
    if (!sourceVals) {
      // Fallback: generate independently
      const values: string[] = [];
      const min = col.min ?? 0;
      const max = col.max ?? 1000;
      for (let i = 0; i < rows; i++) {
        values.push((min + rng() * (max - min)).toFixed(2));
      }
      colData.set(col.name, values);
      continue;
    }

    const corr = col.correlation ?? 0.5;
    const min = col.min ?? 0;
    const max = col.max ?? 1000;
    const sourceNums = sourceVals.map(v => parseFloat(v));
    const srcMean = sourceNums.reduce((a, b) => a + b, 0) / sourceNums.length;
    const srcStd = Math.sqrt(sourceNums.reduce((a, b) => a + (b - srcMean) ** 2, 0) / sourceNums.length) || 1;

    const values: string[] = [];
    const targetMean = (min + max) / 2;
    const targetStd = (max - min) / 6;

    for (let i = 0; i < rows; i++) {
      const srcNorm = (sourceNums[i] - srcMean) / srcStd;
      const noise = normalRandom(rng, 0, 1);
      const combined = corr * srcNorm + Math.sqrt(1 - corr * corr) * noise;
      let val = targetMean + combined * targetStd;
      val = Math.max(min, Math.min(max, val));
      values.push(val.toFixed(2));
    }
    colData.set(col.name, values);
  }

  // Generate network connections
  if (isNetwork) {
    const idCol = schema.find(c => c.type === "id");
    const idName = idCol?.name ?? "id";
    const ids = colData.get(idName) ?? Array.from({ length: rows }, (_, i) => `node_${i + 1}`);
    if (!colData.has(idName)) colData.set(idName, ids);

    const connections: string[] = [];
    for (let i = 0; i < rows; i++) {
      const numConns = 1 + Math.floor(rng() * Math.min(3, rows - 1));
      const conns: string[] = [];
      for (let j = 0; j < numConns; j++) {
        let target = Math.floor(rng() * rows);
        if (target === i) target = (target + 1) % rows;
        if (!conns.includes(ids[target])) {
          conns.push(ids[target]);
        }
      }
      connections.push(conns.join("|"));
    }
    colData.set("connections", connections);
  }

  // Generate geographic columns if not in schema
  if (isGeo) {
    if (!colData.has("latitude")) {
      const lats: string[] = [];
      for (let i = 0; i < rows; i++) {
        lats.push((-90 + rng() * 180).toFixed(4));
      }
      colData.set("latitude", lats);
    }
    if (!colData.has("longitude")) {
      const lons: string[] = [];
      for (let i = 0; i < rows; i++) {
        lons.push((-180 + rng() * 360).toFixed(4));
      }
      colData.set("longitude", lons);
    }
  }

  // Build CSV
  const csvLines: string[] = [headers.map(h => csvEscapeField(h)).join(",")];
  for (let i = 0; i < rows; i++) {
    const row = headers.map(h => {
      const vals = colData.get(h);
      return csvEscapeField(vals ? vals[i] : "");
    });
    csvLines.push(row.join(","));
  }

  const csv = csvLines.join("\n");

  return {
    csv,
    rows,
    columns: headers.length,
    schema: headers.map(h => {
      const col = schema!.find(c => c.name === h);
      return { name: h, type: col?.type ?? (h === "connections" ? "connections" : "text") };
    }),
  };
}
