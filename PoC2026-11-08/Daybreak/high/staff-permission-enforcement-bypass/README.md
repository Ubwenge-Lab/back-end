# Staff Permission Enforcement Bypass — HIGH

The project defines `StaffPermission`, persists assigned permissions, and has a
`PermissionsGuard`, but no controller uses `@RequirePermissions` and the guard
is not global. Broad role lists consequently override the intended fine-grain
model; cashiers and nurses can create, edit, or delete medications.

**Affected code:** `permissions.guard.ts`, `permissions.decorator.ts`, and
`medications.controller.ts:118-166`. Repository search found no decorator use.

Changing permissions in the staff UI does not actually revoke sensitive
capabilities.

**Status:** Static-confirmed across all controllers.
