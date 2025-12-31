/**
 * SOP Validators - Core validation functions for each SOP file
 *
 * These validators check code changes against the rules defined in SOP files.
 * Each validator returns a ValidationResult with score, violations, and suggestions.
 */

import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface ValidationResult {
  sopFile: string;
  metric: string;
  score: number;
  passed: boolean;
  violations: Violation[];
  warnings: Warning[];
  suggestions: string[];
}

export interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  fix?: string;
}

export interface Warning {
  file: string;
  line: number;
  rule: string;
  message: string;
}

export interface ValidationContext {
  files: string[];
  fileContents: Map<string, string>;
  changedLines?: Map<string, number[]>;
}

export interface ValidatorConfig {
  sopFiles: string[];
  thresholds: {
    blockMerge: number;
    warn: number;
  };
  metrics: MetricConfig[];
}

export interface MetricConfig {
  name: string;
  weight: number;
  blockOnFail: boolean;
  sopFile: string;
}

// ============================================================================
// 2-SUPABASE VALIDATORS
// ============================================================================

export function validateSupabaseAuth(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for decode-only JWT handling
      if (/jwt\.decode\(|decodeJwt\(/.test(line) && !/verify/.test(line)) {
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-SUPABASE-1',
          message: 'Decode-only JWT handling detected. Must use JWKS validation.',
          severity: 'critical',
          fix: 'Replace with Supabase JWKS verification',
        });
      }

      // Check for JWT/token logging
      if (/logger\.(log|debug|error|warn)\(.*token/i.test(line) ||
          /console\.(log|debug|error|warn)\(.*jwt/i.test(line)) {
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-SUPABASE-8',
          message: 'Potential JWT/token logging detected.',
          severity: 'critical',
          fix: 'Remove token from log statement',
        });
      }

      // Check for service-role key usage
      if (/service.?role.?key/i.test(line) && /client/i.test(file)) {
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-SUPABASE-1',
          message: 'Service-role key may be exposed client-side.',
          severity: 'critical',
        });
      }
    });

    // Check guard order in controllers
    if (file.endsWith('.controller.ts')) {
      const guardMatches = content.matchAll(/@UseGuards\(([^)]+)\)/g);
      for (const match of guardMatches) {
        const guards = match[1];
        // Check if JwtAuthGuard comes first when present
        if (guards.includes('RolesGuard') || guards.includes('PermissionsGuard')) {
          if (!guards.includes('JwtAuthGuard') && !content.includes('@UseGuards(JwtAuthGuard)')) {
            warnings.push({
              file,
              line: content.substring(0, match.index).split('\n').length,
              rule: 'INV-SUPABASE-2',
              message: 'RolesGuard/PermissionsGuard used without explicit JwtAuthGuard.',
            });
          }
        }
      }
    }
  }

  const score = violations.length === 0 ? 1.0 : Math.max(0, 1 - (violations.length * 0.2));

  return {
    sopFile: '2-supabase',
    metric: 'supabase-auth-compliance',
    score,
    passed: violations.filter(v => v.severity === 'critical').length === 0,
    violations,
    warnings,
    suggestions,
  };
}

