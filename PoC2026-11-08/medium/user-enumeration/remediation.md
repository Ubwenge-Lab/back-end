# Remediation — User Enumeration

## Priority: P2

### 1. Uniform responses
1. Registration: return the same 201 + generic message whether or not the
   email exists (do the uniqueness check inside, but respond identically).
2. Login/forgot-password already return identical messages — keep that.

### 2. Remove the timing side-channel
1. Always run `bcrypt.compare` (or a dummy hash) even when the user does not
   exist:
   ```typescript
   const dummyHash = await bcrypt.hash('dummy', 10);   // cache it
   const isPasswordValid = user
     ? await bcrypt.compare(dto.password, user.password)
     : await bcrypt.compare(dto.password, dummyHash);
   ```
2. Add a small constant delay (± random) to `login` and `forgot-password`.
3. Rate-limit registration per IP/email (already throttled at 5/min — keep).

### 3. Reduce impact
- Never reveal in error messages whether an account exists.
- Consider CAPTCHA/Proof-of-Work on registration to slow enumeration.

### Acceptance criteria
- [ ] Registration responds identically for existing/new emails
- [ ] Login/forgot-password timings are statistically indistinguishable
