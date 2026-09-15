# Repository scope

Keep commits focused on application changes, required runtime assets, relevant tests and current documentation. Preserve assignment correctness, useful regression coverage and asset provenance.

- Do not commit planning transcripts, handoff notes, generated design references, temporary screenshots, raw verification output, secrets, dependencies or build artifacts.
- Keep scratch work in ignored `scratchpad/` or `tmp/` folders. Keep archives outside this repository.
- Retain only curated, current application screenshots under `docs/screenshots/`, referenced by documentation. Keep concise verification summaries; raw reports belong outside Git.
- Preserve existing user changes. Remove files only after checking their runtime and documentation references.
- Stage explicit paths; avoid blanket staging. Before committing, inspect `git diff --cached --name-status`, `git diff --cached --stat` and `git diff --cached`. Explain every new top-level file or directory to the user.
- Run `npm run check:commit` before committing. Install the local guard with `npm run hooks:install` if no other hooks are configured; do not replace an existing hook configuration without inspecting it.
- Follow the user's requested verification scope. Report checks actually performed separately from checks reported by another agent. Do not invent test results or time spent.
- Do not commit or push unless the user authorizes it.

The path guard rejects known clutter; it cannot decide whether every document or image is useful. Review staged content even when the guard passes.
