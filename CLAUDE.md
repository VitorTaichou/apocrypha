# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Apocrypha is a desktop addon manager for *The Elder Scrolls Online*, built to replace Minion (Java-based, slow) with a modern, lightweight alternative. Codename "Archivist".

## Workspace layout

The repo root is single-project:

- **`app/`** — the actual Apocrypha project. Tauri 2 + Rust + React + TypeScript. All work happens here.

Earlier scaffolding referenced a Python "ESO Power Lite" project and a
Google Stitch mockup set as design seeds; both have been removed once the
visual identity and architecture were settled in code. The design system
now lives entirely in `app/src/index.css` (Tailwind 4 `@theme` tokens).

## Commands (run from `app/`)

```powershell
npm install                  # First-time deps
npm run tauri dev            # Launch dev window (first cargo build ~3min, subsequent ~15s)
npm run tauri build          # Production MSI / AppImage
npm run build                # Frontend-only build + typecheck (fast validation)
cd src-tauri ; cargo check --message-format=short    # Rust-only check (faster than full build)
```

Vite dev server uses port 1420 (`vite.config.ts`).

## Architecture

Two halves communicating via Tauri IPC commands and broadcast events.

### Rust backend (`app/src-tauri/src/`)

- **`lib.rs`** — Tauri builder, command registration, `setup()` hook that auto-syncs the catalog on every boot.
- **`state.rs`** — `AppState` (single instance via `.manage()`): SQLite connection, MMOUI HTTP client, addons folder path, `AtomicBool` sync guard. `AppState::run_sync()` is the canonical sync entry point; reused by both auto-sync and the manual `sync_catalog` command.
- **`api.rs`** — MMOUI v3 client. Discovers feed URLs via `globalconfig.json`, fetches `filelist.json` (~6000 addons, 5–10 MB) and `categorylist.json`. Lazy `fetch_addon_download_url` and `download_bytes` for install-time use.
- **`db.rs`** — SQLite catalog at `%APPDATA%/Apocrypha/catalog.db`. WAL mode. Idempotent `ALTER TABLE` migrations on `addons` for new columns (currently `thumbnail_url`, `images`). `find_by_directory` is the bridge from local installed dirs back to catalog entries.
- **`scanner.rs`** — Walks `<Documents>/Elder Scrolls Online/live/AddOns/`, parses `.txt` / `.addon` manifests (`## Title`, `## Version`, `## DependsOn`, etc.). Strips ESO color codes (`|cRRGGBB...|r`) and handles lossy UTF-8.
- **`installer.rs`** — Install/uninstall pipeline. **Two-pass extraction**: pass 1 validates entries and gathers root dirs; **pre-clean deletes each existing target dir before extracting** (this is what made `LibAddonMenu-2.0` actually update — old `Foo.txt` no longer lingers when the new release ships `Foo.addon`); pass 2 extracts. Path-traversal defense in depth: `enclosed_name()` + explicit `Component::ParentDir/Prefix/RootDir` rejection. Uninstall uses `canonicalize()` to confirm target lives inside `addons_dir` before `remove_dir_all`. Dependencies resolve recursively via `find_by_directory` with a visited `HashSet`.
- **`commands.rs`** — Tauri command wrappers. Async commands emit events for the frontend: `catalog:sync:{start,done,error}`, `addon:install:{start,progress,done,error}`, `addon:uninstall:{done,error}`.
- **`models.rs`** — Shared serde types (`Addon`, `Category`, `InstalledAddon`, `CatalogMeta`, `SearchResult`). Keep mirrored in `src/lib/types.ts`.

### React frontend (`app/src/`)

