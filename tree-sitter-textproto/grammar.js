/**
 * Tree-sitter grammar for Protocol Buffer Text Format (textproto)
 * Based on https://protobuf.dev/reference/protobuf/textformat-spec/
 *
 * Supports .textproto, .textpb, .pbtext, .pbtxt files
 */

module.exports = grammar({
  name: "textproto",

  extras: ($) => [/\s/, $.comment],

  precedences: ($) => [["message_list", "scalar_list"]],

  rules: {
    // Root rule - a textproto file is a message (list of fields)
    source_file: ($) => repeat($.field),

    // A field can be a message field or a scalar field
    field: ($) => choice($.message_field, $.scalar_field),

    // message_field = field_name [ ":" ] message_value [ ";" | "," ]
    message_field: ($) =>
      seq(
        $.field_name,
        optional(":"),
        choice($.message_value, $.message_list),
        optional(choice(";", ","))
      ),

    // scalar_field = field_name ":" scalar_value [ ";" | "," ]
    scalar_field: ($) =>
      seq(
        $.field_name,
        ":",
        choice($.scalar_value, $.scalar_list),
        optional(choice(";", ","))
      ),

    // Message value can use {} or <> brackets
    message_value: ($) =>
      choice(
        seq("{", optional($.message_body), "}"),
        seq("<", optional($.message_body), ">")
      ),

    message_body: ($) => repeat1($.field),

    // List of message values: [ msg, msg, ... ]
    message_list: ($) =>
      prec(
        2,
        seq(
          "[",
          optional(
            seq(
              $.message_value,
              repeat(seq(",", $.message_value)),
              optional(",") // trailing comma
            )
          ),
          "]"
        )
      ),

    // Field name can be identifier, extension, or Any type
    field_name: ($) => choice($.extension_name, $.any_name, $.identifier),

    // Extension field: [type.name]
    extension_name: ($) => seq("[", $.type_name, "]"),

    // Any field: [domain/type.name]
    any_name: ($) => seq("[", $.domain, "/", $.type_name, "]"),

    // Type name: package.Type.NestedType
    type_name: ($) => seq($.identifier, repeat(seq(".", $.identifier))),

    // Domain for Any types: type.googleapis.com
    domain: ($) => seq($.identifier, repeat(seq(".", $.identifier))),

    // Scalar values
    scalar_value: ($) =>
      choice(
        repeat1($.string), // String concatenation
        $.identifier, // Enum values, true, false, inf, nan
        $.signed_identifier, // -inf, -nan
        $.number
      ),

    // List of scalar values: [ val, val, ... ]
    scalar_list: ($) =>
      prec(
        1,
        seq(
          "[",
          optional(
            seq(
              $.scalar_value,
              repeat(seq(",", $.scalar_value)),
              optional(",") // trailing comma
            )
          ),
          "]"
        )
      ),

    // Signed identifier for -inf, -nan
    signed_identifier: ($) => seq(choice("-", "+"), $.identifier),

    // Identifier
    identifier: ($) => /[A-Za-z_][A-Za-z0-9_]*/,

    // String literals (single or double quoted)
    string: ($) => choice($.single_string, $.double_string),

    single_string: ($) =>
      seq("'", repeat(choice($.escape_sequence, /[^\n'\\]+/)), "'"),

    double_string: ($) =>
      seq('"', repeat(choice($.escape_sequence, /[^\n"\\]+/)), '"'),

    // Escape sequences
    escape_sequence: ($) =>
      choice(
        /\\[abfnrtv?'"\\]/, // Simple escapes
        /\\[0-7]{1,3}/, // Octal escapes
        /\\x[0-9A-Fa-f]{1,2}/, // Hex escapes
        /\\u[0-9A-Fa-f]{4}/, // Unicode 4-digit
        /\\U[0-9A-Fa-f]{8}/ // Unicode 8-digit
      ),

    // Numbers
    number: ($) =>
      choice(
        $.float_lit,
        $.int_lit,
        seq("-", $.float_lit),
        seq("-", $.int_lit),
        seq("+", $.float_lit),
        seq("+", $.int_lit)
      ),

    // Integer literals
    int_lit: ($) => choice($.decimal_lit, $.octal_lit, $.hex_lit),

    decimal_lit: ($) => choice("0", /[1-9][0-9]*/),

    octal_lit: ($) => /0[0-7]+/,

    hex_lit: ($) => /0[xX][0-9A-Fa-f]+/,

    // Float literals - use a single regex to avoid conflicts
    float_lit: ($) =>
      token(
        choice(
          // 1.5e10, 1.5E-10, .5e10
          /\d*\.\d+[eE][-+]?\d+[fF]?/,
          // 1.5, 1., .5
          /\d*\.\d+[fF]?/,
          /\d+\.[fF]?/,
          // 1e10, 1E-10
          /\d+[eE][-+]?\d+[fF]?/,
          // 1f, 1F
          /\d+[fF]/
        )
      ),

    exponent: ($) => seq(/[eE]/, optional(/[-+]/), /[0-9]+/),

    // Comments (# style)
    comment: ($) => seq("#", /.*/),
  },
});
