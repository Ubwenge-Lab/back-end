# Remediation — Public Error Email Flood and HTML Injection

Delete the test route outside automated/local test builds. HTML-escape every
dynamic email field and avoid including raw URLs/stacks in email. Deduplicate
alerts by error fingerprint, rate-limit them independently, and send summaries
through monitoring rather than one email per request. Keep stack traces in a
restricted observability system. Test encoded HTML remains text and repeated
errors produce one bounded alert.
