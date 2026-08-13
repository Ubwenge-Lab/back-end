# Notification Read IDOR — LOW

`PUT /api/notifications/:id/read` passes only the notification ID. The service
updates that row without checking `userId` against the authenticated caller.

**Affected code:** `notifications.controller.ts:35-38` and
`notifications.service.ts:46-50`.

Any authenticated user who obtains another notification UUID can mark it read,
hiding an alert from the intended recipient. UUID entropy limits blind
guessing, but notification IDs can leak through the existing WebSocket issue.

**Status:** Static-confirmed.
