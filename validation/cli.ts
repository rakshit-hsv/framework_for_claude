#!/usr/bin/env node
/**
 * SOP Validation CLI
 *
 * Unified CLI for validating code against SOP rules.
 * Supports multiple modes:
 *   - Full codebase validation
 *   - Changed files only (git diff)
 *   - Staged changes (pre-commit)
 *   - Specific commits
 *   - Claude's newly written code
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  validators,
  ValidatorName,
  ValidationContext,
  ValidationResult,
} from './validators';
import { validateGeneralPractices } from './general-practices-validator';
import {
  METRIC_DEFINITIONS,
  evaluateGating,
  DEFAULT_GATING_CONFIG,
  STRICT_GATING_CONFIG,
  GatingConfig,
} from './metrics-config';

// Add general practices to validators
(validators as any)['general-practices'] = validateGeneralPractices;

// ============================================================================
// TYPES
// ============================================================================

interface CLIOptions {
  mode: 'full' | 'staged' | 'changed' | 'commit' | 'branch' | 'code';
  targetDir: string;
  include: string[];
  exclude: string[];
  validators: ValidatorName[];
  sopFiles: string[];
  format: 'console' | 'json' | 'markdown' | 'github';
  verbose: boolean;
  strict: boolean;
  failOnWarnings: boolean;
  commit?: string;
  branch?: string;
  code?: string;
  filename?: string;
  includeGeneral: boolean;
}

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  content?: string;
  changedLines?: number[];
}

// ============================================================================
// GIT HELPERS
// ============================================================================

function getGitRoot(): string {
  try {
    return execSync('git rev-parse --show-toplevel', { encoding: 'utf-8' }).trim();
  } catch {
    throw new Error('Not a git repository');
  }
}

function getStagedFiles(): FileChange[] {
  try {
    const output = execSync('git diff --cached --name-status', { encoding: 'utf-8' });
    return parseGitStatus(output);
  } catch {
    return [];
  }
}

function getChangedFiles(base = 'HEAD'): FileChange[] {
  try {
    const output = execSync(`git diff ${base} --name-status`, { encoding: 'utf-8' });
    return parseGitStatus(output);
  } catch {
    return [];
  }
}

function getCommitFiles(commit: string): FileChange[] {
  try {
    const output = execSync(`git diff-tree --no-commit-id --name-status -r ${commit}`, {
      encoding: 'utf-8',
    });
    return parseGitStatus(output);
  } catch {
    throw new Error(`Invalid commit: ${commit}`);
  }
}

function getBranchChanges(branch: string): FileChange[] {
  try {
    // Find merge base with main/master
    let baseBranch = 'main';
    try {
      execSync('git rev-parse --verify main', { encoding: 'utf-8' });
    } catch {
      baseBranch = 'master';
    }

    const mergeBase = execSync(`git merge-base ${baseBranch} ${branch}`, {
      encoding: 'utf-8',
    }).trim();

    const output = execSync(`git diff ${mergeBase}..${branch} --name-status`, {
      encoding: 'utf-8',
    });
    return parseGitStatus(output);
  } catch (e) {
    throw new Error(`Failed to get branch changes: ${e}`);
  }
}

function parseGitStatus(output: string): FileChange[] {
  const files: FileChange[] = [];
  const lines = output.trim().split('\n').filter(Boolean);

  for (const line of lines) {
    const [status, filePath] = line.split('\t');
    if (!filePath) continue;

    let fileStatus: 'added' | 'modified' | 'deleted';
    if (status === 'A') fileStatus = 'added';
    else if (status === 'D') fileStatus = 'deleted';
    else fileStatus = 'modified';

    files.push({ path: filePath, status: fileStatus });
  }

  return files;
}

function getChangedLines(filePath: string, base = 'HEAD'): number[] {
  try {
    const output = execSync(`git diff ${base} -U0 -- "${filePath}"`, {
      encoding: 'utf-8',
    });

    const changedLines: number[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // Parse @@ -old,count +new,count @@ format
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
      if (match) {
        const start = parseInt(match[1], 10);
        const count = parseInt(match[2] || '1', 10);
        for (let i = 0; i < count; i++) {
          changedLines.push(start + i);
        }
      }
    }

    return changedLines;
  } catch {
    return [];
  }
}

// ============================================================================
// FILE LOADING
// ============================================================================

function loadFiles(
  changes: FileChange[],
  options: CLIOptions
): Map<string, string> {
  const contents = new Map<string, string>();
  const gitRoot = getGitRoot();

  for (const change of changes) {
    if (change.status === 'deleted') continue;

    const fullPath = path.join(gitRoot, change.path);

    // Check include/exclude patterns
    if (!matchPatterns(change.path, options.include, options.exclude)) {
      continue;
    }

    try {
      const content = fs.readFileSync(fullPath, 'utf-8');
      contents.set(change.path, content);
    } catch (e) {
      console.error(`Warning: Could not read ${change.path}`);
    }
  }

  return contents;
}

function loadAllFiles(dir: string, options: CLIOptions): Map<string, string> {
  const contents = new Map<string, string>();

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      if (!matchPatterns(relativePath, options.include, options.exclude)) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          contents.set(relativePath, content);
        } catch (e) {
          console.error(`Warning: Could not read ${relativePath}`);
        }
      }
    }
  }

  walkDir(dir);
  return contents;
}

function matchPatterns(
  filePath: string,
  include: string[],
  exclude: string[]
): boolean {
  // Check excludes first
  for (const pattern of exclude) {
    if (matchGlob(filePath, pattern)) return false;
  }

  // If no includes specified, include all (after exclusions)
  if (include.length === 0) return true;

  // Check includes
  for (const pattern of include) {
    if (matchGlob(filePath, pattern)) return true;
  }

  return false;
}

function matchGlob(filePath: string, pattern: string): boolean {
  const regex = pattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '{{GLOBSTAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{GLOBSTAR}}/g, '.*');

  return new RegExp(`^${regex}$`).test(filePath);
}

// ============================================================================
// VALIDATION
// ============================================================================

function runValidation(options: CLIOptions): {
  results: ValidationResult[];
  summary: any;
} {
  let fileContents: Map<string, string>;
  let changedLines: Map<string, number[]> | undefined;

  // Load files based on mode
  switch (options.mode) {
    case 'staged':
      const stagedFiles = getStagedFiles();
      fileContents = loadFiles(stagedFiles, options);
      changedLines = new Map();
      for (const f of stagedFiles) {
        if (f.status !== 'deleted') {
          changedLines.set(f.path, getChangedLines(f.path, 'HEAD'));
        }
      }
      break;

    case 'changed':
      const changedFiles = getChangedFiles();
      fileContents = loadFiles(changedFiles, options);
      break;

    case 'commit':
      if (!options.commit) throw new Error('Commit hash required');
      const commitFiles = getCommitFiles(options.commit);
      fileContents = loadFiles(commitFiles, options);
      break;

    case 'branch':
      const branchFiles = getBranchChanges(options.branch || 'HEAD');
      fileContents = loadFiles(branchFiles, options);
      break;

    case 'code':
      if (!options.code || !options.filename) {
        throw new Error('Code and filename required for code mode');
      }
      fileContents = new Map([[options.filename, options.code]]);
      break;

    case 'full':
    default:
      fileContents = loadAllFiles(options.targetDir, options);
  }

  if (fileContents.size === 0) {
    return {
      results: [],
      summary: {
        passed: true,
        score: 1.0,
        filesAnalyzed: 0,
        blockers: 0,
        warnings: 0,
        message: 'No files to validate',
      },
    };
  }

  // Determine validators to run
  let validatorsToRun: ValidatorName[] = [];

  if (options.validators.length > 0) {
    validatorsToRun = options.validators;
  } else if (options.sopFiles.length > 0) {
    const sopMap: Record<string, ValidatorName[]> = {
      '2-supabase': ['supabase-auth', 'tenant-isolation', 'audit-logging'],
      '3-database-prisma': ['prisma-queries', 'transactions'],
      '4-code-safety-patterns': ['code-safety'],
      '5-error-handling-logging': ['exception-types', 'logging'],
      '6-external-services-timing': ['external-services'],
      '7-queue-job-processing': ['job-processing'],
      '8-api-design-patterns': ['api-design'],
      '9-testing-code-quality': ['code-quality'],
    };

    for (const sop of options.sopFiles) {
      const sopValidators = sopMap[sop];
      if (sopValidators) validatorsToRun.push(...sopValidators);
    }
  } else {
    // Run all validators
    validatorsToRun = Object.keys(validators) as ValidatorName[];
  }

  // Add general practices if requested
  if (options.includeGeneral && !validatorsToRun.includes('general-practices' as any)) {
    validatorsToRun.push('general-practices' as any);
  }

  // Create context
  const ctx: ValidationContext = {
    files: Array.from(fileContents.keys()),
    fileContents,
    changedLines,
  };

  // Run validators
  const results: ValidationResult[] = [];

  for (const name of validatorsToRun) {
    const validator = (validators as any)[name];
    if (validator) {
      const result = validator(ctx);
      results.push(result);
    }
  }

  // Calculate summary
  const scores = new Map<ValidatorName, number>();
  let blockers = 0;
  let warnings = 0;

  for (const result of results) {
    scores.set(result.metric as ValidatorName, result.score);
    blockers += result.violations.filter((v: any) => v.severity === 'critical' || v.severity === 'high').length;
    warnings += result.warnings.length;
  }

  const gatingConfig = options.strict ? STRICT_GATING_CONFIG : DEFAULT_GATING_CONFIG;
  const gatingResult = evaluateGating(scores, blockers, warnings, gatingConfig);

  let totalScore = 0;
  let totalWeight = 0;
  for (const [name, score] of scores) {
    const metric = METRIC_DEFINITIONS.find(m => m.name === name);
    const weight = metric?.weight ?? 0.05;
    totalScore += score * weight;
    totalWeight += weight;
  }

  return {
    results,
    summary: {
      passed: gatingResult.passed,
      score: totalWeight > 0 ? totalScore / totalWeight : 1.0,
      filesAnalyzed: fileContents.size,
      blockers,
      warnings,
      message: gatingResult.reason,
    },
  };
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function formatConsole(results: ValidationResult[], summary: any, verbose: boolean) {
  console.log('\n' + '='.repeat(60));
  console.log('SOP VALIDATION REPORT');
  console.log('='.repeat(60));
  console.log(`Files analyzed: ${summary.filesAnalyzed}`);
  console.log(`Score: ${(summary.score * 100).toFixed(1)}%`);
  console.log(`Status: ${summary.passed ? '✅ PASSED' : '❌ FAILED'}`);
  if (summary.message) console.log(`Reason: ${summary.message}`);
  console.log('');

  // Metrics breakdown
  console.log('-'.repeat(60));
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const blockerTag = METRIC_DEFINITIONS.find(m => m.name === result.metric)?.blockOnFail ? ' [BLOCKER]' : '';
    console.log(`${icon} ${result.metric}: ${(result.score * 100).toFixed(1)}%${blockerTag}`);
    if (result.violations.length > 0) {
      console.log(`   Violations: ${result.violations.length}`);
    }
  }

  // Violations
  if (summary.blockers > 0 || verbose) {
    console.log('');
    console.log('-'.repeat(60));
    console.log('VIOLATIONS:');

    for (const result of results) {
      for (const v of result.violations) {
        console.log(`  [${v.severity.toUpperCase()}] ${v.file}:${v.line}`);
        console.log(`    ${v.rule}: ${v.message}`);
        if (v.fix) console.log(`    Fix: ${v.fix}`);
      }
    }
  }

  // Warnings (verbose only)
  if (verbose && summary.warnings > 0) {
    console.log('');
    console.log('-'.repeat(60));
    console.log('WARNINGS:');

    for (const result of results) {
      for (const w of result.warnings) {
        console.log(`  ${w.file}:${w.line} - ${w.message}`);
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

function formatGitHub(results: ValidationResult[], summary: any) {
  // GitHub Actions annotations format
  for (const result of results) {
    for (const v of result.violations) {
      const level = v.severity === 'critical' ? 'error' : 'warning';
      console.log(`::${level} file=${v.file},line=${v.line}::${v.rule}: ${v.message}`);
    }
  }

  // Summary for GitHub
  console.log('');
  console.log('## SOP Validation Summary');
  console.log('');
  console.log(`| Metric | Value |`);
  console.log(`|--------|-------|`);
  console.log(`| Status | ${summary.passed ? '✅ Passed' : '❌ Failed'} |`);
  console.log(`| Score | ${(summary.score * 100).toFixed(1)}% |`);
  console.log(`| Files | ${summary.filesAnalyzed} |`);
  console.log(`| Blockers | ${summary.blockers} |`);
  console.log(`| Warnings | ${summary.warnings} |`);
}

// ============================================================================
// CLI PARSING
// ============================================================================

function parseArgs(args: string[]): CLIOptions {
  const options: CLIOptions = {
    mode: 'full',
    targetDir: process.cwd(),
    include: ['*.ts'],
    exclude: ['node_modules/**', 'dist/**', '*.spec.ts', '*.test.ts', '*.d.ts'],
    validators: [],
    sopFiles: [],
    format: 'console',
    verbose: false,
    strict: false,
    failOnWarnings: false,
    includeGeneral: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--mode':
      case '-m':
        options.mode = args[++i] as any;
        break;

      case '--staged':
        options.mode = 'staged';
        break;

      case '--changed':
        options.mode = 'changed';
        break;

      case '--commit':
        options.mode = 'commit';
        options.commit = args[++i];
        break;

      case '--branch':
        options.mode = 'branch';
        options.branch = args[++i];
        break;

      case '--full':
        options.mode = 'full';
        break;

      case '--code':
        options.mode = 'code';
        options.code = args[++i];
        break;

      case '--filename':
        options.filename = args[++i];
        break;

      case '--dir':
      case '-d':
        options.targetDir = args[++i];
        break;

      case '--sop':
      case '-s':
        options.sopFiles.push(args[++i]);
        break;

      case '--validator':
      case '-v':
        options.validators.push(args[++i] as ValidatorName);
        break;

      case '--format':
      case '-f':
        options.format = args[++i] as any;
        break;

      case '--verbose':
        options.verbose = true;
        break;

      case '--strict':
        options.strict = true;
        break;

      case '--fail-on-warnings':
        options.failOnWarnings = true;
        break;

      case '--no-general':
        options.includeGeneral = false;
        break;

      case '--include':
        options.include.push(args[++i]);
        break;

      case '--exclude':
        options.exclude.push(args[++i]);
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);

      default:
        if (!arg.startsWith('-')) {
          options.targetDir = arg;
        }
    }
  }

  return options;
}

function printHelp() {
  console.log(`
SOP Validation CLI

Validate code against SOP rules. Supports full codebase, commits, and staged changes.

MODES:
  --full               Validate entire codebase (default)
  --staged             Validate only staged changes (for pre-commit)
  --changed            Validate uncommitted changes
  --commit <hash>      Validate a specific commit
  --branch <name>      Validate all changes on a branch

OPTIONS:
  -d, --dir <path>     Target directory (default: current dir)
  -s, --sop <name>     SOP file to validate against (can specify multiple)
  -v, --validator <n>  Specific validator to run (can specify multiple)
  -f, --format <type>  Output: console, json, markdown, github
  --verbose            Show detailed output including warnings
  --strict             Use strict thresholds
  --fail-on-warnings   Exit non-zero if warnings present
  --no-general         Skip general best practices checks
  --include <pattern>  File patterns to include
  --exclude <pattern>  File patterns to exclude
  -h, --help           Show this help

EXAMPLES:
  # Validate full codebase
  npx ts-node cli.ts --full src/

  # Pre-commit hook (staged changes only)
  npx ts-node cli.ts --staged

  # Validate uncommitted changes
  npx ts-node cli.ts --changed

  # Validate a specific commit
  npx ts-node cli.ts --commit abc123

  # Validate feature branch changes
  npx ts-node cli.ts --branch feature/my-feature

  # Validate specific SOPs
  npx ts-node cli.ts --staged -s 3-database-prisma -s 2-supabase

  # CI with GitHub annotations
  npx ts-node cli.ts --staged -f github --strict

  # Validate Claude's code
  npx ts-node cli.ts --code "const x = 1;" --filename test.ts

SOP FILES:
  2-supabase, 3-database-prisma, 4-code-safety-patterns,
  5-error-handling-logging, 6-external-services-timing,
  7-queue-job-processing, 8-api-design-patterns, 9-testing-code-quality
`);
}

// ============================================================================
// MAIN
// ============================================================================

function main() {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  try {
    const { results, summary } = runValidation(options);

    switch (options.format) {
      case 'json':
        console.log(JSON.stringify({ results, summary }, null, 2));
        break;

      case 'github':
        formatGitHub(results, summary);
        break;

      case 'markdown':
        console.log(`# SOP Validation Report\n`);
        console.log(`**Status:** ${summary.passed ? '✅ Passed' : '❌ Failed'}`);
        console.log(`**Score:** ${(summary.score * 100).toFixed(1)}%\n`);
        formatConsole(results, summary, options.verbose);
        break;

      default:
        formatConsole(results, summary, options.verbose);
    }

    const exitCode = summary.passed && (!options.failOnWarnings || summary.warnings === 0) ? 0 : 1;
    process.exit(exitCode);

  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { parseArgs, runValidation };
