# CSV Formula Injection — MEDIUM (Static-Confirmed)

## Vulnerability Summary

The report-export CSV builder (`csv-builder.util.ts`) escapes quotes/commas
but **not leading spreadsheet formula characters** (`=`, `+`, `-`, `@`).
Values like `=HYPERLINK("https://evil","Click")` or `=cmd|'/C calc'!A0` in
exported cells execute or link when opened in Excel/Sheets.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Medium (client-side code execution / phishing when opening exports)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/reports/utils/csv-builder.util.ts:16-31`:

```typescript
function escapeField(value: unknown): string {
  ...
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;            // ← '=' , '+' , '-' , '@' pass through untouched
}
```

The reports are built from DB records whose fields include patient names,
pharmacy names, and descriptions. A malicious value (e.g. a patient named
`=1+1` or a description starting with `=HYPERLINK(...)`) will be written
verbatim into the CSV.

### 1.2 Attack surface
- `GET /api/reports/appointments|revenue|prescriptions` (HOSPITAL_ADMIN /
  SUPER_ADMIN) → CSV export containing patient/hospital-provided strings.
- CSV injection is a **stored** payload: the trigger is the admin opening the
  exported file in a spreadsheet app.

---

## 2. Attack Chain

```
Attacker (patient or hospital staff) sets a field to:
  =HYPERLINK("https://evil.example","Open report")     or
  =cmd|'/C powershell -enc ...'!A0                      (Windows Excel)
  =1+1,  @SUM(...),  -2+3
  → hospital admin exports a report → opens in Excel
  → formula executes → phishing link / external fetch / local command (older Excel)
```

---

## 3. Evidence

```
Source: csv-builder.util.ts escapeField() — no formula-character sanitization.
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Build a CSV with a formula payload and verify it is emitted raw |
| `remediation.md` | Step-by-step remediation |
