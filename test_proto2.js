const { ProtoParser } = require('./out/server/core/parser');
const fs = require('fs');

const parser = new ProtoParser();
const content = fs.readFileSync('/tmp/proto2_features_test.proto', 'utf-8');

console.log('Testing Proto2-specific features...\n');

try {
  const result = parser.parse(content, 'file:///tmp/proto2_features_test.proto');
  console.log('✓ Parsing succeeded!');
  console.log(`  - Syntax: ${result.syntax?.version || 'none'}`);
  console.log(`  - Package: ${result.package?.name || 'none'}`);
  console.log(`  - Messages: ${result.messages.length}`);
  console.log(`  - Enums: ${result.enums.length}`);
  console.log(`  - Extensions: ${result.extends.length}`);
  console.log('\nMessage details:');
  result.messages.forEach(msg => {
    console.log(`  - ${msg.name}:`);
    console.log(`      Fields: ${msg.fields.length}`);
    if (msg.fields.length > 0) {
      msg.fields.forEach(f => {
        console.log(`        - ${f.modifier || ''} ${f.fieldType} ${f.name} = ${f.number}${f.options ? ' [options]' : ''}`);
      });
    }
  });
} catch (e) {
  console.error('✗ Parsing failed:', e.message);
  console.error(e.stack);
}
