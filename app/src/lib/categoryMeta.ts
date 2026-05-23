import {
  Activity,
  Backpack,
  BarChart3,
  Beaker,
  BookOpen,
  Box,
  Crosshair,
  Database,
  Drama,
  Flame,
  Gamepad2,
  Hammer,
  Heart,
  Hexagon,
  Home,
  Image,
  Info,
  Languages,
  Library,
  type LucideIcon,
  Mail,
  Map,
  MessageCircle,
  Moon,
  Palette,
  Plug,
  Shield,
  ShoppingBag,
  Skull,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  Timer,
  TrendingUp,
  User,
  Users,
  UsersRound,
  Wrench,
  Zap,
} from "lucide-react";

export interface CategoryMeta {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
}

const META: Record<string, CategoryMeta> = {
  // === Visual / UI ===
  "17": { icon: Palette, color: "#67E8F9", title: "Graphic UI Mods", description: "Skins and themes that reshape the entire UI look." },
  "147": { icon: Image, color: "#7DD3FC", title: "UI Media", description: "Fonts, textures and other UI media assets." },
  "162": { icon: Gamepad2, color: "#A5B4FC", title: "Game Controller", description: "Tweaks for gamepad and controller layouts." },

  // === Combat & Action ===
  "25": { icon: Swords, color: "#F87171", title: "Combat Mods", description: "Combat enhancements, damage meters, threat trackers." },
  "19": { icon: Crosshair, color: "#FB923C", title: "Action Bar Mods", description: "Custom action bars, slot management and rotations." },
  "22": { icon: Sparkles, color: "#FCA5A5", title: "Buff, Debuff, Spell", description: "Buff, debuff and spell tracking overlays." },
  "112": { icon: Timer, color: "#FDBA74", title: "Casting Bars, Cooldowns", description: "Cast bars, cooldown timers and procs." },
  "21": { icon: User, color: "#FB7185", title: "Unit Mods", description: "Unit frames for self, target and party." },
  "45": { icon: Users, color: "#EF4444", title: "Raid Mods", description: "Tools tailored for raid mechanics and trial groups." },
  "96": { icon: Shield, color: "#DC2626", title: "PvP", description: "PvP, Cyrodiil and battleground utilities." },

  // === Class Specific ===
  "56": { icon: Sun, color: "#FDE68A", title: "Templar", description: "Templar-specific helpers and ability trackers." },
  "57": { icon: Flame, color: "#F97316", title: "Dragon Knight", description: "Dragon Knight class addons." },
  "58": { icon: Zap, color: "#A855F7", title: "Sorcerer", description: "Sorcerer class addons." },
  "152": { icon: Moon, color: "#8B5CF6", title: "Nightblade", description: "Nightblade class addons." },
  "164": { icon: Sprout, color: "#65A30D", title: "Warden", description: "Warden class addons." },
  "165": { icon: Skull, color: "#737373", title: "Necromancer", description: "Necromancer class addons." },
  "166": { icon: Hexagon, color: "#06B6D4", title: "Arcanist", description: "Arcanist class addons." },
  "149": { icon: Activity, color: "#EF4444", title: "DPS", description: "Role-focused helpers for DPS." },
  "150": { icon: Heart, color: "#FDE047", title: "Healers", description: "Tools to keep allies alive and topped off." },
  "151": { icon: Shield, color: "#3B82F6", title: "Tank", description: "Threat, mitigation and tanking helpers." },

  // === World, Map & Housing ===
  "24": { icon: Map, color: "#34D399", title: "Map, Coords, Compasses", description: "Map overlays, coordinates and compass pins." },
  "160": { icon: Home, color: "#10B981", title: "Homestead", description: "Housing decoration, planning and inventory." },

  // === Social & Communication ===
  "55": { icon: MessageCircle, color: "#7DD3FC", title: "Chat Mods", description: "Chat improvements, filters and emote helpers." },
  "95": { icon: UsersRound, color: "#60A5FA", title: "Group, Guild & Friends", description: "Guild rosters, group tools and friend management." },
  "97": { icon: Mail, color: "#93C5FD", title: "Mail", description: "Mailbox automation and bulk handling." },
  "98": { icon: Info, color: "#22D3EE", title: "ToolTip", description: "Tooltips with extra item, set or skill data." },
  "114": { icon: Drama, color: "#F472B6", title: "RolePlay", description: "Roleplay tools, character profiles and ambience." },

  // === Trade & Crafting ===
  "20": { icon: Backpack, color: "#FBBF24", title: "Bags, Bank, Inventory", description: "Bag, bank and inventory management." },
  "94": { icon: ShoppingBag, color: "#F59E0B", title: "Auction House & Vendors", description: "Guild traders, auction houses, vendor price helpers." },
  "40": { icon: Hammer, color: "#D97706", title: "TradeSkill Mods", description: "Crafting writs, traits and material trackers." },

  // === Data & Progression ===
  "18": { icon: TrendingUp, color: "#818CF8", title: "Character Advancement", description: "Skill points, attribute planning, leveling info." },
  "26": { icon: Database, color: "#60A5FA", title: "Data Mods", description: "Dungeon data, item drops, set databases." },
  "109": { icon: BarChart3, color: "#A78BFA", title: "Info, Plug-in Bars", description: "Status bars showing XP, gold, AP and more." },

  // === Tools & Misc ===
  "53": { icon: Library, color: "#94A3B8", title: "Libraries", description: "Shared libraries used by other addons." },
  "33": { icon: Plug, color: "#A1A1AA", title: "Plug-Ins & Patches", description: "Plug-ins and patches that extend other addons." },
  "155": { icon: Beaker, color: "#F472B6", title: "Beta-version AddOns", description: "Experimental beta builds — use with care." },
  "159": { icon: Wrench, color: "#9CA3AF", title: "Utility Mods", description: "General-purpose utilities and quality of life." },
  "163": { icon: Languages, color: "#A78BFA", title: "Unofficial game translations", description: "Community translations and localization patches." },
  "27": { icon: Box, color: "#94A3B8", title: "Miscellaneous", description: "Everything that doesn't fit elsewhere." },
};

const DEFAULT_META: CategoryMeta = {
  icon: BookOpen,
  color: "#67D9CA",
  title: "Uncategorized",
  description: "Uncatalogued addons.",
};

export function getCategoryMeta(id: string | null | undefined): CategoryMeta {
  if (!id) return DEFAULT_META;
  return META[id] ?? DEFAULT_META;
}
