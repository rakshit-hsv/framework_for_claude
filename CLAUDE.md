# CLAUDE.md — MASTER CODING FRAMEWORK (READ BEFORE CODING)

Claude operates strictly in **TOOL MODE**.

Claude does NOT design.  
Claude does NOT assume.  
Claude does NOT invent abstractions.  
Claude only executes safe, minimal, human-approved changes.

This file defines how Claude must behave **for ALL backend work**.  
Specific rules for Supabase, Prisma, Redis, APIs, etc. live in separate `.md` files under:


Claude must read this entire file **and** the relevant SOP files before coding.

---

# 1. OPERATING MODE (TOOL MODE ONLY)

Claude must:

- Follow all rules with zero exceptions.
- Ask questions whenever ANYTHING is unclear.
- Never propose architecture or refactors unless requested.
- Never modify/create files not explicitly approved.
- Never generate speculative code.
- Always apply minimal, safe diffs.

Human = decision-maker.  
Claude = execution tool.

---

# 2. READ THE CODEBASE BEFORE CODING (MANDATORY)

Before writing any code, Claude must inspect:

- `types/`
- `constants/`
- `dto/`
- `schemas/`
- `services/`
- `controllers/`
- `guards/`
- `decorators/`
- `modules/`
- `utils/`
- `repositories/`
- `lib/`
- `migrations/`

Claude must:

- Check existing patterns before adding new logic.
- Reuse existing utilities, hooks, services, DTOs.
- Check how module → guard → decorator → service wiring works.

If anything is missing, Claude must STOP and ASK.

---

# 3. MINIMAL DIFF POLICY (STRICT)

Claude must:

- Make the smallest possible change.
- Avoid refactors unless explicitly requested.
- Avoid cleanup/reorganization.
- Avoid abstractions unless requested.
- Inline simple 1–5 line logic instead of creating new utils/hooks.
- Modify ONLY files approved in the plan.

Minimal diff = maximum safety.

---

# 4. REUSE-FIRST POLICY (STRICT)

Claude must ALWAYS reuse:

- Existing DTOs  
- Existing types  
- Existing decorators  
- Existing guards  
- Existing utils  
- Existing services  
- Existing repositories  
- Existing caching patterns  
- Existing validation schemas  
- Existing API client modules  

Never duplicate logic.  
Never create unnecessary abstractions.

When reuse is unclear → Claude must ASK.

---

# 5. FILE PLACEMENT RULES (NON-NEGOTIABLE)

Correct placement:

- DTOs → `dto/`
- Types → `types/`
- Schemas → `schemas/`
- Controllers → routing only
- Services → business logic only
- Repositories → DB access only
- Guards → auth logic only
- Decorators → RBAC metadata only
- Utils → pure helpers only

Forbidden:

- DTOs/types inside controllers or services
- Business logic inside controllers
- New directories without permission

Claude must ask if placement is unclear.

---

# 6. AREA-SPECIFIC RULESETS (SOP FILES)

Claude must route itself to the correct rule file based on the task.

### Supabase Auth / JWT / RBAC / Tenant Logic  
Use:
apps/api/claude-sop/supabase.md


### PostgreSQL / Prisma / Queries / Migrations  
Use:
apps/api/claude-sop/3-database-prisma.md


### Redis / Cache / Queues / Monitoring  
Use:
apps/api/claude-sop/4-cache-queues-monitoring.md


### DTOs / Validation / API Responses / Controllers  
Use:
apps/api/claude-sop/5-api-validation-structure.md


### Claude Behavior / Minimal Diff / Reuse Rules  
Use:
apps/api/claude-sop/6-agent-sop-claude.md


### NestJS Architecture / Modules / Wiring  
Use:
apps/api/claude-sop/1-runtime-framework.md


Claude must load BOTH this file and the relevant SOP file **before** planning or coding.

If Claude is unsure which SOP applies → Claude must ASK.

---

# 7. REQUIRED WORKFLOW CLAUDE MUST FOLLOW

### Step 1 — Read the main `CLAUDE.md`  
### Step 2 — Identify and load the correct SOP file(s)  
### Step 3 — Ask questions where context is missing  
### Step 4 — Produce a short plan  
### Step 5 — Wait for explicit human approval  
### Step 6 — Edit ONLY the approved files  
### Step 7 — Apply minimal diff  
### Step 8 — Self-review:

- SOP file followed  
- Patterns reused  
- File placement correct  
- No speculative code  
- No guessing  
- No unapproved abstractions  
- No missing org/team scopes (if applicable)  
- Guard chain enforced (if applicable)  
- DTOs/types correctly placed  

### Step 9 — Output final diff only  
(Unless asked otherwise.)

---

# 8. NO GUESSING (HARD RULE)

Claude must ask when unsure about:

- DTO definitions  
- Type structure  
- Folder placement  
- Error-handling conventions  
- Expected API shape  
- Query structure  
- DB schema  
- Migration rules  
- Pagination format  
- Guard/decorator usage  
- Scoping logic (org/team)  
- Existing utilities/hooks  

If ANYTHING is unclear → Claude must ASK.

No exceptions.

---

# 9. FAILURE BEHAVIOR

If Claude cannot follow a rule:

1. Stop immediately  
2. State which rule is unclear  
3. Ask for clarification  

Claude must never continue coding until alignment is confirmed.

---

# REDIRECTION NOTE

For specific rule files, Claude must redirect to:

- `claude-sop/1-runtime-framework.md`
- `claude-sop/2-supabase.md`
- `claude-sop/3-database-prisma.md`
- `claude-sop/4-cache-queues-monitoring.md`
- `claude-sop/5-api-validation-structure.md`
- `claude-sop/6-agent-sop-claude.md`

Claude must ALWAYS read the relevant SOP file BEFORE producing a plan.

---

# END OF FILE
