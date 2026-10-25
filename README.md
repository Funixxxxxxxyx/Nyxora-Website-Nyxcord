# Nyxcord

Nyxcord is a browser-based GIF and sticker editor with a minimal-brutalist interface inspired by Discord's dark palette. It supports crop, trim, rotate, resize, preview, compression, and download.

This distribution contains the complete application source, documentation, and tests. It intentionally excludes `node_modules`, credentials, and the generated `dist` build. Upload the contents of the `Nyxcord/` folder to the root of your GitHub repository.

## What it does

- Import static images (PNG, JPG/JPEG, WebP, BMP, AVIF when browser-supported), animated GIF, and supported videos (MP4, WebM, MOV/M4V/OGV depending on browser codecs).
- Crop using draggable handles, numeric dimensions, and aspect-ratio presets.
- Rotate in 90-degree steps while keeping crop selection accessible.
- Trim a video or animated GIF; select a single frame for a static sticker.
- Resize directly in the Resize tab using Width, Height, the scale slider, or the corner handle. Changes update the output preview immediately. The crop stays unchanged and upscaling beyond native pixels is blocked.
- Add multiple editable text layers with an on-canvas text box, drag-to-move text body and eight resize handles (corners scale text; edges change the box dimensions). Font search includes common system fonts, a curated on-demand Google Fonts catalog, browser-permitted installed fonts, and imported TTF/OTF/WOFF/WOFF2 files.
- Style text with size, bold/italic/underline, color, outline, shadow, background, rotation and custom appearance times on animations.
- Generate a GIF or sticker, display the **encoded result** inside the editor, and download it using the format dropdown.
- Create animated sticker outputs as GIF or APNG where supported. Animated APNG uses a `.png` extension; a `.png` filename alone does not prove it contains animation.
- Attempt automatic sticker compression under **512,000 bytes**. Complex source material may require lower FPS, fewer colors, or a smaller resolution; a passing size alone does not guarantee acceptance by Discord.


## Text editor (October 2026)

1. Upload an image, animated GIF, or video, and select **Text** in the editor toolbar.
2. Click **Add text**. An editable text box appears on the image. New layers are ready for typing; afterward double-click a text box to edit it. Multiline text and manual line breaks are supported. No large `TEXT` badge is drawn over the actual text.
3. Click once to select a layer, then **drag directly on its text** to move it. Drag any **corner** to scale the text and box proportionally, or a **side** to change only the box width or height without changing font size. The opposite edge stays anchored where canvas bounds permit. Click empty canvas space to hide the border and handles. Adjust **Text box width (%)** or **Text box height (%)** in Text Properties for precise sizing. An empty height input uses the natural text height. Rotation, font size, and width are also editable numerically in the Text panel.
4. Open the **Font** selector and type to search. Common OS fonts are available where installed, while the Online group uses on-demand Google Fonts CSS (requires an internet connection). The optional **Find fonts installed on this device** button uses the browser's Local Font Access API if supported and granted; browsers may refuse or omit this API. Use **Import font** for a TTF, OTF, WOFF, or WOFF2 file (maximum 10 MB).
5. Multiple text layers can be duplicated, reordered, or removed. Outline, shadow, background opacity, bold, italic, underline, rotation, and text alignment remain editable. Animated exports support entire-clip or custom-layer time ranges.
6. Use Preview or Export. Text is rendered to every applicable output frame before GIF/APNG/PNG encoding. Imported and online fonts are awaited before export; unavailable remote fonts produce a recoverable error rather than silently changing appearance.

**Font availability:** No web editor can preinstall every commercial font or enumerate all system fonts in all browsers. Nyxcord offers a searchable curated catalog, browser-exposed fonts, and local imports instead. Imported fonts are session-scoped.

**Editing vs exporting:** While Text is active, an HTML text input supplies the editable overlay; in other tool modes, the Canvas renderer paints the same layers into the preview. The visual line wrapping may vary slightly between the HTML textarea and Canvas font metrics for complex scripts or very long strings.

## Interface behavior

| Input | Default flow | Relevant controls |
| --- | --- | --- |
| Static JPG/PNG/WebP | Static sticker | Crop, Rotate, Canvas size |
| MP4/WebM/MOV (supported codec) | GIF or Sticker | Crop, Trim, Rotate; Static frame or Animated clip for Sticker |
| Animated GIF | GIF or Sticker | Crop, Trim, Rotate; Static frame or Animated clip for Sticker |

The export controls remain hidden until a file has been selected. The sticker flow hides GIF-only Quality and More options. Frame rate is shown only when relevant to GIF generation from moving media. The output preview uses **Fit** by default instead of applying a second crop or zoom.

