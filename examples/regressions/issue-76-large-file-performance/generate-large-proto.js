const fs = require('fs');
const path = require('path');

const outPath = path.join(__dirname, 'large.proto');
const lines = [];

lines.push('syntax = "proto3";');
lines.push('');
lines.push('package issue76;');
lines.push('');
lines.push('message LargeMessage {');

for (let i = 1; i <= 8000; i += 1) {
  const num = String(i).padStart(4, '0');
  lines.push(`  string field_${num} = ${i};`);
}

lines.push('}');
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Wrote ${outPath}`);
