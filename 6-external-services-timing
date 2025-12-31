# EXTERNAL-SERVICES-TIMING.md — STRICT EXTERNAL SERVICE RULES

These rules apply to external API calls, retry logic, timing issues, and service dependencies.

Claude must follow these strictly when integrating with external services.

---

# 1. EXTERNAL SERVICE TIMING (MANDATORY)

## 1.1 The Problem

External services (ElevenLabs, S3, OpenAI, etc.) may not be immediately ready after triggering.

## 1.2 Options (In Order of Preference)

### Option 1: Defer the Call (Best)

Do other work first to give the external service time:

```typescript
// External service was triggered by a webhook earlier...

// Do DB operations first (buys time)
const [rolePlay, scenario] = await Promise.all([
  this.fetchRolePlay(id),
  this.fetchScenario(id),
]);

// Now fetch from external service (it had time to process)
const transcript = await this.fetchTranscript(id);
```

### Option 2: Retry with Exponential Backoff (Good)

```typescript
async retryOperation<T>(
  operation: () => Promise<T>,
  name: string,
  maxRetries = 3,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
        this.logger.warn(`${name} failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// Usage
const transcript = await this.retryOperation(
  () => this.fetchTranscript(id),
  'transcript fetch',
  3,
  1000
);
```

### Option 3: Explicit Delay (Last Resort)

```typescript
// Only if you KNOW the service needs time and there's nothing else to do
const ELEVENLABS_PROCESSING_DELAY = 2000;

this.logger.debug(`Waiting ${ELEVENLABS_PROCESSING_DELAY}ms for ElevenLabs...`);
await new Promise(resolve => setTimeout(resolve, ELEVENLABS_PROCESSING_DELAY));

const transcript = await this.fetchTranscript(id);
```

## 1.3 Why Defer > Delay?

- Delays are wasted time if the service is already ready
- Deferring uses the time productively
- If the service is slow, you've already done useful work

---

# 2. RETRY PATTERN (MANDATORY)

## 2.1 Standard Retry Implementation

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

## 2.2 Retry Configuration Guidelines

| Service Type | Max Retries | Base Delay | Notes |
|--------------|-------------|------------|-------|
| Idempotent reads | 3 | 1000ms | Safe to retry |
| Idempotent writes | 3 | 2000ms | Verify idempotency first |
| Non-idempotent | 0 | N/A | Never auto-retry |
| Rate-limited APIs | 3 | 5000ms | Respect rate limits |

## 2.3 Before Adding Retry Logic

Claude must ask:

1. Is this operation idempotent?
2. What's the expected latency?
3. Are there rate limits to respect?

---

# 3. DEFERRED OPERATIONS PATTERN (RECOMMENDED)

## 3.1 Standard Processing Order

```typescript
async processJob(id: string) {
  // 1. Quick validations first (fail fast)
  const record = await this.getRecord(id);
  if (!record) throw new NotFoundException(`Record ${id} not found`);

  // 2. Update status
  await this.updateStatus(id, 'PROCESSING');

  // 3. DB operations (fast, buys time for external services)
  const [dataA, dataB] = await Promise.all([
    this.fetchFromDB1(record.ref_id),
    this.fetchFromDB2(record.ref_id),
  ]);

  // 4. External service calls (had time to be ready)
  const externalData = await this.fetchFromExternalService(id);

  // 5. Processing
  const result = await this.process(dataA, dataB, externalData);

  // 6. Update status
  await this.updateStatus(id, 'COMPLETED');

  return result;
}
```

## 3.2 Order Rationale

1. **Validation first** — Fail fast before any work
2. **Status update** — User knows processing started
3. **DB operations** — Fast, buys time for external services
4. **External calls** — Had time to be ready
5. **Processing** — All data now available
6. **Final status** — Accurate completion status

---

# 4. REQUIRED FIELD WITH FALLBACK PATTERN

## 4.1 When Field Has Default

```typescript
async determineRubricId(dto: CreateDto): Promise<string> {
  // Use provided value if available
  if (dto.rubric_id) {
    // Validate it exists
    const rubric = await this.prisma.rubrics.findUnique({
      where: { id: dto.rubric_id, is_active: true, deleted_at: null }
    });
    if (!rubric) {
      throw new NotFoundException(`Rubric ${dto.rubric_id} not found or inactive`);
    }
    return dto.rubric_id;
  }

  // Fall back to organization default
  const org = await this.prisma.organizations.findUnique({
    where: { id: dto.organization_id },
    select: { default_rubric_id: true }
  });

  if (!org) {
    throw new NotFoundException(`Organization ${dto.organization_id} not found`);
  }

  if (!org.default_rubric_id) {
    throw new BadRequestException(
      `Organization ${dto.organization_id} has no default rubric. Please provide rubric_id.`
    );
  }

  return org.default_rubric_id;
}
```

---

# 5. TRANSACTION WITH CLEANUP PATTERN

## 5.1 For Related Writes

```typescript
async createWithRelations(dto: CreateDto) {
  return this.prisma.$transaction(async (tx) => {
    // Create main record
    const main = await tx.mainTable.create({
      data: { name: dto.name }
    });

    try {
      // Create related records
      await tx.relatedTable.create({
        data: { main_id: main.id, value: dto.value }
      });

      // External API call (if it fails, transaction rolls back)
      await this.externalService.notify(main.id);

      return main;
    } catch (error) {
      // Transaction auto-rolls back, but log for debugging
      this.logger.error(`Failed creating relations for ${main.id}`, error);
      throw error;
    }
  });
}
```

---

# 6. ENVIRONMENT VARIABLE VALIDATION (MANDATORY)

## 6.1 Validate on Startup

```typescript
function validateExternalServiceConfig(): void {
  const required = [
    'ELEVENLABS_API_KEY',
    'OPENAI_API_KEY',
    'S3_BUCKET_NAME',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}. ` +
      'Add them to your .env file.'
    );
  }
}

// Call in module constructor or app bootstrap
```

---

# 7. EXTERNAL SERVICE ERROR HANDLING

## 7.1 Wrap External Calls

```typescript
async callExternalService(data: RequestData): Promise<ResponseData> {
  try {
    const response = await this.httpService.post(EXTERNAL_URL, data).toPromise();
    return response.data;
  } catch (error) {
    if (error.response?.status === 429) {
      this.logger.warn('Rate limited by external service');
      throw new ServiceUnavailableException('Service temporarily unavailable, please retry');
    }

    if (error.response?.status >= 500) {
      this.logger.error('External service error', error.response?.data);
      throw new BadGatewayException('External service error');
    }

    this.logger.error('External service call failed', error);
    throw new InternalServerErrorException('Failed to process request');
  }
}
```

## 7.2 Never Expose External Errors to User

```typescript
// BAD
throw new Error(externalError.response.data.message);

// GOOD
this.logger.error('External API error', externalError.response?.data);
throw new InternalServerErrorException('Processing failed. Please try again.');
```

---

# 8. MANDATORY CHECKLIST

Before integrating with external services, Claude must verify:

**Timing:**
- [ ] Deferred calls used where possible
- [ ] Retry logic for transient failures
- [ ] Appropriate delays if required

**Retry Logic:**
- [ ] Operation is idempotent before adding retries
- [ ] Exponential backoff used
- [ ] Rate limits respected

**Error Handling:**
- [ ] External errors wrapped and logged
- [ ] User-facing errors are generic
- [ ] Rate limit responses handled

**Configuration:**
- [ ] Environment variables validated on startup
- [ ] Secrets not hardcoded
- [ ] .env.example updated for new variables

---

# END OF FILE
