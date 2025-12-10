# CLAUDE-CODING-FRAMEWORK.md

This document defines the **deep, strict, non-negotiable rules** Claude must follow when interacting with ANY part of this codebase: backend, frontend, Supabase, DB, APIs, cache, workers, scripts, infra, migrations.

Claude operates in **TOOL MODE ONLY**.  
Claude does NOT design.  
Claude does NOT assume.  
Claude does NOT invent.  
Claude only executes precisely what the human instructs.

Read this ENTIRE document before producing any code.

---

# 1. OPERATING MODE (TOOL MODE — NO AUTONOMY)

Claude must always:

1. Obey every rule in this file with zero exceptions.
2. Treat the human as the sole decision-maker.
3. Ask questions whenever ANYTHING is unclear.
4. Never propose architecture.
5. Never introduce abstractions unless explicitly requested.
6. Never generalize logic unless used in multiple known places.
7. Never modify or create files not explicitly approved.

Claude’s purpose is execution, not creativity.

---

# 2. READ THE CODEBASE BEFORE CODING (MANDATORY)

Before writing any code, Claude must:

1. Read all relevant code:
   - types/
   - constants/
   - dto/
   - schemas/
   - services/
   - controllers/
   - lib/
   - utils/
   - guards/
   - decorators/
   - hooks/
   - modules/
   - migrations/

2. Check module → guard → decorator → service → repository wiring.
3. Identify existing helpers before writing ANY new logic.
4. Identify existing hooks before writing ANY new hook.
5. Identify existing DTOs and types before defining ANY new structures.
6. Identify existing DB patterns, tenant filters, indexing patterns.

If any needed structure is not found → Claude must ask instead of guessing.

No reading → no coding.

---

# 3. NO GUESSING (STRICT)

Claude must ask when unsure about ANY of the following:

- Correct type or DTO.
- Correct folder for the code.
- Required permissions or roles.
- Required org/team scope.
- Expected pagination shape.
- Expected API response format.
- Expected DB schema fields.
- Expected error-handling pattern.
- Correct guard chain.
- Whether a hook/helper already exists.

If a type or DTO is not found → Claude must ask before defining it.

Nothing may be assumed.  
EVERY ambiguity must lead to a question.

---

# 4. MINIMAL DIFF, MINIMAL CODE

Claude must:

1. Make the smallest possible change.
2. Avoid refactoring unless explicitly asked.
3. Avoid “cleanup” or reorganizing code.
4. Avoid new abstractions for simple 1–5 line logic.
5. Inline trivial logic unless explicitly instructed otherwise.
6. Only edit files explicitly approved in the plan.

Minimal diff = highest safety.

---

# 5. STRICT REUSE-FIRST POLICY

Claude must ALWAYS reuse:

- Existing types.
- Existing DTOs.
- Existing guards.
- Existing decorators.
- Existing hooks.
- Existing utils.
- Existing cache helpers.
- Existing error patterns.
- Existing schema validation.
- Existing API client modules.

Do not duplicate logic.  
Do not reinvent utilities.  
Do not generalize prematurely.

---

# 6. FILE PLACEMENT RULES (DO NOT VIOLATE)

Correct placement is non-negotiable:

- DTOs → dto/
- Types → types/
- Schemas → schemas/
- Controllers → routing only
- Services → business logic
- Repositories → DB access
- Guards → auth logic
- Decorators → auth RBAC metadata
- Utils → pure functions only
- Hooks (frontend) → reusable UI logic only

Never place DTOs or types inside services or controllers.  
Never place business logic inside controllers.

---

# 7. AUTH, RBAC, MULTI-ORG (SUPABASE STRICT MODE)

Claude must enforce ALL of the following:

## 7.1 JWT Validation (Mandatory)
- Validate Supabase JWT using JWKS.
- Never decode-only.
- Reject expired/malformed tokens.
- Reject stale tokens.
- Trust only server-validated claims: user_id, org_id, roles, permissions.
- Never leak JWT or claims.
- Never use service-role keys client-side.

## 7.2 Dual-Auth Model Rules
- Internal users → Roles()
- Org users → Permissions()
- MixedAuth only when explicitly allowed.

Guard order must ALWAYS be:

1. JwtAuthGuard  
2. RolesGuard or PermissionsGuard  
3. Org-scope validation

Never bypass or reorder guards.

## 7.3 Fail-Closed Authorization
If no roles or permissions declared:
- Deny ALL org users.
- Only internal users may pass.

Default = deny.

## 7.4 Tenant Isolation (MANDATORY)
Every DB query must include:

- organization_id  
- team_id (when applicable)

No query, join, aggregation, mutation, list, or background job may operate without org/team filtering.

Zero cross-tenant leakage tolerated.

## 7.5 Multi-Org Users
For users spanning multiple orgs (CSMs):
- Validate requested org scope explicitly before returning data.

## 7.6 Cache Isolation
- Cache keys must include organization_id (and team_id).
- Never share cache entries across orgs.
- Invalidate caches when permissions or org scope change.

## 7.7 DTO and API Hygiene
- API DTOs in snake_case.
- Internal code in camelCase.
- Never expose internal fields (org scope, permissions, metadata).
- All list endpoints must be paginated.
- Never allow unbounded responses or queries.

## 7.8 Audit Without Leakage
- Log only safe metadata (route, org, user, failure reason).
- Never log JWTs, claims, or PII.
- Feature flags and entitlements must be validated per-org and per-user.

---

# 8. DATABASE DISCIPLINE

Claude must:

1. Inspect schema before coding.
2. Never alter schema without explicit approval.
3. Never create tables, indexes, relations unless explicitly told to.
4. Enforce org/team filtering at ALL levels.
5. Avoid N+1 patterns.
6. Follow existing repository patterns.
7. Validate relational correctness before writing queries.
8. Use precise, minimal queries.

---

# 9. API DEVELOPMENT RULES

Claude must:

1. Follow existing API shapes.
2. Use correct DTOs for request/response.
3. Keep controllers thin.
4. Put all logic in services.
5. Never expose internal fields or claims.
6. Enforce pagination & filters on all list endpoints.
7. Return consistent error structure.

---

# 10. FRONTEND/UI RULES (IF APPLICABLE)

1. Never create new hooks for small logic.
2. Reuse existing components and hooks.
3. Keep components small.
4. Follow established state patterns (Query/Context/etc.).
5. Correct folder placement is mandatory.

---

# 11. REQUIRED PRE-WORK FOR EVERY TASK

Claude must do the following BEFORE writing code:

1. Locate relevant types, constants, DTOs, schemas.
2. Inspect existing services, clients, and utils for reuse.
3. Identify correct guard chain and org-scope enforcement.
4. Ensure no ambiguity remains; ask questions if needed.
5. Ensure minimal, safe, predictable changes.

---

# 12. WORKFLOW CLAUDE MUST FOLLOW

1. Read all relevant code.
2. Produce a short plan.
3. Ask questions where needed.
4. Wait for approval.
5. Only edit files explicitly listed in the approved plan.
6. Apply minimal diff following all rules.
7. Perform self-check:
   - JWT validation correct
   - Guard chain correct
   - Tenant/org/team scope applied everywhere
   - Correct DTO/type placement
   - No speculative code
   - No unauthorized abstractions
   - Reuse-first enforced
   - No cross-tenant leakage
8. Output final diff only. No commentary.

---

# 13. FAILURE BEHAVIOR

If any rule is violated or unclear:

Claude must STOP and ASK.

Claude must not proceed until aligned.

---

# END OF FILE
