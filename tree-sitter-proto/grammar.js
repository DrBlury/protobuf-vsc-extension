/**
 * Tree-sitter grammar for Protocol Buffers
 * Supports proto2, proto3, and editions syntax
 */

module.exports = grammar({
  name: 'proto',

  extras: $ => [
    /\s/,
    $.comment,
  ],

  word: $ => $.identifier,

  rules: {
    source_file: $ => seq(
      optional(choice($.syntax, $.edition)),
      repeat(choice(
        $.import,
        $.package,
        $.option,
        $.message,
        $.enum,
        $.service,
        $.extend,
        $.empty_statement
      ))
    ),

    // Syntax declaration
    syntax: $ => seq(
      'syntax',
      '=',
      field('version', choice(
        '"proto2"',
        '"proto3"',
        "'proto2'",
        "'proto3'"
      )),
      ';'
    ),

    // Edition declaration
    edition: $ => seq(
      'edition',
      '=',
      field('version', choice(
        $.string,
        $.identifier
      )),
      ';'
    ),

    // Import statement
    import: $ => seq(
      'import',
      optional(field('modifier', choice('weak', 'public'))),
      field('path', $.string),
      ';'
    ),

    // Package declaration
    package: $ => seq(
      'package',
      field('name', $.full_ident),
      ';'
    ),

    // Option statement
    option: $ => seq(
      'option',
      field('name', $.option_name),
      '=',
      field('value', $.constant),
      ';'
    ),

    // Message definition
    message: $ => seq(
      'message',
      field('name', $.identifier),
      field('body', $.message_body)
    ),

    message_body: $ => seq(
      '{',
      repeat(choice(
        $.field,
        $.map_field,
        $.oneof,
        $.option,
        $.reserved,
        $.extensions,
        $.message,
        $.enum,
        $.extend,
        $.group,
        $.empty_statement
      )),
      '}'
    ),

    // Field definition
    field: $ => seq(
      optional(field('modifier', choice('optional', 'required', 'repeated'))),
      field('type', $.type),
      field('name', $.identifier),
      '=',
      field('number', $.int_lit),
      optional(field('options', $.field_options)),
      ';'
    ),

    // Map field
    map_field: $ => seq(
      'map',
      '<',
      field('key_type', $.key_type),
      ',',
      field('value_type', $.type),
      '>',
      field('name', $.identifier),
      '=',
      field('number', $.int_lit),
      optional(field('options', $.field_options)),
      ';'
    ),

    // Oneof definition
    oneof: $ => seq(
      'oneof',
      field('name', $.identifier),
      '{',
      repeat(choice(
        $.oneof_field,
        $.option,
        $.empty_statement
      )),
      '}'
    ),

    oneof_field: $ => seq(
      field('type', $.type),
      field('name', $.identifier),
      '=',
      field('number', $.int_lit),
      optional(field('options', $.field_options)),
      ';'
    ),

    // Group (proto2 only)
    group: $ => seq(
      optional(field('modifier', choice('optional', 'required', 'repeated'))),
      'group',
      field('name', $.identifier),
      '=',
      field('number', $.int_lit),
      $.message_body
    ),

    // Enum definition
    enum: $ => seq(
      'enum',
      field('name', $.identifier),
      field('body', $.enum_body)
    ),

    enum_body: $ => seq(
      '{',
      repeat(choice(
        $.enum_field,
        $.option,
        $.reserved,
        $.empty_statement
      )),
      '}'
    ),

    enum_field: $ => seq(
      field('name', $.identifier),
      '=',
      field('number', choice($.int_lit, seq('-', $.int_lit))),
      optional(field('options', $.field_options)),
      ';'
    ),

    // Service definition
    service: $ => seq(
      'service',
      field('name', $.identifier),
      '{',
      repeat(choice(
        $.rpc,
        $.option,
        $.empty_statement
      )),
      '}'
    ),

    // RPC method
    rpc: $ => seq(
      'rpc',
      field('name', $.identifier),
      '(',
      optional('stream'),
      field('request_type', $.message_type),
      ')',
      'returns',
      '(',
      optional('stream'),
      field('response_type', $.message_type),
      ')',
      choice(
        seq('{', repeat(choice($.option, $.empty_statement)), '}'),
        ';'
      )
    ),

    // Extend definition
    extend: $ => seq(
      'extend',
      field('type', $.message_type),
      '{',
      repeat(choice(
        $.field,
        $.group,
        $.empty_statement
      )),
      '}'
    ),

    // Reserved statement
    reserved: $ => seq(
      'reserved',
      choice(
        $.ranges,
        $.field_names
      ),
      ';'
    ),

    ranges: $ => seq(
      $.range,
      repeat(seq(',', $.range))
    ),

    range: $ => choice(
      $.int_lit,
      seq($.int_lit, 'to', choice($.int_lit, 'max'))
    ),

    field_names: $ => seq(
      choice($.string, $.identifier),
      repeat(seq(',', choice($.string, $.identifier)))
    ),

    // Extensions statement
    extensions: $ => seq(
      'extensions',
      $.ranges,
      ';'
    ),

    // Field options
    field_options: $ => seq(
      '[',
      $.field_option,
      repeat(seq(',', $.field_option)),
      ']'
    ),

    field_option: $ => seq(
      field('name', $.option_name),
      '=',
      field('value', $.constant)
    ),

    // Option name (can be compound with parentheses)
    option_name: $ => choice(
      $.full_ident,
      seq('(', $.full_ident, ')', optional(seq('.', $.full_ident)))
    ),

    // Types
    type: $ => choice(
      $.scalar_type,
      $.message_type
    ),

    scalar_type: $ => choice(
      'double', 'float',
      'int32', 'int64',
      'uint32', 'uint64',
      'sint32', 'sint64',
      'fixed32', 'fixed64',
      'sfixed32', 'sfixed64',
      'bool', 'string', 'bytes'
    ),

    message_type: $ => choice(
      $.full_ident,
      seq('.', $.full_ident)
    ),

    key_type: $ => choice(
      'int32', 'int64',
      'uint32', 'uint64',
      'sint32', 'sint64',
      'fixed32', 'fixed64',
      'sfixed32', 'sfixed64',
      'bool', 'string'
    ),

    // Constants
    constant: $ => choice(
      $.full_ident,
      seq(optional(choice('+', '-')), $.int_lit),
      seq(optional(choice('+', '-')), $.float_lit),
      $.string,
      $.bool_lit,
      $.message_value
    ),

    // Message value (for options)
    message_value: $ => seq(
      '{',
      repeat($.message_field),
      '}'
    ),

    message_field: $ => choice(
      seq($.identifier, ':', $.constant),
      seq($.identifier, $.message_value)
    ),

    // Identifiers
    full_ident: $ => seq(
      $.identifier,
      repeat(seq('.', $.identifier))
    ),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // Literals
    int_lit: $ => choice(
      /[0-9]+/,                    // decimal
      /0[xX][0-9a-fA-F]+/,        // hexadecimal
      /0[0-7]+/                    // octal
    ),

    float_lit: $ => choice(
      /[0-9]+\.[0-9]*([eE][+-]?[0-9]+)?/,
      /[0-9]+[eE][+-]?[0-9]+/,
      /\.[0-9]+([eE][+-]?[0-9]+)?/,
      'inf',
      'nan'
    ),

    bool_lit: $ => choice('true', 'false'),

    string: $ => choice(
      seq('"', repeat(choice($.string_escape, /[^"\\\n]/)), '"'),
      seq("'", repeat(choice($.string_escape, /[^'\\\n]/)), "'")
    ),

    string_escape: $ => token.immediate(seq(
      '\\',
      choice(
        /[abfnrtv\\'"]/, // standard escapes
        /[0-7]{1,3}/,    // octal
        /x[0-9a-fA-F]{2}/, // hex
        /u[0-9a-fA-F]{4}/, // unicode
        /U[0-9a-fA-F]{8}/  // unicode
      )
    )),

    // Comments
    comment: $ => token(choice(
      seq('//', /.*/),
      seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')
    )),

    // Empty statement
    empty_statement: $ => ';'
  }
});