export function validateTenantIsolation(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  const softDeleteEntities = [
    'organizations',
    'organization_users',
    'organization_roles',
    'teams',
    'rubrics',
    'role_plays',
    'tracks',
  ];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for Prisma queries without organization_id
      const prismaQueryMatch = line.match(/prisma\.(\w+)\.(findMany|findFirst|findUnique|count|aggregate)/);
      if (prismaQueryMatch) {
        const entity = prismaQueryMatch[1];

        // Look ahead for where clause
        let whereBlock = '';
        for (let i = index; i < Math.min(index + 10, lines.length); i++) {
          whereBlock += lines[i];
          if (lines[i].includes('});') || lines[i].includes(')];')) break;
        }

        // Check if organization_id is in where clause
        if (!whereBlock.includes('organization_id') &&
            !whereBlock.includes('org_id') &&
            entity !== 'internal_users' &&
            entity !== 'evaluation_model_configs') {
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-SUPABASE-4',
            message: `Query on ${entity} may be missing organization_id filter.`,
          });
        }

        // Check soft delete filter
        if (softDeleteEntities.some(e => entity.includes(e))) {
          if (!whereBlock.includes('deleted_at')) {
            violations.push({
              file,
              line: lineNum,
              rule: 'INV-PRISMA-SOFT-DELETE',
              message: `Query on ${entity} missing deleted_at: null filter.`,
              severity: 'high',
              fix: 'Add deleted_at: null to where clause',
            });
          }
        }
      }

      // Check cache keys for org/team isolation
      if (/cache\.(get|set|del)\(/.test(line) || /cacheManager\.(get|set|del)\(/.test(line)) {
        const keyMatch = line.match(/['"]([\w:]+)['"]/);
        if (keyMatch && !keyMatch[1].includes('org') && !keyMatch[1].includes('${')) {
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-SUPABASE-6',
            message: 'Cache key may not include organization context.',
          });
        }
      }
    });
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const highViolations = violations.filter(v => v.severity === 'high').length;
  const score = Math.max(0, 1 - (criticalViolations * 0.3) - (highViolations * 0.15));

  return {
    sopFile: '2-supabase',
    metric: 'tenant-isolation',
    score,
    passed: criticalViolations === 0 && highViolations === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 3-DATABASE-PRISMA VALIDATORS
// ============================================================================

export function validatePrismaQueries(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for findMany without orderBy
      if (/\.findMany\(/.test(line)) {
        let queryBlock = '';
        for (let i = index; i < Math.min(index + 15, lines.length); i++) {
          queryBlock += lines[i];
          if (lines[i].includes('});')) break;
        }

        if (!queryBlock.includes('orderBy')) {
          violations.push({
            file,
            line: lineNum,
            rule: 'INV-PRISMA-ORDERBY',
            message: 'findMany query missing orderBy clause.',
            severity: 'medium',
            fix: 'Add orderBy: { created_at: "desc" } or appropriate field',
          });
        }

        // Check for pagination
        if (!queryBlock.includes('take') && !queryBlock.includes('skip')) {
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-PRISMA-PAGINATION',
            message: 'findMany query may need pagination (take/skip).',
          });
        }
      }

      // Check for N+1 pattern (query in loop)
      if (/for\s*\(|\.forEach\(|\.map\(/.test(line)) {
        let loopBlock = '';
        let braceCount = 0;
        let started = false;
        for (let i = index; i < Math.min(index + 30, lines.length); i++) {
          loopBlock += lines[i];
          if (lines[i].includes('{')) { started = true; braceCount++; }
          if (lines[i].includes('}')) braceCount--;
          if (started && braceCount === 0) break;
        }

        if (/await\s+.*prisma\.\w+\.(findFirst|findUnique|findMany|count)/.test(loopBlock)) {
          violations.push({
            file,
            line: lineNum,
            rule: 'INV-PRISMA-N+1',
            message: 'Potential N+1 query detected: Prisma query inside loop.',
            severity: 'high',
            fix: 'Use batch query with { in: [...ids] } before the loop',
          });
        }
      }

      // Check for count using findMany().length
      if (/\.findMany\([^)]*\)\.length/.test(line) || /\.length\s*$/.test(line)) {
        const prevLines = lines.slice(Math.max(0, index - 5), index + 1).join('\n');
        if (/findMany/.test(prevLines) && /\.length/.test(line)) {
          violations.push({
            file,
            line: lineNum,
            rule: 'INV-PRISMA-COUNT',
            message: 'Using findMany().length instead of count() for totals.',
            severity: 'medium',
            fix: 'Use prisma.model.count({ where }) instead',
          });
        }
      }

      // Check for include vs select preference
      if (/include:\s*{/.test(line)) {
        const nextLines = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
        const includeCount = (nextLines.match(/:\s*true/g) || []).length;
        if (includeCount === 1) {
          suggestions.push(`${file}:${lineNum} - Consider using select instead of include for single relation`);
        }
      }
    });

    // Check for hard deletes on soft-delete entities
    const hardDeleteMatch = content.match(/prisma\.(organizations|teams|rubrics|role_plays)\.delete\(/);
    if (hardDeleteMatch) {
      violations.push({
        file,
        line: content.substring(0, hardDeleteMatch.index).split('\n').length,
        rule: 'INV-PRISMA-SOFT-DELETE',
        message: `Hard delete on ${hardDeleteMatch[1]} - use soft delete (deleted_at).`,
        severity: 'critical',
      });
    }
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const highViolations = violations.filter(v => v.severity === 'high').length;
  const mediumViolations = violations.filter(v => v.severity === 'medium').length;
  const score = Math.max(0, 1 - (criticalViolations * 0.3) - (highViolations * 0.15) - (mediumViolations * 0.05));

  return {
    sopFile: '3-database-prisma',
    metric: 'prisma-query-compliance',
    score,
    passed: criticalViolations === 0 && highViolations === 0,
    violations,
    warnings,
    suggestions,
  };
}

export function validateTransactions(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    // Find functions with multiple prisma mutations
    const functionMatches = content.matchAll(/async\s+(\w+)\s*\([^)]*\)\s*(?::\s*[^{]+)?\s*{/g);

    for (const funcMatch of functionMatches) {
      const funcName = funcMatch[1];
      const funcStart = funcMatch.index!;

      // Find function body
      let braceCount = 0;
      let started = false;
      let funcEnd = funcStart;
      for (let i = funcStart; i < content.length; i++) {
        if (content[i] === '{') { started = true; braceCount++; }
        if (content[i] === '}') braceCount--;
        if (started && braceCount === 0) { funcEnd = i; break; }
      }

      const funcBody = content.substring(funcStart, funcEnd);

      // Count distinct table mutations
      const createMatches = [...funcBody.matchAll(/prisma\.(\w+)\.create\(/g)];
      const updateMatches = [...funcBody.matchAll(/prisma\.(\w+)\.update\(/g)];
      const deleteMatches = [...funcBody.matchAll(/prisma\.(\w+)\.delete\(/g)];

      const allMutations = [...createMatches, ...updateMatches, ...deleteMatches];
      const uniqueTables = new Set(allMutations.map(m => m[1]));

      if (uniqueTables.size > 1 && !funcBody.includes('$transaction')) {
        violations.push({
          file,
          line: content.substring(0, funcStart).split('\n').length,
          rule: 'INV-PRISMA-TRANSACTION',
          message: `Function ${funcName} has multi-table mutations without $transaction.`,
          severity: 'high',
          fix: 'Wrap related writes in prisma.$transaction(async (tx) => { ... })',
        });
      }
    }
  }

  const score = violations.length === 0 ? 1.0 : Math.max(0, 1 - (violations.length * 0.2));

  return {
    sopFile: '3-database-prisma',
    metric: 'transaction-compliance',
    score,
    passed: violations.length === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 4-CODE-SAFETY-PATTERNS VALIDATORS
// ============================================================================

export function validateCodeSafetyPatterns(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for status updates with 'complete' before actual operation
      if (/step:\s*['"][\w_]*complete['"]/.test(line) || /status.*complete/i.test(line)) {
        // Look back to see if operation happened
        const prevLines = lines.slice(Math.max(0, index - 10), index).join('\n');
        if (/updateStatus|setStatus|progress/.test(prevLines)) {
          // Check if actual operation is AFTER this status update
          const nextLines = lines.slice(index + 1, Math.min(index + 10, lines.length)).join('\n');
          if (/await\s+this\.\w+\(|fetch|prisma\./.test(nextLines)) {
            warnings.push({
              file,
              line: lineNum,
              rule: 'INV-STATUS-ACCURACY',
              message: 'Status set to "complete" before operation may have finished.',
            });
          }
        }
      }

      // Check for closure variable capture issues
      if (/retryOperation\(|setTimeout\(|setInterval\(|\)\s*=>\s*{/.test(line)) {
        // Look for variables that were null-checked before
        const prevLines = lines.slice(Math.max(0, index - 15), index).join('\n');
        const nullChecks = prevLines.match(/if\s*\(\s*!(\w+)\s*\)/g);
        if (nullChecks) {
          const closureBody = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
          for (const check of nullChecks) {
            const varName = check.match(/!(\w+)/)?.[1];
            if (varName && closureBody.includes(varName + '.')) {
              suggestions.push(
                `${file}:${lineNum} - Variable '${varName}' used in closure after null check. Consider capturing value before closure.`
              );
            }
          }
        }
      }
    });
  }

  const score = violations.length === 0 ? 1.0 : Math.max(0, 1 - (violations.length * 0.15));

  return {
    sopFile: '4-code-safety-patterns',
    metric: 'code-safety-compliance',
    score,
    passed: violations.filter(v => v.severity === 'critical').length === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 5-ERROR-HANDLING-LOGGING VALIDATORS
// ============================================================================

export function validateExceptionTypes(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  const nestExceptions = [
    'NotFoundException',
    'BadRequestException',
    'ForbiddenException',
    'UnauthorizedException',
    'ConflictException',
    'UnprocessableEntityException',
    'InternalServerErrorException',
    'BadGatewayException',
    'ServiceUnavailableException',
  ];

  let nestExceptionCount = 0;
  let genericErrorCount = 0;

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for generic Error throws
      if (/throw\s+new\s+Error\(/.test(line)) {
        genericErrorCount++;
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-ERROR-TYPE',
          message: 'Using generic Error instead of NestJS exception.',
          severity: 'medium',
          fix: 'Use NotFoundException, BadRequestException, etc.',
        });
      }

      // Count NestJS exceptions
      if (nestExceptions.some(ex => line.includes(`throw new ${ex}`))) {
        nestExceptionCount++;
      }

      // Check for console.log usage
      if (/console\.(log|debug|error|warn|info)\(/.test(line)) {
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-LOGGER',
          message: 'Using console.* instead of NestJS Logger.',
          severity: 'medium',
          fix: 'Use this.logger.log/error/warn/debug',
        });
      }

      // Check for sensitive data in logs
      if (/logger\.(log|debug|error|warn)\(/.test(line)) {
        if (/password|secret|token|apiKey|api_key|jwt/i.test(line)) {
          violations.push({
            file,
            line: lineNum,
            rule: 'INV-LOG-SENSITIVE',
            message: 'Potential sensitive data in log statement.',
            severity: 'critical',
          });
        }
      }

      // Check for error context preservation
      if (/catch\s*\(\s*(\w+)\s*\)/.test(line)) {
        const catchBlock = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
        if (/throw\s+new\s+\w+Exception\(/.test(catchBlock)) {
          if (!catchBlock.includes('.message') && !catchBlock.includes('.stack')) {
            warnings.push({
              file,
              line: lineNum,
              rule: 'INV-ERROR-CONTEXT',
              message: 'Rethrowing exception may lose original error context.',
            });
          }
        }
      }
    });
  }

  const totalThrows = nestExceptionCount + genericErrorCount;
  const score = totalThrows === 0 ? 1.0 : nestExceptionCount / totalThrows;

  return {
    sopFile: '5-error-handling-logging',
    metric: 'exception-type-compliance',
    score,
    passed: score >= 0.9,
    violations,
    warnings,
    suggestions,
  };
}

export function validateLogging(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    // Check for Logger initialization in services
    if (file.endsWith('.service.ts')) {
      if (!content.includes('private readonly logger = new Logger(') &&
          !content.includes('private logger = new Logger(')) {
        if (content.includes('this.logger')) {
          violations.push({
            file,
            line: 1,
            rule: 'INV-LOGGER-INIT',
            message: 'Service uses this.logger but Logger is not properly initialized.',
            severity: 'medium',
          });
        }
      }
    }

    const lines = content.split('\n');
    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for log statements without context
      if (/this\.logger\.(log|error|warn)\(['"][\w\s]+['"]\s*\)/.test(line)) {
        if (!line.includes('${') && !line.includes('+ ') && !line.includes(', {')) {
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-LOG-CONTEXT',
            message: 'Log statement may be missing context (entity IDs, etc.).',
          });
        }
      }

      // Check for hardcoded secrets
      if (/['"]sk-[a-zA-Z0-9]+['"]/.test(line) ||
          /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/.test(line)) {
        violations.push({
          file,
          line: lineNum,
          rule: 'INV-HARDCODED-SECRET',
          message: 'Potential hardcoded secret detected.',
          severity: 'critical',
        });
      }

      // Check for missing env variable validation
      if (/process\.env\.(\w+)/.test(line)) {
        const envVar = line.match(/process\.env\.(\w+)/)?.[1];
        const nextLines = lines.slice(index, Math.min(index + 5, lines.length)).join('\n');
        if (!nextLines.includes('if (!' + envVar) && !nextLines.includes('?? ') && !nextLines.includes('|| ')) {
          suggestions.push(
            `${file}:${lineNum} - Environment variable ${envVar} used without validation.`
          );
        }
      }
    });
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const score = criticalViolations === 0 ? 1.0 : Math.max(0, 1 - (criticalViolations * 0.3));

  return {
    sopFile: '5-error-handling-logging',
    metric: 'logging-compliance',
    score,
    passed: criticalViolations === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 6-EXTERNAL-SERVICES-TIMING VALIDATORS
// ============================================================================

export function validateExternalServicePatterns(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for external API calls without retry logic
      if (/httpService\.(get|post|put|patch|delete)\(|axios\.(get|post|put|patch|delete)\(|fetch\(/.test(line)) {
        const funcBody = lines.slice(Math.max(0, index - 30), index + 30).join('\n');
        if (!funcBody.includes('retry') && !funcBody.includes('attempt')) {
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-EXTERNAL-RETRY',
            message: 'External API call may need retry logic.',
          });
        }
      }

      // Check for explicit delays (last resort)
      if (/await\s+new\s+Promise.*setTimeout/.test(line) || /await\s+sleep\(/.test(line)) {
        suggestions.push(
          `${file}:${lineNum} - Explicit delay detected. Consider deferring operation or using retry instead.`
        );
      }

      // Check for external errors exposed to user
      if (/catch\s*\([^)]+\)/.test(line)) {
        const catchBlock = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');
        if (/throw\s+new\s+\w+Exception\([^)]*error\./.test(catchBlock) ||
            /throw\s+new\s+\w+Exception\([^)]*\.message/.test(catchBlock)) {
          const nextLines = lines.slice(index, Math.min(index + 5, lines.length)).join('\n');
          if (nextLines.includes('external') || nextLines.includes('http') || nextLines.includes('api')) {
            warnings.push({
              file,
              line: lineNum,
              rule: 'INV-EXTERNAL-ERROR-EXPOSE',
              message: 'External service error may be exposed to user.',
            });
          }
        }
      }
    });
  }

  const score = 1.0 - (violations.length * 0.2) - (warnings.length * 0.05);

  return {
    sopFile: '6-external-services-timing',
    metric: 'external-service-compliance',
    score: Math.max(0, score),
    passed: violations.length === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 7-QUEUE-JOB-PROCESSING VALIDATORS
// ============================================================================

export function validateJobProcessing(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    // Check processor files
    if (file.includes('processor') || file.includes('consumer')) {
      const lines = content.split('\n');

      // Check for idempotency
      if (content.includes('async process(') || content.includes('async execute(')) {
        // Look for idempotency check pattern
        if (!content.includes('already') &&
            !content.includes('processed') &&
            !content.includes('idempotent') &&
            !content.includes('skip')) {

          // Check if it has side effects
          if (content.includes('sendEmail') ||
              content.includes('notify') ||
              content.includes('webhook') ||
              content.includes('create(')) {
            warnings.push({
              file,
              line: 1,
              rule: 'INV-JOB-IDEMPOTENT',
              message: 'Job processor with side effects may need idempotency check.',
            });
          }
        }
      }

      // Check for tenant context in job data
      lines.forEach((line, index) => {
        const lineNum = index + 1;

        if (/Job<[^>]+>/.test(line) || /interface.*JobData/.test(line)) {
          const typeBlock = lines.slice(index, Math.min(index + 15, lines.length)).join('\n');
          if (!typeBlock.includes('organizationId') && !typeBlock.includes('organization_id')) {
            warnings.push({
              file,
              line: lineNum,
              rule: 'INV-JOB-TENANT',
              message: 'Job data type may be missing organizationId.',
            });
          }
        }
      });

      // Check for proper logging
      if (!content.includes('this.logger.log') && !content.includes('this.logger.error')) {
        warnings.push({
          file,
          line: 1,
          rule: 'INV-JOB-LOGGING',
          message: 'Job processor may be missing logging.',
        });
      }
    }

    // Check job producers
    if (content.includes('addJob') || content.includes('add(')) {
      const lines = content.split('\n');

      lines.forEach((line, index) => {
        if (/\.add\(|\.addJob\(/.test(line)) {
          const jobCall = lines.slice(index, Math.min(index + 10, lines.length)).join('\n');

          // Check for retry configuration
          if (!jobCall.includes('attempts') && !jobCall.includes('backoff')) {
            suggestions.push(
              `${file}:${index + 1} - Job added without explicit retry configuration.`
            );
          }
        }
      });
    }
  }

  const score = 1.0 - (violations.length * 0.2) - (warnings.length * 0.1);

  return {
    sopFile: '7-queue-job-processing',
    metric: 'job-processing-compliance',
    score: Math.max(0, score),
    passed: violations.length === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 8-API-DESIGN-PATTERNS VALIDATORS
// ============================================================================

export function validateApiDesign(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    // Check controllers
    if (file.endsWith('.controller.ts')) {
      // Check for API documentation
      if (!content.includes('@ApiTags')) {
        warnings.push({
          file,
          line: 1,
          rule: 'INV-API-DOCS',
          message: 'Controller missing @ApiTags decorator.',
        });
      }

      lines.forEach((line, index) => {
        const lineNum = index + 1;

        // Check for guards on mutation endpoints
        if (/@(Post|Put|Patch|Delete)\(/.test(line)) {
          const methodBlock = lines.slice(Math.max(0, index - 5), index + 1).join('\n');
          if (!methodBlock.includes('@UseGuards') && !content.includes('@UseGuards(')) {
            violations.push({
              file,
              line: lineNum,
              rule: 'INV-API-GUARD',
              message: 'Mutation endpoint missing @UseGuards decorator.',
              severity: 'critical',
            });
          }
        }

        // Check for @ApiOperation on endpoints
        if (/@(Get|Post|Put|Patch|Delete)\(/.test(line)) {
          const methodBlock = lines.slice(Math.max(0, index - 3), index + 1).join('\n');
          if (!methodBlock.includes('@ApiOperation')) {
            suggestions.push(
              `${file}:${lineNum} - Endpoint missing @ApiOperation documentation.`
            );
          }
        }
      });
    }

    // Check DTOs
    if (file.includes('/dto/')) {
      lines.forEach((line, index) => {
        const lineNum = index + 1;

        // Check for validation decorators
        if (/^\s+\w+\s*:\s*(string|number|boolean)/.test(line) && !line.includes('?')) {
          const prevLines = lines.slice(Math.max(0, index - 3), index).join('\n');
          if (!prevLines.includes('@Is') && !prevLines.includes('@Valid')) {
            warnings.push({
              file,
              line: lineNum,
              rule: 'INV-DTO-VALIDATION',
              message: 'Required field may be missing validation decorator.',
            });
          }
        }
      });
    }
  }

  const criticalViolations = violations.filter(v => v.severity === 'critical').length;
  const score = criticalViolations === 0 ? 1.0 : Math.max(0, 1 - (criticalViolations * 0.25));

  return {
    sopFile: '8-api-design-patterns',
    metric: 'api-design-compliance',
    score,
    passed: criticalViolations === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// 9-TESTING-CODE-QUALITY VALIDATORS
// ============================================================================

export function validateCodeQuality(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  for (const [file, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Check for TODO/FIXME
      if (/\/\/\s*(TODO|FIXME|HACK|XXX)/i.test(line)) {
        warnings.push({
          file,
          line: lineNum,
          rule: 'INV-TODO',
          message: 'Unresolved TODO/FIXME comment.',
        });
      }

      // Check for any type
      if (/:\s*any\s*[;,=)]/.test(line) || /as\s+any/.test(line)) {
        warnings.push({
          file,
          line: lineNum,
          rule: 'INV-ANY-TYPE',
          message: 'Usage of "any" type reduces type safety.',
        });
      }

      // Check for commented-out code
      if (/^\s*\/\/\s*(await|return|const|let|var|if|for|while)\s/.test(line)) {
        suggestions.push(
          `${file}:${lineNum} - Commented-out code detected. Consider removing.`
        );
      }

      // Check for magic numbers
      if (/[^a-zA-Z0-9_](1000|2000|3000|5000|10000|60000|86400)\s*[),;]/.test(line)) {
        if (!line.includes('const') && !line.includes('//')) {
          suggestions.push(
            `${file}:${lineNum} - Magic number detected. Consider extracting to named constant.`
          );
        }
      }
    });

    // Check for testability issues
    if (file.endsWith('.service.ts')) {
      // Check for new Date() without injection
      if (content.includes('new Date()') && !content.includes('Date = new Date')) {
        suggestions.push(
          `${file} - Using new Date() directly may make testing harder. Consider injectable time service.`
        );
      }
    }
  }

  const score = 1.0 - (violations.length * 0.1) - (warnings.length * 0.02);

  return {
    sopFile: '9-testing-code-quality',
    metric: 'code-quality',
    score: Math.max(0, score),
    passed: violations.length === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// AUDIT LOG VALIDATOR
// ============================================================================

export function validateAuditLogging(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  const criticalEntities = ['organizations', 'role_plays', 'assessments', 'users', 'rubrics'];

  for (const [file, content] of ctx.fileContents) {
    if (!file.endsWith('.service.ts')) continue;

    for (const entity of criticalEntities) {
      // Check for create operations
      const createPattern = new RegExp(`prisma\\.${entity}\\.create\\(`, 'g');
      const createMatches = [...content.matchAll(createPattern)];

      for (const match of createMatches) {
        const funcStart = content.lastIndexOf('async ', match.index);
        const funcEnd = content.indexOf('}', match.index! + 100);
        const funcBody = content.substring(funcStart, funcEnd);

        if (!funcBody.includes('auditLogsService') && !funcBody.includes('audit')) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-AUDIT-LOG',
            message: `Create operation on ${entity} may be missing audit log.`,
          });
        }
      }

      // Check for update operations
      const updatePattern = new RegExp(`prisma\\.${entity}\\.update\\(`, 'g');
      const updateMatches = [...content.matchAll(updatePattern)];

      for (const match of updateMatches) {
        const funcStart = content.lastIndexOf('async ', match.index);
        const funcEnd = content.indexOf('}', match.index! + 100);
        const funcBody = content.substring(funcStart, funcEnd);

        if (!funcBody.includes('auditLogsService') && !funcBody.includes('audit')) {
          const lineNum = content.substring(0, match.index).split('\n').length;
          warnings.push({
            file,
            line: lineNum,
            rule: 'INV-AUDIT-LOG',
            message: `Update operation on ${entity} may be missing audit log.`,
          });
        }
      }
    }
  }

  const score = warnings.length === 0 ? 1.0 : Math.max(0, 1 - (warnings.length * 0.1));

  return {
    sopFile: '2-supabase', // Audit rules are in supabase SOP
    metric: 'audit-log-coverage',
    score,
    passed: true, // Audit log is a warning, not a blocker
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export const validators = {
  // 2-supabase
  'supabase-auth': validateSupabaseAuth,
  'tenant-isolation': validateTenantIsolation,
  'audit-logging': validateAuditLogging,

  // 3-database-prisma
  'prisma-queries': validatePrismaQueries,
  'transactions': validateTransactions,

  // 4-code-safety-patterns
  'code-safety': validateCodeSafetyPatterns,

  // 5-error-handling-logging
  'exception-types': validateExceptionTypes,
  'logging': validateLogging,

  // 6-external-services-timing
  'external-services': validateExternalServicePatterns,

  // 7-queue-job-processing
  'job-processing': validateJobProcessing,

  // 8-api-design-patterns
  'api-design': validateApiDesign,

  // 9-testing-code-quality
  'code-quality': validateCodeQuality,

  // General best practices (imported from general-practices-validator.ts)
  // This is added dynamically - see runner.ts
};

export type ValidatorName = keyof typeof validators;
