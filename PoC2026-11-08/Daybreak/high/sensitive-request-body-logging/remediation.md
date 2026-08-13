# Remediation — Sensitive Request-Body Logging

Stop logging request bodies globally. Use an allowlist of safe metadata per
route; log correlation ID, method, route template, status, duration, actor, and
tenant. Where debugging bodies is unavoidable, use schema-aware redaction for
codes, tokens, policy/member/national IDs, files, clinical fields, headers, and
nested arrays. Never log raw prescription data URIs. Restrict and encrypt logs,
shorten retention, and purge existing exposed material. Add a log-capture test
asserting secret markers never appear.
