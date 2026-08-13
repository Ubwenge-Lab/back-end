# Remediation — Public Telemedicine Telemetry Forgery

Require JWT authentication and derive `userId`/role from the token. Verify the
caller is the appointment's patient or assigned doctor and that the appointment
is in a telemedicine-active state. Use a server-issued room/session token,
unique event IDs, and an explicit JOINED state so LEAVE cannot be replayed.
Calculate durations from authoritative server connection events, cap values,
and test anonymous, unrelated, mismatched-role, and replay requests.
