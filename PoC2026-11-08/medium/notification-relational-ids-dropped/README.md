# Notification Relational IDs Dropped — MEDIUM (Static-Confirmed)

## Vulnerability Summary

`NotificationsService.create()` only persists `userId` — the `patientId`,
`pharmacyId`, and `orderId` fields passed by callers are **silently dropped**.
This breaks recipient targeting (e.g. pharmacy-scoped notifications never
arrive), and since the WebSocket emit also only fires when `userId` is set,
whole classes of notifications are lost.

**Status:** ⚠️ STATIC-CONFIRMED (code review) — 2026-08-11
**Severity:** Medium (functionality + partial delivery of sensitive alerts)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/notifications/notifications.service.ts:14-30`:

```typescript
async create(data: any) {
  const notification = await this.prisma.notification.create({
    data: {
      userId: data.userId,          // ← only this is written
      type: data.type,
      title: data.title,
      message: data.message,
      // data.patientId, data.pharmacyId, data.orderId are IGNORED
    },
  });
  if (data.userId) {
    this.gateway.sendNotificationToUser(data.userId, notification);
  }
  return notification;
}
```

Callers routinely pass `patientId`, `pharmacyId`, `orderId` — e.g.
`payments.service.ts:195-209` (payment success) and
`orders.service.ts:223-238` (new order). Because those are dropped:

- `patientId`-only notifications have no `userId` → **no WS delivery** and
  the notification is un-routable.
- Pharmacy notifications (`pharmacyId` only) are never delivered to any
  pharmacy user.

### 1.2 Live observation

During the WS hijack test, the intercepted notification had
`patientId:null, pharmacyId:null, orderId:null` — confirming the fields are
not persisted even when the caller provides them.

---

## 2. Attack Chain

Not directly exploitable for privilege escalation, but it:
1. Breaks delivery of security-relevant alerts (payment received, order
   placed) to pharmacies — operational/security blindness.
2. Combined with the WS hijack, an attacker who subscribes to a victim's
   `user_<id>` room receives everything that IS emitted — while the intended
   recipient may not receive it at all.

---

## 3. Evidence (2026-08-11)

```
Intercepted payload: {"userId":"00000000-...-0001","patientId":null,
  "pharmacyId":null,"orderId":null,...}  ← relational IDs nulled by create()
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.sh` | Trigger + inspect persisted notification row (parameterised) |
| `remediation.md` | Step-by-step remediation |