- **`App.tsx`** — Root layout. Listens to `catalog:sync:*`, renders `SyncBanner`, increments `catalogTick` on `done` to force-remount pages with fresh data.
- **`pages/{SearchPage,InstalledPage,SettingsPage}.tsx`** — Each fetches its own data and subscribes to relevant events for cross-page sync (e.g. SearchPage refreshes `installedDirs` when `addon:install:done` fires; InstalledPage reloads on the same event).
- **`components/`** — `Sidebar`, `PageHeader`, `AddonRow`, `InstalledRow`, `CategoryIcon`, `CategorySelect`, `SyncBanner`.
- **`lib/api.ts`** — typed `invoke()` wrappers. One function per Tauri command.
- **`lib/types.ts`** — TS mirrors of Rust models. **Update both sides** when adding fields.
- **`lib/categoryMeta.ts`** — Hardcoded `{ icon, color, title, description }` per MMOUI category ID (~39 entries). When MMOUI introduces a new category, add it here (otherwise it falls back to a generic icon).
- **`lib/format.ts`** — `formatCount`, `formatRelativeTime`.
- **`index.css`** — Tailwind 4 + design tokens as `@theme` CSS variables. Imports Newsreader + Geist from Google Fonts.

## Catalog data flow

1. App launches → `setup()` hook spawns async task → emits `catalog:sync:start`.
2. `MmouiClient` fetches `filelist.json` + `categorylist.json` (whole catalog at once — the API does **not** support pagination or server-side search).
3. Bulk upsert into SQLite via transactions.
4. Emits `catalog:sync:done` with `CatalogMeta`.
5. `App.tsx` bumps `catalogTick` → pages remount and re-fetch from SQLite.

Sync happens on **every boot** (user preference). `db::is_stale()` and `AppState::is_stale()` exist for re-introducing a TTL later — currently unused, will trigger an `unused` warning until adopted.

## Design system

`app/src/index.css` is canonical. The `@theme` block defines every design
token Tailwind picks up. Key facts:

- Dark teal-on-near-black ("Techno-Occult Productivity")
- **Newsreader** (serif) for the wordmark, **Geist** (sans) for body — both via Google Fonts
- Primary `#67D9CA`, surface `#101413`, border `#1A2422`

Per the user: use Newsreader **only** for the "APOCRYPHA" logo in the sidebar. Everything else is Geist (including page titles like "Search", "Installed", "Settings").

## Important gotchas

