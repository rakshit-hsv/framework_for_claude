# TESTING-CODE-QUALITY.md — STRICT TESTING & CODE QUALITY RULES

These rules apply to testability, code review, and quality standards.

Claude must follow these strictly when writing or reviewing code.

---

# 1. WRITE TESTABLE CODE (MANDATORY)

## 1.1 Injectable Dependencies

```typescript
// BAD - hard to test, depends on real time
async checkExpiry() {
  const now = new Date();
  return this.item.expiresAt < now;
}

// GOOD - injectable dependency
async checkExpiry(now: Date = new Date()) {
  return this.item.expiresAt < now;
}

// In tests:
expect(service.checkExpiry(new Date('2025-01-01'))).toBe(true);
```

## 1.2 Separate Pure Logic from I/O

```typescript
// BAD - mixed logic and I/O
async calculateScore(assessmentId: string) {
  const assessment = await this.prisma.assessments.findUnique({
    where: { id: assessmentId }
  });
  const rubric = await this.prisma.rubrics.findUnique({
    where: { id: assessment.rubricId }
  });

  let score = 0;
  for (const competency of rubric.competencies) {
    score += this.evaluateCompetency(assessment.transcript, competency);
  }
  return score / rubric.competencies.length;
}

// GOOD - pure logic separate from I/O
calculateScoreFromData(transcript: string, competencies: Competency[]): number {
  let score = 0;
  for (const competency of competencies) {
    score += this.evaluateCompetency(transcript, competency);
  }
  return score / competencies.length;
}

async calculateScore(assessmentId: string) {
  const assessment = await this.prisma.assessments.findUnique({
    where: { id: assessmentId }
  });
  const rubric = await this.prisma.rubrics.findUnique({
    where: { id: assessment.rubricId }
  });

  return this.calculateScoreFromData(assessment.transcript, rubric.competencies);
}
```

## 1.3 Avoid Static Methods for Testable Logic

```typescript
// BAD - hard to mock
class ScoreCalculator {
  static calculate(data: Data): number {
    return data.values.reduce((a, b) => a + b, 0);
  }
}

// GOOD - injectable service
@Injectable()
class ScoreCalculatorService {
  calculate(data: Data): number {
    return data.values.reduce((a, b) => a + b, 0);
  }
}
```

---

# 2. CODE REVIEW CHECKLIST (MANDATORY)

## 2.1 Functional Checks

Before submitting changes, verify:

- [ ] Moved code? Check what depended on its output
- [ ] Added required field? Update both frontend AND backend
- [ ] Changed API response? Update all consumers
- [ ] Modified job payload? Update job processor

## 2.2 Data Checks

- [ ] Service needs DB records? Document seed command
- [ ] Added new table? Add to seed file
- [ ] Changed schema? Migration created and tested?

## 2.3 External Dependencies

- [ ] External service call? Consider timing/retry strategy
- [ ] New env variable? Added to .env.example?
- [ ] New npm package? Justified and secure?

## 2.4 Code Quality

- [ ] Status updates match actual progress?
- [ ] Using variables in closures? Check for null issues
- [ ] Error messages actionable and safe?
- [ ] Logs include enough context?
- [ ] No sensitive data logged?

## 2.5 Performance

- [ ] N+1 queries avoided?
- [ ] Large lists paginated?
- [ ] Expensive operations in background jobs?

---

# 3. SECURITY CHECKS (MANDATORY)

## 3.1 Never Trust User Input

```typescript
// Always validate and sanitize
@Post()
async create(@Body() dto: CreateDto) {
  // DTO validation handles most cases
  // But also check business logic
  if (!await this.canUserAccessOrg(dto.organization_id)) {
    throw new ForbiddenException();
  }
}
```

## 3.2 Parameterized Queries

```typescript
// Prisma automatically parameterizes, but if using raw SQL:

// BAD - SQL injection risk
await prisma.$queryRaw`SELECT * FROM users WHERE id = ${userId}`;

// GOOD - use Prisma's parameterization
await prisma.$queryRaw`SELECT * FROM users WHERE id = ${Prisma.sql`${userId}`}`;

// BEST - use Prisma's query builder
await prisma.users.findUnique({ where: { id: userId } });
```

## 3.3 Security Checklist

- [ ] All inputs validated via DTO
- [ ] Access control verified server-side
- [ ] No SQL injection possible
- [ ] No XSS in rendered output
- [ ] Secrets in environment variables
- [ ] No sensitive data in logs

---

# 4. COMMON CODE SMELLS

## 4.1 Console.log in Production

```bash
# Find console.log (should be logger)
grep -rn "console\." src/
```

