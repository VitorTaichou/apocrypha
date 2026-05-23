import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-end justify-between border-b border-[var(--color-border)] px-10 py-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-on-surface)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-base text-[var(--color-on-surface-variant)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
