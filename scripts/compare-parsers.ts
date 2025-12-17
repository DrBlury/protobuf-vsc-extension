#!/usr/bin/env node
/**
 * Parser Comparison Script
 *
 * Compares AST output between built-in parser and Tree-sitter parser.
 * Run with: npx ts-node scripts/compare-parsers.ts [proto-file]
 *
 * Or run all examples: npx ts-node scripts/compare-parsers.ts --all
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProtoParser } from '../src/server/core/parser';
import { TreeSitterProtoParser, initTreeSitterParser, isTreeSitterInitialized } from '../src/server/core/treeSitterParser';
import { ProtoFile, MessageDefinition, EnumDefinition, FieldDefinition, ServiceDefinition, RpcDefinition } from '../src/server/core/ast';

interface ComparisonResult {
  file: string;
  match: boolean;
  differences: string[];
  builtInTime: number;
  treeSitterTime: number;
}

/**
 * Normalize AST for comparison (removes position info that may differ)
 */
function normalizeForComparison(file: ProtoFile): unknown {
  return {
    syntax: file.syntax?.version,
    edition: file.edition?.edition,
    package: file.package?.name,
    imports: file.imports.map(i => ({ path: i.path, modifier: i.modifier })).sort((a, b) => a.path.localeCompare(b.path)),
    options: file.options.map(o => ({ name: o.name, value: o.value })).sort((a, b) => a.name.localeCompare(b.name)),
    messages: file.messages.map(normalizeMessage).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    enums: file.enums.map(normalizeEnum).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    services: file.services.map(normalizeService).sort((a: any, b: any) => a.name.localeCompare(b.name)),
  };
}

function normalizeMessage(msg: MessageDefinition): unknown {
  return {
    name: msg.name,
    fields: msg.fields.map(normalizeField).sort((a: any, b: any) => a.number - b.number),
    nestedMessages: msg.nestedMessages.map(normalizeMessage).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    nestedEnums: msg.nestedEnums.map(normalizeEnum).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    oneofs: msg.oneofs.map(o => ({
      name: o.name,
      fields: o.fields.map(normalizeField).sort((a: any, b: any) => a.number - b.number)
    })).sort((a: any, b: any) => a.name.localeCompare(b.name)),
    maps: msg.maps.map(m => ({
      name: m.name,
      keyType: m.keyType,
      valueType: m.valueType,
      number: m.number
    })).sort((a: any, b: any) => a.number - b.number),
    reserved: msg.reserved.map(r => ({
      names: [...r.names].sort(),
      // Normalize 'max' to the actual max field number (536870911 = 0x1FFFFFFF)
      ranges: r.ranges.map(range => ({
        start: range.start,
        end: range.end === 'max' ? 536870911 : range.end
      }))
    }))
  };
}

