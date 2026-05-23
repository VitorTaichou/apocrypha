import { Search, Library, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { TentacleMark } from "@/components/TentacleMark";

export type PageId = "search" | "installed" | "settings";

interface SidebarProps {
  current: PageId;
  onNavigate: (page: PageId) => void;
}

const navItems: { id: PageId; label: string; icon: typeof Search }[] = [
  { id: "search", label: "Search", icon: Search },
  { id: "installed", label: "Installed", icon: Library },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ current, onNavigate }: SidebarProps) {
  return (
    <aside className="relative flex w-72 shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface-lowest)]">
      {/* Atmospheric decoration — tentacles emerging from the archivist's trove.
          Sits at the bottom of the sidebar, faded, with a top-gradient mask so
          it dissolves into the surface rather than ending in a hard rectangle. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 flex justify-center"
        style={{
          maskImage:
            "linear-gradient(to bottom, black 75%, rgba(0,0,0,0.85) 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, black 75%, rgba(0,0,0,0.85) 90%, transparent 100%)",
        }}
      >
        <img
          src="/sidebar-decor.png"
          alt=""
          className="h-auto w-full max-w-[520px] select-none opacity-[0.3]"
          draggable={false}
        />
      </div>

      <div className="relative z-10 flex justify-center px-7 pt-10 pb-10">
        <h1 className="inline-flex items-center gap-3 font-serif text-3xl font-light leading-none tracking-tight text-[var(--color-primary)]">
          <TentacleMark
            title="Apocrypha"
            className="h-9 w-9 shrink-0"
          />
          <span className="translate-y-[1px]">APOCRYPHA</span>
        </h1>
      </div>

      <nav className="relative z-10 flex flex-1 flex-col gap-1.5 px-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = current === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                "group flex items-center gap-3.5 rounded-md px-4 py-2.5 text-[15px] transition-colors",
                isActive
                  ? "bg-[var(--color-surface-container)]/85 backdrop-blur-sm text-[var(--color-primary)]"
                  : "text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-low)]/85 hover:backdrop-blur-sm hover:text-[var(--color-on-surface)]",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative z-10 h-5" />
    </aside>
  );
}
