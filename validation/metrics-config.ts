/**
 * SOP Metrics Configuration
 *
 * Centralized configuration for validation metrics, thresholds, and gating rules.
 * Based on the Backend Code Evaluation Metrics specification.
 */

import { ValidatorName } from './validators';

// ============================================================================
// METRIC DEFINITIONS
// ============================================================================

export interface MetricDefinition {
  name: ValidatorName;
  displayName: string;
  description: string;
  sopFile: string;
  weight: number;
  blockOnFail: boolean;
  thresholds: {
    pass: number;
    warn: number;
    fail: number;
  };
  invariants: string[];
}

export const METRIC_DEFINITIONS: MetricDefinition[] = [
  // ============================================================================
  // 2-SUPABASE METRICS
  // ============================================================================
  {
    name: 'supabase-auth',
    displayName: 'Supabase Auth Compliance',
    description: 'JWT validation, guard chains, token security',
    sopFile: '2-supabase',
    weight: 0.15,
    blockOnFail: true,
    thresholds: { pass: 1.0, warn: 0.95, fail: 0.9 },
    invariants: [
      'INV-SUPABASE-1: JWKS validation required, no decode-only',
      'INV-SUPABASE-2: Guard chain order (JwtAuthGuard → RolesGuard/PermissionsGuard → OrgScopeGuard)',
      'INV-SUPABASE-8: Never log JWTs, claims, or sensitive data',
    ],
  },
  {
    name: 'tenant-isolation',
    displayName: 'Tenant Isolation',
    description: 'Organization scoping, cache isolation, cross-tenant prevention',
    sopFile: '2-supabase',
    weight: 0.15,
    blockOnFail: true,
    thresholds: { pass: 1.0, warn: 0.95, fail: 0.9 },
    invariants: [
      'INV-SUPABASE-4: Every query must include organization_id',
      'INV-SUPABASE-5: Multi-org users must validate org scope explicitly',
      'INV-SUPABASE-6: Cache keys must include organization_id',
    ],
  },
  {
    name: 'audit-logging',
    displayName: 'Audit Log Coverage',
    description: 'CRUD operations on critical entities call audit logging',
    sopFile: '2-supabase',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.8, fail: 0.5 },
    invariants: [
      'INV-AUDIT-1: Organizations CRUD must log',
      'INV-AUDIT-2: RolePlays CRUD must log',
      'INV-AUDIT-3: Assessments CRUD must log',
    ],
  },

  // ============================================================================
  // 3-DATABASE-PRISMA METRICS
  // ============================================================================
  {
    name: 'prisma-queries',
    displayName: 'Prisma Query Compliance',
    description: 'Query patterns, soft deletes, N+1 prevention, ordering',
    sopFile: '3-database-prisma',
    weight: 0.15,
    blockOnFail: true,
    thresholds: { pass: 1.0, warn: 0.9, fail: 0.8 },
    invariants: [
      'INV-PRISMA-SOFT-DELETE: Use deleted_at: null, never hard delete critical entities',
      'INV-PRISMA-ORDERBY: All findMany queries must have orderBy',
      'INV-PRISMA-N+1: No Prisma queries inside loops',
      'INV-PRISMA-COUNT: Use count() not findMany().length',
    ],
  },
  {
    name: 'transactions',
    displayName: 'Transaction Compliance',
    description: 'Multi-table writes wrapped in transactions',
    sopFile: '3-database-prisma',
    weight: 0.10,
    blockOnFail: true,
    thresholds: { pass: 1.0, warn: 0.9, fail: 0.8 },
    invariants: [
      'INV-PRISMA-TRANSACTION: Multi-table mutations must use $transaction',
    ],
  },

  // ============================================================================
  // 4-CODE-SAFETY-PATTERNS METRICS
  // ============================================================================
  {
    name: 'code-safety',
    displayName: 'Code Safety Patterns',
    description: 'Code movement dependencies, closure captures, status accuracy',
    sopFile: '4-code-safety-patterns',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.8, fail: 0.6 },
    invariants: [
      'INV-STATUS-ACCURACY: Status "complete" only after operation finishes',
      'INV-CLOSURE-CAPTURE: Capture narrowed variables before closures',
    ],
  },

  // ============================================================================
  // 5-ERROR-HANDLING-LOGGING METRICS
  // ============================================================================
  {
    name: 'exception-types',
    displayName: 'Exception Type Compliance',
    description: 'NestJS exceptions vs generic Error usage',
    sopFile: '5-error-handling-logging',
    weight: 0.10,
    blockOnFail: false,
    thresholds: { pass: 0.95, warn: 0.85, fail: 0.7 },
    invariants: [
      'INV-ERROR-TYPE: Use NestJS exceptions (NotFoundException, BadRequestException, etc.)',
      'INV-LOG-SENSITIVE: Never log passwords, tokens, PII',
    ],
  },
  {
    name: 'logging',
    displayName: 'Logging Compliance',
    description: 'Logger usage, context, no sensitive data',
    sopFile: '5-error-handling-logging',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.8, fail: 0.6 },
    invariants: [
      'INV-LOGGER: Use NestJS Logger, not console.*',
      'INV-LOGGER-INIT: Services must initialize Logger with class name',
      'INV-HARDCODED-SECRET: No hardcoded API keys or secrets',
    ],
  },

  // ============================================================================
  // 6-EXTERNAL-SERVICES-TIMING METRICS
  // ============================================================================
  {
    name: 'external-services',
    displayName: 'External Service Patterns',
    description: 'Retry logic, timing handling, error wrapping',
    sopFile: '6-external-services-timing',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.7, fail: 0.5 },
    invariants: [
      'INV-EXTERNAL-RETRY: External API calls should have retry logic',
      'INV-EXTERNAL-ERROR-EXPOSE: Don\'t expose external service errors to users',
    ],
  },

  // ============================================================================
  // 7-QUEUE-JOB-PROCESSING METRICS
  // ============================================================================
  {
    name: 'job-processing',
    displayName: 'Job Processing Compliance',
    description: 'Idempotency, tenant context, logging',
    sopFile: '7-queue-job-processing',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.7, fail: 0.5 },
    invariants: [
      'INV-JOB-IDEMPOTENT: Jobs with side effects need idempotency checks',
      'INV-JOB-TENANT: Job data must include organizationId',
      'INV-JOB-LOGGING: Job processors must log start/end/errors',
    ],
  },

  // ============================================================================
  // 8-API-DESIGN-PATTERNS METRICS
  // ============================================================================
  {
    name: 'api-design',
    displayName: 'API Design Compliance',
    description: 'Guards on mutations, API documentation, DTO validation',
    sopFile: '8-api-design-patterns',
    weight: 0.05,
    blockOnFail: true,
    thresholds: { pass: 1.0, warn: 0.9, fail: 0.8 },
    invariants: [
      'INV-API-GUARD: Mutation endpoints must have @UseGuards',
      'INV-API-DOCS: Controllers should have @ApiTags',
      'INV-DTO-VALIDATION: Required fields need validation decorators',
    ],
  },

  // ============================================================================
  // 9-TESTING-CODE-QUALITY METRICS
  // ============================================================================
  {
    name: 'code-quality',
    displayName: 'Code Quality',
    description: 'TODOs, any types, code smells',
    sopFile: '9-testing-code-quality',
    weight: 0.05,
    blockOnFail: false,
    thresholds: { pass: 1.0, warn: 0.7, fail: 0.5 },
    invariants: [
      'INV-TODO: Unresolved TODO/FIXME comments',
      'INV-ANY-TYPE: Avoid "any" type usage',
    ],
  },
];

