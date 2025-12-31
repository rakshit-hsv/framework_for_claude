/**
 * Claude Code Validator
 *
 * Validates code written by Claude against SOP rules BEFORE committing.
 * This is specifically designed to check Claude's generated code for compliance.
 *
 * Usage:
 *   - Pass the code Claude wrote as a string
 *   - Get back validation results with violations to fix
 *   - Claude should fix violations before presenting code to user
 */

import {
  validators,
  ValidatorName,
  ValidationResult,
  ValidationContext,
  Violation,
  Warning,
} from './validators';
import {
  METRIC_DEFINITIONS,
  getBlockingMetrics,
  evaluateGating,
  DEFAULT_GATING_CONFIG,
} from './metrics-config';

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeCodeInput {
  /** The code Claude wrote */
  code: string;

  /** Filename (used to determine file type, e.g., .service.ts, .controller.ts) */
  filename: string;

  /** Optional: The original code before Claude's changes (for diff validation) */
  originalCode?: string;

  /** Optional: Specific validators to run (default: auto-detect based on filename) */
  validators?: ValidatorName[];
}

export interface ClaudeValidationResult {
  /** Whether the code passes all blocking checks */
  passed: boolean;

  /** Overall compliance score (0-1) */
  score: number;

  /** Critical violations that MUST be fixed */
  blockers: ClaudeViolation[];

  /** Warnings that SHOULD be fixed */
  warnings: ClaudeViolation[];

  /** Suggestions for improvement */
  suggestions: string[];

  /** Detailed breakdown by validator */
  details: ValidatorDetail[];

  /** Summary message for Claude */
  summary: string;

  /** If not passed, suggested fixes */
  fixes?: SuggestedFix[];
}

export interface ClaudeViolation {
  rule: string;
  line: number;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  sopFile: string;
  fix?: string;
}

export interface ValidatorDetail {
  name: string;
  sopFile: string;
  score: number;
  passed: boolean;
  isBlocker: boolean;
  violationCount: number;
  warningCount: number;
}

export interface SuggestedFix {
  rule: string;
  pattern: string;
  replacement: string;
  description: string;
}

// ============================================================================
// VALIDATOR SELECTION
// ============================================================================

function selectValidatorsForFile(filename: string): ValidatorName[] {
  const validators: ValidatorName[] = [];

  // Service files - check most rules
  if (filename.endsWith('.service.ts')) {
    validators.push(
      'exception-types',
      'logging',
      'prisma-queries',
      'transactions',
      'tenant-isolation',
      'code-safety',
      'external-services',
      'code-quality'
    );
  }

  // Controller files - check API design
  if (filename.endsWith('.controller.ts')) {
    validators.push(
      'api-design',
      'supabase-auth',
      'code-quality'
    );
  }

  // Processor/Consumer files - check job processing
  if (filename.includes('processor') || filename.includes('consumer')) {
    validators.push(
      'job-processing',
      'exception-types',
      'logging',
      'tenant-isolation',
      'code-quality'
    );
  }

  // DTO files - check validation
  if (filename.includes('/dto/')) {
    validators.push('api-design', 'code-quality');
  }

  // Repository files - check database patterns
  if (filename.includes('repository')) {
    validators.push(
      'prisma-queries',
      'transactions',
      'tenant-isolation',
      'code-quality'
    );
  }

  // Guard files - check auth patterns
  if (filename.includes('guard')) {
    validators.push('supabase-auth', 'code-quality');
  }

  // Default: run core validators
  if (validators.length === 0) {
    validators.push(
      'exception-types',
      'logging',
      'code-quality'
    );
  }

  return [...new Set(validators)]; // Deduplicate
}

// ============================================================================
// MAIN VALIDATION FUNCTION
// ============================================================================

