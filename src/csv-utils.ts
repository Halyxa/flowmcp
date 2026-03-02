/**
 * Shared CSV utilities for parsing and escaping.
 *
 * Used by both index.ts (main thread) and worker-force.ts (worker threads).
 * Single source of truth to prevent drift between duplicated implementations.
 */

/** Parse a CSV line handling quoted fields with embedded commas, newlines, and escaped quotes. */
export function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Escaped quote ""
          current += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        fields.push(current.trim());
        current = "";
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Escape a CSV field — wrap in quotes if it contains comma, double-quote, newline, or pipe. */
export function csvEscapeField(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n") || val.includes("|")) {
    return '"' + val.replace(/"/g, '""') + '"';
  }
  return val;
}
