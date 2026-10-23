# Nyxcord — Resize Functionality Repair

## Root cause

The Resize tab only linked to controls lower on the page. Its visual outline matched the entire crop regardless of requested output dimensions, so dragging or changing dimensions gave little visible indication of a resize. Width/Height also committed only after blur.

## Changes

- Width and Height inputs moved into the Resize tab. They update store dimensions as soon as a complete positive number is entered.
- Added a proportional output-scale slider and keyboard-accessible drag handle.
- Resize preview now renders the selected crop into the output dimensions. Its displayed size changes relative to the available source pixels; the crop itself is not modified.
- Export settings has one read-only Canvas Size summary and an Edit Size link, removing duplicated controls.
- Export validation and browser-side encoder continue to use the exact same `outputWidth`/`outputHeight` state.
- Added `tests/resize-functional.test.cjs` with crop, resize, rotation, native-limit, preview math and export-plan checks.

## Verification

- `npm test`: 11 test scripts passed, including the new resize regression suite.
- TypeScript and TSX syntax parsing: 29 files passed.
- Production Vite build and full browser React E2E: not verified; npm registry was unreachable (`EAI_AGAIN`).
- Performance and real exported GIF/APNG pixel output have not been benchmarked here.

This is a source-code fix, not a claim that all browser/device issues are resolved.
