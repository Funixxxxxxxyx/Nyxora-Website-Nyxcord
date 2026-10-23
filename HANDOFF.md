# Nyxcord — Developer Handoff

## Scope and package contents

This documentation-only GitHub package contains:

```text
Nyxcord/
├── README.md
├── HANDOFF.md
└── .gitignore
```

It intentionally excludes `src/`, `public/`, `tests/`, `package.json`, dependencies, source code, `dist/`, and production build artifacts. To make the actual website work, use the separate application source distribution.

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

Build a source-bearing repository with Vite (`npm run build`, output `dist`), then deploy through Vercel static hosting. The docs-only ZIP is suitable for GitHub documentation, **not** a standalone deployment. Keep the last known deployed commit/tag so a broken release can be reverted without deleting user data; no server-side user media is persisted by the current design.

## `.gitignore` / secrets

- Ignore `.env` and `.env.*` except a non-secret `.env.example`.
- Ignore `node_modules/`, `dist/`, `.vercel/`, caches, local IDE state, build info, coverage, E2E reports, debug logs and local fixtures.
- Do not ignore public source assets indiscriminately; intentional icons should be tracked in the actual source project.
- `.gitignore` will **not** untrack a file that Git is already tracking; remove it from the index and rotate leaked secrets if needed.
