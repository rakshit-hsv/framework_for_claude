# QUEUE-JOB-PROCESSING.md — STRICT JOB & QUEUE RULES

These rules apply to background job processing, queue handling, and async task management.

Claude must follow these strictly when writing job processors or queue producers.

---

# 1. IDEMPOTENT JOBS (MANDATORY)

## 1.1 The Problem

Jobs may run multiple times due to:
- Retries after failure
- Worker restarts
- Network issues
- Duplicate queue messages

## 1.2 BAD — Non-Idempotent Job

```typescript
async processJob(data: { userId: string }) {
  await this.sendWelcomeEmail(data.userId);  // Sends email every retry!
}
```

## 1.3 GOOD — Idempotent Job

```typescript
async processJob(data: { userId: string }) {
  const user = await this.prisma.users.findUnique({
    where: { id: data.userId },
    select: { welcome_email_sent: true }
  });

  if (user.welcome_email_sent) {
    this.logger.log('Welcome email already sent, skipping');
    return;
  }

  await this.sendWelcomeEmail(data.userId);
  await this.prisma.users.update({
    where: { id: data.userId },
    data: { welcome_email_sent: true }
  });
}
```

## 1.4 Idempotency Strategies

| Strategy | When to Use |
|----------|-------------|
| Flag check | One-time operations (welcome email) |
| Upsert | Create-or-update scenarios |
| Idempotency key | External API calls |
| Version check | Optimistic concurrency |

## 1.5 Mandatory Rule

Claude must verify job is idempotent before implementing. If not, ask human how to make it idempotent.

---

# 2. JOB PAYLOAD DATA (MANDATORY)

## 2.1 Include Enough Context

Jobs should include data needed for processing, not just IDs.

## 2.2 BAD — ID Only

```typescript
await this.jobProducer.addJob({
  assessmentId: assessment.id
});

// Processor must fetch everything
async processJob(data: { assessmentId: string }) {
  const assessment = await this.prisma.assessments.findUnique({
    where: { id: data.assessmentId }
  });
  // What if assessment was deleted between queue and processing?
}
```

## 2.3 GOOD — Include Needed Data

```typescript
await this.jobProducer.addJob({
  assessmentId: assessment.id,
  userId: assessment.user_id,
  organizationId: assessment.organization_id,
  transcript: assessment.sanitized_transcript  // Already have it, pass it along
});

// Processor has what it needs
async processJob(data: EvaluationJobData) {
  // Can start processing immediately
  const result = await this.evaluate(data.transcript);
}
```

## 2.4 Payload Guidelines

**Include:**
- Entity IDs (for logging, status updates)
- Immutable data needed for processing
- Organization/tenant context
- Data that was just computed

**Don't include:**
- Entire database rows (use IDs + select fields)
- Sensitive data (fetch from secure storage)
- Data that may change (fetch fresh if needed)

---

# 3. JOB RETRY CONFIGURATION (MANDATORY)

## 3.1 Set Appropriate Retry Config

```typescript
await this.jobProducer.addEvaluationJob(data, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000  // 2s, 4s, 8s
  },
  removeOnComplete: 100,  // Keep last 100 completed
  removeOnFail: 500       // Keep last 500 failed for debugging
});
```

## 3.2 Retry Guidelines by Job Type

| Job Type | Attempts | Backoff | Notes |
|----------|----------|---------|-------|
| Email sending | 3 | exponential 5s | Provider might be down |
| External API | 3 | exponential 2s | Transient failures |
| DB operations | 2 | fixed 1s | Usually works or fails fast |
| LLM evaluation | 3 | exponential 10s | Can be slow |
| Webhook delivery | 5 | exponential 30s | Allow for downtime |

## 3.3 Before Setting Retry Config

Claude must ask:

1. Is this operation idempotent?
2. What's acceptable latency for retries?
3. Are there external rate limits?

---

# 4. JOB STATUS TRACKING (MANDATORY)

## 4.1 Update Status at Key Points

```typescript
async processEvaluationJob(data: EvaluationJobData) {
  const { assessmentId } = data;

  try {
    // 1. Mark started
    await this.updateStatus(assessmentId, 'PROCESSING', {
      step: 'started',
      startedAt: new Date()
    });

    // 2. Update progress
    await this.updateStatus(assessmentId, 'PROCESSING', {
      step: 'fetching_data',
      progress: 10
    });

    const fetchedData = await this.fetchData(data);

    await this.updateStatus(assessmentId, 'PROCESSING', {
      step: 'evaluating',
      progress: 50
    });

    const result = await this.evaluate(fetchedData);

    // 3. Mark completed
    await this.updateStatus(assessmentId, 'COMPLETED', {
      step: 'finished',
      progress: 100,
      completedAt: new Date()
    });

    return result;

  } catch (error) {
    // 4. Mark failed
    await this.updateStatus(assessmentId, 'FAILED', {
      step: 'error',
      error: error.message,
      failedAt: new Date()
    });
    throw error;
  }
}
```

