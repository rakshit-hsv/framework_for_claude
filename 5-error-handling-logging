# ERROR-HANDLING-LOGGING.md — STRICT ERROR & LOGGING RULES

These rules apply to exception handling, error messages, logging practices, and debugging output.

Claude must follow these strictly when writing error handling or logging code.

---

# 1. EXCEPTION TYPES (MANDATORY)

## 1.1 Use NestJS Exceptions

Claude must use appropriate NestJS exception types, never generic `Error`.

## 1.2 BAD — Generic Error

```typescript
throw new Error('Organization not found');
```

## 1.3 GOOD — NestJS Exception with Proper HTTP Status

```typescript
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';

throw new NotFoundException('Organization not found');           // 404
throw new BadRequestException('Invalid rubric_id format');       // 400
throw new ForbiddenException('Access denied to this resource');  // 403
```

## 1.4 HTTP Status Code Reference

| Code | NestJS Exception | Use When |
|------|------------------|----------|
| 400 | `BadRequestException` | Invalid input, validation failed |
| 401 | `UnauthorizedException` | Not authenticated |
| 403 | `ForbiddenException` | Authenticated but not authorized |
| 404 | `NotFoundException` | Resource doesn't exist |
| 409 | `ConflictException` | Duplicate, already exists |
| 500 | `InternalServerErrorException` | Server error (avoid exposing details) |

---

# 2. ERROR MESSAGE GUIDELINES (MANDATORY)

## 2.1 Messages Must Be Actionable and Safe

## 2.2 BAD — No Context

```typescript
throw new NotFoundException('Not found');
```

## 2.3 BAD — Exposes Internals

```typescript
throw new Error(`SELECT * FROM users WHERE id = ${id} returned null`);
```

## 2.4 GOOD — Specific, Actionable, Safe

```typescript
throw new NotFoundException(
  `Organization ${organizationId} not found or you don't have access`
);
```

## 2.5 Error Message Rules

1. Include the entity type (Organization, User, Assessment)
2. Include the identifier when safe
3. Never expose SQL queries or internal structure
4. Suggest possible causes or next steps when helpful

---

# 3. CATCH AND RETHROW WITH CONTEXT (MANDATORY)

## 3.1 Never Lose Original Error Context

## 3.2 BAD — Context Lost

```typescript
try {
  await this.processEvaluation(id);
} catch (error) {
  throw new Error('Evaluation failed');
}
```

## 3.3 GOOD — Preserve Context

```typescript
try {
  await this.processEvaluation(id);
} catch (error) {
  this.logger.error(`Evaluation failed for ${id}`, error.stack);
  throw new InternalServerErrorException(
    `Evaluation failed for assessment ${id}: ${error.message}`
  );
}
```

## 3.4 Mandatory Pattern

When catching and rethrowing:

1. Log the original error with stack trace
2. Include entity ID in new error message
3. Include original error message (if safe to expose)

---

# 4. PARTIAL FAILURE HANDLING (MANDATORY)

## 4.1 Clean Up on Failure

When creating multiple related records outside a transaction, clean up partial state.

## 4.2 BAD — Orphaned Records on Failure

```typescript
const rolePlay = await this.prisma.role_plays.create({ data });
await this.createAgentConfig(rolePlay.id);  // If this fails, orphan rolePlay exists
await this.notifyUsers(rolePlay.id);
```

## 4.3 GOOD — Cleanup on Failure

```typescript
let createdRolePlay;
try {
  createdRolePlay = await this.prisma.role_plays.create({ data });

  await this.createAgentConfig(createdRolePlay.id);
  await this.notifyUsers(createdRolePlay.id);

} catch (error) {
  // Clean up partial state
  if (createdRolePlay) {
    await this.prisma.role_plays.delete({ where: { id: createdRolePlay.id } });
  }
  throw error;
}
```

## 4.4 Better — Use Transactions

```typescript
await this.prisma.$transaction(async (tx) => {
  const rolePlay = await tx.role_plays.create({ data: rolePlayData });
  await tx.agent_configs.create({
    data: { ...agentData, role_play_id: rolePlay.id }
  });
  return rolePlay;
});
```

---

# 5. LOGGING LEVELS (MANDATORY)

## 5.1 Use Correct Log Level

| Level | Use For |
|-------|---------|
| `error` | Exceptions, failures that need attention |
| `warn` | Recoverable issues, deprecations |
| `log` | Important business events (job started, completed) |
| `debug` | Detailed flow info (for troubleshooting) |
| `verbose` | Very detailed (rarely used in production) |

## 5.2 BAD — Wrong Level

```typescript
this.logger.error('Processing started');  // Not an error!
this.logger.log('Database connection failed');  // This IS an error!
```

## 5.3 GOOD — Correct Level

```typescript
this.logger.log('Processing started');
this.logger.error('Database connection failed', error.stack);
```

---

# 6. LOGGING CONTEXT (MANDATORY)

## 6.1 Always Include Identifiers

## 6.2 BAD — No Context

```typescript
this.logger.log('Processing started');
this.logger.error('Failed');
```

## 6.3 GOOD — Includes Identifiers

```typescript
this.logger.log(`Processing evaluation for assessment ${assessmentId}`);
this.logger.error(`Evaluation failed for assessment ${assessmentId}`, {
  error: error.message,
  stack: error.stack,
  userId,
  organizationId
});
```

## 6.4 Structured Logging

```typescript
// Use objects for structured data
this.logger.log('Evaluation completed', {
  assessmentId,
  duration: Date.now() - startTime,
  modelUsed: 'gpt-4o',
  tokenCount: 1500
});
```

---

# 7. SENSITIVE DATA IN LOGS (STRICT PROHIBITION)

## 7.1 Never Log Sensitive Data

Claude must NEVER log:

- Passwords
- API keys (full)
- JWTs
- PII beyond identifiers
- Credit card numbers
- Session tokens

## 7.2 BAD — Leaking Secrets

```typescript
this.logger.log(`User login: ${email}, password: ${password}`);
this.logger.log(`API Key: ${apiKey}`);
this.logger.debug(`JWT: ${token}`);
```

## 7.3 GOOD — Safe Logging

```typescript
this.logger.log(`User login: ${email}`);
this.logger.log(`API Key: ${apiKey.substring(0, 8)}...`);
this.logger.debug(`JWT present: ${!!token}`);
```

## 7.4 Masking Pattern

```typescript
function maskSecret(secret: string, visibleChars = 4): string {
  if (secret.length <= visibleChars) return '***';
  return secret.substring(0, visibleChars) + '...';
}
```

---

# 8. ENVIRONMENT VARIABLES FOR SECRETS (MANDATORY)

## 8.1 Never Hardcode Secrets

## 8.2 BAD — Hardcoded

```typescript
const apiKey = 'sk-1234567890';
```

## 8.3 GOOD — Environment Variable

```typescript
const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('OPENAI_API_KEY not configured');
}
```

## 8.4 Validation Pattern

```typescript
function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Environment variable ${name} is required but not set. ` +
      `Add it to your .env file.`
    );
  }
  return value;
}
```

