import { getCategoryMeta } from "@/lib/categoryMeta";

interface CategoryIconProps {
  categoryId: string | null | undefined;
  size?: number;
}

export function CategoryIcon({ categoryId, size = 14 }: CategoryIconProps) {
  if (!categoryId) return null;
  const meta = getCategoryMeta(categoryId);
  const Icon = meta.icon;
  return (
    <span
      title={meta.title}
      className="inline-flex shrink-0 items-center"
      aria-label={meta.title}
    >
      <Icon
        strokeWidth={1.75}
        style={{ width: size, height: size, color: meta.color }}
      />
    </span>
  );
}
