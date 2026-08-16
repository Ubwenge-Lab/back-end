# Remediation — Appointment Check-in Role Bypass

## Priority: P3

### 1. Re-enable the role restriction
```typescript
@Put(':id/check-in')
@Roles(Role.RECEPTIONIST, Role.HOSPITAL_ADMIN)   // un-comment and add admin
```

### 2. Add a lint guard
Add an ESLint rule (or code review checklist) that rejects commented-out
`@Roles`/`@UseGuards` decorators — a silent-deactivation foot-gun.

### 3. Tests
- Receptionist → 200; patient/cashier → 403.

### Acceptance criteria
- [ ] Non-receptionist roles get 403 on check-in
- [ ] No commented-out security decorators remain
