; Syntax highlighting for textproto files

; Field names
(field_name
  (identifier) @variable)

(extension_name) @attribute
(any_name) @attribute

; Type names
(type_name) @type
(domain) @namespace

; Strings
(string) @string
(escape_sequence) @string.escape

; Numbers
[
  (int_lit)
  (float_lit)
  (decimal_lit)
  (octal_lit)
  (hex_lit)
] @number

; Special identifiers (true, false, inf, nan)
((identifier) @constant.builtin
  (#match? @constant.builtin "^(true|false|inf|nan|infinity)$"))

((signed_identifier) @constant.builtin
  (#match? @constant.builtin "^[-+](inf|nan|infinity)$"))

; Enum values (other identifiers in scalar context)
(scalar_value
  (identifier) @constant)

; Comments
(comment) @comment

; Punctuation
[
  "{"
  "}"
  "<"
  ">"
  "["
  "]"
] @punctuation.bracket

[
  ":"
  ";"
  ","
  "."
  "/"
] @punctuation.delimiter

[
  "-"
  "+"
] @operator
