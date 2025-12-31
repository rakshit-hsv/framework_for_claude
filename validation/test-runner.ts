/**
 * SOP Validation Test Runner
 *
 * Test harness for validating the SOP validators themselves.
 * Contains test cases with known violations and passing code.
 */

import {
  validators,
  ValidatorName,
  ValidationResult,
  ValidationContext,
} from './validators';

// ============================================================================
// TEST TYPES
// ============================================================================

interface TestCase {
  name: string;
  description: string;
  validator: ValidatorName;
  files: Record<string, string>;
  expectedViolations: number;
  expectedWarnings: number;
  shouldPass: boolean;
}

interface TestResult {
  name: string;
  validator: ValidatorName;
  passed: boolean;
  expected: {
    violations: number;
    warnings: number;
    shouldPass: boolean;
  };
  actual: {
    violations: number;
    warnings: number;
    passed: boolean;
  };
  details?: string;
}

// ============================================================================
// TEST CASES
// ============================================================================

const testCases: TestCase[] = [
  // ============================================================================
  // 2-SUPABASE TESTS
  // ============================================================================
  {
    name: 'JWT decode-only violation',
    description: 'Detects decode-only JWT handling without verification',
    validator: 'supabase-auth',
    files: {
      'auth.service.ts': `
        import jwt from 'jsonwebtoken';

        async function parseToken(token: string) {
          // BAD: decode-only
          const decoded = jwt.decode(token);
          return decoded;
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'JWT logging violation',
    description: 'Detects JWT/token in log statements',
    validator: 'supabase-auth',
    files: {
      'auth.service.ts': `
        private readonly logger = new Logger(AuthService.name);

        async validateToken(token: string) {
          this.logger.log('Token received: ' + token);
          // Process...
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Valid auth implementation',
    description: 'Proper auth with no violations',
    validator: 'supabase-auth',
    files: {
      'auth.service.ts': `
        import { JwtService } from '@nestjs/jwt';

        @Injectable()
        export class AuthService {
          constructor(private jwtService: JwtService) {}

          async validateToken(token: string) {
            // GOOD: Using NestJS JWT service with verification
            const payload = await this.jwtService.verifyAsync(token);
            return payload;
          }
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 0,
    shouldPass: true,
  },

  // ============================================================================
  // 3-DATABASE-PRISMA TESTS
  // ============================================================================
  {
    name: 'Missing orderBy in findMany',
    description: 'Detects findMany without orderBy clause',
    validator: 'prisma-queries',
    files: {
      'users.service.ts': `
        async getUsers(orgId: string) {
          return this.prisma.users.findMany({
            where: {
              organization_id: orgId,
              deleted_at: null,
            },
          });
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 1, // Also warns about pagination
    shouldPass: false,
  },
  {
    name: 'N+1 query pattern',
    description: 'Detects Prisma query inside loop',
    validator: 'prisma-queries',
    files: {
      'reports.service.ts': `
        async generateReport(userIds: string[]) {
          const results = [];
          for (const userId of userIds) {
            const data = await this.prisma.assessments.findFirst({
              where: { user_id: userId },
            });
            results.push(data);
          }
          return results;
        }
      `,
    },
    expectedViolations: 2, // N+1 + missing orderBy
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Hard delete on soft-delete entity',
    description: 'Detects hard delete on organizations',
    validator: 'prisma-queries',
    files: {
      'org.service.ts': `
        async deleteOrganization(id: string) {
          return this.prisma.organizations.delete({
            where: { id },
          });
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Proper Prisma query',
    description: 'Well-formed query with all requirements',
    validator: 'prisma-queries',
    files: {
      'users.service.ts': `
        async getUsers(orgId: string, page: number, limit: number) {
          return this.prisma.users.findMany({
            where: {
              organization_id: orgId,
              deleted_at: null,
            },
            orderBy: { created_at: 'desc' },
            take: limit,
            skip: (page - 1) * limit,
          });
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 0,
    shouldPass: true,
  },
  {
    name: 'Missing soft delete filter',
    description: 'Query on organizations without deleted_at filter',
    validator: 'prisma-queries',
    files: {
      'org.service.ts': `
        async getOrganizations() {
          return this.prisma.organizations.findMany({
            where: {
              status: 'active',
            },
            orderBy: { name: 'asc' },
          });
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },

  // ============================================================================
  // TRANSACTION TESTS
  // ============================================================================
  {
    name: 'Multi-table write without transaction',
    description: 'Creates in multiple tables without $transaction',
    validator: 'transactions',
    files: {
      'roleplay.service.ts': `
        async createRolePlay(data: CreateRolePlayDto) {
          const rolePlay = await this.prisma.role_plays.create({
            data: { name: data.name },
          });

          await this.prisma.agent_configs.create({
            data: { role_play_id: rolePlay.id },
          });

          return rolePlay;
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Proper transaction usage',
    description: 'Multi-table writes wrapped in transaction',
    validator: 'transactions',
    files: {
      'roleplay.service.ts': `
        async createRolePlay(data: CreateRolePlayDto) {
          return this.prisma.$transaction(async (tx) => {
            const rolePlay = await tx.role_plays.create({
              data: { name: data.name },
            });

            await tx.agent_configs.create({
              data: { role_play_id: rolePlay.id },
            });

            return rolePlay;
          });
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 0,
    shouldPass: true,
  },

  // ============================================================================
  // 5-ERROR-HANDLING-LOGGING TESTS
  // ============================================================================
  {
    name: 'Generic Error thrown',
    description: 'Using Error instead of NestJS exception',
    validator: 'exception-types',
    files: {
      'org.service.ts': `
        async findOne(id: string) {
          const org = await this.prisma.organizations.findUnique({
            where: { id },
          });

          if (!org) {
            throw new Error('Organization not found');
          }

          return org;
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Console.log usage',
    description: 'Using console instead of Logger',
    validator: 'exception-types',
    files: {
      'debug.service.ts': `
        async process() {
          console.log('Starting process...');
          // work...
          console.error('Something failed');
        }
      `,
    },
    expectedViolations: 2,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Proper NestJS exceptions',
    description: 'Using proper exception types',
    validator: 'exception-types',
    files: {
      'org.service.ts': `
        import { NotFoundException, BadRequestException } from '@nestjs/common';

        async findOne(id: string) {
          if (!isUUID(id)) {
            throw new BadRequestException('Invalid ID format');
          }

          const org = await this.prisma.organizations.findUnique({
            where: { id },
          });

          if (!org) {
            throw new NotFoundException('Organization not found');
          }

          return org;
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 0,
    shouldPass: true,
  },
  {
    name: 'Sensitive data in logs',
    description: 'Logging password or API keys',
    validator: 'exception-types',
    files: {
      'auth.service.ts': `
        private readonly logger = new Logger(AuthService.name);

        async login(email: string, password: string) {
          this.logger.debug('Login attempt with password: ' + password);
          // ...
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },
  {
    name: 'Hardcoded secret',
    description: 'API key hardcoded in source',
    validator: 'logging',
    files: {
      'api.service.ts': `
        const API_KEY = 'sk-1234567890abcdef';

        async callApi() {
          return fetch(url, {
            headers: { 'Authorization': 'Bearer ' + API_KEY },
          });
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 0,
    shouldPass: false,
  },

  // ============================================================================
  // 7-QUEUE-JOB-PROCESSING TESTS
  // ============================================================================
  {
    name: 'Job without tenant context',
    description: 'Job data missing organizationId',
    validator: 'job-processing',
    files: {
      'email.processor.ts': `
        interface EmailJobData {
          userId: string;
          templateId: string;
        }

        @Processor('email')
        export class EmailProcessor {
          @Process()
          async execute(job: Job<EmailJobData>) {
            await this.sendEmail(job.data.userId, job.data.templateId);
          }
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 2, // Missing org + missing logging
    shouldPass: true,
  },
  {
    name: 'Non-idempotent job',
    description: 'Job with side effects but no idempotency check',
    validator: 'job-processing',
    files: {
      'notification.processor.ts': `
        interface NotificationJobData {
          organizationId: string;
          userId: string;
        }

        @Processor('notifications')
        export class NotificationProcessor {
          private readonly logger = new Logger(NotificationProcessor.name);

          @Process()
          async execute(job: Job<NotificationJobData>) {
            this.logger.log('Processing notification');
            await this.sendEmail(job.data.userId);
            this.logger.log('Done');
          }
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 1, // Idempotency warning
    shouldPass: true,
  },

  // ============================================================================
  // 8-API-DESIGN-PATTERNS TESTS
  // ============================================================================
  {
    name: 'Controller without guards on POST',
    description: 'POST endpoint missing UseGuards',
    validator: 'api-design',
    files: {
      'users.controller.ts': `
        @Controller('users')
        export class UsersController {
          @Post()
          async create(@Body() dto: CreateUserDto) {
            return this.usersService.create(dto);
          }
        }
      `,
    },
    expectedViolations: 1,
    expectedWarnings: 1, // Missing ApiTags
    shouldPass: false,
  },
  {
    name: 'Properly guarded controller',
    description: 'Controller with proper decorators',
    validator: 'api-design',
    files: {
      'users.controller.ts': `
        @ApiTags('Users')
        @Controller('users')
        @UseGuards(RolesGuard)
        export class UsersController {
          @ApiOperation({ summary: 'Create user' })
          @Post()
          @Roles(UserRole.ADMIN)
          async create(@Body() dto: CreateUserDto) {
            return this.usersService.create(dto);
          }
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 0,
    shouldPass: true,
  },

  // ============================================================================
  // 9-TESTING-CODE-QUALITY TESTS
  // ============================================================================
  {
    name: 'TODO comments',
    description: 'Unresolved TODO in code',
    validator: 'code-quality',
    files: {
      'service.ts': `
        async process() {
          // TODO: Implement error handling
          // FIXME: This is broken
          return data;
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 2,
    shouldPass: true,
  },
  {
    name: 'Any type usage',
    description: 'Using any type',
    validator: 'code-quality',
    files: {
      'utils.ts': `
        function processData(data: any): any {
          return data as any;
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 3,
    shouldPass: true,
  },

  // ============================================================================
  // TENANT ISOLATION TESTS
  // ============================================================================
  {
    name: 'Query without org filter',
    description: 'Prisma query missing organization_id',
    validator: 'tenant-isolation',
    files: {
      'data.service.ts': `
        async getData() {
          return this.prisma.assessments.findMany({
            where: {
              status: 'COMPLETED',
            },
          });
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 1,
    shouldPass: true,
  },
  {
    name: 'Cache without org in key',
    description: 'Cache key missing organization context',
    validator: 'tenant-isolation',
    files: {
      'cache.service.ts': `
        async getCached(key: string) {
          return this.cacheManager.get('user:' + key);
        }
      `,
    },
    expectedViolations: 0,
    expectedWarnings: 1,
    shouldPass: true,
  },
];

// ============================================================================
// TEST RUNNER
// ============================================================================

function createContext(files: Record<string, string>): ValidationContext {
  const fileContents = new Map<string, string>();
  const fileList: string[] = [];

  for (const [name, content] of Object.entries(files)) {
    fileContents.set(name, content);
    fileList.push(name);
  }

  return {
    files: fileList,
    fileContents,
  };
}

function runTest(testCase: TestCase): TestResult {
  const ctx = createContext(testCase.files);
  const validator = validators[testCase.validator];

  if (!validator) {
    return {
      name: testCase.name,
      validator: testCase.validator,
      passed: false,
      expected: {
        violations: testCase.expectedViolations,
        warnings: testCase.expectedWarnings,
        shouldPass: testCase.shouldPass,
      },
      actual: {
        violations: 0,
        warnings: 0,
        passed: false,
      },
      details: `Validator '${testCase.validator}' not found`,
    };
  }

  const result = validator(ctx);

  const violationMatch = result.violations.length === testCase.expectedViolations;
  const warningMatch = result.warnings.length === testCase.expectedWarnings;
  const passMatch = result.passed === testCase.shouldPass;

  const passed = violationMatch && warningMatch && passMatch;

  let details: string | undefined;
  if (!passed) {
    const issues: string[] = [];
    if (!violationMatch) {
      issues.push(`violations: expected ${testCase.expectedViolations}, got ${result.violations.length}`);
    }
    if (!warningMatch) {
      issues.push(`warnings: expected ${testCase.expectedWarnings}, got ${result.warnings.length}`);
    }
    if (!passMatch) {
      issues.push(`passed: expected ${testCase.shouldPass}, got ${result.passed}`);
    }
    details = issues.join('; ');
  }

  return {
    name: testCase.name,
    validator: testCase.validator,
    passed,
    expected: {
      violations: testCase.expectedViolations,
      warnings: testCase.expectedWarnings,
      shouldPass: testCase.shouldPass,
    },
    actual: {
      violations: result.violations.length,
      warnings: result.warnings.length,
      passed: result.passed,
    },
    details,
  };
}

export function runAllTests(filter?: ValidatorName): TestResult[] {
  const results: TestResult[] = [];

  for (const testCase of testCases) {
    if (filter && testCase.validator !== filter) {
      continue;
    }

    const result = runTest(testCase);
    results.push(result);
  }

  return results;
}

export function printTestResults(results: TestResult[]) {
  console.log('\n' + '='.repeat(60));
  console.log('SOP VALIDATOR TEST RESULTS');
  console.log('='.repeat(60) + '\n');

  let passed = 0;
  let failed = 0;

  // Group by validator
  const byValidator = new Map<ValidatorName, TestResult[]>();
  for (const result of results) {
    const list = byValidator.get(result.validator) || [];
    list.push(result);
    byValidator.set(result.validator, list);
  }

  for (const [validator, tests] of byValidator) {
    console.log(`\n[${validator}]`);
    console.log('-'.repeat(40));

    for (const test of tests) {
      const icon = test.passed ? '✅' : '❌';
      console.log(`${icon} ${test.name}`);

      if (!test.passed && test.details) {
        console.log(`   ${test.details}`);
      }

      if (test.passed) {
        passed++;
      } else {
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`SUMMARY: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('='.repeat(60) + '\n');

  return failed === 0;
}

// ============================================================================
// CLI
// ============================================================================

if (require.main === module) {
  const args = process.argv.slice(2);
  let filter: ValidatorName | undefined;

  if (args.length > 0 && args[0] !== '--all') {
    filter = args[0] as ValidatorName;
  }

  const results = runAllTests(filter);
  const allPassed = printTestResults(results);

  process.exit(allPassed ? 0 : 1);
}

export { testCases };
