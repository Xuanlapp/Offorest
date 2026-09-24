# Offorest Agent Instructions

## Mandatory Read Order
1. Read `.ai/project-context.md` first.
2. Follow `.ai/coding-rules.md` for every code change.
3. Use `.ai/architecture.md` to place logic in the correct layer.

## Scope Control
- Do not edit files unrelated to the current task.
- Keep changes minimal and targeted.
- Do not introduce architecture changes unless explicitly requested.

## Planning Before Coding
- Before writing code, summarize:
  - objective
  - impacted files
  - risk points (auth, permission, IPC, API contracts)

## Implementation Rules
- Preserve renderer <-> preload <-> main contracts.
- Preserve auth and permission gates.
- Validate inputs and handle errors explicitly.
- Do not hard-code secrets.

## Test and Validation Rules
- Run applicable checks (`npm run lint`, smoke test with `npm run start`, and targeted manual flow verification).
- If logic changes, add/update tests when the project test setup supports it.
- For bug fixes, include a regression verification scenario.

## Pre-Completion Self Review
- Review against `.ai/review-checklist.md` before ending task.

## Required Final Report Format
At the end of every task, report:
1. What was changed.
2. Which files changed.
3. How it was tested.
4. Remaining risks or follow-up items.
Before writing or modifying code, always read and follow `.ai/logic-rules.md`.