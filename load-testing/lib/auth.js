import http from 'k6/http';
import { check } from 'k6';

// Logs in once (call this from setup(), never from a VU iteration — the
// /api/auth/* prefix is throttled to 5 req/min per client, so logging in per
// VU/iteration will self-DoS the test with 429s).
export function login(baseUrl, email, password, label) {
  if (!email || !password) {
    throw new Error(
      `Missing credentials for "${label}" — set the corresponding *_EMAIL / *_PASSWORD env vars.`,
    );
  }

  const res = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  const ok = check(res, {
    [`${label} login succeeded`]: (r) => r.status === 200,
  });

  if (!ok) {
    throw new Error(
      `Login failed for "${label}" (${email}): HTTP ${res.status} ${res.body}`,
    );
  }

  const body = res.json();
  const token = body.accessToken || body.access_token;
  if (!token) {
    throw new Error(
      `Login response for "${label}" had no accessToken/access_token field: ${res.body}`,
    );
  }
  return token;
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}` } };
}