## 4.2 Status Update Rules

- `*_started` — Before operation begins
- `*_in_progress` — During operation with percentage
- `*_complete` — After operation succeeds
- `*_failed` — After operation fails (with error message)

---

# 5. JOB LOGGING (MANDATORY)

## 5.1 Log at Key Points

```typescript
async processJob(data: JobData) {
  const { jobId, assessmentId } = data;

  this.logger.log(`Job ${jobId} started for assessment ${assessmentId}`);

  try {
    // Processing...

    this.logger.log(`Job ${jobId} completed for assessment ${assessmentId}`, {
      duration: Date.now() - startTime,
      result: 'success'
    });

  } catch (error) {
    this.logger.error(`Job ${jobId} failed for assessment ${assessmentId}`, {
      error: error.message,
      stack: error.stack,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

## 5.2 Required Log Fields

| Event | Required Fields |
|-------|-----------------|
| Job start | jobId, entityId, timestamp |
| Job progress | jobId, step, percentage |
| Job complete | jobId, entityId, duration, result |
| Job failure | jobId, entityId, error, duration |

---

# 6. JOB CLEANUP (MANDATORY)

## 6.1 Configure Job Retention

```typescript
// In queue configuration
{
  removeOnComplete: {
    age: 3600,  // Remove completed jobs after 1 hour
    count: 1000 // Keep max 1000 completed jobs
  },
  removeOnFail: {
    age: 604800, // Keep failed jobs for 1 week
    count: 5000  // Keep max 5000 failed jobs
  }
}
```

## 6.2 Retention Guidelines

| Job Type | Complete Retention | Failed Retention |
|----------|-------------------|------------------|
| High-volume | 1 hour / 100 | 1 day / 1000 |
| Standard | 1 day / 1000 | 1 week / 5000 |
| Critical/Audit | 1 week / 10000 | 1 month / 10000 |

---

# 7. QUEUE ISOLATION (MANDATORY)

## 7.1 Tenant Context in Jobs

Every job must include tenant context:

```typescript
interface BaseJobData {
  organizationId: string;
  userId?: string;
  correlationId: string;  // For tracing
}

interface EvaluationJobData extends BaseJobData {
  assessmentId: string;
  transcript: string;
}
```

## 7.2 Verify Tenant in Processor

```typescript
async processJob(data: EvaluationJobData) {
  // Always log tenant context
  this.logger.log(`Processing job for org ${data.organizationId}`);

  // Verify access if needed
  const hasAccess = await this.verifyOrgAccess(data.organizationId);
  if (!hasAccess) {
    throw new Error(`Invalid organization ${data.organizationId}`);
  }

  // Include tenant in all queries
  const assessment = await this.prisma.assessments.findFirst({
    where: {
      id: data.assessmentId,
      organization_id: data.organizationId  // ALWAYS filter by org
    }
  });
}
```

---

# 8. DEAD LETTER QUEUE (RECOMMENDED)

## 8.1 Handle Permanently Failed Jobs

```typescript
// Configure DLQ
const queue = new Queue('evaluations', {
  deadLetterQueue: {
    queue: 'evaluations-dlq',
    maxRetries: 3
  }
});

// Monitor DLQ
@Processor('evaluations-dlq')
export class EvaluationDLQProcessor {
  @Process()
  async handleFailedJob(job: Job<EvaluationJobData>) {
    this.logger.error(`Job permanently failed`, {
      jobId: job.id,
      data: job.data,
      failedReason: job.failedReason
    });

    // Notify operations team
    await this.alertService.sendAlert({
      type: 'JOB_PERMANENTLY_FAILED',
      jobId: job.id,
      assessmentId: job.data.assessmentId
    });
  }
}
```

---

# 9. MANDATORY CHECKLIST

Before writing job processing code, Claude must verify:

**Idempotency:**
- [ ] Job can run multiple times safely
- [ ] Flag/check prevents duplicate side effects
- [ ] External API calls have idempotency keys

**Payload:**
- [ ] All needed data included in payload
- [ ] Tenant context (organizationId) included
- [ ] Correlation ID for tracing

**Retry Config:**
- [ ] Appropriate attempts count
- [ ] Exponential backoff configured
- [ ] Rate limits respected

**Status & Logging:**
- [ ] Status updated at start/progress/complete/fail
- [ ] All log entries include job ID and entity ID
- [ ] Errors logged with full context

**Cleanup:**
- [ ] Retention configured for completed jobs
- [ ] Failed jobs kept for debugging
- [ ] DLQ configured for permanent failures

---

# END OF FILE
