# Nyxcord — Developer Handoff

## Scope and package contents

This patch updates the existing Nyxcord application source and its two maintained documents:

- `README.md` — installation, features and user guide.
- `HANDOFF.md` — engineering decisions and release checks.

Apply the contents of `patch_files/` to the root of the Nyxcord repository, preserving your existing `.git/`. Other historical Markdown reports are intentionally excluded. Remove the obsolete `RESIZE_FIX_REPORT.md` with `git rm RESIZE_FIX_REPORT.md` (or delete the file before committing).

## Product decisions (locked)

- Name: **Nyxcord**; N monogram; Discord-inspired Blurple `#5865F2`.
- Direction: **Minimal Brutalism** with dark surfaces and Lucide functional icons.
- Editor: direct Crop, Trim, Rotate and numeric Canvas size.
- Source-bound crop/resize; output size defaults from the selected crop.
- Crop reset: new upload, Reset, and aspect-ratio change use the full source; switching tools/rotating preserves selection.
- Static inputs: Sticker output; moving inputs: GIF or Sticker; moving Sticker: Static frame or Animated clip.
- Hide irrelevant settings by media type and output mode. Quality/More options apply only to GIF, not Sticker.
- Compression: sticker target **<512,000 bytes** with format-aware fallback, displaying an error when a usable file cannot be produced.
- Export: inline actual result preview, then Download dropdown; download never re-encodes or reloads.
- Sessions: page reload starts at Upload; no media restored from previous tabs.

## UI copy and footer change

The source revision removes all these visible strings:

- `LOCAL / NO UPLOADS`
- `No account required`
- `Files stay in your browser`
- `NYXCORD / EDITOR 01`
- `IMAGE / VIDEO`

Keep a single brand in the header and a quiet footer, `© {year} Nyxcord` (render the actual year). Do not repeat the brand mark in the footer, add a fake status badge, or invent social links. The footer should sit at the bottom of short pages using a flex-column page layout, and its height should be about 48–52px. The main workspace and accent color remain unchanged.

## Existing application module map

| Area | Location in source project | Responsibility |
| --- | --- | --- |
| Entry and lifecycle | `src/App.tsx` | Upload, media reset, export job, cached downloads, header/footer |
| App/editor state | `src/store/editor.ts` | Crop, trim, rotation, size, format, export status |
| Canvas | `src/components/CanvasEditor.tsx` | Visual editing and crop handles |
| Editor controls | `src/components/EditorControls.tsx` | Crop/Trim/Rotate/Resize interaction |
| Size input | `src/components/CanvasSizeFields.tsx` | Width/height and ratio lock |
| Format settings | `src/components/OutputSettings.tsx` | Conditional controls by media type |
| Export controls | `src/components/ExportControls.tsx` | Create, cancel, progress and inline results |
| Result and download | `src/components/ResultPreview.tsx`, `DownloadMenu.tsx` | Encoded file preview and download menu |
| Encoding pipeline | `src/lib/export.ts`, `encoder.worker.ts`, `apngStream.ts` | Frame extraction, encoding and compression |
| Validation | `src/lib/validateOutput.ts`, `decodeValidation.ts` | Output signatures/frame checks |
| Styles | `src/styles/foundation.css`, `brutal.css` | Layout and visual overrides |

## Code practices

- Keep modules focused and below 1,000 lines; prefer shorter independent functions over huge components.
- Use TypeScript types for crop rectangles, dimensions and export state.
- Never store large decoded frame arrays in Zustand.
- Revoke old Blob URLs and terminate workers on cancel, media change and unmount.
- Separate rendered-preview media from export decoding resources.
- Do not add no-op buttons, fake progress, marketing badges or decorative icon clutter.
- Preserve keyboard focus, touch crop handles and responsive layouts.
- Avoid introducing new dependencies unless they solve a measurable problem.

## Release gates

1. Dependency installation must succeed.
2. TypeScript and Vite production build must succeed.
3. Unit/regression tests must pass.
4. Playwright on the **full React application** must cover Upload → Crop/Rotate → Export → Preview → Download twice → Refresh.
5. Validate GIF and APNG as truly animated with exact frame count and cumulative duration (not just filename).
6. Test image, MP4/WebM, corrupt input, low-memory settings, and cancellation.
7. Test empty-screen and long-content footer layouts at mobile and desktop widths.
8. Verify that no private secrets, raw media or generated files are staged for Git.

### Known verification gap

Previous reports include isolated browser integration checks and source-level regression checks, but no confirmed full Vite build or full React E2E on this exact revision. Clearly distinguish checks performed from those still pending.

