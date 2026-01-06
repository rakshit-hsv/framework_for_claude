# How This SOP System Was Built

## The Problem

AI coding agents (Claude, Cursor) produce inconsistent code. Same prompt, different results. Common issues:

- Missing `organization_id` filters (data leaks between tenants)
- `console.log` instead of Logger
- Generic `Error` instead of `NotFoundException`
- No `orderBy` on `findMany` (random ordering)
- Inventing patterns instead of following existing ones
- Over-engineering simple fixes

Code review became the bottleneck. Every PR needed 2+ hours of fixes.

---

## The Insight

Claude follows rules when you give it rules. The problem: we weren't giving it rules.

The solution: Write down every pattern, every gotcha, every "you should have known that" as explicit rules. Feed them to Claude before it writes code.

---

## Research Phase

### 1. Collected Pain Points

Sources:
- Code review comments (6 months)
- Production incidents (post-mortems)
- Slack threads ("why did Claude do X?")
- Debugging sessions

Patterns emerged:
- Tenant isolation failures (most common)
- Auth bypass bugs
- Inconsistent error handling
- N+1 queries
- Missing soft-delete filters

### 2. Studied Existing Solutions

Looked at:
- ESLint rules (too generic, can't catch business logic)
- SonarQube (good for metrics, bad for context)
- Custom lint rules (expensive to maintain)
- `.cursorrules` files (right idea, wrong execution)

Key learning: Rules need to be **readable by AI**, not just parseable by machines.

### 3. Analyzed What Works

Observed that Claude performs better when:
- Given explicit file paths to read
- Told to "ask if unsure"
- Constrained to "minimal changes only"
- Given examples of good vs bad code

---

## Design Decisions

### Rule File Format

Markdown, not JSON/YAML. Why:
- AI reads markdown natively
- Humans can read and edit easily
- Supports code examples inline
- No parsing required

### Rule Organization

Split by domain, not by severity:
```
2-supabase.md          → Auth, guards, JWT
3-database-prisma.md   → Queries, transactions
4-code-safety.md       → Refactoring patterns
5-error-handling.md    → Exceptions, logging
...
```

Why numbered: Establishes reading order. Core rules first.

### Validation CLI

Built a CLI that checks code against rules. Why:
- Pre-commit hook catches issues early
- CI blocks bad code from merging
- Developers get instant feedback
- Reduces code review burden

### Init Command

`sop-validate init` copies rules to project. Why:
- Rules live with the code
- Each project can customize
- No external dependency at runtime
- Works offline

---

## Implementation

### Phase 1: Rule Files (Week 1)

Wrote 9 rule files from collected pain points:
1. `CLAUDE.md` - Operating mode (tool, not designer)
2. `2-supabase.md` - Auth patterns
3. `3-database-prisma.md` - Query patterns
4. `4-code-safety-patterns.md` - Refactoring rules
5. `5-error-handling-logging.md` - Exceptions
6. `6-external-services-timing.md` - API calls
7. `7-queue-job-processing.md` - Background jobs
8. `8-api-design-patterns.md` - REST patterns
9. `9-testing-code-quality.md` - Review checklist

### Phase 2: Validation CLI (Week 2)

Built validators for each rule file:
- Pattern matching (regex on AST-like structures)
- Severity levels (blocker vs warning)
- File/line reporting
- Multiple output formats (console, JSON, GitHub)

### Phase 3: Git Integration (Week 2)

Added modes:
- `--staged` for pre-commit
- `--changed` for uncommitted
- `--commit` for specific commits
- `--branch` for PR review

### Phase 4: Distribution (Week 3)

Made it installable:
- `install.sh` for one-liner setup
- `npm link` for global CLI
- `sop-validate init` for project setup

---

## What Worked

1. **Explicit over implicit** - Writing "every query must have organization_id" beats assuming Claude knows this.

2. **Examples over descriptions** - Showing bad code → good code is clearer than explaining.

3. **Blockers vs warnings** - Not everything needs to block merge. Missing `orderBy` is less critical than missing tenant filter.

4. **Pre-commit validation** - Catching issues before commit is 10x better than catching in review.

5. **Readable rules** - Markdown files that humans and AI both understand.

---

## What Didn't Work

1. **Too many rules at once** - Initially had 200+ rules. Claude got confused. Cut to ~50 core rules.

2. **Overly strict thresholds** - 100% compliance blocked legitimate code. Relaxed to 85-95% depending on rule.

3. **Complex regex patterns** - AST parsing would be better but regex works for 90% of cases.

4. **Auto-fix everything** - Some fixes need human judgment. Better to report than auto-fix incorrectly.

---

## Metrics

Before SOPs:
- Code review time: 2+ hours per PR
- Tenant isolation bugs: 3-4 per month
- Auth bypasses: 1-2 per quarter

After SOPs:
- Code review time: 15-30 minutes per PR
- Tenant isolation bugs: 0 in 3 months
- Auth bypasses: 0 in 3 months

---

## Lessons Learned

1. **AI needs constraints** - Without rules, AI optimizes for "looks right" not "is right".

2. **Rules must be current** - Stale rules are worse than no rules. Update when patterns change.

3. **Validation must be fast** - Slow validation gets skipped. Keep under 5 seconds.

4. **Start with blockers** - Get the critical rules right first. Warnings can come later.

5. **Document the why** - Rules without explanation get ignored. Every rule needs context.

---

## Future Ideas

- [ ] AST-based validation (more accurate than regex)
- [ ] Auto-fix for common issues
- [ ] IDE integration (real-time validation)
- [ ] Rule versioning (track rule changes over time)
- [ ] Metrics dashboard (track compliance trends)
