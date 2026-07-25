// uuid@13 is ESM-only and cannot be require()'d by ts-jest (CJS transform).
// Shim it with Node's built-in crypto.randomUUID() so v4 works identically.
const { randomUUID } = require('crypto');

module.exports = {
  v4: () => randomUUID(),
  validate: (s) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s),
  NIL: '00000000-0000-0000-0000-000000000000',
};