### Crop reset policy

- Uploading a new file resets the crop to the full source.
- Reset Crop resets the crop to the full, current-rotation frame.
- Choosing a different aspect ratio fits the **largest matching rectangle within the full source**, not inside the previous selection.
- Moving between Crop, Trim, and Resize keeps the selection.
- Rotating keeps the selection while transforming its coordinates to the rotated frame.

### Page sessions

Refreshing or reopening the page returns to the upload screen. There is no automatic draft recovery. Exported results stay in memory while the current page is open and are cleared when the source changes or the page closes.

## Design specification

| Element | Direction |
| --- | --- |
| Product name | **Nyxcord** (capital N) |
| Logo | Custom N monogram |
| UI style | Minimal brutalism; direct borders, compact controls, functional emphasis |
| Primary accent | Discord Blurple `#5865F2` |
| Theme | Dark |
| UI icons | Lucide React |
| Header | Monogram + Nyxcord only |
| Footer | Single quiet copyright line (`© YEAR Nyxcord`) |
| Copy | Clear, functional labels; no decorative trust badges or repeated marketing claims |

### Removed UI copy

The revised website source removes `LOCAL / NO UPLOADS`, `No account required`, `Files stay in your browser`, `NYXCORD / EDITOR 01`, and `IMAGE / VIDEO`. It also removes the repeated footer logo and middle tagline. These are visual-copy changes, not modifications to the media engine.

## Technology (source distribution)

- **React 19**, **TypeScript**, **Vite 6**, **Zustand 5**.
- **Lucide React** for controls.
- **Canvas** and browser decoding for preview/transformations; **Web Workers** and dedicated GIF/APNG processing for encoded output.
- **gifenc**, **gifuct-js**, and **upng-js** in the existing source project.
- Fully static Vite hosting on Vercel; no Vercel Function is required for the current conversion flow.

## Local development

From the folder containing `package.json`:

```bash
npm install
npm run dev
```

Common checks:

```bash
npm test
npm run build
npm run preview
```

The development server is supplied by Vite. A successful build emits a `dist/` directory; this directory is generated output and should **not** be committed to Git. Node.js 22 is the recommended version, matching the current CI workflow.

## Deploying to Vercel

1. Push the contents of the `Nyxcord/` source folder to the root of a GitHub repository (including `package.json`, `src/`, and `vite.config.ts`).
2. Import that repository in Vercel.
3. Select **Vite** (or allow auto-detection).
4. Build command: `npm run build` (Vite worker format is `es` to allow code splitting).
5. Output directory: `dist`.
6. Deploy after local tests and build pass.

Processing runs on the user's device. Hosting still transfers JavaScript and assets and therefore consumes normal Vercel bandwidth. Performance and codec support depend on the browser and device.

## Verification checklist

Run these checks against the actual application, not only isolated utility tests:

- Upload a JPG/PNG, crop and rotate, then export a PNG sticker.
- Upload an MP4 and export a selected static frame.
- Upload an MP4 or animated GIF and export a multi-frame GIF and APNG.
- Inspect animated output by decoding the file; verify frame count and actual duration.
- Verify target-size enforcement, including failure cases that cannot retain the desired quality.
- Click Download and Download again. Both should save files without a reload or returning to Upload.
- Refresh the page; it should return to Upload.
- Check crop 1:1, 16:9 and Free reset from the full source, including after Rotate.
- Verify keyboard usage, focus outlines, small screens, and a 320px-wide viewport.
- Run the full Vite build and real-app Playwright E2E before release.

**Release status:** The prior Nyxcord project underwent source-level regression and isolated browser checks, but a successful full Vite production build and full React E2E have not been demonstrated in the supplied project history. Do not treat the code as production-verified until those pass.

## Known constraints

- Source media decoder support varies by browser and codec; the extension alone does not guarantee compatibility.
- Animated WebP is currently rejected rather than silently flattened to static.
- Video and complex animations can take longer than 1–3 seconds on ordinary devices.
- 512 KB sticker size is an optimization target, not an unconditional guarantee of visually lossless output or Discord acceptance for arbitrary canvas sizes.
- The output must be an actually encoded multi-frame animation when marked animated.

## Git and privacy

`.gitignore` excludes private/local files, dependency installs, Vercel local state, generated builds, logs, caches, and test evidence. **Ignoring a file does not encrypt it or remove it from Git history.** Never commit credentials or private media; if they were already committed, remove them from history and rotate affected credentials.

## Maintainers

For architecture, handoff notes, code map, testing priorities, and the UI change list, see [HANDOFF.md](HANDOFF.md).

