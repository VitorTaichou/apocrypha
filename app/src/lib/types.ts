export interface Addon {
  id: string;
  category_id: string | null;
  name: string;
  author: string;
  version: string;
  last_updated: number;
  download_total: number;
  download_monthly: number;
  favorite_total: number;
  directories: string[];
  file_info_url: string | null;
  thumbnail_url: string | null;
  images: string[];
}

export interface Category {
  id: string;
  title: string;
  icon: string | null;
  file_count: number;
}

export interface InstalledAddon {
  dir_name: string;
  title: string;
  version: string | null;
  author: string | null;
  description: string | null;
  depends_on: string[];
  optional_depends_on: string[];
  catalog_id: string | null;
  catalog_version: string | null;
  category_id: string | null;
  thumbnail_url: string | null;
  update_available: boolean;
  catalog_last_updated: number | null;
  installed_at: string | null;
}

export interface CatalogMeta {
  addon_count: number;
  last_synced: string | null;
}

export interface SearchResult {
  total: number;
  page: number;
  limit: number;
  addons: Addon[];
}

export type SortKey =
  | "download_total"
  | "download_monthly"
  | "favorite_total"
  | "last_updated"
  | "name";

export interface AddonDetails extends Addon {
  description: string;
  changelog: string;
}

export interface Snapshot {
  id: string;
  created_at: string;
  kind: string;
  file_count: number;
  total_size_bytes: number;
  trigger: string | null;
}
