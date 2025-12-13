/**
 * CEL (Common Expression Language) hover support for protovalidate expressions
 */

import { createMarkdownHover, HoverHandler } from './types';

/**
 * CEL function definitions with signatures, descriptions, and examples
 */
export const CEL_FUNCTIONS: Record<string, { signature: string; description: string; example?: string }> = {
  // Field presence
  has: {
    signature: 'has(field) → bool',
    description: 'Returns true if the specified field is set (not the default value).',
    example: 'has(this.email)'
  },

  // Size functions
  size: {
    signature: 'size(value) → int',
    description: 'Returns the size/length of a string, bytes, list, or map.',
    example: 'size(this.name) > 0'
  },

  // String methods
  startsWith: {
    signature: 'string.startsWith(prefix) → bool',
    description: 'Returns true if the string starts with the specified prefix.',
    example: '"hello".startsWith("he") // true'
  },
  endsWith: {
    signature: 'string.endsWith(suffix) → bool',
    description: 'Returns true if the string ends with the specified suffix.',
    example: '"hello".endsWith("lo") // true'
  },
  contains: {
    signature: 'string.contains(substring) → bool',
    description: 'Returns true if the string contains the specified substring.',
    example: '"hello".contains("ell") // true'
  },
  matches: {
    signature: 'string.matches(regex) → bool',
    description: 'Returns true if the string matches the regular expression pattern.',
    example: 'this.email.matches("^[a-zA-Z0-9+_.-]+@[a-zA-Z0-9.-]+$")'
  },
  toLowerCase: {
    signature: 'string.toLowerCase() → string',
    description: 'Returns the string converted to lowercase.',
    example: '"Hello".toLowerCase() // "hello"'
  },
  toUpperCase: {
    signature: 'string.toUpperCase() → string',
    description: 'Returns the string converted to uppercase.',
    example: '"hello".toUpperCase() // "HELLO"'
  },
  trim: {
    signature: 'string.trim() → string',
    description: 'Returns the string with leading and trailing whitespace removed.',
    example: '"  hello  ".trim() // "hello"'
  },

  // List macros
  all: {
    signature: 'list.all(x, predicate) → bool',
    description: 'Returns true if the predicate is true for all elements in the list.',
    example: '[1, 2, 3].all(x, x > 0) // true'
  },
  exists: {
    signature: 'list.exists(x, predicate) → bool',
    description: 'Returns true if the predicate is true for any element in the list.',
    example: '[1, 2, 3].exists(x, x > 2) // true'
  },
  exists_one: {
    signature: 'list.exists_one(x, predicate) → bool',
    description: 'Returns true if the predicate is true for exactly one element.',
    example: '[1, 2, 3].exists_one(x, x == 2) // true'
  },
  filter: {
    signature: 'list.filter(x, predicate) → list',
    description: 'Returns a new list containing only elements where the predicate is true.',
    example: '[1, 2, 3, 4].filter(x, x > 2) // [3, 4]'
  },
  map: {
    signature: 'list.map(x, transform) → list',
    description: 'Returns a new list with each element transformed.',
    example: '[1, 2, 3].map(x, x * 2) // [2, 4, 6]'
  },

  // Type conversions
  int: {
    signature: 'int(value) → int',
    description: 'Converts a value to an integer.',
    example: 'int("42") // 42'
  },
  uint: {
    signature: 'uint(value) → uint',
    description: 'Converts a value to an unsigned integer.',
    example: 'uint(42) // 42u'
  },
  double: {
    signature: 'double(value) → double',
    description: 'Converts a value to a double (floating point).',
    example: 'double("3.14") // 3.14'
  },
  string: {
    signature: 'string(value) → string',
    description: 'Converts a value to a string representation.',
    example: 'string(42) // "42"'
  },
  bytes: {
    signature: 'bytes(value) → bytes',
    description: 'Converts a value to bytes.',
    example: 'bytes("hello")'
  },
  bool: {
    signature: 'bool(value) → bool',
    description: 'Converts a value to a boolean.',
    example: 'bool("true") // true'
  },
  type: {
    signature: 'type(value) → type',
    description: 'Returns the type of the given value.',
    example: 'type(42) // int'
  },
  dyn: {
    signature: 'dyn(value) → dyn',
    description: 'Casts a value to dynamic type, disabling type checking.',
    example: 'dyn(this.field)'
  },

  // Duration/Timestamp
  duration: {
    signature: 'duration(string) → google.protobuf.Duration',
    description: 'Creates a Duration from a string like "1h30m", "3600s", or "100ms".',
    example: 'duration("1h30m")'
  },
  timestamp: {
    signature: 'timestamp(string) → google.protobuf.Timestamp',
    description: 'Creates a Timestamp from an RFC3339 formatted string.',
    example: 'timestamp("2023-01-01T00:00:00Z")'
  },

  // Timestamp methods
  getDate: {
    signature: 'timestamp.getDate(timezone?) → int',
    description: 'Gets the day of month (1-31) from a timestamp.',
    example: 'this.created_at.getDate()'
  },
  getDayOfMonth: {
    signature: 'timestamp.getDayOfMonth(timezone?) → int',
    description: 'Gets the day of month (1-31) from a timestamp.',
    example: 'this.created_at.getDayOfMonth()'
  },
  getDayOfWeek: {
    signature: 'timestamp.getDayOfWeek(timezone?) → int',
    description: 'Gets the day of week (0=Sunday, 6=Saturday) from a timestamp.',
    example: 'this.created_at.getDayOfWeek()'
  },
  getDayOfYear: {
    signature: 'timestamp.getDayOfYear(timezone?) → int',
    description: 'Gets the day of year (1-366) from a timestamp.',
    example: 'this.created_at.getDayOfYear()'
  },
  getFullYear: {
    signature: 'timestamp.getFullYear(timezone?) → int',
    description: 'Gets the four-digit year from a timestamp.',
    example: 'this.created_at.getFullYear()'
  },
  getHours: {
    signature: 'timestamp.getHours(timezone?) → int',
    description: 'Gets the hours component (0-23) from a timestamp.',
    example: 'this.created_at.getHours()'
  },
  getMilliseconds: {
    signature: 'timestamp.getMilliseconds(timezone?) → int',
    description: 'Gets the milliseconds component from a timestamp.',
    example: 'this.created_at.getMilliseconds()'
  },
  getMinutes: {
    signature: 'timestamp.getMinutes(timezone?) → int',
    description: 'Gets the minutes component (0-59) from a timestamp.',
    example: 'this.created_at.getMinutes()'
  },
  getMonth: {
    signature: 'timestamp.getMonth(timezone?) → int',
    description: 'Gets the month (0-11, 0=January) from a timestamp.',
    example: 'this.created_at.getMonth()'
  },
  getSeconds: {
    signature: 'timestamp.getSeconds(timezone?) → int',
    description: 'Gets the seconds component (0-59) from a timestamp.',
    example: 'this.created_at.getSeconds()'
  },

  // protovalidate-specific CEL functions
  isNan: {
    signature: 'double.isNan() → bool',
    description: 'Returns true if the double value is NaN (Not a Number).',
    example: 'this.value.isNan()'
  },
  isInf: {
    signature: 'double.isInf(sign?) → bool',
    description: 'Returns true if the double value is infinity. Optional sign: 1 for +∞, -1 for -∞.',
    example: 'this.value.isInf()'
  },
  isEmail: {
    signature: 'string.isEmail() → bool',
    description: 'Returns true if the string is a valid email address (protovalidate extension).',
    example: 'this.email.isEmail()'
  },
  isUri: {
    signature: 'string.isUri() → bool',
    description: 'Returns true if the string is a valid URI (protovalidate extension).',
    example: 'this.url.isUri()'
  },
  isUriRef: {
    signature: 'string.isUriRef() → bool',
    description: 'Returns true if the string is a valid URI reference (protovalidate extension).',
    example: 'this.link.isUriRef()'
  },
  isHostname: {
    signature: 'string.isHostname() → bool',
    description: 'Returns true if the string is a valid hostname (protovalidate extension).',
    example: 'this.host.isHostname()'
  },
  isIp: {
    signature: 'string.isIp(version?) → bool',
    description: 'Returns true if the string is a valid IP address. Optional version: 4 or 6.',
    example: 'this.ip_address.isIp(4)'
  },
  isIpPrefix: {
    signature: 'string.isIpPrefix(version?, strict?) → bool',
    description: 'Returns true if the string is a valid IP prefix (CIDR notation).',
    example: 'this.network.isIpPrefix()'
  },
  unique: {
    signature: 'list.unique() → bool',
    description: 'Returns true if all elements in the list are unique (protovalidate extension).',
    example: 'this.items.unique()'
  }
};

