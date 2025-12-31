/**
 * SOP Validation Runner
 *
 * Main orchestrator for running SOP validations against code changes.
 * Supports running individual validators or full validation suites.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  validators,
  ValidatorName,
  ValidationResult,
  ValidationContext,
  Violation,
} from './validators';

// ============================================================================
// TYPES
// ============================================================================

export interface RunnerConfig {
  /** Directory containing files to validate */
  targetDir: string;

  /** File patterns to include (glob-like) */
  include?: string[];

  /** File patterns to exclude */
  exclude?: string[];

  /** Specific validators to run (default: all) */
  validators?: ValidatorName[];

  /** SOP files to validate against (runs all validators for those SOPs) */
  sopFiles?: string[];

  /** Output format */
  format?: 'console' | 'json' | 'markdown';

  /** Fail on warnings */
  failOnWarnings?: boolean;

  /** Verbose output */
  verbose?: boolean;
}

export interface ValidationSummary {
  timestamp: string;
  targetDir: string;
  filesAnalyzed: number;
  totalScore: number;
  passed: boolean;
  blockers: number;
  warnings: number;
  suggestions: number;
  results: ValidationResult[];
  metrics: MetricSummary[];
}

export interface MetricSummary {
  name: string;
  sopFile: string;
  score: number;
  passed: boolean;
  blockOnFail: boolean;
  violationCount: number;
  warningCount: number;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const SOP_VALIDATOR_MAP: Record<string, ValidatorName[]> = {
  '2-supabase': ['supabase-auth', 'tenant-isolation', 'audit-logging'],
  '3-database-prisma': ['prisma-queries', 'transactions'],
  '4-code-safety-patterns': ['code-safety'],
  '5-error-handling-logging': ['exception-types', 'logging'],
  '6-external-services-timing': ['external-services'],
  '7-queue-job-processing': ['job-processing'],
  '8-api-design-patterns': ['api-design'],
  '9-testing-code-quality': ['code-quality'],
};

const METRIC_WEIGHTS: Record<ValidatorName, number> = {
  'supabase-auth': 0.15,
  'tenant-isolation': 0.15,
  'audit-logging': 0.05,
  'prisma-queries': 0.15,
  'transactions': 0.10,
  'code-safety': 0.05,
  'exception-types': 0.10,
  'logging': 0.05,
  'external-services': 0.05,
  'job-processing': 0.05,
  'api-design': 0.05,
  'code-quality': 0.05,
};

const BLOCK_ON_FAIL: ValidatorName[] = [
  'supabase-auth',
  'tenant-isolation',
  'prisma-queries',
  'transactions',
  'api-design',
];

// ============================================================================
// FILE UTILITIES
// ============================================================================

function getFiles(dir: string, include: string[], exclude: string[]): string[] {
  const files: string[] = [];

  function walkDir(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativePath = path.relative(dir, fullPath);

      // Check excludes
      if (exclude.some(pattern => matchPattern(relativePath, pattern))) {
        continue;
      }

      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.isFile()) {
        if (include.length === 0 || include.some(pattern => matchPattern(relativePath, pattern))) {
          files.push(fullPath);
        }
      }
    }
  }

  if (fs.existsSync(dir)) {
    walkDir(dir);
  }

  return files;
}

function matchPattern(filePath: string, pattern: string): boolean {
  // Simple glob matching
  const regexPattern = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  return new RegExp(regexPattern).test(filePath);
}

function readFileContents(files: string[]): Map<string, string> {
  const contents = new Map<string, string>();

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      contents.set(file, content);
    } catch (error) {
      console.error(`Failed to read ${file}: ${error}`);
    }
  }

  return contents;
}

// ============================================================================
// VALIDATION RUNNER
// ============================================================================

