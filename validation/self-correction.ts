/**
 * SOP Self-Correction Loop
 *
 * Automated correction system that applies fixes based on validation results.
 * Used in AI-assisted code generation to iteratively improve code quality.
 */

import {
  ValidationResult,
  Violation,
  ValidationContext,
  validators,
  ValidatorName,
} from './validators';
import { runValidation, ValidationSummary } from './runner';

// ============================================================================
// TYPES
// ============================================================================

export interface CorrectionResult {
  original: string;
  corrected: string;
  appliedFixes: AppliedFix[];
  remainingViolations: Violation[];
}

export interface AppliedFix {
  rule: string;
  line: number;
  description: string;
  before: string;
  after: string;
}

export interface CorrectionConfig {
  maxIterations: number;
  autoFix: boolean;
  fixRules?: string[];
  skipRules?: string[];
}

// ============================================================================
// FIX PATTERNS
// ============================================================================

interface FixPattern {
  rule: string;
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
  description: string;
}

const FIX_PATTERNS: FixPattern[] = [
  // Generic Error → NestJS Exception
  {
    rule: 'INV-ERROR-TYPE',
    pattern: /throw\s+new\s+Error\(\s*['"]([^'"]*not\s*found[^'"]*)['"][\s)]/gi,
    replacement: "throw new NotFoundException('$1')",
    description: 'Replace generic Error with NotFoundException',
  },
  {
    rule: 'INV-ERROR-TYPE',
    pattern: /throw\s+new\s+Error\(\s*['"]([^'"]*invalid[^'"]*)['"][\s)]/gi,
    replacement: "throw new BadRequestException('$1')",
    description: 'Replace generic Error with BadRequestException',
  },
  {
    rule: 'INV-ERROR-TYPE',
    pattern: /throw\s+new\s+Error\(\s*['"]([^'"]*denied[^'"]*)['"][\s)]/gi,
    replacement: "throw new ForbiddenException('$1')",
    description: 'Replace generic Error with ForbiddenException',
  },

  // console.* → Logger
  {
    rule: 'INV-LOGGER',
    pattern: /console\.log\(/g,
    replacement: 'this.logger.log(',
    description: 'Replace console.log with Logger',
  },
  {
    rule: 'INV-LOGGER',
    pattern: /console\.error\(/g,
    replacement: 'this.logger.error(',
    description: 'Replace console.error with Logger',
  },
  {
    rule: 'INV-LOGGER',
    pattern: /console\.warn\(/g,
    replacement: 'this.logger.warn(',
    description: 'Replace console.warn with Logger',
  },
  {
    rule: 'INV-LOGGER',
    pattern: /console\.debug\(/g,
    replacement: 'this.logger.debug(',
    description: 'Replace console.debug with Logger',
  },

  // Add deleted_at filter
  {
    rule: 'INV-PRISMA-SOFT-DELETE',
    pattern: /(prisma\.(organizations|teams|rubrics|role_plays)\.find\w+\(\s*{\s*where:\s*{)([^}]+)(}\s*}\))/g,
    replacement: (match, prefix, entity, conditions, suffix) => {
      if (conditions.includes('deleted_at')) return match;
      const newConditions = conditions.trim().replace(/,?\s*$/, '') + ',\n      deleted_at: null,';
      return `${prefix}${newConditions}${suffix}`;
    },
    description: 'Add deleted_at: null filter',
  },

  // Add orderBy to findMany
  {
    rule: 'INV-PRISMA-ORDERBY',
    pattern: /(\.findMany\(\s*{\s*where:\s*{[^}]+}\s*)(}\))/g,
    replacement: "$1,\n    orderBy: { created_at: 'desc' },\n  $2",
    description: 'Add orderBy clause to findMany',
  },
];

// ============================================================================
// IMPORT FIXES
// ============================================================================

const IMPORT_FIXES: Record<string, string> = {
  'NotFoundException': "import { NotFoundException } from '@nestjs/common';",
  'BadRequestException': "import { BadRequestException } from '@nestjs/common';",
  'ForbiddenException': "import { ForbiddenException } from '@nestjs/common';",
  'UnauthorizedException': "import { UnauthorizedException } from '@nestjs/common';",
  'ConflictException': "import { ConflictException } from '@nestjs/common';",
  'Logger': "import { Logger } from '@nestjs/common';",
};

// ============================================================================
// CORRECTION ENGINE
// ============================================================================

export function applyFixes(
  content: string,
  violations: Violation[],
  config: CorrectionConfig
): CorrectionResult {
  let corrected = content;
  const appliedFixes: AppliedFix[] = [];
  const remainingViolations: Violation[] = [];

  // Group violations by rule
  const violationsByRule = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = violationsByRule.get(v.rule) || [];
    list.push(v);
    violationsByRule.set(v.rule, list);
  }

  // Apply fix patterns
  for (const pattern of FIX_PATTERNS) {
    // Check if we should skip this rule
    if (config.skipRules?.includes(pattern.rule)) continue;
    if (config.fixRules && !config.fixRules.includes(pattern.rule)) continue;

    // Check if we have violations for this rule
    if (!violationsByRule.has(pattern.rule)) continue;

    // Apply the fix
    const before = corrected;
    if (typeof pattern.replacement === 'string') {
      corrected = corrected.replace(pattern.pattern, pattern.replacement);
    } else {
      corrected = corrected.replace(pattern.pattern, pattern.replacement);
    }

    if (before !== corrected) {
      // Find affected lines
      const affectedViolations = violationsByRule.get(pattern.rule) || [];
      for (const v of affectedViolations) {
        appliedFixes.push({
          rule: pattern.rule,
          line: v.line,
          description: pattern.description,
          before: before.split('\n')[v.line - 1] || '',
          after: corrected.split('\n')[v.line - 1] || '',
        });
      }
    }
  }

  // Add missing imports
  const neededImports = new Set<string>();
  for (const [exceptionName, importStatement] of Object.entries(IMPORT_FIXES)) {
    if (corrected.includes(exceptionName) && !corrected.includes(importStatement)) {
      // Check if there's already an import from @nestjs/common
      const existingImport = corrected.match(/import\s*{([^}]+)}\s*from\s*['"]@nestjs\/common['"]/);
      if (existingImport) {
        // Add to existing import
        const imports = existingImport[1].split(',').map(s => s.trim());
        if (!imports.includes(exceptionName)) {
          imports.push(exceptionName);
          corrected = corrected.replace(
            existingImport[0],
            `import { ${imports.join(', ')} } from '@nestjs/common'`
          );
          appliedFixes.push({
            rule: 'INV-IMPORT',
            line: 1,
            description: `Add ${exceptionName} to existing import`,
            before: existingImport[0],
            after: `import { ${imports.join(', ')} } from '@nestjs/common'`,
          });
        }
      } else {
        neededImports.add(importStatement);
      }
    }
  }

  // Add new import statements at the top
  if (neededImports.size > 0) {
    const importBlock = Array.from(neededImports).join('\n') + '\n';
    corrected = importBlock + corrected;
    appliedFixes.push({
      rule: 'INV-IMPORT',
      line: 1,
      description: 'Add missing imports',
      before: '',
      after: importBlock.trim(),
    });
  }

  // Check for remaining violations
  const ctx: ValidationContext = {
    files: ['corrected.ts'],
    fileContents: new Map([['corrected.ts', corrected]]),
  };

  // Run all validators
  for (const validator of Object.values(validators)) {
    const result = validator(ctx);
    remainingViolations.push(...result.violations);
  }

  return {
    original: content,
    corrected,
    appliedFixes,
    remainingViolations,
  };
}

// ============================================================================
// SELF-CORRECTION LOOP
// ============================================================================

export interface CorrectionLoopResult {
  iterations: number;
  initialViolations: number;
  finalViolations: number;
  correctionHistory: CorrectionResult[];
  finalContent: string;
  success: boolean;
}

export function runCorrectionLoop(
  content: string,
  config: CorrectionConfig = { maxIterations: 3, autoFix: true }
): CorrectionLoopResult {
  let currentContent = content;
  const correctionHistory: CorrectionResult[] = [];
  let iterations = 0;

  // Get initial violations
  const ctx: ValidationContext = {
    files: ['file.ts'],
    fileContents: new Map([['file.ts', content]]),
  };

  let allViolations: Violation[] = [];
  for (const validator of Object.values(validators)) {
    const result = validator(ctx);
    allViolations.push(...result.violations);
  }

  const initialViolations = allViolations.length;

  // Correction loop
  while (iterations < config.maxIterations && allViolations.length > 0) {
    iterations++;

    const result = applyFixes(currentContent, allViolations, config);
    correctionHistory.push(result);

    if (result.appliedFixes.length === 0) {
      // No fixes were applied, can't improve further
      break;
    }

    currentContent = result.corrected;
    allViolations = result.remainingViolations;
  }

  return {
    iterations,
    initialViolations,
    finalViolations: allViolations.length,
    correctionHistory,
    finalContent: currentContent,
    success: allViolations.length === 0,
  };
}

// ============================================================================
// SUGGESTION GENERATOR
// ============================================================================

export interface Suggestion {
  rule: string;
  message: string;
  codeExample?: string;
}

export function generateSuggestions(violations: Violation[]): Suggestion[] {
  const suggestions: Suggestion[] = [];

  for (const v of violations) {
    switch (v.rule) {
      case 'INV-ERROR-TYPE':
        suggestions.push({
          rule: v.rule,
          message: 'Use NestJS exceptions for proper HTTP status codes',
          codeExample: `
// Instead of:
throw new Error('Not found');

// Use:
throw new NotFoundException('Resource not found');
throw new BadRequestException('Invalid input');
throw new ForbiddenException('Access denied');
          `.trim(),
        });
        break;

      case 'INV-PRISMA-SOFT-DELETE':
        suggestions.push({
          rule: v.rule,
          message: 'Add deleted_at: null filter to exclude soft-deleted records',
          codeExample: `
const records = await this.prisma.${v.message.match(/on (\w+)/)?.[1] || 'model'}.findMany({
  where: {
    organization_id: orgId,
    deleted_at: null,  // Add this
  },
});
          `.trim(),
        });
        break;

      case 'INV-PRISMA-ORDERBY':
        suggestions.push({
          rule: v.rule,
          message: 'Add orderBy to ensure deterministic query results',
          codeExample: `
const records = await this.prisma.model.findMany({
  where: { ... },
  orderBy: { created_at: 'desc' },  // Add this
});
          `.trim(),
        });
        break;

      case 'INV-PRISMA-TRANSACTION':
        suggestions.push({
          rule: v.rule,
          message: 'Wrap multi-table writes in a transaction',
          codeExample: `
await this.prisma.$transaction(async (tx) => {
  const parent = await tx.parents.create({ data: parentData });
  await tx.children.create({ data: { parent_id: parent.id } });
  return parent;
});
          `.trim(),
        });
        break;

      case 'INV-API-GUARD':
        suggestions.push({
          rule: v.rule,
          message: 'Add authorization guards to mutation endpoints',
          codeExample: `
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
@Post()
async create(@Body() dto: CreateDto) { ... }
          `.trim(),
        });
        break;

      case 'INV-PRISMA-N+1':
        suggestions.push({
          rule: v.rule,
          message: 'Use batch queries instead of queries in loops',
          codeExample: `
// Instead of:
for (const id of ids) {
  const record = await prisma.model.findFirst({ where: { id } });
}

// Use:
const records = await prisma.model.findMany({
  where: { id: { in: ids } },
});
          `.trim(),
        });
        break;

      default:
        if (v.fix) {
          suggestions.push({
            rule: v.rule,
            message: v.fix,
          });
        }
    }
  }

  // Deduplicate suggestions by rule
  const seen = new Set<string>();
  return suggestions.filter(s => {
    if (seen.has(s.rule)) return false;
    seen.add(s.rule);
    return true;
  });
}

// ============================================================================
// CLI
// ============================================================================

export function runCorrectionCLI(args: string[]) {
  const config: CorrectionConfig = {
    maxIterations: 3,
    autoFix: true,
  };

  let inputFile: string | undefined;
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-iterations':
        config.maxIterations = parseInt(args[++i], 10);
        break;
      case '--fix-rules':
        config.fixRules = args[++i].split(',');
        break;
      case '--skip-rules':
        config.skipRules = args[++i].split(',');
        break;
      case '--output':
      case '-o':
        outputFile = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
SOP Self-Correction Tool

Usage: npx ts-node validation/self-correction.ts [options] <input-file>

Options:
  --max-iterations <n>   Maximum correction iterations (default: 3)
  --fix-rules <rules>    Comma-separated list of rules to fix
  --skip-rules <rules>   Comma-separated list of rules to skip
  -o, --output <file>    Output file for corrected code
  -h, --help             Show this help

Examples:
  npx ts-node validation/self-correction.ts src/service.ts
  npx ts-node validation/self-correction.ts --fix-rules INV-ERROR-TYPE src/service.ts
  npx ts-node validation/self-correction.ts -o fixed.ts src/broken.ts
        `);
        process.exit(0);
      default:
        if (!args[i].startsWith('-')) {
          inputFile = args[i];
        }
    }
  }

  if (!inputFile) {
    console.error('Error: Input file required');
    process.exit(1);
  }

  const fs = require('fs');
  const content = fs.readFileSync(inputFile, 'utf-8');

  console.log('Running self-correction loop...\n');

  const result = runCorrectionLoop(content, config);

  console.log(`Iterations: ${result.iterations}`);
  console.log(`Initial violations: ${result.initialViolations}`);
  console.log(`Final violations: ${result.finalViolations}`);
  console.log(`Success: ${result.success ? 'Yes' : 'No'}\n`);

  if (result.correctionHistory.length > 0) {
    console.log('Applied fixes:');
    for (const correction of result.correctionHistory) {
      for (const fix of correction.appliedFixes) {
        console.log(`  - ${fix.description} (line ${fix.line})`);
      }
    }
  }

  if (result.finalViolations > 0) {
    console.log('\nRemaining violations require manual review:');
    const lastCorrection = result.correctionHistory[result.correctionHistory.length - 1];
    if (lastCorrection) {
      for (const v of lastCorrection.remainingViolations) {
        console.log(`  - ${v.rule}: ${v.message}`);
      }
    }

    const suggestions = generateSuggestions(
      lastCorrection?.remainingViolations || []
    );
    if (suggestions.length > 0) {
      console.log('\nSuggestions:');
      for (const s of suggestions) {
        console.log(`\n[${s.rule}] ${s.message}`);
        if (s.codeExample) {
          console.log(s.codeExample);
        }
      }
    }
  }

  if (outputFile) {
    fs.writeFileSync(outputFile, result.finalContent);
    console.log(`\nCorrected code written to: ${outputFile}`);
  }

  process.exit(result.success ? 0 : 1);
}

if (require.main === module) {
  runCorrectionCLI(process.argv.slice(2));
}