/**
 * CEL keywords and variables
 */
export const CEL_KEYWORDS: Record<string, string> = {
  this: 'Reference to the current message being validated. Use `this.field_name` to access fields.',
  true: 'Boolean literal representing true.',
  false: 'Boolean literal representing false.',
  null: 'Null literal representing absence of value.',
  in: 'Membership operator. Checks if a value exists in a list or map.',
  rule: 'Reference to the current validation rule context (protovalidate).'
};

/**
 * Check if we're in a CEL expression context
 */
export function isCelContext(lineText: string): boolean {
  return lineText.includes('buf.validate') ||
         lineText.includes('expression:') ||
         lineText.includes('.cel') ||
         lineText.includes('cel =');
}

/**
 * Get CEL function or keyword hover information
 */
export const getCelHover: HoverHandler = (word: string, lineText: string) => {
  const inCelContext = isCelContext(lineText);

  // Handle dot-separated words - extract segments for matching
  const wordParts = word.split('.');
  const firstPart = wordParts[0]!;
  const lastPart = wordParts[wordParts.length - 1]!;

  // Check if the word is a CEL function (check full word, last segment, and first segment)
  const functionMatch = CEL_FUNCTIONS[word] || CEL_FUNCTIONS[lastPart] || CEL_FUNCTIONS[firstPart];
  const matchedFnName = CEL_FUNCTIONS[word] ? word : (CEL_FUNCTIONS[lastPart] ? lastPart : firstPart);

  if (functionMatch) {
    const fn = functionMatch;
    const lines = [
      `**${matchedFnName}** *(CEL function)*`,
      '',
      `\`${fn.signature}\``,
      '',
      fn.description
    ];
    if (fn.example) {
      lines.push('', '**Example:**', '```cel', fn.example, '```');
    }
    return createMarkdownHover(lines);
  }

  // CEL keywords/variables - only show in CEL context
  if (inCelContext) {
    const keywordMatch = CEL_KEYWORDS[word] || CEL_KEYWORDS[firstPart];
    const matchedKeyword = CEL_KEYWORDS[word] ? word : firstPart;
    if (keywordMatch) {
      return createMarkdownHover([
        `**${matchedKeyword}** *(CEL keyword)*`,
        '',
        keywordMatch
      ]);
    }
  }

  return null;
};
