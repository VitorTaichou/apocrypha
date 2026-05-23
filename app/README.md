# Apocrypha

A modern addon manager for **The Elder Scrolls Online**.

Fast, lightweight, beautifully dark. Built to replace Minion with something that respects your machine and your time.

> "Apocrypha" — codename **Archivist** — v0.1.0

## Stack

- **Tauri 2** + **Rust** — native window, ~10 MB binary, real auto-updater
- **React 19** + **TypeScript** + **Vite**
- **Tailwind CSS 4** + **shadcn/ui** + **Lucide icons**
- **Newsreader** (display serif) + **Geist** (UI sans) via Google Fonts
- **SQLite** local catalog (planned) — synced from ESOUI via GitHub Actions

## Status

Phase 0 — scaffold complete. The app launches with sidebar (Search / Installed / Settings), status bar, and placeholder pages styled with the Apocrypha Tech design system.

## Development

```powershell
# install JS deps (once)
npm install

# run in dev mode (opens the desktop window)
npm run tauri dev

# production build (MSI on Windows, AppImage on Linux)
npm run tauri build
```

First `tauri dev` triggers a full Rust compile of ~476 crates (Tauri, wry, tao, webview2-com, windows-sys, …). Expect ~4 minutes on the first run; subsequent runs are seconds.

## Project layout

```
app/
├── src/                     # React frontend
│   ├── components/          # Sidebar, StatusBar, PageHeader
│   ├── pages/               # SearchPage, InstalledPage, SettingsPage
│   ├── lib/utils.ts         # cn() helper
│   ├── App.tsx              # root layout
│   ├── main.tsx             # React entry
│   └── index.css            # Tailwind + design tokens
├── src-tauri/               # Rust backend
│   ├── src/main.rs          # entrypoint
│   ├── src/lib.rs           # Tauri builder + commands
│   ├── Cargo.toml
│   └── tauri.conf.json      # window, bundling, identifier
├── components.json          # shadcn/ui config
├── package.json
└── vite.config.ts
```

## Roadmap

### Phase 1 — MVP (next)
- [ ] Cliente MMOUI v3 em Rust (`api.rs`)
- [ ] Schema SQLite + catálogo local
- [ ] Download do `addons.db` do GitHub release `data-latest` na primeira execução
- [ ] Scanner da pasta `AddOns/` (Windows + Steam Deck)
- [ ] Parser de manifesto `.txt` / `.addon` (lê `## DependsOn`, `## Version`, etc.)
- [ ] Comandos Tauri: `install_addon`, `uninstall_addon`, `list_installed`, `search_addons`
- [ ] UI conectada às telas Search e Installed

### Phase 2 — Diferenciais
- [ ] Detector de conflitos e dependências quebradas
- [ ] Auditoria do que já está instalado (mostrada na página Installed)
- [ ] Importação 1-click do Minion (biblioteca + SavedVariables)
- [ ] Instalador MSI assinado + winget no Windows
- [ ] AppImage + Flatpak (Flathub) no Linux
- [ ] Auto-updater do app (Tauri Updater)

### Phase 3 — Polish
- [ ] Documentação + GIFs no GitHub Pages
- [ ] Beta fechado (Discord ESO BR)
- [ ] Beta aberto (post no ESOUI forum + r/elderscrollsonline)

### v1.0
- [ ] Bugs do beta resolvidos
- [ ] Aprovação no winget e Flathub

## Design

Visual identity ships from `../stitch_apocrypha_eso_manager/apocrypha_tech/DESIGN.md` — "Techno-Occult Productivity". Dark teal-on-near-black, scholarly serif headlines (Newsreader) over technical sans body (Geist). No fantasy borders, no neon, no game-launcher loudness.

## License

TBD.
