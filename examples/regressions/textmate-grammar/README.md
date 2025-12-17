# TextMate Grammar Regression Tests

This directory contains proto files that showcase syntax highlighting features.
Open these files to verify correct syntax highlighting behavior.

## Features Tested

1. **String escapes** - All escape sequences per protobuf spec
2. **Proto2 groups** - Deprecated but valid group syntax
3. **RPC bodies** - RPC methods with option blocks
4. **Number formats** - Hex, octal, floats, and +/- prefixes
5. **Field options** - Inline options with various value types
6. **Hex field numbers** - Using 0xNN for field numbers