function normalizeField(field: FieldDefinition): unknown {
  return {
    name: field.name,
    fieldType: field.fieldType,
    number: field.number,
    modifier: field.modifier || null,
    options: (field.options || []).map(o => ({
      name: o.name,
      // Normalize aggregate values by collapsing whitespace around punctuation
      value: normalizeOptionValue(o.value)
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

/**
 * Normalize option values to handle whitespace differences in textproto-style values
 * e.g., "{ lt { seconds: 300 } }" vs "{lt {seconds: 300}}"
 */
function normalizeOptionValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (!value.startsWith('{')) return value;

  // Normalize whitespace: collapse multiple spaces, normalize around braces and colons
  return value
    .replace(/\s+/g, ' ')           // Collapse multiple whitespace to single space
    .replace(/\{\s*/g, '{')         // Remove space after {
    .replace(/\s*\}/g, '}')         // Remove space before }
    .replace(/\s*:\s*/g, ':')       // Remove space around :
    .replace(/\s*,\s*/g, ',')       // Remove space around ,
    .trim();
}

function normalizeEnum(enumDef: EnumDefinition): unknown {
  return {
    name: enumDef.name,
    values: enumDef.values.map(v => ({
      name: v.name,
      number: v.number,
      options: (v.options || []).map(o => ({ name: o.name, value: o.value })).sort((a, b) => a.name.localeCompare(b.name))
    })).sort((a, b) => a.number - b.number),
    options: enumDef.options.map(o => ({ name: o.name, value: o.value })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

function normalizeService(svc: ServiceDefinition): unknown {
  return {
    name: svc.name,
    rpcs: svc.rpcs.map((rpc: RpcDefinition) => ({
      name: rpc.name,
      requestType: rpc.requestType,
      responseType: rpc.responseType,
      requestStreaming: rpc.requestStreaming,
      responseStreaming: rpc.responseStreaming
    })).sort((a, b) => a.name.localeCompare(b.name))
  };
}

/**
 * Deep diff two objects
 */
function deepDiff(obj1: any, obj2: any, path: string = ''): string[] {
  const differences: string[] = [];

  // Handle type mismatches with special cases for numeric strings
  if (typeof obj1 !== typeof obj2) {
    // Check if one is a number and the other is a numeric string
    const num1 = typeof obj1 === 'number' ? obj1 : (typeof obj1 === 'string' ? parseFloat(obj1) : NaN);
    const num2 = typeof obj2 === 'number' ? obj2 : (typeof obj2 === 'string' ? parseFloat(obj2) : NaN);

    if (!Number.isNaN(num1) && !Number.isNaN(num2) && num1 === num2) {
      // Numeric values are equivalent, no difference
      return differences;
    }

    differences.push(`${path}: type mismatch (${typeof obj1} vs ${typeof obj2})`);
    return differences;
  }

  if (obj1 === null && obj2 === null) return differences;
  if (obj1 === null || obj2 === null) {
    differences.push(`${path}: null mismatch (${obj1} vs ${obj2})`);
    return differences;
  }

  if (typeof obj1 !== 'object') {
    // Special handling for NaN, Infinity, -Infinity
    if (typeof obj1 === 'number' && typeof obj2 === 'number') {
      const bothNaN = Number.isNaN(obj1) && Number.isNaN(obj2);
      const bothSame = obj1 === obj2;
      if (!bothNaN && !bothSame) {
        differences.push(`${path}: value mismatch ("${obj1}" vs "${obj2}")`);
      }
    } else if (obj1 !== obj2) {
      differences.push(`${path}: value mismatch ("${obj1}" vs "${obj2}")`);
    }
    return differences;
  }

  if (Array.isArray(obj1) && Array.isArray(obj2)) {
    if (obj1.length !== obj2.length) {
      differences.push(`${path}: array length mismatch (${obj1.length} vs ${obj2.length})`);
    }
    const maxLen = Math.max(obj1.length, obj2.length);
    for (let i = 0; i < maxLen; i++) {
      differences.push(...deepDiff(obj1[i], obj2[i], `${path}[${i}]`));
    }
    return differences;
  }

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  const allKeys = new Set([...keys1, ...keys2]);

  for (const key of allKeys) {
    if (!(key in obj1)) {
      differences.push(`${path}.${key}: missing in built-in parser`);
    } else if (!(key in obj2)) {
      differences.push(`${path}.${key}: missing in tree-sitter parser`);
    } else {
      differences.push(...deepDiff(obj1[key], obj2[key], `${path}.${key}`));
    }
  }

  return differences;
}

async function compareFile(
  filePath: string,
  builtInParser: ProtoParser,
  treeSitterParser: TreeSitterProtoParser
): Promise<ComparisonResult> {
  const content = fs.readFileSync(filePath, 'utf-8');
  const uri = `file://${filePath}`;

  // Parse with built-in parser
  const builtInStart = performance.now();
  const builtInResult = builtInParser.parse(content, uri);
  const builtInTime = performance.now() - builtInStart;

  // Parse with Tree-sitter parser
  const treeSitterStart = performance.now();
  const treeSitterResult = treeSitterParser.parse(content, uri);
  const treeSitterTime = performance.now() - treeSitterStart;

  // Normalize and compare
  const builtInNormalized = normalizeForComparison(builtInResult);
  const treeSitterNormalized = normalizeForComparison(treeSitterResult);

  const differences = deepDiff(builtInNormalized, treeSitterNormalized, 'root');

  return {
    file: filePath,
    match: differences.length === 0,
    differences,
    builtInTime,
    treeSitterTime
  };
}

async function findProtoFiles(dir: string): Promise<string[]> {
  const files: string[] = [];

  function walk(directory: string) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.proto')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Minimum match rate required for CI to pass (percentage)
const CI_MINIMUM_MATCH_RATE = 100;

async function main() {
  const args = process.argv.slice(2);
  const ciMode = args.includes('--ci');
  const quiet = args.includes('--quiet') || args.includes('-q');

  // Initialize Tree-sitter
  const wasmPath = path.join(__dirname, '../tree-sitter-proto/tree-sitter-proto.wasm');
  if (!fs.existsSync(wasmPath)) {
    console.error(`Tree-sitter WASM not found at ${wasmPath}`);
    console.error('Please build it first: cd tree-sitter-proto && npm run build');
    process.exit(1);
  }

  if (!quiet) {
    console.log('Initializing Tree-sitter parser...');
  }
  await initTreeSitterParser(wasmPath);

  if (!isTreeSitterInitialized()) {
    console.error('Failed to initialize Tree-sitter parser');
    process.exit(1);
  }

  const builtInParser = new ProtoParser();
  const treeSitterParser = new TreeSitterProtoParser();

  let files: string[];

  if (args.includes('--all') || ciMode) {
    // Find all proto files in examples directory
    const examplesDir = path.join(__dirname, '../examples');
    files = await findProtoFiles(examplesDir);
    if (!quiet) {
      console.log(`Found ${files.length} proto files in examples/\n`);
    }
  } else if (args.filter(arg => !arg.startsWith('-')).length > 0) {
    files = args.filter(arg => !arg.startsWith('-'));
  } else {
    console.log('Usage:');
    console.log('  npx ts-node scripts/compare-parsers.ts <proto-file>');
    console.log('  npx ts-node scripts/compare-parsers.ts --all');
    console.log('  npx ts-node scripts/compare-parsers.ts --ci    # CI mode with exit code');
    console.log('  npx ts-node scripts/compare-parsers.ts --quiet # Minimal output');
    process.exit(0);
  }

  const results: ComparisonResult[] = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.error(`File not found: ${file}`);
      continue;
    }

    try {
      const result = await compareFile(file, builtInParser, treeSitterParser);
      results.push(result);

      if (!quiet) {
        const status = result.match ? '✅' : '❌';
        const relativePath = path.relative(process.cwd(), file);
        console.log(`${status} ${relativePath}`);

        if (!result.match) {
          console.log(`   Differences (${result.differences.length}):`);
          for (const diff of result.differences.slice(0, 10)) {
            console.log(`     - ${diff}`);
          }
          if (result.differences.length > 10) {
            console.log(`     ... and ${result.differences.length - 10} more`);
          }
        }

        console.log(`   Built-in: ${result.builtInTime.toFixed(2)}ms, Tree-sitter: ${result.treeSitterTime.toFixed(2)}ms`);
      }
    } catch (error) {
      console.error(`Error processing ${file}:`, error);
    }
  }

  // Summary
  const matching = results.filter(r => r.match).length;
  const total = results.length;
  const matchRate = (matching / total) * 100;

  console.log('\n=== Summary ===');
  console.log(`Matching: ${matching}/${total} (${matchRate.toFixed(1)}%)`);

  if (!quiet) {
    const avgBuiltIn = results.reduce((sum, r) => sum + r.builtInTime, 0) / results.length;
    const avgTreeSitter = results.reduce((sum, r) => sum + r.treeSitterTime, 0) / results.length;
    console.log(`Avg parse time - Built-in: ${avgBuiltIn.toFixed(2)}ms, Tree-sitter: ${avgTreeSitter.toFixed(2)}ms`);
  }

  if (matching < total) {
    console.log('\nFiles with differences:');
    for (const result of results.filter(r => !r.match)) {
      console.log(`  - ${path.relative(process.cwd(), result.file)}`);
    }
  }

  // CI mode: exit with error if below threshold
  if (ciMode) {
    console.log(`\nCI Mode: Minimum required match rate: ${CI_MINIMUM_MATCH_RATE}%`);
    if (matchRate < CI_MINIMUM_MATCH_RATE) {
      console.error(`❌ FAILED: Match rate ${matchRate.toFixed(1)}% is below minimum ${CI_MINIMUM_MATCH_RATE}%`);
      process.exit(1);
    } else {
      console.log(`✅ PASSED: Match rate ${matchRate.toFixed(1)}% meets minimum ${CI_MINIMUM_MATCH_RATE}%`);
      process.exit(0);
    }
  }
}

main().catch(console.error);
