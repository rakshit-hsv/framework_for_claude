# CODE-SAFETY-PATTERNS.md — STRICT CODE MODIFICATION RULES

These rules apply to code refactoring, moving code blocks, closure handling, and variable dependencies.

Claude must follow these strictly when modifying existing code.

---

# 1. MOVING CODE BLOCKS (MANDATORY DEPENDENCY CHECK)

## 1.1 Before Moving ANY Code Block

Claude MUST verify:

1. What variables does this code produce?
2. What code uses those variables AFTER the original location?
3. Does anything between old and new location need those variables?
4. Are there side effects (DB writes, API calls) that depend on order?
5. Will moving this change the error handling flow?

**Never move code without completing this checklist.**

## 1.2 Real Example — Pipeline Bug

```typescript
// ORIGINAL ORDER (worked):
const transcript = await this.fetchTranscript();     // 1. Fetch transcript
await this.queuePredictionJob({ transcript });       // 2. Use transcript
const [rolePlay, scenario] = await this.fetchDB();  // 3. DB operations

// AFTER MOVING (broken):
await this.queuePredictionJob({ transcript });       // 1. transcript is undefined!
const [rolePlay, scenario] = await this.fetchDB();  // 2. DB operations
const transcript = await this.fetchTranscript();     // 3. Fetch transcript (too late)
```

**Result:** Prediction job sent empty transcript to external API.

## 1.3 Mandatory Verification Steps

Before proposing ANY code movement, Claude must:

1. **List all variables produced** by the code block
2. **Search for all usages** of those variables in the file
3. **Confirm no downstream dependency** will break
4. **Ask human** if dependency chain is unclear

```bash
# Claude must mentally execute equivalent of:
grep -n "variableName" path/to/file.ts
```

---

# 2. CLOSURE VARIABLE CAPTURE (STRICT)

## 2.1 The Problem

TypeScript narrows types, but closures capture the variable reference, not the narrowed type.

## 2.2 BAD — Type Error in Closure

```typescript
let assessment = await this.getAssessment(id);
if (!assessment) throw new Error('Not found');

// assessment is narrowed to non-null here...

const result = await this.retryOperation(() => {
  // ...but inside closure, TS doesn't know it's non-null
  return this.doSomething(assessment.role_play_id); // Error: possibly null
});
```

## 2.3 GOOD — Capture Before Closure

```typescript
let assessment = await this.getAssessment(id);
if (!assessment) throw new Error('Not found');

// Capture the value, not the variable
const rolePlayId = assessment.role_play_id;

const result = await this.retryOperation(() => {
  return this.doSomething(rolePlayId); // No error
});
```

## 2.4 Alternative — Non-null Assertion (Use Sparingly)

```typescript
const result = await this.retryOperation(() => {
  return this.doSomething(assessment!.role_play_id); // ! asserts non-null
});
```

**Rule:** Only use `!` when 100% certain AND capturing would be awkward.

## 2.5 Mandatory Check

Before writing ANY closure that references external variables, Claude must:

1. Check if the variable was narrowed via null check
2. If yes, capture the value BEFORE the closure
3. If uncertain, ask human

---

# 3. STATUS/PROGRESS MESSAGES (MANDATORY ACCURACY)

## 3.1 Status Must Match Reality

Status updates MUST reflect actual operation state.

## 3.2 BAD — Status Lies

```typescript
// Says "complete" before fetching even starts
await this.updateStatus(assessmentId, 'EVALUATION_IN_PROGRESS', {
  step: 'data_fetching_complete',  // LIE!
});

// Actual fetching happens here
const data = await this.fetchData();
```

## 3.3 GOOD — Status is Accurate

```typescript
await this.updateStatus(assessmentId, 'EVALUATION_IN_PROGRESS', {
  step: 'data_fetching_started',
});

const data = await this.fetchData();

await this.updateStatus(assessmentId, 'EVALUATION_IN_PROGRESS', {
  step: 'data_fetching_complete',
});
```

## 3.4 Status Naming Conventions

