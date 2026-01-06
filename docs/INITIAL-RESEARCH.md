# Initial Research: AI Code Quality Problem

## Discovery

### Observation

AI coding agents produce code that "looks right" but fails in production.

### Evidence

| Issue | Frequency | Impact |
|-------|-----------|--------|
| Missing tenant filters | 3-4/month | Data leaks between orgs |
| Wrong error types | Every PR | Inconsistent API responses |
| No orderBy on queries | Every PR | Random result ordering |
| console.log in services | Every PR | No structured logging |
| Decode-only JWT | 2/quarter | Auth bypass vulnerability |

### Root Cause

AI has no context about our codebase patterns. It generates "generic good code" not "our code".

---

## Research Questions

1. Why does AI produce inconsistent code?
2. What makes AI follow patterns correctly?
3. How do other teams solve this?
4. What's the minimum viable solution?

---

## Findings

### 1. Why Inconsistent Code?

AI optimizes for:
- Syntactically correct
- Looks like examples from training data
- Solves the immediate ask

AI doesn't know:
- Our multi-tenant architecture
- Our auth patterns
- Our error handling conventions
- Our database schema constraints

**Conclusion:** AI needs explicit context about our patterns.

### 2. What Makes AI Follow Patterns?

Tested different approaches:

| Approach | Result |
|----------|--------|
| Verbal instructions | Forgotten after 2-3 messages |
| System prompts | Better, but limited context |
| File references | Best - AI reads and follows |
| Examples (good/bad) | Very effective |
| Explicit constraints | Highly effective |

**Conclusion:** Written rules + examples + constraints work best.

### 3. How Do Others Solve This?

| Solution | Pros | Cons |
|----------|------|------|
| ESLint custom rules | Automated | Can't catch business logic |
| Code review | Catches everything | Slow, expensive |
| .cursorrules | AI-readable | No validation |
| Documentation | Human-readable | AI ignores it |
| Training/fine-tuning | Perfect fit | Expensive, inflexible |

**Conclusion:** Need AI-readable rules + automated validation.

### 4. Minimum Viable Solution

Requirements:
- [ ] Rules AI can read
- [ ] Rules humans can edit
- [ ] Automated checking
- [ ] Fast feedback loop
- [ ] Low maintenance

Solution: Markdown rules + CLI validator.

---

## Pain Points Collected

### From Code Reviews (6 months)

```
"Missing organization_id filter" - 47 occurrences
"Use NotFoundException not Error" - 32 occurrences
"Add orderBy to findMany" - 28 occurrences
"Use Logger not console.log" - 25 occurrences
"Wrap in transaction" - 18 occurrences
"Missing deleted_at filter" - 15 occurrences
```

### From Production Incidents

| Incident | Root Cause | Fix |
|----------|------------|-----|
| User saw other org's data | Missing org filter | Added tenant check |
| Auth bypass on admin route | Decode-only JWT | JWKS validation |
| Duplicate job processing | Non-idempotent job | Added idempotency key |
| Slow dashboard | N+1 queries | Batch loading |

### From Developer Feedback

> "Claude keeps inventing new patterns instead of following existing ones"

> "Every PR needs the same fixes"

> "I spend more time reviewing AI code than writing it myself"

---

## Hypothesis

If we give AI explicit, readable rules about our patterns, it will produce consistent, compliant code.

### Test Plan

1. Write rules for top 5 pain points
2. Test with Claude on real tasks
3. Measure compliance before/after
4. Iterate on rule clarity

### Success Metrics

| Metric | Before | Target |
|--------|--------|--------|
| Code review time | 2+ hours | < 30 min |
| Tenant isolation bugs | 3-4/month | 0 |
| Same-fix-different-PR | 80% | < 10% |

---

## Prototype Plan

### Week 1: Rules

Write markdown rules for:
1. Tenant isolation (organization_id)
2. Auth patterns (JWT, guards)
3. Error handling (NestJS exceptions)
4. Database queries (Prisma patterns)

### Week 2: Validation

Build CLI that:
1. Reads TypeScript files
2. Checks against rules
3. Reports violations
4. Integrates with git

### Week 3: Integration

1. Pre-commit hook
2. CI pipeline
3. Developer docs
4. Team rollout

---

## Decision Log

| Decision | Rationale | Date |
|----------|-----------|------|
| Markdown over JSON | AI reads markdown natively | Day 1 |
| CLI over IDE plugin | Works everywhere, CI-friendly | Day 3 |
| Blockers vs warnings | Not all violations equal | Day 5 |
| Init command | Rules should live with code | Day 7 |
| Regex over AST | Fast enough, simpler | Day 10 |

---

## Open Questions

1. ~~How to handle false positives?~~ → Warnings vs blockers
2. ~~How to keep rules updated?~~ → Version with code
3. How to measure long-term impact? → Track in metrics dashboard
4. How to handle rule conflicts? → Priority ordering
5. How to onboard new rules? → Test on sample PRs first
