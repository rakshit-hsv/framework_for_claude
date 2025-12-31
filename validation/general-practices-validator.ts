/**
 * General Best Practices Validator
 *
 * Validates code against universal TypeScript/Node.js best practices.
 * These are NOT codebase-specific rules - they apply to any code Claude writes.
 */

import { ValidationResult, Violation, Warning, ValidationContext } from './validators';

// ============================================================================
// GENERAL BEST PRACTICES RULES
// ============================================================================

export interface GeneralRule {
  id: string;
  name: string;
  description: string;
  category: 'security' | 'performance' | 'reliability' | 'maintainability' | 'error-handling';
  severity: 'critical' | 'high' | 'medium';
  check: (line: string, lineNum: number, context: LineContext) => RuleViolation | null;
}

export interface LineContext {
  prevLines: string[];
  nextLines: string[];
  fullContent: string;
  filename: string;
  inFunction: boolean;
  inClass: boolean;
  inTryCatch: boolean;
}

export interface RuleViolation {
  message: string;
  fix?: string;
}

// ============================================================================
// SECURITY RULES
// ============================================================================

const securityRules: GeneralRule[] = [
  {
    id: 'SEC-001',
    name: 'No eval()',
    description: 'eval() can execute arbitrary code and is a security risk',
    category: 'security',
    severity: 'critical',
    check: (line) => {
      if (/\beval\s*\(/.test(line)) {
        return {
          message: 'eval() usage detected - security vulnerability',
          fix: 'Use JSON.parse() for JSON, or Function constructor if absolutely necessary',
        };
      }
      return null;
    },
  },
  {
    id: 'SEC-002',
    name: 'No Function constructor',
    description: 'new Function() can execute arbitrary code',
    category: 'security',
    severity: 'high',
    check: (line) => {
      if (/new\s+Function\s*\(/.test(line)) {
        return {
          message: 'new Function() can execute arbitrary code',
          fix: 'Use regular functions or arrow functions instead',
        };
      }
      return null;
    },
  },
  {
    id: 'SEC-003',
    name: 'No innerHTML with user input',
    description: 'innerHTML with user input can lead to XSS',
    category: 'security',
    severity: 'critical',
    check: (line) => {
      if (/\.innerHTML\s*=/.test(line) && !/sanitize|escape|encode/i.test(line)) {
        return {
          message: 'innerHTML assignment without visible sanitization',
          fix: 'Use textContent, or sanitize HTML before assignment',
        };
      }
      return null;
    },
  },
  {
    id: 'SEC-004',
    name: 'No hardcoded credentials',
    description: 'Credentials should not be hardcoded in source',
    category: 'security',
    severity: 'critical',
    check: (line) => {
      // API keys
      if (/['"]sk-[a-zA-Z0-9]{20,}['"]/.test(line)) {
        return { message: 'Hardcoded API key detected', fix: 'Use environment variables' };
      }
      // Passwords
      if (/password\s*[:=]\s*['"][^'"]{4,}['"](?!.*\$\{)/.test(line) && !/example|test|mock/i.test(line)) {
        return { message: 'Hardcoded password detected', fix: 'Use environment variables' };
      }
      // AWS keys
      if (/AKIA[0-9A-Z]{16}/.test(line)) {
        return { message: 'AWS access key detected', fix: 'Use environment variables' };
      }
      return null;
    },
  },
  {
    id: 'SEC-005',
    name: 'No SQL string concatenation',
    description: 'String concatenation in SQL can lead to injection',
    category: 'security',
    severity: 'critical',
    check: (line, lineNum, ctx) => {
      if (/\$queryRaw`.*\$\{/.test(line) || /\$executeRaw`.*\$\{/.test(line)) {
        if (!line.includes('Prisma.sql') && !line.includes('Prisma.join')) {
          return {
            message: 'Raw SQL with string interpolation - potential SQL injection',
            fix: 'Use Prisma.sql`...` for parameterized queries',
          };
        }
      }
      if (/(SELECT|INSERT|UPDATE|DELETE).*\+\s*['"]?\s*\w+/.test(line)) {
        return {
          message: 'SQL string concatenation detected - potential injection',
          fix: 'Use parameterized queries',
        };
      }
      return null;
    },
  },
  {
    id: 'SEC-006',
    name: 'No exec/spawn with user input',
    description: 'Command execution with user input can lead to command injection',
    category: 'security',
    severity: 'critical',
    check: (line) => {
      if (/child_process|exec\(|spawn\(|execSync\(/.test(line)) {
        if (/\$\{|\+\s*\w+/.test(line)) {
          return {
            message: 'Command execution with variable input - potential command injection',
            fix: 'Validate and sanitize all inputs, use argument arrays instead of string',
          };
        }
      }
      return null;
    },
  },
];

// ============================================================================
// ERROR HANDLING RULES
// ============================================================================

const errorHandlingRules: GeneralRule[] = [
  {
    id: 'ERR-001',
    name: 'No empty catch blocks',
    description: 'Empty catch blocks hide errors',
    category: 'error-handling',
    severity: 'high',
    check: (line, lineNum, ctx) => {
      if (/catch\s*\([^)]*\)\s*{\s*}/.test(line)) {
        return {
          message: 'Empty catch block - errors will be silently ignored',
          fix: 'Log the error or rethrow with context',
        };
      }
      // Multi-line empty catch
      if (/catch\s*\([^)]*\)\s*{$/.test(line)) {
        const nextLine = ctx.nextLines[0] || '';
        if (/^\s*}/.test(nextLine)) {
          return {
            message: 'Empty catch block - errors will be silently ignored',
            fix: 'Log the error or rethrow with context',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ERR-002',
    name: 'No catch with just console.log',
    description: 'Catch blocks should handle errors, not just log',
    category: 'error-handling',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/catch\s*\([^)]*\)\s*{\s*console\.log/.test(line)) {
        return {
          message: 'Catch block only logs error but doesn\'t handle it',
          fix: 'Rethrow the error, recover, or return an error response',
        };
      }
      return null;
    },
  },
  {
    id: 'ERR-003',
    name: 'Async functions should handle errors',
    description: 'Async functions without try-catch can crash',
    category: 'error-handling',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/async\s+\w+\s*\([^)]*\)\s*{/.test(line)) {
        // Check if function body has try-catch or .catch
        const funcBody = ctx.nextLines.slice(0, 20).join('\n');
        if (/await\s/.test(funcBody) && !/try\s*{|\.catch\(/.test(funcBody)) {
          return {
            message: 'Async function with await but no error handling',
            fix: 'Add try-catch or .catch() for await calls',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ERR-004',
    name: 'Promise rejection handling',
    description: 'Promises should have rejection handlers',
    category: 'error-handling',
    severity: 'medium',
    check: (line) => {
      if (/new\s+Promise\s*\(/.test(line)) {
        // Check for reject parameter
        if (!/reject|_/.test(line)) {
          return {
            message: 'Promise created without reject handler',
            fix: 'Add reject parameter: new Promise((resolve, reject) => {...})',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'ERR-005',
    name: 'Error thrown should have message',
    description: 'Errors should have descriptive messages',
    category: 'error-handling',
    severity: 'medium',
    check: (line) => {
      if (/throw\s+new\s+\w*Error\s*\(\s*\)/.test(line)) {
        return {
          message: 'Error thrown without message',
          fix: 'Add descriptive error message',
        };
      }
      return null;
    },
  },
];

// ============================================================================
// PERFORMANCE RULES
// ============================================================================

const performanceRules: GeneralRule[] = [
  {
    id: 'PERF-001',
    name: 'Avoid await in loops',
    description: 'Sequential awaits in loops are slow',
    category: 'performance',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/for\s*\(|\.forEach\(|while\s*\(/.test(line)) {
        const loopBody = ctx.nextLines.slice(0, 15).join('\n');
        if (/await\s/.test(loopBody) && !/Promise\.all/.test(loopBody)) {
          return {
            message: 'await inside loop - runs sequentially instead of in parallel',
            fix: 'Use Promise.all() with map(), or batch the operations',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'PERF-002',
    name: 'No sync file operations',
    description: 'Sync file operations block the event loop',
    category: 'performance',
    severity: 'medium',
    check: (line) => {
      if (/readFileSync|writeFileSync|existsSync|readdirSync|statSync/.test(line)) {
        if (!/require\s*\(|import/.test(line)) { // Allow in require context
          return {
            message: 'Sync file operation blocks event loop',
            fix: 'Use async version (readFile, writeFile, etc.) with await',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'PERF-003',
    name: 'Avoid creating functions in loops',
    description: 'Functions created in loops waste memory',
    category: 'performance',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/for\s*\(|while\s*\(/.test(line)) {
        const loopBody = ctx.nextLines.slice(0, 10).join('\n');
        if (/function\s*\(|=>\s*{/.test(loopBody)) {
          // Check if it's a callback to a method (acceptable)
          if (!/\.(map|filter|reduce|forEach|find|some|every)\(/.test(loopBody)) {
            return {
              message: 'Function created inside loop',
              fix: 'Define function outside loop and reference it',
            };
          }
        }
      }
      return null;
    },
  },
  {
    id: 'PERF-004',
    name: 'Use Set for existence checks',
    description: 'Array.includes() is O(n), Set.has() is O(1)',
    category: 'performance',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/\.includes\(/.test(line)) {
        // Check if in a loop
        const prevLines = ctx.prevLines.slice(-10).join('\n');
        if (/for\s*\(|\.forEach\(|while\s*\(/.test(prevLines)) {
          return {
            message: 'Array.includes() in loop is O(n) per iteration',
            fix: 'Convert array to Set before loop, use Set.has()',
          };
        }
      }
      return null;
    },
  },
];

// ============================================================================
// RELIABILITY RULES
// ============================================================================

const reliabilityRules: GeneralRule[] = [
  {
    id: 'REL-001',
    name: 'No floating promises',
    description: 'Promises without await or .then() can fail silently',
    category: 'reliability',
    severity: 'high',
    check: (line, lineNum, ctx) => {
      // Check for function calls that likely return promises without await
      if (/^\s*this\.\w+\.\w+\([^)]*\);?\s*$/.test(line) && !line.includes('await')) {
        // Look for async indicators
        const fullContent = ctx.fullContent;
        const funcName = line.match(/this\.(\w+)\.(\w+)/)?.[2];
        if (funcName && /^(create|update|delete|save|send|fetch|post|get|put|patch)/.test(funcName)) {
          return {
            message: 'Potential floating promise - async operation without await',
            fix: 'Add await before the call, or use .then()/.catch()',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'REL-002',
    name: 'Check for null/undefined before access',
    description: 'Accessing properties on null/undefined causes runtime errors',
    category: 'reliability',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      // Accessing properties on potential null
      if (/\w+\.\w+\.\w+/.test(line)) {
        // Check if there's optional chaining or null check
        if (!/\?\.|!\.|\?\[|if\s*\(!?\w+\)/.test(line)) {
          const prevLines = ctx.prevLines.slice(-5).join('\n');
          if (!/if\s*\(!?\w+\)|&&\s*\w+/.test(prevLines)) {
            // This is a heuristic - may have false positives
            return null; // Too many false positives, skip
          }
        }
      }
      return null;
    },
  },
  {
    id: 'REL-003',
    name: 'No mutation of function parameters',
    description: 'Mutating parameters causes unexpected side effects',
    category: 'reliability',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      // Check if we're inside a function
      if (ctx.inFunction) {
        // Parameter mutation patterns
        if (/^\s*\w+\.\w+\s*=/.test(line)) {
          // Check if variable is a parameter
          const funcDef = ctx.prevLines.slice(-15).join('\n');
          const paramMatch = funcDef.match(/\(([^)]+)\)/);
          if (paramMatch) {
            const params = paramMatch[1].split(',').map(p => p.trim().split(':')[0].trim());
            const mutatedVar = line.match(/^\s*(\w+)\./)?.[1];
            if (mutatedVar && params.includes(mutatedVar)) {
              return {
                message: `Mutating function parameter '${mutatedVar}'`,
                fix: 'Create a copy of the parameter before modifying',
              };
            }
          }
        }
      }
      return null;
    },
  },
  {
    id: 'REL-004',
    name: 'Timeout in async operations',
    description: 'Async operations should have timeouts',
    category: 'reliability',
    severity: 'medium',
    check: (line) => {
      if (/fetch\(|axios\.|httpService\./.test(line)) {
        if (!/timeout|signal|AbortController/.test(line)) {
          return {
            message: 'HTTP request without timeout',
            fix: 'Add timeout option or AbortController signal',
          };
        }
      }
      return null;
    },
  },
];

// ============================================================================
// MAINTAINABILITY RULES
// ============================================================================

const maintainabilityRules: GeneralRule[] = [
  {
    id: 'MAINT-001',
    name: 'No magic numbers',
    description: 'Magic numbers should be named constants',
    category: 'maintainability',
    severity: 'medium',
    check: (line) => {
      // Common magic numbers
      if (/[^a-zA-Z0-9_](86400|3600|1000|60000|5000|10000|30000)[^0-9]/.test(line)) {
        if (!/const|let|var|=\s*\d+;?\s*\/\//.test(line)) {
          return {
            message: 'Magic number detected',
            fix: 'Extract to named constant (e.g., const TIMEOUT_MS = 5000)',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'MAINT-002',
    name: 'No deeply nested callbacks',
    description: 'Deep nesting reduces readability',
    category: 'maintainability',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      const indent = line.match(/^(\s*)/)?.[1].length || 0;
      if (indent > 20) { // More than 5 levels (4 spaces each)
        if (/=>\s*{|function\s*\(|\{\s*$/.test(line)) {
          return {
            message: 'Deeply nested code (>5 levels)',
            fix: 'Extract to separate functions or use early returns',
          };
        }
      }
      return null;
    },
  },
  {
    id: 'MAINT-003',
    name: 'No commented-out code',
    description: 'Commented code should be removed',
    category: 'maintainability',
    severity: 'medium',
    check: (line) => {
      if (/^\s*\/\/\s*(const|let|var|if|for|while|return|await|function|class|import)\s/.test(line)) {
        return {
          message: 'Commented-out code detected',
          fix: 'Remove commented code, use version control for history',
        };
      }
      return null;
    },
  },
  {
    id: 'MAINT-004',
    name: 'Avoid any type',
    description: '"any" type defeats TypeScript benefits',
    category: 'maintainability',
    severity: 'medium',
    check: (line) => {
      if (/:\s*any\s*[;,=)\]]|as\s+any\b/.test(line)) {
        return {
          message: 'Usage of "any" type',
          fix: 'Use proper type, unknown, or generic',
        };
      }
      return null;
    },
  },
  {
    id: 'MAINT-005',
    name: 'Function too long',
    description: 'Long functions are hard to maintain',
    category: 'maintainability',
    severity: 'medium',
    check: (line, lineNum, ctx) => {
      if (/async\s+\w+\s*\(|function\s+\w+\s*\(/.test(line)) {
        // Count lines until function end
        let braceCount = 0;
        let started = false;
        let lineCount = 0;

        for (let i = 0; i < ctx.nextLines.length && i < 100; i++) {
          const l = ctx.nextLines[i];
          if (l.includes('{')) { started = true; braceCount += (l.match(/{/g) || []).length; }
          if (l.includes('}')) braceCount -= (l.match(/}/g) || []).length;
          if (started) lineCount++;
          if (started && braceCount === 0) break;
        }

        if (lineCount > 50) {
          return {
            message: `Function is ${lineCount} lines (>50 lines)`,
            fix: 'Extract logic into smaller functions',
          };
        }
      }
      return null;
    },
  },
];

// ============================================================================
// MAIN VALIDATOR
// ============================================================================

export function validateGeneralPractices(ctx: ValidationContext): ValidationResult {
  const violations: Violation[] = [];
  const warnings: Warning[] = [];
  const suggestions: string[] = [];

  const allRules = [
    ...securityRules,
    ...errorHandlingRules,
    ...performanceRules,
    ...reliabilityRules,
    ...maintainabilityRules,
  ];

  for (const [filename, content] of ctx.fileContents) {
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      const lineNum = index + 1;

      // Build context
      const lineContext: LineContext = {
        prevLines: lines.slice(Math.max(0, index - 15), index),
        nextLines: lines.slice(index + 1, Math.min(index + 30, lines.length)),
        fullContent: content,
        filename,
        inFunction: checkInFunction(lines, index),
        inClass: checkInClass(lines, index),
        inTryCatch: checkInTryCatch(lines, index),
      };

      // Run all rules
      for (const rule of allRules) {
        const violation = rule.check(line, lineNum, lineContext);

        if (violation) {
          if (rule.severity === 'critical' || rule.severity === 'high') {
            violations.push({
              file: filename,
              line: lineNum,
              rule: rule.id,
              message: violation.message,
              severity: rule.severity,
              fix: violation.fix,
            });
          } else {
            warnings.push({
              file: filename,
              line: lineNum,
              rule: rule.id,
              message: violation.message,
            });
          }
        }
      }
    });
  }

  const criticalCount = violations.filter(v => v.severity === 'critical').length;
  const highCount = violations.filter(v => v.severity === 'high').length;
  const score = Math.max(0, 1 - (criticalCount * 0.3) - (highCount * 0.1) - (warnings.length * 0.02));

  return {
    sopFile: 'general-practices',
    metric: 'general-best-practices',
    score,
    passed: criticalCount === 0,
    violations,
    warnings,
    suggestions,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function checkInFunction(lines: string[], currentIndex: number): boolean {
  let braceCount = 0;
  for (let i = currentIndex; i >= 0; i--) {
    const line = lines[i];
    braceCount += (line.match(/}/g) || []).length;
    braceCount -= (line.match(/{/g) || []).length;
    if (/async\s+\w+|function\s+\w+/.test(line) && braceCount <= 0) {
      return true;
    }
  }
  return false;
}

function checkInClass(lines: string[], currentIndex: number): boolean {
  for (let i = currentIndex; i >= 0; i--) {
    if (/^class\s+\w+/.test(lines[i])) return true;
    if (/^export\s+class\s+\w+/.test(lines[i])) return true;
  }
  return false;
}

function checkInTryCatch(lines: string[], currentIndex: number): boolean {
  let braceCount = 0;
  for (let i = currentIndex; i >= 0; i--) {
    const line = lines[i];
    braceCount += (line.match(/}/g) || []).length;
    braceCount -= (line.match(/{/g) || []).length;
    if (/try\s*{/.test(line) && braceCount <= 0) return true;
    if (/catch\s*\([^)]*\)\s*{/.test(line) && braceCount <= 0) return true;
  }
  return false;
}

// ============================================================================
// EXPORTS
// ============================================================================

export const generalRules = {
  security: securityRules,
  errorHandling: errorHandlingRules,
  performance: performanceRules,
  reliability: reliabilityRules,
  maintainability: maintainabilityRules,
};

export default validateGeneralPractices;
