; Keywords
[
  "syntax"
  "edition"
  "package"
  "option"
  "import"
  "service"
  "rpc"
  "returns"
  "message"
  "enum"
  "extend"
  "oneof"
  "optional"
  "required"
  "repeated"
  "reserved"
  "extensions"
  "to"
  "max"
  "stream"
  "weak"
  "public"
] @keyword

; Type names
[
  (key_type)
  (scalar_type)
  (type)
] @type

[
  (message name: (identifier))
  (enum name: (identifier))
  (service name: (identifier))
] @type

(rpc name: (identifier)) @function

; Field names and identifiers
(field
  name: (identifier) @variable)

(enum_field
  name: (identifier) @constant)

(oneof
  name: (identifier) @variable)

(map_field
  name: (identifier) @variable)

; Strings
(string) @string

; Numbers
[
  (int_lit)
  (float_lit)
] @number

; Boolean literals
(bool_lit) @constant.builtin

; Comments
(comment) @comment

; Operators and punctuation
"=" @operator

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
  "<"
  ">"
] @punctuation.bracket

[
  ";"
  ","
  "."
] @punctuation.delimiter
