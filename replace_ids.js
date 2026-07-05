const fs = require('fs');
const file = 'src/prisma/seed.ts';
let code = fs.readFileSync(file, 'utf8');

// Match any backtick string containing a UUID prefix followed by anything except a backtick, ending in backtick
code = code.replace(/`\d{8}-\d{4}-\d{4}-\d{4}-\d{8,12}[^`]*`/g, 'randomUUID()');

if (!code.includes('import { randomUUID }')) {
  code = `import { randomUUID } from 'crypto';\n` + code;
}

fs.writeFileSync(file, code);
console.log('Replaced successfully!');
