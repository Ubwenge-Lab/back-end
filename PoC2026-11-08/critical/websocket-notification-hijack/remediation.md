# Remediation — WebSocket Notification Hijack

## Priority: P0

### 1. Authenticate the socket handshake
1. Use a Socket.IO JWT middleware that validates the Bearer token before the
   connection is accepted (or on `connection`, reject invalid tokens).
2. Derive the allowed rooms from the token (`req.user.sub`), never from the
   client.

### 2. Authorize every subscription
```typescript
@SubscribeMessage('subscribeToUser')
async handleSubscribe(@ConnectedSocket() client: Socket, userId: string) {
  const user = client.data.user;            // set by JWT middleware
  if (user.sub !== userId) {
    client.emit('error', { message: 'Forbidden' });
    return;
  }
  client.join(`user_${userId}`);
}
```

### 3. Scope the CORS policy
- Replace `origin: '*'` with the exact frontend origin(s).
- Optionally verify the `Origin` header on handshake.

### 4. Protect the data at the source
1. `NotificationsService.create()` should only `sendNotificationToUser()` for
   `userId` values the caller may target (it is a server-internal call — the
   gateway is the boundary that needs the auth).
2. Consider including a per-notification `HMAC` or user-scoped channel token
   for sensitive payloads.

### 5. Harden (defense in depth)
1. Apply `ThrottlerGuard`-style rate limits per socket for
   `subscribeToUser` (prevent mass-subscription scraping).
2. Log connections and subscription attempts; alert on one client joining
   many distinct user rooms.
3. Disconnect sockets with no authenticated user after a grace period.

### Acceptance criteria
- [ ] Anonymous connect is rejected (or cannot subscribe)
- [ ] Client A cannot subscribe to client B's room
- [ ] CORS origin list matches the frontend only
- [ ] One socket cannot join many different user rooms
