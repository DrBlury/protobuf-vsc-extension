# bin directory

This directory would contain the user's tools:

- `clang-format` - Custom clang-format binary
- `protoc` - Custom protoc binary

For testing, you can:

1. Create symlinks to your system tools:

   ```bash
   ln -s $(which clang-format) ./clang-format
   ln -s $(which protoc) ./protoc
   ```

2. Or copy the binaries here

The extension should resolve `${workspaceFolder}/bin/clang-format` to this directory.
