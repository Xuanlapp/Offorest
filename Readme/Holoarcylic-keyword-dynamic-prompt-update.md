# Holoarcylic keyword dynamic prompt update

## File updated
- `src/pages/HoloarcylicPage.jsx`

## Change made
- In `handleCreateMaster`, added dynamic keyword injection from sheet data (`row.keyword`) into the redesign prompt.
- Added instruction:
  - `Use the provided keyword ({{keyword}}) dynamically injected from input to guide subtle visual refinements of the existing subject only, without introducing any new elements.`
- Runtime behavior:
  - If keyword exists, it is appended to the prompt with the real value.
  - If keyword is empty, this extra instruction is skipped.

## Why
- Keeps generation focused on subtle refinement of the current product subject.
- Avoids introducing unrelated/new visual elements.
- Ensures per-row personalization based on sheet keyword.
