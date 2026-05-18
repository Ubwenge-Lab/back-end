import { generateMRN } from './utils/hospital';

const testMRNs = new Set();
const iterations = 1000;

for (let i = 0; i < iterations; i++) {
  testMRNs.add(generateMRN());
}

console.log(`Generated ${iterations} MRNs.`);
console.log(`Unique count: ${testMRNs.size}`);

if (testMRNs.size === iterations) {
  console.log(' Success: No collisions detected in 1,000 samples.');
} else {
  console.log(' Warning: Collisions detected. Consider increasing entropy.');
}
