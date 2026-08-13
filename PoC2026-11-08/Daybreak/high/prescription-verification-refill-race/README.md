# Prescription Verification and Refill Race — HIGH

The pharmacy verification endpoint accepts either a QR payload or a bare
prescription ID. With only an ID, no presented QR hash is required; the service
compares a recomputed hash with the stored hash and treats that as proof. It
then reads and decrements `refillsRemaining` in separate operations.

**Affected code:** `prescriptions.service.ts:639-750`.

Knowing/enumerating the custom prescription ID reveals patient and medication
details and consumes a refill. Concurrent requests can all observe a positive
count and decrement below zero.

**Status:** Static-confirmed.
