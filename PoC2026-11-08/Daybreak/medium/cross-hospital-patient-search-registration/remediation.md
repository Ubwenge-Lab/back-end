# Remediation — Cross-Hospital Patient Search and Registration

Derive the hospital from the authenticated admin/staff relationship; reject a
mismatched URL ID. Limit search results to minimum fields required for matching
and require a documented registration workflow/consent before linking. Create
the link with the derived hospital ID, record actor and purpose, and notify the
patient. Add tests proving Hospital A cannot search or register through
Hospital B and that global identifiers are not over-disclosed.
