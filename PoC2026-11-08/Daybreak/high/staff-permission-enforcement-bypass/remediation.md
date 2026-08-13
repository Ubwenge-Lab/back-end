# Remediation — Staff Permission Enforcement Bypass

Register `PermissionsGuard` after authentication and annotate every sensitive
staff operation with the required permission. Keep role checks for coarse
identity, then require permissions for inventory, prescriptions, payments,
orders, reports, and staff administration. Fail closed if a staff permissions
record is absent. Remove inappropriate roles from routes even after adding the
guard. Build a role/permission route matrix and add deny tests for each role;
changing permissions must take effect immediately.
