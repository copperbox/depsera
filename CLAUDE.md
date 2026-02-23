# CLAUDE.md

## Documentation
All relevant implementation specs can be found in `docs/specs`. These must be maintained when changes are made.

**IMPORTANT:** When adding a new migration file to `/server/src/db/migrations/`, you **must** also register it in `/server/src/db/migrate.ts` — add the import and append an entry to the `migrations` array. The migration runner only executes migrations listed in that array; a migration file that isn't registered will never run.

## General Guidance

- Unless answers are already specified, always ask clarifying questions when there are decisions to be made.
- When encountering important decisions regarding **file structure**, **infrastructure**, **UI behavior**, or other architectural concerns, always:
  1. Pause and ask for direction
  2. Present the available options with pros/cons
  3. Wait for confirmation before proceeding

When being asked to handle linear tasks, refer to `LINEAR.md` for general instructions.