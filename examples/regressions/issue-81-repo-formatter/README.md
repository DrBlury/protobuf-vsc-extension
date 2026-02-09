Issue 81: Add a formatter to the repository

Files
- `format-demo.ts` is intentionally unformatted.

How to validate
1. Run `npm run format:check` or `npm run format` from the repo root.
2. Prettier should reformat `format-demo.ts` based on `.prettierrc.json`.

Expected result
- The repository has a formatter configuration and scripts to apply it.
