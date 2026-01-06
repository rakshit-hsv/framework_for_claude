# AI Coding Guide: Claude Code + SOP Validation

## Document Overview

This document is the single source of truth for using Claude Code (CLI) and Cursor with our SOP validation system.

This guide covers:
- What SOPs are and why they exist
- Setup and installation
- Daily workflow for developers
- Rule files and when to use them
- CLI commands and validation
- How to communicate with Claude effectively
- Automation (pre-commit, CI)
- Troubleshooting

---

## Locked Decisions (Non-Negotiable)

These are fixed rules for working with Claude on our codebase:

| Area | Decision |
|------|----------|
| Rule files | Claude must read SOP files before writing any backend code |
| Tenant isolation | Every Prisma query must include `organization_id` filter |
| Auth | JWT must use JWKS validation, never decode-only |
| Error handling | Use NestJS exceptions, never generic `Error` |
| Logging | Use Logger service, never `console.log` |
| Transactions | Multi-table writes must use `$transaction` |
| Soft deletes | Queries must include `deleted_at: null` filter |
| Ordering | All `findMany` queries must have `orderBy` |
| Validation | Run `sop-validate --staged` before every commit |
| Minimal changes | Fix only what was asked. No refactoring unless requested |

---

## Terminology

| Term | Meaning |
|------|---------|
| SOP | Standard Operating Procedure. A rule file that defines how Claude should write code |
| Validator | A check that runs against code to verify SOP compliance |
| Blocker | A violation that must be fixed before merge |
| Warning | A violation that should be fixed but won't block merge |
| Tenant isolation | Ensuring data from one organization never leaks to another |

---

## Current State (Before SOPs)

Without rules, Claude:
- Creates endpoints without `organization_id` filters (security bug)
- Uses `console.log` instead of Logger
- Throws generic `Error` instead of `NotFoundException`
- Forgets `orderBy` on `findMany` (inconsistent results)
- Invents new patterns instead of following existing ones
- Over-engineers simple fixes

Result: Code review takes hours. Security bugs reach production.

---

## Target State (With SOPs)

With rules, Claude:
- Reads SOP files before writing code
- Adds `organization_id` filters automatically
- Uses proper NestJS exceptions
- Includes `orderBy`, pagination, soft-delete filters
- Follows existing codebase patterns
- Makes minimal, focused changes

Result: Code passes review. Ships same day.

---

## Setup (One Time)

### 1. Install the CLI

