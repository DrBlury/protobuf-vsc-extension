const { ProtoParser } = require('./out/server/core/parser');
const fs = require('fs');

const parser = new ProtoParser();
const content = fs.readFileSync('/tmp/proto2_features_test.proto', 'utf-8');

const result = parser.parse(content, 'file:///tmp/proto2_features_test.proto');

console.log('All messages found:');
result.messages.forEach(msg => {
  console.log(`- ${msg.name}`);
});

console.log('\nSearchResponse found?', result.messages.some(m => m.name === 'SearchResponse'));
