# Public Error Email Flood and HTML Injection — MEDIUM

The public `GET /api/test-error` route always throws an unhandled error. Every
500 causes the global exception filter to email the super admin. The email
interpolates the request URL into HTML without escaping it.

**Affected code:** `app.controller.ts:15-19` and
`global-exception.filter.ts:69-146`.

An unauthenticated attacker can repeatedly generate operational alerts and put
HTML from the query string into the alert email, causing inbox/log flooding and
misleading rendered content.

**Status:** Static-confirmed.
