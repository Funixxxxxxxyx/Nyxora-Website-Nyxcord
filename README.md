# Nyxcord

Nyxcord is a browser-based GIF and sticker editor with a minimal-brutalist interface inspired by Discord's dark palette. It supports crop, trim, rotate, resize, preview, compression, and download.

This repository's **documentation-only distribution** contains `README.md`, `HANDOFF.md`, and `.gitignore`. It does not contain application source code, installed packages, or a production build. To run or deploy the app, add the Nyxcord source project separately.

## What it does

- Import static images (PNG, JPG/JPEG, WebP, BMP, AVIF when browser-supported), animated GIF, and supported videos (MP4, WebM, MOV/M4V/OGV depending on browser codecs).
- Crop using draggable handles, numeric dimensions, and aspect-ratio presets.
- Rotate in 90-degree steps while keeping crop selection accessible.
- Trim a video or animated GIF; select a single frame for a static sticker.
- Resize directly in the Resize tab using Width, Height, the scale slider, or the corner handle. Changes update the output preview immediately. The crop stays unchanged and upscaling beyond native pixels is blocked.
- Generate a GIF or sticker, display the **encoded result** inside the editor, and download it using the format dropdown.
- Create animated sticker outputs as GIF or APNG where supported. Animated APNG uses a `.png` extension; a `.png` filename alone does not prove it contains animation.
- Attempt automatic sticker compression under **512,000 bytes**. Complex source material may require lower FPS, fewer colors, or a smaller resolution; a passing size alone does not guarantee acceptance by Discord.

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

These commands apply **only after the application source files are present**:

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

1. Push the full application source to a GitHub repository. A documentation-only ZIP cannot be deployed as the editor.
2. Import that repository in Vercel.
3. Select **Vite** (or allow auto-detection).
4. Build command: `npm run build`.
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
