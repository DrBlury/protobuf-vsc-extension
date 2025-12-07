const { ProtoParser } = require('./out/server/core/parser');
const fs = require('fs');

const parser = new ProtoParser();
const content = fs.readFileSync('/tmp/language_spec_test.proto', 'utf-8');

console.log('Testing comprehensive language spec file...\n');

try {
  const result = parser.parse(content, 'file:///tmp/language_spec_test.proto');
  console.log('✓ Parsing succeeded!');
  console.log(`  - Syntax: ${result.syntax?.version || 'none'}`);
  console.log(`  - Package: ${result.package?.name || 'none'}`);
  console.log(`  - Imports: ${result.imports.length}`);
  console.log(`  - Messages: ${result.messages.length}`);
  console.log(`  - Enums: ${result.enums.length}`);
  console.log(`  - Services: ${result.services.length}`);
  console.log(`  - Extensions: ${result.extends.length}`);
  console.log('\nMessage details:');
  result.messages.forEach(msg => {
    console.log(`  - ${msg.name}: ${msg.fields.length} fields, ${msg.maps.length} maps, ${msg.oneofs.length} oneofs`);
  });
} catch (e) {
  console.error('✗ Parsing failed:', e.message);
  console.error(e.stack);
}
