<#
.SYNOPSIS
  Verify the .proto files for compiler-conformance and compliance with the proto definition style guide.

.DESCRIPTION
  This script runs the proto-Compiler and Linter as Docker containers to validate the .proto files in 
  this repository.
#>

$protoCompilerImage = "namely/protoc-all:1.51_2"
$protoLintImage = "yoheimuta/protolint:0.56.4"

docker run --rm --volume .:/defs $protoCompilerImage -d protos -o /tmp -l csharp -i protos

docker run --rm --volume .:/workspace --workdir /workspace $protoLintImage lint protos
