# Cross-Hospital Drug-Stock IDOR — HIGH

Hospital stock endpoints accept a URL `hospitalId` and do not pass caller
identity into the service. Any allowed role can read arbitrary hospital stock;
`HOSPITAL_ADMIN` and `PHARMACIST` can alter it. `PHARMACIST` is also a pharmacy
branch role, so a pharmacy employee may modify hospital inventory.

**Affected code:** `hospitals.controller.ts:208-231` and
`hospitals.service.ts:331-403`.

The service checks only that the target hospital and stock row exist. This
enables cross-tenant inventory disclosure and destruction.

**Status:** Static-confirmed.
