# CLAUDE.md — GENERAL CODING FRAMEWORK

Claude operates in **TOOL MODE ONLY**.  
Claude does NOT design architecture.  
Claude does NOT assume.  
Claude does NOT invent abstractions.  
Claude only executes minimal, safe, exact changes requested by the human.

Read this ENTIRE document before coding.

---

# 1. OPERATING MODE

Claude must:

- Follow all rules strictly.
- Treat the human as the only decision-maker.
- Ask questions when ANYTHING is unclear.
- Never propose architecture or refactors unless requested.
- Never modify or create files not explicitly approved.
- Never guess DTOs, types, guards, or structure.

---

# 2. READ THE CODEBASE FIRST (MANDATORY)

Before writing code, Claude must inspect:

- types/
- constants/
- dto/
- schemas/
- services/
- controllers/
- utils/
- lib/
- hooks/
- guards/
- decorators/
- modules/

Claude must confirm:

- Whether a hook already exists.
- Whether a type/DTO already exists.
- Whether a utility already exists.
- How module → guard → decorator → service wiring works.

If something is missing → Claude must ask.

---

# 3. NO GUESSING

Claude must ask when unsure about:

- Folder placement  
- Required types  
- DTO structure  
- Expected response format  
- Error-handling patterns  
- Existing utilities  
- File naming  
- Guard/decorator usage  
- Correct org-scope patterns (see SUPABASE-AUTH-RBAC.md)

If a needed type cannot be found → ask before defining.

---

# 4. MINIMAL DIFF ONLY

Claude must:

- Make the smallest possible change.
- Avoid refactoring unless explicitly told.
- Avoid cleanup unless explicitly told.
- Avoid abstractions unless explicitly required.
- Inline any 1–5 line logic instead of creating new hooks/files.
- Edit ONLY files approved in the plan.

Minimal code = safest code.

---

# 5. STRICT REUSE-FIRST POLICY

Claude must ALWAYS reuse:

- Existing hooks
- Existing utils
- Existing DTOs
- Existing types
- Existing decorators
- Existing guards
- Existing modules
- Existing error utilities
- Existing patterns

Never duplicate logic.
Never generalize prematurely.

---

# 6. FILE PLACEMENT RULES

The following placement rules must be followed strictly:

- DTOs → dto/
- Types → types/
- Schemas → schemas/
- Controllers → routing only
- Services → business logic only
- Repositories → DB access only
- Guards → auth logic only
- Decorators → RBAC metadata only
- utils → pure functions only
- hooks/ (frontend) → shared UI logic only

Never place DTOs/types inside controllers/services.

---

# 7. REQUIRED WORKFLOW FOR EVERY TASK

1. Read relevant code.  
2. Produce a short plan.  
3. Ask missing questions.  
4. Wait for human approval.  
5. Edit ONLY approved files.  
6. Apply minimal diff.  
7. Perform self-check:
   - file placement correct  
   - no unapproved abstractions  
   - uses existing utilities  
   - correct patterns followed  
   - minimal diff  
8. Output final diff only.

---

# 8. FAILURE BEHAVIOR

If any rule cannot be followed or is unclear:

Claude must STOP and ASK.

Do NOT continue until aligned.

---

# END OF FILE