export function validateClaudeCode(input: ClaudeCodeInput): ClaudeValidationResult {
  const { code, filename, originalCode, validators: specifiedValidators } = input;

  // Determine which validators to run
  const validatorsToRun = specifiedValidators || selectValidatorsForFile(filename);

  // Create validation context
  const ctx: ValidationContext = {
    files: [filename],
    fileContents: new Map([[filename, code]]),
  };

  // Run validators
  const results: ValidationResult[] = [];
  const allBlockers: ClaudeViolation[] = [];
  const allWarnings: ClaudeViolation[] = [];
  const allSuggestions: string[] = [];
  const details: ValidatorDetail[] = [];

  for (const validatorName of validatorsToRun) {
    const validator = validators[validatorName];
    if (!validator) continue;

    const result = validator(ctx);
    results.push(result);

    const metricDef = METRIC_DEFINITIONS.find(m => m.name === validatorName);
    const isBlocker = metricDef?.blockOnFail ?? false;

    // Collect violations
    for (const v of result.violations) {
      const violation: ClaudeViolation = {
        rule: v.rule,
        line: v.line,
        message: v.message,
        severity: v.severity,
        sopFile: result.sopFile,
        fix: v.fix,
      };

      if (isBlocker || v.severity === 'critical') {
        allBlockers.push(violation);
      } else {
        allWarnings.push(violation);
      }
    }

    // Collect warnings
    for (const w of result.warnings) {
      allWarnings.push({
        rule: w.rule,
        line: w.line,
        message: w.message,
        severity: 'medium',
        sopFile: result.sopFile,
      });
    }

    // Collect suggestions
    allSuggestions.push(...result.suggestions);

    // Add to details
    details.push({
      name: validatorName,
      sopFile: result.sopFile,
      score: result.score,
      passed: result.passed,
      isBlocker,
      violationCount: result.violations.length,
      warningCount: result.warnings.length,
    });
  }

  // Calculate overall score
  let totalScore = 0;
  let totalWeight = 0;
  for (const detail of details) {
    const metricDef = METRIC_DEFINITIONS.find(m => m.name === detail.name);
    const weight = metricDef?.weight ?? 0.05;
    totalScore += detail.score * weight;
    totalWeight += weight;
  }
  const score = totalWeight > 0 ? totalScore / totalWeight : 1.0;

  // Determine if passed
  const passed = allBlockers.length === 0 && score >= 0.85;

  // Generate summary
  const summary = generateSummary(passed, allBlockers, allWarnings, score);

  // Generate suggested fixes
  const fixes = passed ? undefined : generateFixes(allBlockers);

  return {
    passed,
    score,
    blockers: allBlockers,
    warnings: allWarnings,
    suggestions: allSuggestions,
    details,
    summary,
    fixes,
  };
}

// ============================================================================
// SUMMARY GENERATION
// ============================================================================

function generateSummary(
  passed: boolean,
  blockers: ClaudeViolation[],
  warnings: ClaudeViolation[],
  score: number
): string {
  if (passed && warnings.length === 0) {
    return `✅ Code passes all SOP checks (score: ${(score * 100).toFixed(0)}%)`;
  }

  if (passed && warnings.length > 0) {
    return `✅ Code passes with ${warnings.length} warning(s) (score: ${(score * 100).toFixed(0)}%)`;
  }

  const parts: string[] = [];
  parts.push(`❌ Code has ${blockers.length} blocking violation(s)`);

  // Group blockers by rule
  const byRule = new Map<string, number>();
  for (const b of blockers) {
    byRule.set(b.rule, (byRule.get(b.rule) || 0) + 1);
  }

  for (const [rule, count] of byRule) {
    parts.push(`  - ${rule}: ${count} violation(s)`);
  }

  if (warnings.length > 0) {
    parts.push(`  + ${warnings.length} warning(s)`);
  }

  return parts.join('\n');
}

// ============================================================================
// FIX GENERATION
// ============================================================================

function generateFixes(blockers: ClaudeViolation[]): SuggestedFix[] {
  const fixes: SuggestedFix[] = [];
  const seenRules = new Set<string>();

  for (const blocker of blockers) {
    if (seenRules.has(blocker.rule)) continue;
    seenRules.add(blocker.rule);

    switch (blocker.rule) {
      case 'INV-ERROR-TYPE':
        fixes.push({
          rule: 'INV-ERROR-TYPE',
          pattern: "throw new Error('...')",
          replacement: "throw new NotFoundException('...') or BadRequestException('...')",
          description: 'Use NestJS exceptions instead of generic Error',
        });
        break;

      case 'INV-LOGGER':
        fixes.push({
          rule: 'INV-LOGGER',
          pattern: 'console.log(...)',
          replacement: 'this.logger.log(...)',
          description: 'Use NestJS Logger instead of console',
        });
        break;

      case 'INV-PRISMA-SOFT-DELETE':
        fixes.push({
          rule: 'INV-PRISMA-SOFT-DELETE',
          pattern: 'where: { ... }',
          replacement: 'where: { ..., deleted_at: null }',
          description: 'Add deleted_at: null filter for soft-delete entities',
        });
        break;

      case 'INV-PRISMA-ORDERBY':
        fixes.push({
          rule: 'INV-PRISMA-ORDERBY',
          pattern: 'findMany({ where: {...} })',
          replacement: "findMany({ where: {...}, orderBy: { created_at: 'desc' } })",
          description: 'Add orderBy clause to findMany queries',
        });
        break;

      case 'INV-PRISMA-TRANSACTION':
        fixes.push({
          rule: 'INV-PRISMA-TRANSACTION',
          pattern: 'Multiple prisma.*.create/update calls',
          replacement: 'prisma.$transaction(async (tx) => { ... })',
          description: 'Wrap multi-table mutations in transaction',
        });
        break;

      case 'INV-API-GUARD':
        fixes.push({
          rule: 'INV-API-GUARD',
          pattern: '@Post() or @Put() without guards',
          replacement: '@UseGuards(RolesGuard) @Roles(UserRole.ADMIN)',
          description: 'Add authorization guards to mutation endpoints',
        });
        break;

      case 'INV-SUPABASE-1':
        fixes.push({
          rule: 'INV-SUPABASE-1',
          pattern: 'jwt.decode(token)',
          replacement: 'jwtService.verifyAsync(token)',
          description: 'Use JWT verification, not decode-only',
        });
        break;

      case 'INV-LOG-SENSITIVE':
        fixes.push({
          rule: 'INV-LOG-SENSITIVE',
          pattern: 'this.logger.log(`...${password}...`)',
          replacement: 'Remove sensitive data from log statement',
          description: 'Never log passwords, tokens, or secrets',
        });
        break;

      case 'INV-HARDCODED-SECRET':
        fixes.push({
          rule: 'INV-HARDCODED-SECRET',
          pattern: "const key = 'sk-...'",
          replacement: 'const key = process.env.API_KEY',
          description: 'Use environment variables for secrets',
        });
        break;

      default:
        if (blocker.fix) {
          fixes.push({
            rule: blocker.rule,
            pattern: 'Current code',
            replacement: blocker.fix,
            description: blocker.message,
          });
        }
    }
  }

  return fixes;
}

