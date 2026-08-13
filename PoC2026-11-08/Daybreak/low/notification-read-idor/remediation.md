# Remediation — Notification Read IDOR

Pass `req.user.sub` and update with both ID and owner:

```typescript
updateMany({ where: { id, userId }, data: { isRead: true } })
```

Require one affected row or return 404. Apply the same ownership predicate to
delete/read/detail operations and ensure `read-all` scopes by caller. Resolve
relational notifications to concrete recipient user IDs when created. Add a
two-user regression test proving one user cannot modify the other's alert.
