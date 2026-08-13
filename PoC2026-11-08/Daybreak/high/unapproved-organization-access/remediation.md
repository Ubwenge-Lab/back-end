# Remediation — Unapproved Organization Access

Do not issue operational JWTs to `PENDING`, `REJECTED`, `SUSPENDED`, or
inactive organizations. If resubmission needs authentication, issue a narrow
token with an `ORG_REVIEW` audience accepted only by document/profile
resubmission endpoints. Re-check organization status in centralized principal
validation on every request and refresh. Clear refresh tokens on rejection or
suspension. Test every organization state against every privileged route.