## Deploy and rollback

Build a source-bearing repository with Vite (`npm run build`, output `dist`), then deploy through Vercel static hosting. This source patch is intended to update an existing application repository, not to replace its Git history. Keep the last known deployed commit/tag so a broken release can be reverted without deleting user data; no server-side user media is persisted by the current design.

## `.gitignore` / secrets

- Ignore `.env` and `.env.*` except a non-secret `.env.example`.
- Ignore `node_modules/`, `dist/`, `.vercel/`, caches, local IDE state, build info, coverage, E2E reports, debug logs and local fixtures.
- Do not ignore public source assets indiscriminately; intentional icons should be tracked in the actual source project.
- `.gitignore` will **not** untrack a file that Git is already tracking; remove it from the index and rotate leaked secrets if needed.

## Text Tool handoff

**Entry points:** `EditorControls` adds the Text tab; `CanvasEditor` composites the shared renderer for previews and draws `TextOverlay` in Text mode; `renderMedia` composites text into the selected frames before handing RGBA buffers to the GIF/APNG worker.

**Ordering:** Decode media -> crop/rotate/resize -> render matching text layers -> encode. The final output renderer is `src/features/text/textRender.ts`. Position is normalized to the output canvas; `fontSize`, padding, shadow and outline are pixel-based, scaled if aggressive compression reduces dimensions.

**Timebase:** `visibleFromMs` and `visibleToMs` are represented as `fromMs` and `toMs` on each layer, relative to the beginning of the trimmed result. Static stickers always show text independent of timing mode. Avoid using absolute source playhead times during export.

**Fonts:** Import is handled by the `FontFace` API. Wait on `waitForTextFonts` before encoding. Do not upload font files, persist binary font contents, or ship imported user fonts with the website. Import support is dependent on browser decoding and font licensing.

**Invalidate output:** Changing a text layer increments its Zustand revision, causing existing results to be marked stale; generating a new export replaces the previous result, without triggering download/navigation.

**Tests:** `tests/text-tool.test.cjs` is included in `npm test`. Keep the regression tests alongside the application. The full `npm run build` and app-level Playwright E2E should be run after installing dependencies; the in-session environment could not reach npm registry.


## Text editing and font search update (2026-10-24)

- `src/components/text/TextOverlay.tsx`: Actual on-canvas textarea; new text layers start blank and focus their input. Direct dragging on the selected text moves the layer; four corner handles scale box width and font size together, while top/bottom and left/right edge handles independently resize box height/width, and keyboard arrows nudge the layer. Width-only line wrapping remains in Text Properties. Layer appearance uses font, size, style, colors, outline, shadow, and background. One text layer can be edited without blocking the other layers.
- `src/components/CanvasEditor.tsx`: Excludes canvas-rendered text **only while editing Text**, so the HTML overlay is not duplicated. For Preview and other tool modes, paints the same text layer data onto the canvas; export always paints text as pixels before encoding.
- `src/components/text/FontPicker.tsx`: Searchable font list, max 60 visible results until refined, opt-in installed font discovery (`queryLocalFonts` where allowed), imported fonts, common system fonts, and online catalog.
- `src/features/text/fontCatalog.ts`: Curated common desktop and Google Fonts names; do not describe these as literally all world fonts. `fontLoader.ts` asynchronously loads the selected Google Fonts CSS once. `fontRegistry.ts` waits for online fonts and imported fonts before export.
- `src/features/text/textRender.ts`: Long unbroken words wrap instead of shrinking to a single line in export.
- `tests/text-editing.test.cjs`: Regression checks for editable overlay, grip controls, font search, online font preloading, and source syntax.

### Operational limitations

- Online fonts require network access in the user's browser; installed-font enumeration requires explicit user permission and browser support. All local TTF/OTF/WOFF/WOFF2 imports remain in browser memory only.
- The Node regression suite and TypeScript syntax checks were run; full React/Vite production build and end-to-end interaction remain unverified where npm registry/dependencies are unavailable. Run `npm install && npm run build` and real editor E2E in CI prior to calling the deployment verified.
- If overlay and encoded text diverge for unusual fonts, compare HTML textarea wrapping and Canvas `measureText`; preserve shared `TextLayer` coordinates and relative font size rather than adding a second text state.

## Text styling UI update — October 2026

The application source now contains `src/components/text/ColorPicker.tsx` and `src/features/text/color.ts`. The picker supports controlled HEX values, mouse/touch/pen saturation+value dragging, keyboard adjustments, hue range, presets, and recent colors. The HEX parser rejects invalid values; typed six-digit HEX commits immediately, and three-digit shorthand commits on blur/Enter. All text colors (fill, outline, shadow, background) use the custom picker.

