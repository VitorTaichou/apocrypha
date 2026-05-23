import { invoke } from "@tauri-apps/api/core";
import type {
  Addon,
  AddonDetails,
  CatalogMeta,
  Category,
  InstalledAddon,
  SearchResult,
  Snapshot,
  SortKey,
} from "./types";

export const api = {
  searchAddons(params: {
    query?: string;
    categoryId?: string;
    sortBy?: SortKey;
    page?: number;
    limit?: number;
  }): Promise<SearchResult> {
    return invoke<SearchResult>("search_addons", {
      query: params.query ?? null,
      categoryId: params.categoryId ?? null,
      sortBy: params.sortBy ?? null,
      page: params.page ?? 1,
      limit: params.limit ?? 30,
    });
  },

  listCategories(): Promise<Category[]> {
    return invoke<Category[]>("list_categories");
  },

  catalogMeta(): Promise<CatalogMeta> {
    return invoke<CatalogMeta>("catalog_meta");
  },

  listInstalled(): Promise<InstalledAddon[]> {
    return invoke<InstalledAddon[]>("list_installed");
  },

  syncCatalog(): Promise<CatalogMeta> {
    return invoke<CatalogMeta>("sync_catalog");
  },

  getAddonsDir(): Promise<string> {
    return invoke<string>("get_addons_dir");
  },

  setAddonsDir(path: string): Promise<void> {
    return invoke<void>("set_addons_dir", { path });
  },

  installAddon(addonId: string): Promise<string[]> {
    return invoke<string[]>("install_addon", { addonId });
  },

  uninstallAddon(dirName: string): Promise<void> {
    return invoke<void>("uninstall_addon", { dirName });
  },

  getAddonById(id: string): Promise<Addon | null> {
    return invoke<Addon | null>("get_addon_by_id", { id });
  },

  getAddonDetails(id: string): Promise<AddonDetails | null> {
    return invoke<AddonDetails | null>("get_addon_details", { id });
  },

  listSnapshots(): Promise<Snapshot[]> {
    return invoke<Snapshot[]>("list_savedvars_snapshots");
  },

  createSnapshot(): Promise<Snapshot> {
    return invoke<Snapshot>("create_savedvars_snapshot");
  },

  restoreSnapshot(id: string): Promise<number> {
    return invoke<number>("restore_savedvars_snapshot", { id });
  },

  deleteSnapshot(id: string): Promise<void> {
    return invoke<void>("delete_savedvars_snapshot", { id });
  },

  getCloseToTray(): Promise<boolean> {
    return invoke<boolean>("get_close_to_tray");
  },

  setCloseToTray(value: boolean): Promise<void> {
    return invoke<void>("set_close_to_tray", { value });
  },
};

export type {
  Addon,
  AddonDetails,
  Category,
  InstalledAddon,
  CatalogMeta,
  SearchResult,
  Snapshot,
};