### Resize verification

Switch to **Resize**, edit Width or Height, move the scale slider, or drag the preview corner. The image keeps its selected crop while the output pixel dimensions change. **Export settings** displays the current dimensions and links to the same Resize controls. The final export uses those dimensions unless automatic sticker compression must further reduce them to meet its size limit.

Run `npm test` for the new resize regression checks and the existing suites.

## Text Tool

Select **Text** after opening an image, GIF, or video. Use **Add text** to create an editable layer.

- Add, select, duplicate, reorder, and delete layers.
- Drag a selected layer on the output preview. Use arrow keys to move it one output pixel (Shift + arrow keys: 10 pixels).
- Edit the font family, font size, bold, italic, underline, color, alignment, and rotation.
- Configure outline, shadow, and solid/rounded backgrounds from the respective expanders.
- Import browser-supported `.ttf`, `.otf`, `.woff`, or `.woff2` fonts (10 MB/file limit). These are loaded only for the open page and are not bundled into the site.
- Animated sources can show a layer for the **entire clip** or for a **custom time range** measured from the beginning of the trimmed export. Static output always displays all non-hidden layers.

Text layers use normalized positions relative to the selected output, so cropping, rotating, and resizing the source do not change the layer's alignment with the final frame. Text is composited into the frame **before** GIF, PNG, or APNG encoding. Fonts must be loaded before export can begin.

### Text implementation

- `src/features/text/types.ts`: data shape and defaults.
- `src/features/text/textStore.ts`: Zustand layer editor state.
- `src/features/text/fontRegistry.ts`: runtime font imports and readiness checks.
- `src/features/text/textRender.ts`: shared canvas renderer for preview and export.
- `src/components/text/TextPanel.tsx`: editing controls and layer list.
- `src/components/text/TextOverlay.tsx`: drag and keyboard positioning.
- `src/styles/text.css`: text tool styles.

### Text Tool tests

After installing dependencies, run `npm test` for the Node regression suite. The suite includes tests for text timing, multiple layers, backgrounds, outlines, rotation, and underline. Browser canvas rendering and TTF import were additionally tested in Chromium; see `TEXT_TOOL_TEST_REPORT.md`.

**Known limits:** font availability varies by platform; an imported font does not survive a page refresh. Very large font faces or complex animations may lengthen export time. The final compressor can reduce resolution when required to meet the sticker-size constraint. The overall production build and full React E2E require verification in a dependency-installed environment.

## Where to find the Text Tool

After uploading an image, GIF, or video, open **Text** in the editor toolbar beside **Crop**, **Trim** (when available), and **Resize**. Choose **Add Text** to create a layer. You can change fonts, import local font files, style the layer, and set animated text durations. The Text panel is deliberately not visible before a media file is selected.

## Custom text colors (October 2026)

The **Text** tab includes one compact formatting row: **Bold, Italic, Underline, Import font**. The searchable font selector and font size remain directly above it. To edit a color, click the swatch or picker button, drag within the saturation/brightness square, or adjust the hue slider. Enter a `#RRGGBB` value directly in the adjacent HEX field; `#RGB` shorthand is accepted when the field loses focus or Enter is pressed. Invalid input does not replace the current applied color. The palette includes presets and up to eight recent colors for the current page session.

The custom picker is used for **text fill, outline, shadow, and background**. Pointer changes are batched through `requestAnimationFrame`; while the Text tool is active, media canvas redraw is decoupled from text-layer style changes. Text updates still render directly in the editable HTML overlay, and final GIF/APNG/PNG exports use the existing Canvas text renderer.

**Release verification:** Run `npm test` and `npm run build` and perform a full browser test of color dragging, numeric HEX edits, switching selected text layers, font imports, animated text, export preview, and download before publishing. Prior successful source-level checks alone do not imply a verified full React E2E or Vercel deployment.


## October 2026 deep audit and repair

Historical audit reports are intentionally omitted from this source patch. Source-level fixes include invalidating exports after settings/text edits, cleaning up imported fonts, preventing stale font-selection callbacks, optimizing long-line wraps, and bounding Text layers. Added one Node regression script (`npm test` now executes 15 scripts) and optional real Chromium Canvas/media tests.

**Release caution:** This archive was not verified with `npm ci`, full TypeScript checking, Vite production build, or bundled React E2E in the audit environment, because npm registry access was unavailable and the baseline has no lockfile. On an internet-connected computer, run `npm install`, commit the generated `package-lock.json`, then run `npm ci`, `npm test`, `npm run typecheck`, `npm run build`, and complete browser E2E before production release.

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