`TextPanel.tsx` keeps B/I/U on the same row as Import font. `CanvasEditor.tsx` subscribes to `textStore.revision` only outside Text mode; in Text mode, `TextOverlay` rerenders the edited HTML text instead of reprocessing media frames for every color change. The existing `renderTextLayers` remains the export path. Do not make preview and export use different color models. A regression test in `tests/text-color-picker.test.cjs` checks math conversions and critical source integration; full production build and full React E2E remain separate release gates.


## Deep audit handoff — 2026-10-24

Earlier audit reports are not included in this patch; verify the changes using the included regression tests and the full production build before deployment. Updated areas: `src/App.tsx` export cache invalidation; `src/features/text/` font session lifecycle, no-op updates, wrap speed, color state; `src/components/text/` font selection and editable layer memoization; `src/lib/export.ts` encoder inactivity watchdog; `src/lib/media.ts` unsupported SVG rejection and GIF canvas disposal; Chromium fixture tests.

**Before merging/deploying:** run `npm install` on a connected machine, commit a new `package-lock.json`, check `npm ci`, TypeScript, Vite, and manual/Playwright React flow. The earlier local build blocker remains unresolved in this environment.

## 2026-10-26 — P1/P2 design and accessibility improvements

This update follows Taste Skill, Anti-Slop and Impeccable design principles without changing Nyxcord branding or media/export code.

- On narrower screens, Crop / Trim / Resize / Text use four equally sized tabs (three tabs for static images). The toolbar remains visible without horizontal scrolling.
- Text's move, width and scale grips have 44 × 44 px pointer targets. Move and resize also work with arrow keys; Shift uses larger steps. Keyboard resizing is announced to assistive technology.
- Upload instructions are easier to read. Upload activation is disabled while a file is opening and progress is announced.
- Color palette uses one swatch trigger and editable HEX field. Incorrect HEX input stays visible with an error instead of silently resetting. Native range inputs provide keyboard access to saturation and brightness, alongside the existing hue slider and pointer-draggable palette.
- The color callback uses the latest external value rather than a stale initial render value.
- Searchable font results show samples for available fonts; online samples are loaded on hover/focus instead of downloading the entire catalog at once.
- Once media has loaded, the hero is smaller, the workspace title becomes *Editor*, and the supporting copy reflects the Text/Resize tools.

**Checks:** `npm test` runs 16 Node scripts (including `ui-p1-p2.test.cjs`). An isolated Chromium layout fixture was tested at 320–1366 px. `npm run build` is still blocked in this environment by missing `vite/client` typings; packages are not installed and this project contains no lockfile. Do not interpret the isolated CSS test as complete React E2E verification.

## Text selection and four-corner interactions (2026-10-26)
- `TextOverlay` draws four touch-friendly corner handles only for selected, unlocked, non-editing text. Single-click selects; drag on the text box moves; double-click enters normal textarea editing; empty canvas deselects.
- Text gestures are pure helpers in `src/features/text/textGestures.ts`; proportional resize anchors the opposite corner and accounts for rotation, preview dimensions, and font scaling. Arrow keys nudge a selected layer; focused handles resize by keyboard.
- Width-only wrapping remains in the numeric Text Properties control. Export rendering is unchanged: selection chrome is DOM-only and is never encoded.

## Eight-handle text box update (2026-10-26)

- Selected, unlocked, non-editing text displays four proportional scale corners plus four edge handles. Unselected and inline-editing modes hide all handles.
- Width-only edge dragging changes wrapping, not font size; height-only edge dragging changes the editable background/selection height, not font size. Text remains vertically centered and is never clipped merely to satisfy a smaller requested height.
- `TextLayer.height?: number` is relative to the output canvas height. `undefined` preserves historical auto-height behavior; the first top/bottom drag sets an explicit height. All render/export paths use this same field.
- `textGestures.ts` projects pointer deltas into the rotated text box's local axes and holds the opposite edge stationary, within canvas bounds. Corner scaling retains the prior proportional behavior, including explicit height if set.
- The browser fixture (`../interaction-fixture.html` when available in the audit workspace) uses the production stylesheet, gesture module and canvas renderer, but is **not** a full React E2E test.
- Tests: `tests/text-eight-handles.test.cjs`, existing `tests/text-four-corner.test.cjs`, plus other Node tests. Production TypeScript build remains unverified without npm dependencies/lockfile.
