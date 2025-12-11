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

---

# END OF FILE
