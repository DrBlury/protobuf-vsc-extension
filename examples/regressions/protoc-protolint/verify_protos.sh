#!/usr/bin/env bash
set -euo pipefail

# Ensures Docker images for protoc and protolint run against the regression protos directory.

SCRIPT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"

PROTO_COMPILER_IMAGE=${PROTO_COMPILER_IMAGE:-"namely/protoc-all:1.51_2"}
PROTO_LINT_IMAGE=${PROTO_LINT_IMAGE:-"yoheimuta/protolint:0.56.4"}

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker must be installed and available in PATH." >&2
  exit 1
fi

docker run --rm --volume "$SCRIPT_DIR":/defs "$PROTO_COMPILER_IMAGE" \
  -d protos -o /tmp -l csharp -i protos

docker run --rm --volume "$SCRIPT_DIR":/workspace --workdir /workspace "$PROTO_LINT_IMAGE" \
  lint protos
