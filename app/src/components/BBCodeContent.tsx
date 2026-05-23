import { openUrl } from "@tauri-apps/plugin-opener";
import type { BlockNode, InlineNode } from "@/lib/bbcode";
import { parseBBCode } from "@/lib/bbcode";

interface BBCodeContentProps {
  text: string;
}

export function BBCodeContent({ text }: BBCodeContentProps) {
  const blocks = parseBBCode(text);
  if (blocks.length === 0) return null;

  return (
    <div className="space-y-3 text-sm leading-relaxed text-[var(--color-on-surface-variant)]">
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

function renderBlock(block: BlockNode, key: number) {
  switch (block.type) {
    case "heading":
      if (block.level === 2) {
        return (
          <h4
            key={key}
            className="mt-5 text-[13px] font-semibold tracking-tight text-[var(--color-on-surface)] first:mt-0"
          >
            {renderInline(stripTrailingColon(block.children))}
          </h4>
        );
      }
      return (
        <h5
          key={key}
          className="mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-primary)]/85 first:mt-0"
        >
          {renderInline(stripTrailingColon(block.children))}
        </h5>
      );

    case "code":
      return (
        <pre
          key={key}
          className="overflow-x-auto whitespace-pre rounded-md border border-[var(--color-border)] bg-[var(--color-surface-dim)] px-3 py-2 font-mono text-[12px] leading-snug text-[var(--color-on-surface)]"
        >
          {block.text}
        </pre>
      );

    case "list":
      return (
        <ul key={key} className="space-y-1.5">
          {block.items.map((item, j) => (
            <li key={j} className="flex gap-2">
              <span
                aria-hidden
                className="select-none text-[var(--color-primary)]/70"
              >
                •
              </span>
              <span className="min-w-0 flex-1">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );

    case "hr":
      return (
        <hr
          key={key}
          className="my-2 border-0 border-t border-[var(--color-outline-variant)]/40"
        />
      );

    case "paragraph":
      return (
        <p key={key} className="whitespace-pre-wrap">
          {renderInline(block.children)}
        </p>
      );
  }
}

function renderInline(nodes: InlineNode[]) {
  return nodes.map((node, i) => renderInlineNode(node, i));
}

// Drop a trailing ":" from heading children so "Slash commands:" reads as
// "Slash commands" without losing inline formatting.
function stripTrailingColon(nodes: InlineNode[]): InlineNode[] {
  if (nodes.length === 0) return nodes;
  const last = nodes[nodes.length - 1];
  if (last.type === "text") {
    const trimmed = last.text.replace(/[:\s]+$/, "");
    if (trimmed === last.text) return nodes;
    if (!trimmed) return nodes.slice(0, -1);
    return [...nodes.slice(0, -1), { type: "text", text: trimmed }];
  }
  return nodes;
}

function renderInlineNode(node: InlineNode, key: number): React.ReactNode {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.text}</span>;
    case "bold":
      return (
        <strong key={key} className="font-semibold text-[var(--color-on-surface)]">
          {renderInline(node.children)}
        </strong>
      );
    case "italic":
      return (
        <em key={key} className="italic">
          {renderInline(node.children)}
        </em>
      );
    case "underline":
      return (
        <span key={key} className="underline">
          {renderInline(node.children)}
        </span>
      );
    case "strike":
      return (
        <span key={key} className="line-through">
          {renderInline(node.children)}
        </span>
      );
    case "link":
      return (
        <a
          key={key}
          href={node.href}
          onClick={(e) => {
            e.preventDefault();
            openUrl(node.href).catch(() => {});
          }}
          className="break-words text-[var(--color-primary)] underline-offset-2 hover:underline"
        >
          {renderInline(node.children)}
        </a>
      );
  }
}
