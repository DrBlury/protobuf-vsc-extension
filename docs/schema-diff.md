# Schema Diff

The Schema Diff feature allows you to compare your current Protocol Buffer files against previous versions in Git, making it easy to see what has changed and review schema evolution.

## Overview

Schema Diff provides:

- **Git integration** - Compare against any Git reference (commit, branch, tag)
- **Visual comparison** - Side-by-side diff view in VS Code
- **Easy navigation** - Jump to specific changes in the diff
- **Historical context** - See how your schema has evolved

## Usage

### Opening Schema Diff

1. **From Command Palette**:
   - Press `Cmd/Ctrl+Shift+P`
   - Run: `Protobuf: Diff Schema`
   - Enter a Git reference (e.g., `HEAD~1`, `main`, `origin/main`)

2. **From Context Menu**:
   - Right-click on a `.proto` file
   - Select "Protobuf: Diff Schema"
   - Enter a Git reference

3. **Prerequisites**:
   - The file must be open in the editor
   - The file must be tracked in Git
   - The Git reference must exist in your repository

### Git References

You can compare against any Git reference:

- **Commits**: `HEAD~1`, `abc1234`, `HEAD~5`
- **Branches**: `main`, `develop`, `feature/branch`
- **Tags**: `v1.0.0`, `release-1.0`
- **Remote branches**: `origin/main`, `origin/develop`

### Diff View

The diff view opens in VS Code's built-in diff editor:

- **Left side** - File content at the specified Git reference
- **Right side** - Current file content
- **Title** - Shows the comparison (e.g., "example.proto (HEAD~1) ↔ Current")

## Examples

### Compare Against Previous Commit

```bash
# Compare current file against the previous commit
Protobuf: Diff Schema → HEAD~1
```

### Compare Against Main Branch

```bash
# Compare current file against main branch
Protobuf: Diff Schema → main
```

### Compare Against Specific Tag

```bash
# Compare current file against a release tag
Protobuf: Diff Schema → v1.0.0
```

## Use Cases

### Code Review

Before committing schema changes:

1. Open the modified `.proto` file
2. Run Schema Diff against `HEAD`
3. Review changes in the diff view
4. Ensure changes are intentional and correct

### Schema Evolution

Track how your schema has changed:

1. Compare against older commits
2. See what fields were added/removed
3. Understand breaking changes
4. Document schema history

### Merge Conflicts

When resolving merge conflicts:

1. Compare against the branch you're merging
2. See differences clearly
3. Make informed decisions about conflicts

## Limitations

- **Git required** - The feature requires Git to be installed and the file to be in a Git repository
- **File must exist** - The file must exist at the specified Git reference
- **Single file** - Currently compares one file at a time

## Troubleshooting

### File Not Found at Reference

If you see "Could not find file at {reference}":

1. Verify the Git reference exists: `git log --oneline`
2. Check if the file existed at that reference: `git ls-tree {reference} {file}`
3. Ensure the file path is correct

### Git Not Available

If Git commands fail:

1. Ensure Git is installed: `git --version`
2. Verify the workspace is a Git repository
3. Check Git is in your PATH

### Diff View Not Opening

If the diff view doesn't open:

1. Check the Output panel for error messages
2. Verify the file is a `.proto` file
3. Ensure VS Code has permission to create temporary files

## Commands

- `protobuf.diffSchema` - Open schema diff for current file

## Integration

Schema Diff works seamlessly with:

- **Git integration** - Uses VS Code's Git integration
- **File watchers** - Automatically detects file changes
- **Editor context** - Uses the currently active file

## Best Practices

1. **Regular comparisons** - Compare against `HEAD` before committing
2. **Document changes** - Use diff view to document schema changes
3. **Review carefully** - Pay attention to breaking changes
4. **Use meaningful references** - Compare against tags or branches for releases

---

For more information, see:

- [Breaking Changes](./breaking-changes.md)
- [Settings Reference](./settings.md)