**One-liner (recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/rakshit-hsv/framework_for_claude/main/install.sh | bash
```

**Or manually:**

```bash
git clone https://github.com/rakshit-hsv/framework_for_claude.git ~/.sop-validate
cd ~/.sop-validate/validation
npm install && npm run build && npm link
```

### 2. Initialize in Your Project

```bash
cd your-backend-project
sop-validate init
```

Creates `./claude-sop-api/` with 9 rule files.

### 3. Point Claude to the Rules

Add to your project's `CLAUDE.md`:

```markdown
Read claude-sop-api/CLAUDE.md before writing any code.
```

For Cursor, add the same to `.cursorrules`.

---

## Rule Files

### Core Rules

| File | Purpose | When to Reference |
|------|---------|-------------------|
| `CLAUDE.md` | Master operating mode. Ask first, minimal changes, no inventing | Every session |
| `2-supabase.md` | Auth, guards, JWT validation, RBAC, fail-closed endpoints | Any endpoint work |
| `3-database-prisma.md` | Queries, tenant isolation, transactions, soft deletes | Any database work |

### Supporting Rules

| File | Purpose | When to Reference |
|------|---------|-------------------|
| `4-code-safety-patterns.md` | Refactoring, moving code, variable dependencies | Modifying existing code |
| `5-error-handling-logging.md` | NestJS exceptions, Logger service, sensitive data | Error handling, logging |
| `6-external-services-timing.md` | Timeouts, retries, external API calls | Third-party integrations |
| `7-queue-job-processing.md` | Job idempotency, tenant context, dead-letter queues | Background jobs |
| `8-api-design-patterns.md` | Response format, pagination, DTOs | API design |
| `9-testing-code-quality.md` | Testability, review checklist, security | Before code review |

---

## Daily Workflow

### Starting a Task

1. Tell Claude which rules apply:

```
I'm adding a new endpoint to fetch team assessments.
Read claude-sop-api/2-supabase.md and claude-sop-api/3-database-prisma.md first.
```

2. Ask for a plan:

```
Show me your plan before writing code.
List which files you'll modify and which patterns you'll follow.
```

3. Review and approve the plan before Claude writes code.

### Before Committing

```bash
sop-validate --staged
```

Fix all blockers before pushing.

### Reviewing a PR

```bash
sop-validate --commit <commit-hash>
```

Or validate a branch:

```bash
sop-validate --branch feature/my-feature
```

---

## CLI Commands

| Command | Use Case |
|---------|----------|
| `sop-validate init` | Copy rule files to project |
| `sop-validate --staged` | Check staged files (pre-commit) |
| `sop-validate --changed` | Check uncommitted changes |
| `sop-validate --full -d ./src` | Check entire codebase |
| `sop-validate --commit abc123` | Check a specific commit |
| `sop-validate --branch feature/x` | Check branch vs main |
| `sop-validate --staged --strict` | Stricter thresholds |
| `sop-validate --staged -s 3-database-prisma` | Check specific rules only |

---

## What the Validator Checks

### Blockers (Must Fix)

| Check | Rule |
|-------|------|
| Missing `organization_id` in queries | 3-database-prisma.md |
| Decode-only JWT | 2-supabase.md |
| Hard deletes on soft-delete tables | 3-database-prisma.md |
| Multi-table writes without `$transaction` | 3-database-prisma.md |
| Token/password in logs | 5-error-handling-logging.md |

### Warnings (Should Fix)

| Check | Rule |
|-------|------|
| `console.log` instead of Logger | 5-error-handling-logging.md |
| Generic `Error` instead of NestJS exceptions | 5-error-handling-logging.md |
| `findMany` without `orderBy` | 3-database-prisma.md |
| `findMany().length` instead of `count()` | 3-database-prisma.md |

---

## How to Communicate with Claude

### Starting a Task

**Bad:**
```
Add a new endpoint to get users
```

**Good:**
```
Read claude-sop-api/2-supabase.md and claude-sop-api/3-database-prisma.md.
Then add a GET /users endpoint that returns users for the current organization.
Show me your plan before writing code.
```

### Fixing a Bug

**Bad:**
```
Fix the bug in assessments.service.ts
```

**Good:**
```
Bug: Users can see assessments from other organizations.
File: src/assessments/assessments.service.ts, line 142.

Read claude-sop-api/3-database-prisma.md section on Tenant Isolation.
Show me what's wrong before proposing a fix.
Fix only the issue. No refactoring.
```

### Preventing Scope Creep

**Bad:**
```
Fix the null check
```

**Good:**
```
Fix ONLY the null check on line 42.
Do not:
- Add new abstractions
- Create helper functions
- Refactor surrounding code
- Add comments to unchanged code
```

---

## Automation

### Pre-commit Hook

Add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
sop-validate --staged --strict
```

Or with Husky:

```bash
npm install husky --save-dev
npx husky init
echo "sop-validate --staged" > .husky/pre-commit
```

### GitHub Actions

```yaml
name: SOP Validation
on: [push, pull_request]
jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install -g /path/to/sop-validation
      - run: sop-validate --full -f github --strict
```

---

## Troubleshooting

### "Claude keeps forgetting the rules"

Start every session with:
```
Read claude-sop-api/CLAUDE.md.
List the 3 most important rules before we start.
```

### "Validation fails on test files"

```bash
sop-validate --staged --exclude "*.spec.ts" --exclude "*.test.ts"
```

### "False positive on console.log"

For CLI code (not backend), skip logging rules:
```bash
sop-validate --staged --no-general
```

### "Claude is over-engineering"

Be explicit:
```
This is a simple fix. Do not:
- Add new abstractions
- Create helper functions
- Refactor surrounding code
- Add comments to unchanged code
```

---

## Success Criteria Checklist

- [ ] SOP files initialized in project (`sop-validate init`)
- [ ] `CLAUDE.md` references `claude-sop-api/CLAUDE.md`
- [ ] Pre-commit hook runs `sop-validate --staged`
- [ ] Claude is instructed to read rules before every task
- [ ] All blockers fixed before merge
- [ ] No tenant isolation violations in queries
- [ ] No decode-only JWT usage
- [ ] No `console.log` in backend services
- [ ] No generic `Error` throws

---

## Quick Reference

```
SETUP
  sop-validate init              → Add rules to project

VALIDATION
  sop-validate --staged          → Check staged files
  sop-validate --changed         → Check uncommitted
  sop-validate --full -d ./src   → Check entire codebase

CLAUDE PROMPTS
  "Read claude-sop-api/X.md"     → Load specific rules
  "Show plan before coding"      → Get approval first
  "Fix only what I asked"        → Prevent scope creep
  "Ask if unsure"                → Prevent guessing

KEY RULES
  2-supabase.md                  → Auth, guards, RBAC
  3-database-prisma.md           → Queries, tenant isolation
  5-error-handling-logging.md    → Exceptions, logging
```

---

## Feedback

If a rule is wrong, too strict, or missing a common bug pattern:
1. Update the rule file in the SOP repo
2. Notify the team
