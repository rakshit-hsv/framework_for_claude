# CLAUDE.md

This file provides strict guidance to Claude Code (claude.ai/code) when working with code in this repository.  
Be extremely concise. Prioritize correctness, security, minimalism.

---

# PURPOSE

Claude = tool.  
Human = decision-maker.  
Claude executes; never designs.

Claude must always read the codebase first, reuse existing patterns, and write minimal guaranteed-working code only.

---

# CORE SECURITY PRINCIPLES

## 1. Strict JWT Validation (Supabase)
- Always validate tokens via **JWKS**.  
- Never use decode-only.  
- Reject expired/malformed tokens.  
- Trust only server-side verified claims: `user_id`, `org_id`, `roles`, `permissions`.  
- Never expose JWTs or internal claims.  
- Never use service-role or secrets in client code.

## 2. Dual-Auth Model (Internal + Org Users)
Auth pipeline (mandatory):

1. `JwtAuthGuard`  
2. `RolesGuard` or `PermissionsGuard`  
3. Org-scope validation

Rules:
- Internal users → `@Roles()`  
- Org users → `@Permissions()`  
- Use `@MixedAuth` only when explicitly allowed  
- Endpoints with no declared roles/permissions → deny org users (fail-closed)

## 3. Tenant/Org Isolation
All data operations (queries, writes, lists, joins, aggregations, background jobs) MUST include:

- `organization_id`
- `team_id` where relevant

No cross-tenant leakage.  
Multi-org users (CSMs) must validate requested org scope explicitly.

## 4. Cache Isolation
- Cache keys MUST include `organization_id` (and `team_id` if applicable).  
- Never share cache entries across tenants.  
- Invalidate caches on role/permission/org-scope changes.

## 5. DTO & API Hygiene
- External API: `snake_case`  
- Internal code: `camelCase`  
- Do not expose internal fields (org scope, permissions, metadata).  
- Pagination required on all list endpoints.  
- DTOs must stay in DTO files, types in `types/`, schemas in `schemas/`.  
- **Never write types/DTOs inside service/controller files.**

## 6. Audit Without Leakage
- Log only metadata: route, org, user, result.  
- Never log JWTs, secrets, claims, PII.  
- Validate feature flags/entitlements per org/user before applying.

---

# CLAUDE DEVELOPMENT PRINCIPLES

## 1. Claude Must Read the Codebase First
Claude must inspect:

- `constants/`, `types/`, `dtos/`, `schemas/`  
- `hooks/`, `guards/`, `decorators/`, `auth/`  
- `lib/`, `utils/`, existing modules  
- Existing implementations of the feature  
- **Check existing route/module/guard wiring before adding decorators.**

If any context is missing → Claude must ask.

---

## 2. No New Hooks/Utilities Unless Explicitly Required
- If logic is **1–5 lines**, inline it.  
- Reuse existing hooks/utilities.  
- Do not create new abstractions for single pages or trivial flows.  
- No refactoring or “cleanup” unless explicitly approved.

---

## 3. Minimal-Diff, Minimal-Code
Claude must:

- Write the smallest possible change  
- Modify **only the approved files**  
- Follow existing naming + structure  
- Avoid abstractions, refactors, complexity  
- Output code that is simple, explicit, and guaranteed to work

---

## 4. Claude Does Not Make Decisions
Forbidden without explicit instruction:

- Architecture choices  
- Pattern changes  
- New libraries  
- Creating shared utilities  
- Reorganizing directory structure  
- Making code “generic for reuse”

Claude executes; humans decide.

---

## 5. Ask When Ambiguous (“No Guessing”)
Claude must ask whenever unsure about:

- Which hook to reuse  
- Which guard/decorator applies  
- Correct org-scope logic  
- DTO boundaries + placement  
- File/folder conventions  
- Error-handling pattern  
- Type naming + imports  
- Module wiring  

**If the needed type/DTO isn’t found, Claude must ask before defining it.**

No assumptions.

---

## 6. Reuse Everything That Exists
Claude MUST reuse:

- Existing types (`types/`)  
- DTOs (`dtos/`)  
- Guards/decorators  
- Validations  
- Utils/helpers  
- Error-handling patterns  
- API client modules  

Never duplicate logic.

---

## 7. No Misplaced Code
Strict placement rules:

- DTOs → `dtos/`  
- Types → `types/`  
- Validation schemas → `schemas/`  
- Guards/decorators → `auth/` or `guards/`  
- Service logic → service files only  
- Controller routing → controller files only  

Never place DTOs or types inside services/controllers.  
Never place business logic inside controllers.

---

## 8. Security > Convenience
Claude must prioritize:

- Verified claims > inferred claims  
- Fail-closed defaults  
- Minimal stable code  
- Strict scoping  
- Tenant isolation  
- Correct decorator order  
- Correct error surfacing

---

## 9. Code Footprint Must Be Minimal
Claude must:

- Keep code short  
- Avoid abstractions  
- Avoid unnecessary branching  
- Avoid premature optimization  
- Avoid “helperizing” simple logic  

Simplicity > cleverness.

---

## 10. Self-Check Before Output
Claude must verify:

- JWT validation flow correct  
- Guards/decorators correctly ordered  
- Org-scope enforced  
- Tenant isolation present in all queries  
- Cache isolation rules followed  
- Types/DTOs correctly placed  
- No undefined types; no guessed types  
- Only approved files edited  
- Minimal diff respected  
- Patterns match existing repo

---

# REQUIRED WORKFLOW (MANDATORY)

1. Read relevant code + folder structure.  
2. Produce a short plan.  
3. Ask for missing context.  
4. Wait for human approval.  
5. **Only edit files explicitly approved in the plan.**  
6. Apply minimal diff with correct file placement.  
7. Run self-review:  
   - Security (JWT, RBAC, scope)  
   - Minimalism  
   - Pattern reuse  
   - No misplaced DTOs/types  
   - No unauthorized abstractions  
8. Output final diff only.

---

# IF CLAUDE VIOLATES ANY RULE  
Claude must stop and ask for clarification.

---

# END OF FILE
