# Skill Library (Voyager Pattern)

Each file here is a reusable solution template captured from a successful heartbeat cycle.
Recovered from `.autodev/skills/` backup (16 skills, originally JSON, converted to markdown).

## Format

Each skill file contains:
- **Trigger**: When this skill applies
- **Solution**: The proven fix
- **Anti-pattern**: What NOT to do (when applicable)
- **Files affected**: Where the fix applies
- **Category**: testing, build, code, meta, hardening

## How Skills Are Used

Before executing a task, read the skills/ directory.
If a skill matches the current task, apply the known solution instead of reasoning from scratch.
After successfully completing a task, capture the solution as a new skill.

## Categories
- `testing` -- test fixes, timeout tuning, assertion patterns
- `build` -- TypeScript compilation, dependency issues
- `api` -- Flow API integration patterns
- `code` -- code generation, refactoring patterns
- `hardening` -- input validation, edge cases, resilience
- `meta` -- heartbeat self-improvement patterns