**Fix:** Replace with NestJS Logger

```typescript
// BAD
console.log('Processing started');

// GOOD
this.logger.log('Processing started');
```

## 4.2 Hardcoded Secrets

```bash
# Find potential secrets
grep -rn "sk-\|api_key\|password" src/
```

**Fix:** Use environment variables

## 4.3 TODO/FIXME Comments

```bash
# Find unresolved TODOs
grep -rn "TODO\|FIXME" src/
```

**Fix:** Resolve or create tickets

## 4.4 Generic Errors

```bash
# Find generic throws
grep -rn "throw new Error" src/
```

**Fix:** Use NestJS exceptions

---

# 5. PRISMA QUICK TIPS

## 5.1 Common Operations

```typescript
// Upsert (create or update)
await prisma.users.upsert({
  where: { email },
  create: { email, name },
  update: { name }
});

// Soft delete
await prisma.items.update({
  where: { id },
  data: { deleted_at: new Date() }
});

// Count with filters
const count = await prisma.items.count({
  where: { status: 'active', deleted_at: null }
});

// Include with filters
await prisma.users.findMany({
  include: {
    posts: {
      where: { published: true },
      orderBy: { created_at: 'desc' },
      take: 5
    }
  }
});
```

## 5.2 Avoid N+1 Queries

```typescript
// BAD - N+1
for (const user of users) {
  const posts = await prisma.posts.findMany({
    where: { user_id: user.id }
  });
}

// GOOD - batch
const posts = await prisma.posts.findMany({
  where: { user_id: { in: users.map(u => u.id) } }
});
```

---

# 6. COMMON PATTERNS REFERENCE

## 6.1 Retry with Exponential Backoff

```typescript
async retryOperation<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      this.logger.warn(
        `${operationName} failed (attempt ${attempt}/${maxRetries}): ${error.message}`
      );

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        this.logger.debug(`Retrying ${operationName} in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  this.logger.error(`${operationName} failed after ${maxRetries} attempts`);
  throw lastError;
}
```

## 6.2 Pagination Response

```typescript
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

async findPaginated(
  filters: FilterDto,
  page = 1,
  limit = 10
): Promise<PaginatedResponse<Item>> {
  const where = this.buildWhereClause(filters);

  const [data, total] = await Promise.all([
    this.prisma.items.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { created_at: 'desc' }
    }),
    this.prisma.items.count({ where })
  ]);

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}
```

## 6.3 Required Field with Fallback

```typescript
async determineValue(dto: CreateDto, field: string): Promise<string> {
  if (dto[field]) {
    const record = await this.prisma.table.findUnique({
      where: { id: dto[field], is_active: true, deleted_at: null }
    });
    if (!record) {
      throw new NotFoundException(`${field} ${dto[field]} not found or inactive`);
    }
    return dto[field];
  }

  const org = await this.prisma.organizations.findUnique({
    where: { id: dto.organization_id },
    select: { [`default_${field}`]: true }
  });

  if (!org?.[`default_${field}`]) {
    throw new BadRequestException(
      `Organization has no default ${field}. Please provide ${field}.`
    );
  }

  return org[`default_${field}`];
}
```

---

# 7. HTTP STATUS CODES QUICK REFERENCE

| Code | NestJS Exception | Use When |
|------|------------------|----------|
| 200 | (success) | GET, PUT, PATCH success |
| 201 | (success) | POST created |
| 204 | (success) | DELETE success, no content |
| 400 | `BadRequestException` | Invalid input |
| 401 | `UnauthorizedException` | Not authenticated |
| 403 | `ForbiddenException` | Not authorized |
| 404 | `NotFoundException` | Resource not found |
| 409 | `ConflictException` | Duplicate/conflict |
| 422 | `UnprocessableEntityException` | Valid but unprocessable |
| 500 | `InternalServerErrorException` | Server error |
| 502 | `BadGatewayException` | External service error |
| 503 | `ServiceUnavailableException` | Service down |

---

# 8. MANDATORY CHECKLIST

Before completing any code change, Claude must verify:

**Testability:**
- [ ] Pure functions separated from I/O
- [ ] Dependencies injectable
- [ ] No hidden static dependencies

**Code Review:**
- [ ] All functional checks passed
- [ ] Data checks passed
- [ ] External dependency checks passed
- [ ] Performance checks passed

**Security:**
- [ ] Inputs validated
- [ ] Access control verified
- [ ] No injection vulnerabilities
- [ ] Secrets in env vars

**Quality:**
- [ ] No console.log
- [ ] No hardcoded secrets
- [ ] No unresolved TODOs
- [ ] No generic errors

---

# END OF FILE
