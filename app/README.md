# Apocrypha

A modern addon manager for **The Elder Scrolls Online**.

Fast. Lightweight. Beautifully dark. Built to replace Minion with
something that respects your machine and your time.

---

## Why

[Minion](https://minion.mmoui.com/) — the incumbent ESO addon manager —
is a Java app that's been struggling for years. It's slow to start,
heavy in memory, awkward on Steam Deck, and the UX hasn't aged well.
Apocrypha is a from-scratch take using a native shell and a modern web
stack: roughly **10× smaller in disk, 4× faster cold start**, with a
catalog that syncs in seconds and an interface that gets out of the
way.

## What it does

- **Browse the full ESOUI catalog** (~6 000 addons) with category
  filtering, sort options, and pagination
- **Install with one click**, including recursive dependency
  resolution — pulling in `LibStub`, `LibAddonMenu-2.0`, `LibCustomMenu`
  and friends without asking
- **Update** any addon (or all at once) from the same UI; the pipeline
  pre-cleans the target so manifest renames (`.txt` → `.addon`) don't
  leave orphans behind
- **Uninstall** with a safety check that confirms the target lives
  inside your AddOns folder
- **SavedVariables snapshots** — automatic before every update,
  manual on demand, with one-click restore
- **Detail panel** with full description, changelog, and a fullscreen
  screenshot lightbox; resizable for long reads
- **System tray + autostart** — close to tray, launch with Windows,
  catalog stays warm in the background
- **Self-updating** (Tauri Updater wired; signing currently dev-only)

## Screenshots

> Coming soon. Until then: open the app, marvel at the dark teal, send
> me a screenshot.

## Install

### Windows

```
winget install VitorTaichou.Apocrypha
```

> *Not on winget yet — the MSI from GitHub Releases works in the
> meantime. Without code signing the first launch will trip
> SmartScreen; click "More info" → "Run anyway".*

Or grab the `.msi` from [the latest release](https://github.com/VitorTaichou/apocrypha/releases/latest).

### Linux / Steam Deck

```
flatpak install flathub com.apocrypha.archivist
```

> *Not on Flathub yet — the AppImage from GitHub Releases is the
> current way in.*

Or download the `.AppImage` from [the latest release](https://github.com/VitorTaichou/apocrypha/releases/latest), `chmod +x`, and run.

## Stack

- **Tauri 2** + **Rust** — native window, ~10 MB binary
- **React 19** + **TypeScript** + **Vite**
- **Tailwind 4** + **shadcn/ui** patterns + **Lucide** icons
- **SQLite** (via `rusqlite`) for the local catalog mirror

## Development

```powershell
git clone https://github.com/VitorTaichou/apocrypha
cd apocrypha/app
npm install
npm run tauri dev
```

First `tauri dev` compiles ~480 Rust crates (Tauri, wry, tao,
webview2-com, windows-sys, …). Expect ~3–4 minutes the first time;
subsequent runs are seconds.

For the architecture overview, the directory layout, and the more
involved gotchas (OneDrive Documents redirect, PowerShell
ExecutionPolicy and npm, MMOUI API quirks, the install pipeline's
two-pass extraction, signing key handling), see [CLAUDE.md](../CLAUDE.md)
in the repo root.

## Status

In active development. Phase 1 (MVP) features are all functional;
distribution is wired but not yet promoted (CI builds run, signing
key is currently a git-ignored dev key — a production release needs
the keypair regenerated with a password and the matching GitHub
Secrets configured). See CLAUDE.md > Distribution & release for the
exact recipe.

## License

TBD — likely MIT once a release ships publicly.

## Credits

- Catalog data sourced from [ESOUI](https://www.esoui.com/) via the
  MMOUI v3 API
- Brand artwork (the tentacles emerging from a chest) by a friend
- Inspired by — and aiming to learn from —
  [arviceblot/eso-addons](https://github.com/arviceblot/eso-addons),
  [brainsnorkel/eso-addon-manager](https://github.com/brainsnorkel/eso-addon-manager),
  and the long tail of frustration with Minion
