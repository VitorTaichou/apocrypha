# App icons

`source.svg` is the canonical brand source for the Apocrypha app icon.

The Tauri CLI rasterises a single PNG into every platform target (Windows
`.ico`, macOS `.icns`, Linux PNGs, Microsoft Store tiles). To regenerate
after editing `source.svg`:

1. Export `source.svg` to a **1024×1024 PNG** with any vector tool (Inkscape,
   Figma, Affinity, online SVG-to-PNG). Save it somewhere outside the
   repo, e.g. `~/Desktop/apocrypha-source.png`.
2. From `app/`, run:

   ```powershell
   npx @tauri-apps/cli icon ~/Desktop/apocrypha-source.png
   ```

   This writes all the variants back into `app/src-tauri/icons/` and
   overwrites the default Tauri wave icons that ship with the scaffold.
3. Commit the regenerated icons (they're binary, but tracked normally).

The SVG itself isn't read by Tauri — keep it here only as the design
source of truth so future tweaks happen on the vector file.