- **PowerShell + npm**: On a default Windows install, the bare `npm` command resolves to `npm.ps1` (Node 24+) which is blocked by the `Restricted` ExecutionPolicy. Fix: `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`. If `npm --version` returns silently in PowerShell, that's the cause.
- **OneDrive Documents redirect**: On Windows with OneDrive enabled, "Documents" is redirected to `~/OneDrive/Documentos` (Portuguese in this user's case). `dirs::document_dir()` respects this via the Windows Known Folder API, so the scanner finds the right path automatically. If it doesn't, user override is in Settings → AddOns Folder.
- **AddOns folder override is not persisted yet** (known gap). Changing it in Settings only lasts for the current process.
- **PowerShell wraps cargo stderr**: `cargo` writes progress to stderr, and PowerShell tags it as `NativeCommandError` even on success. Look at the "Finished" line and exit code, not the stderr wrapping.
- **PATH refresh**: After `winget install`-ing new tools, the current shell session has a stale PATH. Refresh inline: `$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')`. Most PowerShell commands in this workspace prefix this.
- **MMOUI API has no pagination and no server-side search**. The full catalog (5–10 MB JSON) is downloaded every sync. This is why the local SQLite mirror exists — every competitor manager (Minion, ESO Power Lite, arviceblot/eso-addons) does the same.
- **Manifest version vs catalog version differ regularly**. The author's `## Version:` inside `Foo.txt`/`Foo.addon` is independent of MMOUI's `UIVersion`. Update detection compares the local manifest string against `UIVersion` after normalising leading `v`/`V`.
- **Install/Update pre-cleans the target dir**. Without this, addons that change manifest extension between releases (e.g. `.txt` → `.addon`) leave orphan files that confuse the scanner. SavedVariables live in `live/SavedVariables/`, NOT in the AddOns subdirectory, so the wipe is safe.
- **Bundle size**: production build is ~265 KB JS, ~20 KB CSS, ~10 MB Rust binary. Stay frugal with new lucide icons (~1 KB each, but they add up if imported broadly).

## Commits

User wants:
- Commit messages in **English**, natural tone (no Conventional Commits ceremony unless asked)
- **No Co-Authored-By trailer** for Claude

## Distribution & release (not wired yet)

These pieces have been left as TODO because they need external credentials
or a design pass. Wire them when the user is ready to ship a public build.

### App icon

`app/src-tauri/icons/source.svg` is the design source. The PNG/ICO/ICNS
variants currently in `icons/` are the Tauri default wave icons; replacing
them needs:

1. Export `source.svg` to a 1024×1024 PNG (Inkscape, Figma, etc).
2. From `app/`: `npx @tauri-apps/cli icon path/to/source.png` — writes all
   the platform variants in place.

Document for `icons/README.md` describes this.

### GitHub Actions CI

`.github/workflows/build.yml` already builds MSI on `windows-latest` and
AppImage on `ubuntu-latest` on every push/PR to master, with the artifacts
uploaded. No secrets required for the basic unsigned build. Needs a real
GitHub remote (`git remote add origin ...`) before it activates.

### Code signing (Windows MSI)

Without signing, the MSI triggers Windows SmartScreen on first launch. To
fix it cleanly:

- **Azure Trusted Signing** is the cheapest legit option (~$10/month) and
  works with GitHub Actions via Microsoft's official action
  (`azure/trusted-signing-action`).
- Add secrets to the GitHub repo:
  `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
  `TRUSTED_SIGNING_ACCOUNT`, `TRUSTED_SIGNING_CERTIFICATE_PROFILE`.
- In `app/src-tauri/tauri.conf.json` under `bundle.windows`, add the
  signing config (the Tauri docs have the exact JSON).
- Add a post-build step to the workflow that calls the Trusted Signing
  action against the `.msi` output before uploading.

EV cert from Sectigo/DigiCert is the alternative (~$300/year) — same
endgame, just dearer and requires a hardware token or HSM.

### Tauri Updater (auto-update of the app itself)

**Status:** wired (plugin registered, UI in Settings → App Updates), but
currently signed by a **dev keypair** that lives in `app/secrets/` and is
git-ignored. The endpoint in `tauri.conf.json` points at a GitHub Release
URL that doesn't exist yet — `check()` will silently fail in this state.

To activate updates for a public release:

1. **Push the repo to GitHub** under the owner referenced in
   `tauri.conf.json::plugins.updater.endpoints`. Adjust the URL if the
   owner/repo name changes.
2. **Decide the signing identity.** The dev keypair in `app/secrets/` is
   fine for testing but anyone with repo access could sign rogue updates
   if they re-create it from history. For real releases generate a fresh
   one with a password:
   ```powershell
   npx @tauri-apps/cli signer generate -w prod.key
   ```
   Copy the contents of `prod.key.pub` into
   `app/src-tauri/tauri.conf.json::plugins.updater.pubkey`. Store the
   `prod.key` file privately (1Password, vault, etc).
3. **Add GitHub Secrets** to the repo:
   - `TAURI_SIGNING_PRIVATE_KEY` — full contents of `prod.key`.
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password chosen in step 2.
4. **Extend `.github/workflows/build.yml`** so the `npm run tauri build`
   step receives those secrets as env vars. Tauri picks them up
   automatically and signs the bundles. Also publish `latest.json` (Tauri
   build emits it) to a GitHub Release tagged `vX.Y.Z` whose
   `releases/latest/download/latest.json` URL matches the endpoint.
5. **Bump `version`** in both `package.json` and `tauri.conf.json` and
   create a new release whenever you ship.

Code signing the MSI itself (the SmartScreen warning) is a separate
concern — that's the Azure Trusted Signing path above and is unrelated
to Tauri Updater.

## Memory system

User has auto-memory at `~/.claude/projects/C--Users-vitor-workspace-apocrypha/memory/` (indexed in `MEMORY.md`). Notable entries:
- `user_profile.md` — PT-BR responses, voice dictation common
- `project_apocrypha.md` — stack decisions and constraints
- `feedback_no_code_reuse.md` — never propose porting code from `ESO-addon--manager/`
- `design_assets.md` — pointers into the Stitch mockups
- `competitor_landscape.md` — existing ESO addon managers
