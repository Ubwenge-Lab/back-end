# Remediation — CSV Formula Injection

## Priority: P2

### 1. Neutralize formula-prefix characters
In `escapeField()`, prefix dangerous leading characters with a single quote
(or space):

```typescript
if (/^[=+\-@]/.test(str)) {
  str = "'" + str;   // Excel/Sheets then treat the cell as text
}
```

### 2. Defense in depth
1. Only allow known types in export cells (no free-form strings where
   possible); if strings must appear, run them through the sanitizer above.
2. Consider sending exports as `.xlsx` (via a library) instead of CSV —
   libraries that write typed cells do not interpret formulas from values.
3. Document the risk for admins who open exports.

### 3. Tests
- Unit: `escapeField('=1+1')` → `'=1+1'` (or `"'=1+1"`).
- Integration: export report containing a `=HYPERLINK(...)` patient name →
  CSV contains the quoted/sanitized form.

### Acceptance criteria
- [ ] No exported cell starts with `=`, `+`, `-`, or `@`
- [ ] Regression tests cover formula payloads