// ============================================================================
// GATING CONFIGURATION
// ============================================================================

export interface GatingConfig {
  /** Minimum total score to pass */
  minimumScore: number;

  /** Block merge on any blocker violations */
  blockOnBlockers: boolean;

  /** Fail on warnings (optional strict mode) */
  failOnWarnings: boolean;

  /** Maximum allowed blockers (0 = none allowed) */
  maxBlockers: number;

  /** Maximum allowed warnings before failure */
  maxWarnings: number;
}

export const DEFAULT_GATING_CONFIG: GatingConfig = {
  minimumScore: 0.85,
  blockOnBlockers: true,
  failOnWarnings: false,
  maxBlockers: 0,
  maxWarnings: 50,
};

export const STRICT_GATING_CONFIG: GatingConfig = {
  minimumScore: 0.95,
  blockOnBlockers: true,
  failOnWarnings: true,
  maxBlockers: 0,
  maxWarnings: 0,
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export function getMetricByName(name: ValidatorName): MetricDefinition | undefined {
  return METRIC_DEFINITIONS.find(m => m.name === name);
}

export function getMetricsBySop(sopFile: string): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter(m => m.sopFile === sopFile);
}

export function getBlockingMetrics(): MetricDefinition[] {
  return METRIC_DEFINITIONS.filter(m => m.blockOnFail);
}