---

# 9. VALIDATE EARLY, FAIL FAST (MANDATORY)

## 9.1 Validate All Inputs Before Processing

## 9.2 BAD — Late Validation

```typescript
async createRolePlay(dto: CreateRolePlayDto) {
  const rolePlay = await this.prisma.role_plays.create({
    data: { ...dto }
  });

  // Validation after creation - too late!
  const organization = await this.prisma.organizations.findUnique({
    where: { id: dto.organization_id }
  });
  if (!organization) {
    // Now we have orphaned data!
    throw new NotFoundException('Organization not found');
  }
}
```

## 9.3 GOOD — Early Validation

```typescript
async createRolePlay(dto: CreateRolePlayDto) {
  // 1. Validate all inputs FIRST
  const organization = await this.prisma.organizations.findUnique({
    where: { id: dto.organization_id }
  });
  if (!organization) {
    throw new NotFoundException(`Organization ${dto.organization_id} not found`);
  }

  const scenario = await this.prisma.scenarios.findUnique({
    where: { id: dto.scenario_id }
  });
  if (!scenario) {
    throw new NotFoundException(`Scenario ${dto.scenario_id} not found`);
  }

  // 2. THEN do the actual work
  return this.prisma.role_plays.create({ data: { ... } });
}
```

---

# 10. NEVER TRUST FRONTEND DATA (MANDATORY)

## 10.1 Always Verify Access Server-Side

## 10.2 BAD — Trusts Frontend

```typescript
async createRolePlay(dto: CreateRolePlayDto, userId: string) {
  return this.prisma.role_plays.create({
    data: { organization_id: dto.organization_id }  // User could send any org!
  });
}
```

## 10.3 GOOD — Verifies Access

```typescript
async createRolePlay(dto: CreateRolePlayDto, userId: string) {
  const hasAccess = await this.checkUserOrgAccess(userId, dto.organization_id);
  if (!hasAccess) {
    throw new ForbiddenException('No access to this organization');
  }

  return this.prisma.role_plays.create({
    data: { organization_id: dto.organization_id }
  });
}
```

---

# 11. MANDATORY CHECKLIST

Before writing error handling or logging, Claude must verify:

**Exceptions:**
- [ ] Using NestJS exception types, not generic Error
- [ ] Correct HTTP status code for the situation
- [ ] Error message is actionable and safe

**Context Preservation:**
- [ ] Original error logged with stack trace
- [ ] Entity IDs included in error messages
- [ ] Partial state cleaned up on failure

**Logging:**
- [ ] Correct log level used
- [ ] Identifiers included in log messages
- [ ] No sensitive data logged
- [ ] Secrets masked if shown at all

**Validation:**
- [ ] All inputs validated before processing
- [ ] Access verified server-side
- [ ] Environment variables used for secrets

---

# END OF FILE
