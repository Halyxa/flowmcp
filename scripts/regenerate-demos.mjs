#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');

// Dynamically import the compiled functions
const { flowExportFormats } = await import(`${projectRoot}/dist/index.js`);

console.log('📊 Regenerating 3D demo HTML files...\n');

// ============================================================================
// Demo 1: Neural Network Architecture
// ============================================================================
console.log('📱 Demo 1: Neural Network Architecture');
try {
  const nnCsv = readFileSync(`${projectRoot}/samples/neural-network-architecture.csv`, 'utf-8');

  console.log('  → Exporting to HTML...');
  const htmlResult = flowExportFormats({
    csv_content: nnCsv,
    format: 'html_viewer',
    title: 'Neural Network Architecture — 160 Nodes, 2610 Connections'
  });

  // Extract HTML from result
  let html = htmlResult.output || '';
  if (!html && htmlResult.content && htmlResult.content[0]?.text) {
    html = htmlResult.content[0].text;
  }

  // Find actual HTML start
  const htmlStart = html.indexOf('<!DOCTYPE');
  if (htmlStart >= 0) {
    html = html.substring(htmlStart);
  }

  if (!html.includes('<!DOCTYPE')) {
    throw new Error('Generated output is not valid HTML');
  }

  writeFileSync(`${projectRoot}/demos/neural-network-3d.html`, html);
  console.log('  ✓ Written to demos/neural-network-3d.html\n');
} catch (err) {
  console.error(`  ✗ Error: ${err.message}\n`);
  process.exit(1);
}

// ============================================================================
// Demo 2: Global Startup Funding
// ============================================================================
console.log('📱 Demo 2: Global Startup Funding');
try {
  const fundingCsv = readFileSync(`${projectRoot}/samples/global-startup-funding.csv`, 'utf-8');

  console.log('  → Exporting to HTML...');
  const htmlResult = flowExportFormats({
    csv_content: fundingCsv,
    format: 'html_viewer',
    title: 'Global Startup Funding — 420 Companies, 30 Countries'
  });

  // Extract HTML from result
  let html = htmlResult.output || '';
  if (!html && htmlResult.content && htmlResult.content[0]?.text) {
    html = htmlResult.content[0].text;
  }

  // Find actual HTML start
  const htmlStart = html.indexOf('<!DOCTYPE');
  if (htmlStart >= 0) {
    html = html.substring(htmlStart);
  }

  if (!html.includes('<!DOCTYPE')) {
    throw new Error('Generated output is not valid HTML');
  }

  writeFileSync(`${projectRoot}/demos/global-startup-funding-3d.html`, html);
  console.log('  ✓ Written to demos/global-startup-funding-3d.html\n');
} catch (err) {
  console.error(`  ✗ Error: ${err.message}\n`);
  process.exit(1);
}

// ============================================================================
// Demo 3: Climate Change Indicators
// ============================================================================
console.log('📱 Demo 3: Climate Change Indicators');
try {
  const climateCsv = readFileSync(`${projectRoot}/samples/climate-change-indicators.csv`, 'utf-8');

  console.log('  → Exporting to HTML...');
  const htmlResult = flowExportFormats({
    csv_content: climateCsv,
    format: 'html_viewer',
    title: 'Climate Change Indicators — 1040 Observations, 26 Years'
  });

  // Extract HTML from result
  let html = htmlResult.output || '';
  if (!html && htmlResult.content && htmlResult.content[0]?.text) {
    html = htmlResult.content[0].text;
  }

  // Find actual HTML start
  const htmlStart = html.indexOf('<!DOCTYPE');
  if (htmlStart >= 0) {
    html = html.substring(htmlStart);
  }

  if (!html.includes('<!DOCTYPE')) {
    throw new Error('Generated output is not valid HTML');
  }

  writeFileSync(`${projectRoot}/demos/climate-indicators-3d.html`, html);
  console.log('  ✓ Written to demos/climate-indicators-3d.html\n');
} catch (err) {
  console.error(`  ✗ Error: ${err.message}\n`);
  process.exit(1);
}

console.log('✨ All demos regenerated successfully!');