export function runValidation(config: RunnerConfig): ValidationSummary {
  const {
    targetDir,
    include = ['*.ts'],
    exclude = ['node_modules/**', 'dist/**', '*.spec.ts', '*.test.ts'],
    validators: selectedValidators,
    sopFiles,
    format = 'console',
    failOnWarnings = false,
    verbose = false,
  } = config;

  // Determine which validators to run
  let validatorsToRun: ValidatorName[] = [];

  if (selectedValidators && selectedValidators.length > 0) {
    validatorsToRun = selectedValidators;
  } else if (sopFiles && sopFiles.length > 0) {
    for (const sop of sopFiles) {
      const sopValidators = SOP_VALIDATOR_MAP[sop];
      if (sopValidators) {
        validatorsToRun.push(...sopValidators);
      }
    }
  } else {
    // Run all validators
    validatorsToRun = Object.keys(validators) as ValidatorName[];
  }

  // Deduplicate
  validatorsToRun = [...new Set(validatorsToRun)];

  // Get files
  const files = getFiles(targetDir, include, exclude);
  const fileContents = readFileContents(files);

  if (verbose) {
    console.log(`Found ${files.length} files to analyze`);
    console.log(`Running ${validatorsToRun.length} validators`);
  }

  // Create context
  const ctx: ValidationContext = {
    files,
    fileContents,
  };

  // Run validators
  const results: ValidationResult[] = [];

  for (const validatorName of validatorsToRun) {
    const validator = validators[validatorName];
    if (validator) {
      const result = validator(ctx);
      results.push(result);

      if (verbose) {
        console.log(`${validatorName}: ${(result.score * 100).toFixed(1)}% (${result.passed ? 'PASS' : 'FAIL'})`);
      }
    }
  }

  // Calculate summary
  const summary = calculateSummary(results, files.length, targetDir, failOnWarnings);

  // Output results
  switch (format) {
    case 'json':
      console.log(JSON.stringify(summary, null, 2));
      break;
    case 'markdown':
      console.log(formatMarkdown(summary));
      break;
    default:
      printConsoleOutput(summary, verbose);
  }

  return summary;
}

function calculateSummary(
  results: ValidationResult[],
  filesAnalyzed: number,
  targetDir: string,
  failOnWarnings: boolean
): ValidationSummary {
  let weightedScore = 0;
  let totalWeight = 0;
  let blockers = 0;
  let warnings = 0;
  let suggestions = 0;

  const metrics: MetricSummary[] = [];

  for (const result of results) {
    const validatorName = Object.keys(validators).find(
      k => validators[k as ValidatorName] === validators[result.metric as ValidatorName]
    ) as ValidatorName;

    const weight = METRIC_WEIGHTS[validatorName] || 0.05;
    const blockOnFail = BLOCK_ON_FAIL.includes(validatorName);

    weightedScore += result.score * weight;
    totalWeight += weight;

    if (!result.passed && blockOnFail) {
      blockers += result.violations.length;
    }

    warnings += result.warnings.length;
    suggestions += result.suggestions.length;

    metrics.push({
      name: result.metric,
      sopFile: result.sopFile,
      score: result.score,
      passed: result.passed,
      blockOnFail,
      violationCount: result.violations.length,
      warningCount: result.warnings.length,
    });
  }

  const totalScore = totalWeight > 0 ? weightedScore / totalWeight : 1.0;
  const passed = blockers === 0 && totalScore >= 0.85 && (!failOnWarnings || warnings === 0);

  return {
    timestamp: new Date().toISOString(),
    targetDir,
    filesAnalyzed,
    totalScore,
    passed,
    blockers,
    warnings,
    suggestions,
    results,
    metrics,
  };
}

// ============================================================================
// OUTPUT FORMATTERS
// ============================================================================