| Status | When to Set |
|--------|-------------|
| `*_started` | Before the operation begins |
| `*_in_progress` | During long operations (with percentage) |
| `*_complete` | After operation succeeds |
| `*_failed` | After operation fails |

## 3.5 Mandatory Rule

Claude must NEVER set a "complete" status before the operation finishes.

---

# 4. FRONTEND/BACKEND FIELD ALIGNMENT (MANDATORY)

## 4.1 The Matrix

| Frontend Zod | Backend DTO | Result | Action |
|--------------|-------------|--------|--------|
| `.optional()` | `@IsOptional()` | OK | Both optional |
| required | `@IsNotEmpty()` | OK | Both required |
| `.optional()` | `@IsNotEmpty()` | **Bad UX** | User sees API error, not form validation |
| required | `@IsOptional()` | Wasteful | Frontend validates unnecessarily |

## 4.2 Mandatory Rule

**If backend requires a field, frontend MUST require it too.**

## 4.3 BAD — Misaligned Validation

```typescript
// Frontend
const schema = z.object({
  rubric_id: z.string().uuid('Valid rubric required').optional(), // optional!
});

// Backend
@IsNotEmpty()
@IsUUID()
rubric_id: string; // required!

// Result: User clears rubric, submits, sees ugly 400 error
```

## 4.4 GOOD — Aligned Validation

```typescript
// Frontend
const schema = z.object({
  rubric_id: z.string().uuid('Valid rubric required'), // required!
});

// Backend
@IsNotEmpty()
@IsUUID()
rubric_id: string; // required!

// Result: User sees friendly "Valid rubric required" in form
```

## 4.5 Before Adding Required Field

Claude must:

1. Check if field exists in frontend schema
2. If adding `@IsNotEmpty()` to backend, verify frontend also requires it
3. If mismatch found, ask human which should change

---

# 5. DATABASE SEED DEPENDENCIES (MANDATORY DOCUMENTATION)

## 5.1 When Service Requires DB Records

If a service requires database records to function, Claude must:

1. Document the dependency in service class JSDoc
2. Provide actionable error messages with seed commands

## 5.2 BAD — Cryptic Error

```typescript
const models = await prisma.evaluation_model_configs.findMany({
  where: { is_active: true }
});

const defaultModel = models.find(m => m.is_default);
if (!defaultModel) {
  throw new Error('No default model configured'); // User has no idea what to do
}
```

## 5.3 GOOD — Actionable Error

```typescript
const models = await prisma.evaluation_model_configs.findMany({
  where: { is_active: true }
});

if (!models.length) {
  throw new Error(
    'No evaluation models configured. ' +
    'Run: cd apps/api && npx ts-node prisma/seed-models.ts'
  );
}

const defaultModel = models.find(m => m.is_default);
if (!defaultModel) {
  throw new Error(
    'No default evaluation model set. ' +
    'Run: cd apps/api && npx ts-node prisma/seed-models.ts ' +
    'or manually set is_default=true on a model in evaluation_model_configs table.'
  );
}
```

## 5.4 Document Seed Dependencies

```typescript
/**
 * EvaluationService - Main orchestrator for LLM evaluation pipeline
 *
 * @requires evaluation_model_configs table must have at least one active model with is_default=true
 * @seed npx ts-node prisma/seed-models.ts
 */
@Injectable()
export class EvaluationService {
```

---

# 6. MANDATORY CHECKLIST

Before modifying any code, Claude must verify:

**Code Movement:**
- [ ] All variables produced by moved code identified
- [ ] All usages of those variables checked
- [ ] No downstream dependencies broken
- [ ] Side effects order preserved

**Closures:**
- [ ] Variables captured before closure if narrowed
- [ ] No reliance on type narrowing inside callbacks

**Status Updates:**
- [ ] Status set BEFORE operation = `*_started`
- [ ] Status set AFTER operation = `*_complete`
- [ ] No lying about progress

**Field Alignment:**
- [ ] Backend required fields match frontend required fields
- [ ] Frontend optional fields match backend optional fields

**Seed Dependencies:**
- [ ] Service dependencies documented in JSDoc
- [ ] Error messages include seed commands

---

# END OF FILE
