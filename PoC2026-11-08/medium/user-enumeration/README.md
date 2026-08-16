# User Enumeration — MEDIUM (Static-Confirmed)

## Vulnerability Summary

Three signals let an attacker confirm whether an email is registered:

1. **Registration** returns `409 "Email already registered"` vs `201`.
2. **Login timing** differs (~1.6×) between existing and non-existing users
   (bcrypt only runs for existing users).
3. **Forgot-password** timing differs for the same reason.

**Status:** ⚠️ STATIC-CONFIRMED (previously observed live) — 2026-08-11
**Severity:** Medium (account enumeration → phishing/social engineering)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/auth/auth.service.ts`:

```typescript
// registerPatient (line ~369)
const existingUser = await this.usersService.findByEmail(dto.email);
if (existingUser) throw new ConflictException('Email already registered');  // ← 409

// login (line ~53)
const user = await this.usersService.findByEmail(dto.email);
if (!user) throw new UnauthorizedException('Invalid credentials');          // fast path
// bcrypt.compare only when user exists                                       // slow path

// forgotPassword (line ~848)
const user = await this.usersService.findByEmail(dto.email);
if (!user) { return { message: 'If your email is registered...' }; }        // fast path
// code generation + email send only when user exists                        // slow path
```

### 1.2 Timing profile (observed previously on live)

| Vector | Existing user | Non-existing |
|---|---|---|
| `POST /login` | ~1.47 s | ~0.90 s |
| `POST /forgot-password` | ~1.70 s | ~0.88 s |

---

## 2. Attack Chain

```
Attacker targets victims (e.g. staff emails from LinkedIn/company site)
  → POST /auth/register/patient  → 409 = account exists
  → POST /auth/login             → timing tells existence
  → POST /auth/forgot-password   → timing tells existence
  → confirm accounts → targeted phishing (e.g. fake pharmacy portal)
```

---

## 3. Evidence

```
Source: auth.service.ts (409 + timing asymmetry).
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Enumeration probe (parameterised) |
| `remediation.md` | Step-by-step remediation |
