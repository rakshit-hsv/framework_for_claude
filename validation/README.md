# SOP Validation Framework

Automated validation and self-correction system for enforcing SOP rules on backend code.

## Overview

This framework provides:

1. **Validators** - Check code against SOP rules
2. **Runner** - Orchestrate validation across files
3. **Test Runner** - Test the validators themselves
4. **Self-Correction** - Auto-fix common violations

## Quick Start

```bash
# Install dependencies
npm install

# Run all validators on a directory
npm run validate -- /path/to/src

# Run specific SOP validators
npm run validate:prisma -- /path/to/src
npm run validate:supabase -- /path/to/src

# Run validator tests
npm run test
```

## Validators

### Available SOP Validators

| SOP File | Validators | Metrics |
|----------|------------|---------|
| 2-supabase | `supabase-auth`, `tenant-isolation`, `audit-logging` | Auth compliance, tenant isolation |
| 3-database-prisma | `prisma-queries`, `transactions` | Query patterns, transaction safety |
| 4-code-safety-patterns | `code-safety` | Code movement, closures |
| 5-error-handling-logging | `exception-types`, `logging` | Exception types, logging |
| 6-external-services-timing | `external-services` | Retry patterns, timing |
| 7-queue-job-processing | `job-processing` | Idempotency, job structure |
| 8-api-design-patterns | `api-design` | Guards, DTOs, documentation |
| 9-testing-code-quality | `code-quality` | Code smells, testability |

### Blocking Metrics

These metrics will block merge if they fail:

- `supabase-auth` - Security critical
- `tenant-isolation` - Data isolation
- `prisma-queries` - Query safety
- `transactions` - Data consistency
- `api-design` - Authorization guards

## Usage

### Command Line

```bash
# Validate directory against all SOPs
npx ts-node runner.ts /path/to/src

# Validate against specific SOP
npx ts-node runner.ts -s 3-database-prisma /path/to/src

# Run specific validators
npx ts-node runner.ts -v prisma-queries -v transactions /path/to/src

# Output formats
npx ts-node runner.ts -f json /path/to/src    # JSON output
npx ts-node runner.ts -f markdown /path/to/src # Markdown output

# Verbose mode
npx ts-node runner.ts --verbose /path/to/src
```

### Programmatic Usage

```typescript
import { runValidation } from './runner';

const summary = runValidation({
  targetDir: '/path/to/src',
  sopFiles: ['2-supabase', '3-database-prisma'],
  format: 'json',
  verbose: true,
});

if (!summary.passed) {
  console.error('Validation failed!');
  process.exit(1);
}
```

### Individual Validators

```typescript
import { validators, ValidationContext } from './validators';

const ctx: ValidationContext = {
  files: ['service.ts'],
  fileContents: new Map([['service.ts', fileContent]]),
};

const result = validators['prisma-queries'](ctx);

console.log(`Score: ${result.score}`);
console.log(`Violations: ${result.violations.length}`);
```

## Self-Correction

The self-correction module can automatically fix common violations:

```bash
# Run self-correction on a file
npx ts-node self-correction.ts src/service.ts

# Output corrected code to new file
npx ts-node self-correction.ts -o fixed.ts src/service.ts

# Limit iterations
npx ts-node self-correction.ts --max-iterations 5 src/service.ts
```

### Supported Auto-Fixes

| Rule | Fix |
|------|-----|
| `INV-ERROR-TYPE` | Replace `Error` with NestJS exceptions |
| `INV-LOGGER` | Replace `console.*` with Logger |
| `INV-PRISMA-SOFT-DELETE` | Add `deleted_at: null` filter |
| `INV-PRISMA-ORDERBY` | Add `orderBy` to findMany |

## Testing Validators

The test runner validates that validators correctly detect violations:

```bash
# Run all validator tests
npm run test

# Test specific validator
npx ts-node test-runner.ts prisma-queries
npx ts-node test-runner.ts supabase-auth
```

### Writing Test Cases

```typescript
const testCase: TestCase = {
  name: 'Missing orderBy in findMany',
  description: 'Detects findMany without orderBy clause',
  validator: 'prisma-queries',
  files: {
    'users.service.ts': `
      async getUsers(orgId: string) {
        return this.prisma.users.findMany({
          where: { organization_id: orgId },
        });
      }
    `,
  },
  expectedViolations: 1,
  expectedWarnings: 1,
  shouldPass: false,
};
```

## CI Integration

### GitHub Actions

```yaml
name: SOP Validation

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: cd validation && npm install

      - name: Run validators
        run: cd validation && npm run validate -- ../apps/api/src

      - name: Check results
        run: |
          if [ $? -ne 0 ]; then
            echo "Validation failed!"
            exit 1
          fi
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

CHANGED_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep '\.ts$')

if [ -n "$CHANGED_FILES" ]; then
  npx ts-node validation/runner.ts --fail-on-warnings $CHANGED_FILES
  if [ $? -ne 0 ]; then
    echo "SOP validation failed. Fix violations before committing."
    exit 1
  fi
fi
```

## Scoring

### Metric Weights

| Metric | Weight | Block on Fail |
|--------|--------|---------------|
| supabase-auth | 15% | Yes |
| tenant-isolation | 15% | Yes |
| prisma-queries | 15% | Yes |
| transactions | 10% | Yes |
| api-design | 5% | Yes |
| exception-types | 10% | No |
| logging | 5% | No |
| code-quality | 5% | No |
| external-services | 5% | No |
| job-processing | 5% | No |
| audit-logging | 5% | No |

### Thresholds

- **Block Merge**: Any blocking metric fails OR total score < 85%
- **Warning**: Non-blocking violations or score 85-95%
- **Pass**: No blocking violations AND score >= 85%

## Extending

### Adding New Validators

1. Add validator function in `validators.ts`:

```typescript
export function validateNewRule(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];

  for (const [file, content] of ctx.fileContents) {
    // Check rules...
  }

  return {
    sopFile: 'new-sop-file',
    metric: 'new-rule-compliance',
    score: calculateScore(violations),
    passed: violations.length === 0,
    violations,
    warnings,
    suggestions: [],
  };
}
```

2. Register in `validators` export:

```typescript
export const validators = {
  // ...existing validators
  'new-rule': validateNewRule,
};
```

3. Add to SOP mapping in `runner.ts`:

```typescript
const SOP_VALIDATOR_MAP: Record<string, ValidatorName[]> = {
  // ...existing mappings
  'new-sop-file': ['new-rule'],
};
```

4. Add test cases in `test-runner.ts`.

### Adding Auto-Fixes

Add patterns to `FIX_PATTERNS` in `self-correction.ts`:

```typescript
{
  rule: 'INV-NEW-RULE',
  pattern: /pattern-to-find/g,
  replacement: 'replacement-string',
  description: 'What this fix does',
}
```

## Troubleshooting

### Common Issues

1. **"Validator not found"**
   - Check validator name matches key in `validators` object
   - Use `--help` to see available validators

2. **False positives**
   - Some patterns may match incorrectly
   - Use `--skip-rules` to exclude specific rules
   - Submit PR to improve pattern matching

3. **Performance issues**
   - Limit files with `--include` pattern
   - Use `--exclude` for large directories

### Debug Mode

```bash
# Verbose output shows all checks
npx ts-node runner.ts --verbose /path/to/src

# JSON output for programmatic analysis
npx ts-node runner.ts -f json /path/to/src > results.json
```

## License

MIT
