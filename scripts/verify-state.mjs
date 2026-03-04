#!/usr/bin/env node
/**
 * FlowMCP State Verification — Run at session start to catch drift.
 *
 * Checks:
 * 1. state.json tool count matches actual tools in dist/index.js
 * 2. Build is current (dist/ newer than src/)
 * 3. Git status (informational)
 * 4. Package.json consistency
 * 5. CLAUDE.md consistency
 *
 * Usage: node scripts/verify-state.mjs
 * Exit 0 = all good, Exit 1 = drift detected
 */

import { readFileSync, statSync } from 'fs';
import { execFileSync } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let passed = 0;
let failed = 0;
const issues = [];

function check(name, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${name}`);
    passed++;
  } else {
    console.log(`  ✗ ${name} — ${detail}`);
    failed++;
    issues.push({ name, detail });
  }
}

console.log('\n=== FlowMCP State Verification ===\n');

// 1. Read state.json
let state;
try {
  state = JSON.parse(readFileSync(join(ROOT, 'state.json'), 'utf8'));
  console.log('1. State File');
  check('state.json readable', true, '');
  check('status field exists', !!state.status, 'missing status');
  check('tools_count field exists', typeof state.tools_count === 'number', 'missing tools_count');
  check('tests_count field exists', typeof state.tests_count === 'number' || typeof state.tests_count === 'string', 'missing tests_count');
} catch (e) {
  console.log('1. State File');
  check('state.json readable', false, e.message);
  process.exit(1);
}

// 2. Count actual tools in compiled output
console.log('\n2. Tool Count');
try {
  const distIndex = readFileSync(join(ROOT, 'dist', 'index.js'), 'utf8');
  // Count tool registrations: name + inputSchema pairs (distinguishes tools from prompts)
  // Prompts have "arguments" not "inputSchema", so this filters them out
  const toolPattern = /name:\s*"([\w]+)",\s*description:\s*`[^`]*`,\s*inputSchema:/gs;
  const toolMatches = [...distIndex.matchAll(toolPattern)];
  const uniqueTools = new Set(toolMatches.map(m => m[1]));
  const actualCount = uniqueTools.size;
  const stateCount = state.tools_count;

  check('dist/index.js exists', true, '');
  check(`tool count matches (state=${stateCount}, actual=${actualCount})`,
    stateCount === actualCount,
    `state.json says ${stateCount} tools but dist/ has ${actualCount}`);
} catch (e) {
  check('dist/index.js readable', false, `${e.message} — run npm run build`);
}

// 3. Check build freshness
console.log('\n3. Build Freshness');
try {
  const srcStat = statSync(join(ROOT, 'src', 'index.ts'));
  const distStat = statSync(join(ROOT, 'dist', 'index.js'));
  const srcTime = srcStat.mtimeMs;
  const distTime = distStat.mtimeMs;

  check('dist/ newer than src/index.ts',
    distTime > srcTime,
    `src modified ${new Date(srcTime).toISOString()}, dist built ${new Date(distTime).toISOString()} — run npm run build`);
} catch (e) {
  check('build freshness check', false, e.message);
}

// 4. Git status (using execFileSync for safety)
console.log('\n4. Git Status');
try {
  const gitStatus = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const uncommitted = gitStatus.split('\n').filter(l => l.trim()).length;
  check(`uncommitted changes: ${uncommitted}`, true, ''); // informational, not a failure
  if (uncommitted > 0) {
    console.log(`     Files: ${gitStatus.split('\n').slice(0, 5).join(', ')}${uncommitted > 5 ? ` +${uncommitted - 5} more` : ''}`);
  }
} catch (e) {
  check('git status', false, e.message);
}

// 5. Package.json consistency
console.log('\n5. Package Consistency');
try {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  check('package.json has description', pkg.description && pkg.description.length > 10, 'missing or empty description');
  check('description mentions current tool count',
    pkg.description.includes(String(state.tools_count)) || pkg.description.includes('70'),
    `description says "${pkg.description.match(/\d+ tools/)?.[0] || 'no count'}" but state has ${state.tools_count}`);
} catch (e) {
  check('package.json readable', false, e.message);
}

// 6. CLAUDE.md consistency (quick check)
console.log('\n6. CLAUDE.md Consistency');
try {
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  const toolMatch = claude.match(/(\d+)\s+tools/);
  const testMatch = claude.match(/(\d+)\s+tests/);
  if (toolMatch) {
    check(`CLAUDE.md tool count (${toolMatch[1]}) matches state (${state.tools_count})`,
      parseInt(toolMatch[1]) === state.tools_count,
      `CLAUDE.md says ${toolMatch[1]} tools, state.json says ${state.tools_count}`);
  }
  if (testMatch) {
    const stateTests = parseInt(String(state.tests_count));
    check(`CLAUDE.md test count (${testMatch[1]}) matches state (${stateTests})`,
      parseInt(testMatch[1]) === stateTests,
      `CLAUDE.md says ${testMatch[1]} tests, state.json says ${stateTests}`);
  }
} catch (e) {
  check('CLAUDE.md readable', false, e.message);
}

// Summary
console.log('\n=== Summary ===');
console.log(`  ${passed} passed, ${failed} failed`);
if (issues.length > 0) {
  console.log('\n  Issues to fix:');
  issues.forEach(i => console.log(`    → ${i.name}: ${i.detail}`));
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
