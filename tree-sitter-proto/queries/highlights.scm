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
  (type)
  (message_name)
  (enum_name)
  (service_name)
  (rpc_name)
] @type

; Field names and identifiers
(field
  (identifier) @variable)

(enum_field
  (identifier) @constant)

(oneof
  (identifier) @variable)

(map_field
  (identifier) @variable)

; Strings
(string) @string

; Numbers
[
  (int_lit)
  (float_lit)
] @number

; Boolean literals
[
  (true)
  (false)
] @constant.builtin

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