export function calculateWeightedScore(
  scores: Map<ValidatorName, number>
): number {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const metric of METRIC_DEFINITIONS) {
    const score = scores.get(metric.name);
    if (score !== undefined) {
      weightedSum += score * metric.weight;
      totalWeight += metric.weight;
    }
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 1.0;
}

export function evaluateGating(
  scores: Map<ValidatorName, number>,
  blockerCount: number,
  warningCount: number,
  config: GatingConfig = DEFAULT_GATING_CONFIG
): { passed: boolean; reason?: string } {
  // Check blockers
  if (config.blockOnBlockers && blockerCount > config.maxBlockers) {
    return {
      passed: false,
      reason: `${blockerCount} blocking violations (max: ${config.maxBlockers})`,
    };
  }

  // Check warnings
  if (config.failOnWarnings && warningCount > config.maxWarnings) {
    return {
      passed: false,
      reason: `${warningCount} warnings (max: ${config.maxWarnings})`,
    };
  }

  // Check individual blocking metrics
  for (const metric of getBlockingMetrics()) {
    const score = scores.get(metric.name);
    if (score !== undefined && score < metric.thresholds.fail) {
      return {
        passed: false,
        reason: `Blocking metric ${metric.displayName} score ${(score * 100).toFixed(1)}% below threshold ${(metric.thresholds.fail * 100).toFixed(1)}%`,
      };
    }
  }

  // Check total score
  const totalScore = calculateWeightedScore(scores);
  if (totalScore < config.minimumScore) {
    return {
      passed: false,
      reason: `Total score ${(totalScore * 100).toFixed(1)}% below minimum ${(config.minimumScore * 100).toFixed(1)}%`,
    };
  }

  return { passed: true };
}

// ============================================================================
// INVARIANT DOCUMENTATION
// ============================================================================

export const INVARIANT_EVIDENCE: Record<string, { files: string[]; occurrences: string }> = {
  'INV-ERROR-TYPE': {
    files: ['All *.service.ts files'],
    occurrences: '592 NestJS exceptions vs 224 generic Error (73% compliance)',
  },
  'INV-LOGGER': {
    files: ['All *.service.ts files'],
    occurrences: '15+ services with proper Logger initialization',
  },
  'INV-PRISMA-SOFT-DELETE': {
    files: ['organizations.service.ts', 'teams.service.ts', 'rubrics.service.ts'],
    occurrences: '30+ usages of deleted_at: null',
  },
  'INV-PRISMA-TRANSACTION': {
    files: ['assignment-create.service.ts', 'organizations.service.ts'],
    occurrences: '20+ $transaction usages',
  },
  'INV-AUDIT-LOG': {
    files: ['organizations.service.ts', 'assessments.service.ts', 'role-plays.service.ts'],
    occurrences: '10+ auditLogsService calls',
  },
  'INV-API-GUARD': {
    files: ['All *.controller.ts files'],
    occurrences: '30+ controllers with guard decorators',
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  METRIC_DEFINITIONS,
  DEFAULT_GATING_CONFIG,
  STRICT_GATING_CONFIG,
  getMetricByName,
  getMetricsBySop,
  getBlockingMetrics,
  calculateWeightedScore,
  evaluateGating,
};
