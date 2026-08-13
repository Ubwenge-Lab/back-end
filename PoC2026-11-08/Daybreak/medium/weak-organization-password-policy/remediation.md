# Remediation — Weak Organization Password Policy

Create one reusable password DTO/validator for every registration, activation,
reset, and change flow. Require a sensible minimum length (prefer 12+), allow
password-manager characters, check compromised passwords, and rate-limit by
account plus IP. Do not rely on composition rules alone. Add DTO and e2e tests
that apply the same policy to patient, pharmacy, hospital, and staff accounts.
