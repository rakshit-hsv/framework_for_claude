# SUPABASE-AUTH-RBAC.md — STRICT BACKEND SECURITY RULES

These rules apply to backend API, Supabase auth, RBAC, org-scoping, multi-tenant safeguards, caching, and DTO hygiene.

Claude must follow these strictly when editing backend code.

---

# 1. SUPABASE JWT VALIDATION

Claude must always enforce:

- Validate JWT using **Supabase JWKS**.
- Never decode-only.
- Reject malformed, expired, or stale tokens.
- Trust **only server-validated** claims:
  - user_id
  - org_id
  - roles
  - permissions
- Never leak JWTs or internal claims.
- Never use service-role keys client-side.

---

# 2. AUTH MODEL (INTERNAL + ORG USERS)

Two distinct user classes:

- Internal users → `@Roles()`
- Org users → `@Permissions()`
- Mixed-access → `@MixedAuth()` (explicit only)

Mandatory guard chain:

1. `JwtAuthGuard`  
2. `RolesGuard` **or** `PermissionsGuard`  
3. Org-scope validation  

No bypassing or reordering allowed.

---

# 3. FAIL-CLOSED AUTHORIZATION

If an endpoint declares **no** roles/permissions:

- ALL org users are denied.
- ONLY internal users may proceed.

Default = DENY.

---

# 4. TENANT ISOLATION (MANDATORY)

Every data operation—query, join, mutation, aggregation, list, background job—must include:

- `organization_id`  
- `team_id` (when applicable)

Zero cross-tenant leakage is permitted.

---

# 5. MULTI-ORG USERS

For CSMs or multi-org accounts:

- Validate the requested org scope explicitly.
- Do not return data until scope is confirmed.

---

# 6. CACHE ISOLATION

Claude must enforce:

- Cache keys must include `organization_id` (and `team_id`).
- Never share cache across tenants.
- Invalidate cache on:
  - role changes  
  - permission changes  
  - org-scope changes  

---

# 7. DTO & API HYGIENE

Claude must follow:

- External API DTO → `snake_case`
- Internal code → `camelCase`
- Never expose internal fields (org scope, permissions, metadata).
- All list endpoints must include:
  - pagination  
  - filters  
- No unbounded queries.

DTOs belong ONLY in dto/ folder.

---

# 8. AUDIT RULES (NO LEAKAGE)

Claude must ensure:

- Log metadata only:
  - route  
  - org  
  - user  
  - failure reason  

Never log:

- JWTs  
- Claims  
- Sensitive metadata  
- Secrets  
- PII  


## 8.9 Additional Mandatory Safeguards (Required for 100% Compliance)

### 1. Explicit Decode-Only Rejection Rule
Claude must explicitly verify that **no part of the codebase uses decode-only JWT handling**.  
If any decode call is encountered (e.g., `jwt.decode()`, `decodeJwt()`), Claude MUST:

- Refuse to proceed  
- Ask for confirmation  
- Recommend replacing with full JWKS validation  

### 2. Guard Order Verification Checklist
Before modifying or adding any guarded endpoint, Claude must:

1. Inspect the controller file.  
2. Confirm the guard order EXACTLY matches:

@UseGuards(JwtAuthGuard, RolesGuard OR PermissionsGuard, OrgScopeGuard)


3. If guard order is unclear (due to decorators, inheritance, or mixed usage), Claude MUST ask the human.

### 3. Multi-Org CSM Clarification Rule
If user identity spans multiple organizations (CSM or similar), Claude must:

- Ask for the expected scoping behavior  
- Ask for the exact field representing "allowed orgs"  
- Never infer the multi-org mapping  

### 4. Nested DTO Leakage Check
Before returning any DTO, Claude must:

- Inspect all nested objects  
- Verify *no internal fields* (permissions, scopes, org mappings, JWT metadata) are included  
- Ask before returning any object containing fields not explicitly approved

### 5. Cache Invalidation Clarification Rule
Before applying caching to any Supabase-authenticated resource, Claude must ask:

- “What events invalidate this cache?”
- “Do role/permission/org changes affect this data?”
- “Is this safe to cache across internal vs org users?”

Never infer invalidation behavior from existing code.

---

# 9. RELATED SOP FILES

For complete coverage, also read:

- `3-database-prisma` — Tenant isolation in Prisma queries
- `5-error-handling-logging` — Logging rules, no PII/JWT leakage
- `7-queue-job-processing` — Tenant context in background jobs
- `8-api-design-patterns` — DTO hygiene, response formats

---

# 10. MANDATORY CHECKLIST

Before writing auth-related code, Claude must verify:

**JWT Handling:**
- [ ] Using JWKS validation, never decode-only
- [ ] Rejecting expired/malformed tokens
- [ ] Never exposing JWT or claims in responses/logs

**Authorization:**
- [ ] Guard chain in correct order (JwtAuthGuard → RolesGuard/PermissionsGuard → OrgScopeGuard)
- [ ] `@Roles()` for internal users
- [ ] `@Permissions()` for org users
- [ ] Fail-closed on missing decorators

**Tenant Isolation:**
- [ ] `organization_id` in every query
- [ ] `team_id` when applicable
- [ ] Cache keys include org/team
- [ ] Multi-org users explicitly validated

**Data Safety:**
- [ ] No internal fields in DTOs
- [ ] No sensitive data in logs
- [ ] Pagination on all lists

---

# END OF FILE