// ============================================================================
// QUICK CHECK FUNCTIONS (for Claude's internal use)
// ============================================================================

/**
 * Quick check if code has any critical violations.
 * Use this before presenting code to user.
 */
export function hasBlockingViolations(code: string, filename: string): boolean {
  const result = validateClaudeCode({ code, filename });
  return !result.passed;
}

/**
 * Get just the blocker summary for quick display.
 */
export function getBlockerSummary(code: string, filename: string): string {
  const result = validateClaudeCode({ code, filename });
  return result.summary;
}

/**
 * Validate and return fixes for blocking issues only.
 */
export function getRequiredFixes(code: string, filename: string): SuggestedFix[] {
  const result = validateClaudeCode({ code, filename });
  return result.fixes || [];
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  const fs = require('fs');

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
Claude Code Validator

Validates code Claude writes against SOP rules before committing.

Usage:
  npx ts-node claude-code-validator.ts <filename>
  npx ts-node claude-code-validator.ts --code "<code>" --filename <name>

Examples:
  npx ts-node claude-code-validator.ts src/users.service.ts
  npx ts-node claude-code-validator.ts --code "throw new Error('Not found')" --filename test.service.ts

Options:
  --code <string>      Code to validate (alternative to file)
  --filename <name>    Filename for context (required with --code)
  --json               Output as JSON
  --help               Show this help
    `);
    process.exit(0);
  }

  let code: string;
  let filename: string;
  let outputJson = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--code') {
      code = args[++i];
    } else if (args[i] === '--filename') {
      filename = args[++i];
    } else if (args[i] === '--json') {
      outputJson = true;
    } else if (!args[i].startsWith('-')) {
      filename = args[i];
      code = fs.readFileSync(args[i], 'utf-8');
    }
  }

  if (!code! || !filename!) {
    console.error('Error: Code and filename required');
    process.exit(1);
  }

  const result = validateClaudeCode({ code, filename });

  if (outputJson) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n' + '='.repeat(60));
    console.log('CLAUDE CODE VALIDATION');
    console.log('='.repeat(60));
    console.log(`File: ${filename}`);
    console.log(`Score: ${(result.score * 100).toFixed(0)}%`);
    console.log('');
    console.log(result.summary);

    if (result.blockers.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('BLOCKERS (must fix):');
      for (const b of result.blockers) {
        console.log(`  Line ${b.line}: [${b.rule}] ${b.message}`);
        if (b.fix) console.log(`    Fix: ${b.fix}`);
      }
    }

    if (result.fixes && result.fixes.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('SUGGESTED FIXES:');
      for (const f of result.fixes) {
        console.log(`\n[${f.rule}] ${f.description}`);
        console.log(`  Before: ${f.pattern}`);
        console.log(`  After:  ${f.replacement}`);
      }
    }

    if (result.warnings.length > 0) {
      console.log('\n' + '-'.repeat(60));
      console.log('WARNINGS:');
      for (const w of result.warnings) {
        console.log(`  Line ${w.line}: [${w.rule}] ${w.message}`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  process.exit(result.passed ? 0 : 1);
}