function printConsoleOutput(summary: ValidationSummary, verbose: boolean) {
  console.log('\n' + '='.repeat(60));
  console.log('SOP VALIDATION REPORT');
  console.log('='.repeat(60));
  console.log(`Timestamp: ${summary.timestamp}`);
  console.log(`Target: ${summary.targetDir}`);
  console.log(`Files analyzed: ${summary.filesAnalyzed}`);
  console.log('');

  // Overall status
  const statusIcon = summary.passed ? '✅' : '❌';
  const statusText = summary.passed ? 'PASSED' : 'FAILED';
  console.log(`${statusIcon} Overall Status: ${statusText}`);
  console.log(`   Total Score: ${(summary.totalScore * 100).toFixed(1)}%`);
  console.log(`   Blockers: ${summary.blockers}`);
  console.log(`   Warnings: ${summary.warnings}`);
  console.log(`   Suggestions: ${summary.suggestions}`);
  console.log('');

  // Metrics breakdown
  console.log('-'.repeat(60));
  console.log('METRICS BREAKDOWN');
  console.log('-'.repeat(60));

  for (const metric of summary.metrics) {
    const icon = metric.passed ? '✅' : '❌';
    const blockTag = metric.blockOnFail ? ' [BLOCKER]' : '';
    console.log(`${icon} ${metric.name}: ${(metric.score * 100).toFixed(1)}%${blockTag}`);
    if (metric.violationCount > 0) {
      console.log(`   Violations: ${metric.violationCount}`);
    }
    if (metric.warningCount > 0) {
      console.log(`   Warnings: ${metric.warningCount}`);
    }
  }

  // Detailed violations
  if (verbose || summary.blockers > 0) {
    console.log('');
    console.log('-'.repeat(60));
    console.log('VIOLATIONS');
    console.log('-'.repeat(60));

    for (const result of summary.results) {
      if (result.violations.length > 0) {
        console.log(`\n[${result.sopFile}] ${result.metric}:`);
        for (const v of result.violations) {
          console.log(`  ${v.severity.toUpperCase()}: ${v.file}:${v.line}`);
          console.log(`    Rule: ${v.rule}`);
          console.log(`    ${v.message}`);
          if (v.fix) {
            console.log(`    Fix: ${v.fix}`);
          }
        }
      }
    }
  }

  // Warnings (if verbose)
  if (verbose && summary.warnings > 0) {
    console.log('');
    console.log('-'.repeat(60));
    console.log('WARNINGS');
    console.log('-'.repeat(60));

    for (const result of summary.results) {
      if (result.warnings.length > 0) {
        console.log(`\n[${result.sopFile}] ${result.metric}:`);
        for (const w of result.warnings) {
          console.log(`  ${w.file}:${w.line} - ${w.message}`);
        }
      }
    }
  }

  console.log('');
  console.log('='.repeat(60));
}

