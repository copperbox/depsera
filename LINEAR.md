## Linear Workflow

When working on a Linear ticket:
1. Set the issue status to "In Progress" when starting work
2. Upon completing the work, update the issue status to "Done" (or the appropriate completed state)
3. Add a brief comment summarizing what was done if the changes differ from the original requirements

Always update the ticket status - do not leave tickets in "In Progress" after completing work.

## Linear Issue Template

When creating or updating Linear issues for this project, use this structure:

### Title Format
`[Area] Brief action-oriented description`

Examples:
- `[API] Add endpoint for fetching dependency versions`
- `[UI] Create dependency table component`
- `[Bug] Fix pagination in services list`

### Description Structure

```markdown
## Context
Why this work is needed. Link to related issues or discussions if applicable.

## Requirements
- [ ] Specific deliverable 1
- [ ] Specific deliverable 2
- [ ] Specific deliverable 3

## Technical Notes
Implementation details, constraints, or architectural decisions relevant to this work.
Optional - include only when helpful.

## Out of Scope
What this issue explicitly does NOT cover (if clarification is needed).
```

### Labels
Apply relevant labels:
- `bug` - Something isn't working
- `feature` - New functionality
- `enhancement` - Improvement to existing functionality
- `tech-debt` - Refactoring or cleanup
- `documentation` - Documentation updates

### Linking
- Use `blocks` for issues that must complete before others can start
- Use `blocked by` for dependencies on other issues
- Use `related to` for contextually connected work
