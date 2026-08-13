# Remediation — Cross-Branch Recent Payments Exposure

Pass `req.user.sub`, resolve its branch, and query only payments whose order
has that `branchId`. Super-admin global access should use a separate audited
route. Return an explicit DTO containing only receipt fields; do not include
the full patient model. Add pagination and a maximum limit. Regression tests
must seed two branches and prove each staff user sees only its own payments.