function formatMarkdown(summary: ValidationSummary): string {
  let md = '# SOP Validation Report\n\n';

  md += `**Timestamp:** ${summary.timestamp}\n`;
  md += `**Target:** ${summary.targetDir}\n`;
  md += `**Files analyzed:** ${summary.filesAnalyzed}\n\n`;

  // Overall status
  const statusIcon = summary.passed ? '✅' : '❌';
  md += `## ${statusIcon} Overall Status: ${summary.passed ? 'PASSED' : 'FAILED'}\n\n`;
  md += `| Metric | Value |\n`;
  md += `|--------|-------|\n`;
  md += `| Total Score | ${(summary.totalScore * 100).toFixed(1)}% |\n`;
  md += `| Blockers | ${summary.blockers} |\n`;
  md += `| Warnings | ${summary.warnings} |\n`;
  md += `| Suggestions | ${summary.suggestions} |\n\n`;

  // Metrics table
  md += `## Metrics Breakdown\n\n`;
  md += `| Metric | SOP | Score | Status | Blocker |\n`;
  md += `|--------|-----|-------|--------|--------|\n`;

  for (const metric of summary.metrics) {
    const icon = metric.passed ? '✅' : '❌';
    md += `| ${metric.name} | ${metric.sopFile} | ${(metric.score * 100).toFixed(1)}% | ${icon} | ${metric.blockOnFail ? 'Yes' : 'No'} |\n`;
  }

  // Violations
  if (summary.blockers > 0) {
    md += `\n## Violations\n\n`;

    for (const result of summary.results) {
      if (result.violations.length > 0) {
        md += `### ${result.metric} (${result.sopFile})\n\n`;
        for (const v of result.violations) {
          md += `- **${v.severity.toUpperCase()}** \`${v.file}:${v.line}\`\n`;
          md += `  - Rule: ${v.rule}\n`;
          md += `  - ${v.message}\n`;
          if (v.fix) {
            md += `  - Fix: ${v.fix}\n`;
          }
        }
        md += '\n';
      }
    }
  }

  return md;
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

export function runCLI(args: string[]) {
  const config: RunnerConfig = {
    targetDir: process.cwd(),
    include: ['*.ts'],
    exclude: ['node_modules/**', 'dist/**', '*.spec.ts', '*.test.ts'],
    format: 'console',
    verbose: false,
  };

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--dir':
      case '-d':
        config.targetDir = args[++i];
        break;

      case '--sop':
      case '-s':
        config.sopFiles = config.sopFiles || [];
        config.sopFiles.push(args[++i]);
        break;

      case '--validator':
      case '-v':
        config.validators = config.validators || [];
        config.validators.push(args[++i] as ValidatorName);
        break;

      case '--format':
      case '-f':
        config.format = args[++i] as 'console' | 'json' | 'markdown';
        break;

      case '--verbose':
        config.verbose = true;
        break;

      case '--fail-on-warnings':
        config.failOnWarnings = true;
        break;

      case '--include':
        config.include = config.include || [];
        config.include.push(args[++i]);
        break;

      case '--exclude':
        config.exclude = config.exclude || [];
        config.exclude.push(args[++i]);
        break;

      case '--help':
      case '-h':
        printHelp();
        process.exit(0);

      default:
        if (!arg.startsWith('-')) {
          config.targetDir = arg;
        }
    }
  }

  const summary = runValidation(config);
  process.exit(summary.passed ? 0 : 1);
}

function printHelp() {
  console.log(`
SOP Validation Runner

Usage: npx ts-node validation/runner.ts [options] [target-dir]

Options:
  -d, --dir <path>         Target directory to validate (default: current dir)
  -s, --sop <name>         SOP file to validate against (can specify multiple)
                           Examples: 2-supabase, 3-database-prisma
  -v, --validator <name>   Specific validator to run (can specify multiple)
                           Examples: prisma-queries, exception-types
  -f, --format <type>      Output format: console, json, markdown (default: console)
  --verbose                Show detailed output including warnings
  --fail-on-warnings       Fail if any warnings are found
  --include <pattern>      File patterns to include (default: *.ts)
  --exclude <pattern>      File patterns to exclude
  -h, --help               Show this help message

Available SOP Files:
  2-supabase               Auth, RBAC, tenant isolation
  3-database-prisma        Prisma queries, transactions
  4-code-safety-patterns   Code movement, closures
  5-error-handling-logging Exception types, logging
  6-external-services      External APIs, retries
  7-queue-job-processing   Job processing, idempotency
  8-api-design-patterns    API design, DTOs
  9-testing-code-quality   Code quality checks

Available Validators:
  supabase-auth, tenant-isolation, audit-logging
  prisma-queries, transactions
  code-safety
  exception-types, logging
  external-services
  job-processing
  api-design
  code-quality

Examples:
  # Validate all files in src/ against all SOPs
  npx ts-node validation/runner.ts src/

  # Validate against specific SOP
  npx ts-node validation/runner.ts -s 3-database-prisma src/

  # Run specific validators
  npx ts-node validation/runner.ts -v prisma-queries -v transactions src/

  # JSON output for CI
  npx ts-node validation/runner.ts -f json --fail-on-warnings src/
`);
}

// Run CLI if executed directly
if (require.main === module) {
  runCLI(process.argv.slice(2));
}
