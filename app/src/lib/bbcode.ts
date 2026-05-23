/**
 * BBCode parser for ESOUI addon descriptions and changelogs.
 *
 * Returns an AST (block + inline nodes) instead of a plain string, so the
 * renderer can give visual hierarchy to what is otherwise a flat wall of
 * text: headings, code blocks, clickable links, bullet lists.
 *
 * Parsing strategy:
 *   1. Extract block-level wrappers ([code], [list]) into a side table and
 *      replace them with sentinel placeholders so paragraph splitting is
 *      not confused by embedded blank lines.
 *   2. Strip wrappers we don't care about (table, color, font, center,
 *      indent, youtube, etc).
 *   3. Promote ASCII separator lines (---/===) into [hr] placeholders.
 *   4. Split on blank lines into paragraph chunks.
 *   5. Each chunk is classified iteratively:
 *      a. Code/list placeholder, hr.
 *      b. Heading on the first line (heuristic + whitelist), then re-process
 *         the rest of the chunk.
 *      c. Bullet block (every line starts with •/-/*) → list.
 *      d. Otherwise paragraph with inline parsing.
 *
 * Inline parsing handles [b]/[i]/[u]/[s], [url=...]label[/url], [url]bare[/url],
 * and bare http(s) URLs. Headings use the same inline AST so [B]Foo[/B] in a
 * section title renders bold instead of leaking the raw tag.
 */

export type InlineNode =
  | { type: "text"; text: string }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "underline"; children: InlineNode[] }
  | { type: "strike"; children: InlineNode[] }
  | { type: "link"; href: string; children: InlineNode[] };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "heading"; level: 2 | 3; children: InlineNode[] }
  | { type: "code"; text: string }
  | { type: "list"; items: InlineNode[][] }
  | { type: "hr" };

// SOH control char: not a Unicode whitespace, so it survives String.trim()
// inside the paragraph split below. A plain space here would be eaten by
// trim() and the placeholders would leak to the renderer as literal text.
const SENTINEL = "";

// Section names that always read as primary (level-2) headings in ESOUI
// descriptions. Keep lowercase, matched case-insensitively, trimmed.
const PRIMARY_HEADINGS = new Set([
  "description",
  "dependencies",
  "required libraries",
  "optional dependencies",
  "external filters",
  "quick start",
  "usage",
  "features",
  "installation",
  "how to install",
  "how to manually install addon",
  "api",
  "api reference",
  "slash commands",
  "commands",
  "migration",
  "migrating",
  "changelog",
  "credits",
  "requirements",
  "notes",
  "configuration",
  "license",
  "screenshots",
]);

export function parseBBCode(raw: string): BlockNode[] {
  if (!raw) return [];

  let text = raw.replace(/\r\n/g, "\n");

  // 1. Extract [code]...[/code] FIRST — its body must keep raw markup, so
  // it gets pulled aside before any of the subsequent strips touch the text.
  const codeBlocks: string[] = [];
  text = text.replace(
    /\[code(?:=[^\]]*)?\]([\s\S]*?)\[\/code\]/gi,
    (_, body: string) => {
      const idx = codeBlocks.push(body) - 1;
      return `\n\n${SENTINEL}CODE${idx}${SENTINEL}\n\n`;
    },
  );

  // 2. Drop images / embedded media — the panel renders screenshots
  // separately and we can't play YouTube/video inline.
  text = text.replace(/\[img(?:=[^\]]*)?\][\s\S]*?\[\/img\]/gi, "");
  text = text.replace(/\[img=([^\]]+)\]/gi, "");
  text = text.replace(
    /\[(?:youtube|video|media)(?:=[^\]]*)?\][\s\S]*?\[\/(?:youtube|video|media)\]/gi,
    "",
  );
  text = text.replace(/\[(?:youtube|video|media)=[^\]]+\]/gi, "");

  // 3. Strip decorative wrappers (color, font, indent, etc). Runs BEFORE the
  // list extraction so item bodies that go into the side table are already
  // clean — otherwise [COLOR="Plum"]Foo[/COLOR] leaks into renderInline,
  // which only knows [b]/[i]/[u]/[s]/[url].
  text = text.replace(
    /\[\/?(?:table|tr|td|center|left|right|sup|sub|font|size|color|highlight|indent|h\d)(?:=[^\]]*)?\]/gi,
    "",
  );

  // 4. Collapse trivially nested same-tag pairs. Authors regularly stack
  // [B][SIZE=...][B]Foo[/B][/SIZE][/B] (Writ Crafter does this 4+ levels deep).
  // After step 3 strips SIZE/COLOR/etc, we're left with [B][B]Foo[/B][/B] —
  // regex non-greedy can't match nested same-tag pairs, so it pairs the outer
  // [B] with the inner [/B] and leaves stray markup behind. Iteratively drop
  // adjacent duplicates until the text stabilizes.
  let prev: string;
  do {
    prev = text;
    text = text.replace(/\[(b|i|u|s)\]\s*\[\1\]/gi, "[$1]");
    text = text.replace(/\[\/(b|i|u|s)\]\s*\[\/\1\]/gi, "[/$1]");
  } while (prev !== text);

  // 5. Squash multi-line inline tag pairs ([b]/[i]/[u]/[s]) into a single
  // line so paragraph splitting / heading peeling don't break the pair in
  // half. Author of Writ Crafter literally writes "[U]Slash Commands\n[/U]".
  text = text.replace(
    /\[(b|i|u|s)\]([\s\S]*?)\[\/\1\]/gi,
    (_, tag: string, body: string) =>
      `[${tag}]${body.replace(/\s*\n\s*/g, " ").trim()}[/${tag}]`,
  );

  // 5. Quote / spoiler: keep contents as a paragraph break.
  text = text.replace(/\[\/?quote(?:=[^\]]*)?\]/gi, "\n\n");
  text = text.replace(/\[\/?spoiler(?:=[^\]]*)?\]/gi, "\n\n");

  // 6. Extract [list]...[/list]. Items captured here are already free of
  // [color]/[indent]/etc thanks to step 3.
  const listBlocks: string[][] = [];
  text = text.replace(
    /\[list(?:=[^\]]*)?\]([\s\S]*?)\[\/list\]/gi,
    (_, body: string) => {
      const idx = listBlocks.push(splitListItems(body)) - 1;
      return `\n\n${SENTINEL}LIST${idx}${SENTINEL}\n\n`;
    },
  );

  // 7. Strip stray [LIST] / [/LIST] (unbalanced markers some authors leave
  // dangling — e.g. LoreBooks closes one more [/LIST] than it opens).
  text = text.replace(/\[\/?list(?:=[^\]]*)?\]/gi, "");

  // 8. Block-level breaks.
  text = text.replace(/\[hr\]/gi, `\n\n${SENTINEL}HR${SENTINEL}\n\n`);
  text = text.replace(/\[br\]/gi, "\n");
  text = text.replace(
    /^[ \t]*[-=_*]{3,}[ \t]*$/gm,
    `\n\n${SENTINEL}HR${SENTINEL}\n\n`,
  );

  // 9. Stray [*] outside [list] (some authors use bullets without wrapping).
  text = text.replace(/\[\*\]\s*/gi, "• ");

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const blocks: BlockNode[] = [];
  for (const rawPara of paragraphs) {
    classifyParagraph(rawPara, blocks, codeBlocks, listBlocks);
  }

  return blocks;
}

function classifyParagraph(
  initial: string,
  out: BlockNode[],
  codeBlocks: string[],
  listBlocks: string[][],
) {
  let current = initial;

  // Iterate so a paragraph that begins with a heading can peel the heading
  // off and keep classifying the remainder (which itself may be a list or
  // another heading + body).
  while (current.length > 0) {
    // Placeholders for the side tables. SENTINEL is , which survives
    // String.trim(), so the placeholder arrives intact.
    const codeMatch = current.match(/^CODE(\d+)$/);
    if (codeMatch) {
      const body = codeBlocks[Number(codeMatch[1])].replace(/^\n+|\n+$/g, "");
      if (body) out.push({ type: "code", text: body });
      return;
    }
    const listMatch = current.match(/^LIST(\d+)$/);
    if (listMatch) {
      const items = listBlocks[Number(listMatch[1])].map(parseInline);
      if (items.length) out.push({ type: "list", items });
      return;
    }
    if (current === `${SENTINEL}HR${SENTINEL}`) {
      out.push({ type: "hr" });
      return;
    }

    const lines = current.split("\n");
    const firstLine = lines[0].trim();
    const headingChildren = headingChildrenFor(firstLine);

    if (headingChildren && lines.length > 1) {
      const level = headingLevelFor(firstLine);
      const isStrongHeading = level === 2;

      // Multi-line banner detection: if every line in the paragraph looks
      // heading-like AND the first line isn't on the strong-heading
      // whitelist, this is probably a stacked title/subtitle (e.g. "Console
      // Release\nLorebooks"), not heading + body. Keep them together.
      if (
        !isStrongHeading &&
        lines.every((l) => {
          const t = l.trim();
          return t.length === 0 || headingChildrenFor(t) !== null;
        })
      ) {
        out.push({ type: "paragraph", children: parseInline(current) });
        return;
      }

      out.push({ type: "heading", level, children: headingChildren });

      // Headings-like prefix in the remainder → render as a list. Covers
      // "Required Libraries\nLibAddonMenu-2.0\nLibCustomMenu\n...\nDisplays
      // map pins...": six short lines become bullets, the long sentence
      // continues as a paragraph below.
      const rest = lines.slice(1);
      const prefix: string[] = [];
      let i = 0;
      while (i < rest.length && headingChildrenFor(rest[i].trim()) !== null) {
        prefix.push(rest[i].trim());
        i++;
      }
      if (prefix.length >= 2) {
        out.push({ type: "list", items: prefix.map(parseInline) });
        const tail = rest.slice(i).join("\n").trim();
        if (!tail) return;
        current = tail;
        continue;
      }

      const tail = rest.join("\n").trim();
      if (!tail) return;
      current = tail;
      continue;
    }

    if (headingChildren && lines.length === 1) {
      out.push({
        type: "heading",
        level: headingLevelFor(firstLine),
        children: headingChildren,
      });
      return;
    }

    // Single-version changelog line: "version 3.2.1 - someone" or "v106".
    if (
      lines.length === 1 &&
      /^v(?:ersion)?\s*[\w.\-]+(?:\s*[-–—]\s*.+)?$/i.test(firstLine)
    ) {
      out.push({
        type: "heading",
        level: 3,
        children: parseInline(firstLine),
      });
      return;
    }

    // Bullet block: every line starts with •/-/*.
    if (
      lines.length > 1 &&
      lines.every((l) => /^\s*[•\-*]\s+/.test(l) && l.trim().length > 1)
    ) {
      const items = lines
        .map((l) => l.replace(/^\s*[•\-*]\s+/, "").trim())
        .filter(Boolean)
        .map(parseInline);
      out.push({ type: "list", items });
      return;
    }

    // Default: paragraph with inline parsing. Keep \n in the content so
    // pre-wrap rendering preserves the layout the author intended.
    out.push({ type: "paragraph", children: parseInline(current) });
    return;
  }
}

/**
 * If the line reads as a heading, returns parsed inline children (so [B] etc
 * still render as bold). Otherwise returns null.
 */
function headingChildrenFor(line: string): InlineNode[] | null {
  if (!line) return null;
  if (line.includes("\n")) return null;
  const stripped = stripInlineTagsForHeuristic(line).trim();
  if (!stripped) return null;
  if (stripped.length === 0 || stripped.length > 60) return null;
  if (/^[•\-*]\s/.test(stripped)) return null;
  if (stripped.startsWith("/")) return null; // slash command, not a heading
  // Sentence-ending punctuation rules it out (allow trailing ":" though).
  if (/[.,;?!"')]$/.test(stripped)) return null;
  // Mid-sentence comma → prose, not a heading (e.g. "Fully automatic
  // crafting, including:" passed the other checks but is clearly a sentence).
  if (/,/.test(stripped)) return null;
  // Looks like code, not prose.
  if (/[(){};=]/.test(stripped)) return null;
  // Too many words = not a heading.
  const words = stripped.split(/\s+/).length;
  if (words === 0 || words > 6) return null;

  return parseInline(line);
}

function headingLevelFor(line: string): 2 | 3 {
  const key = stripInlineTagsForHeuristic(line)
    .replace(/[:\s]+$/, "")
    .toLowerCase();
  return PRIMARY_HEADINGS.has(key) ? 2 : 3;
}

function stripInlineTagsForHeuristic(s: string): string {
  return s
    .replace(/\[\/?(?:b|i|u|s|highlight|color|font|size|sup|sub|h\d)(?:=[^\]]*)?\]/gi, "")
    .replace(/\[url=[^\]]+\]([\s\S]*?)\[\/url\]/gi, "$1")
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1");
}

function splitListItems(body: string): string[] {
  // Preferred: items separated by [*]. Some authors omit those markers and
  // rely on newlines / "•" / "-" instead — handle both cases gracefully.
  const trimmed = body.trim();
  if (/\[\*\]/.test(trimmed)) {
    return trimmed
      .split(/\[\*\]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return trimmed
    .split("\n")
    .map((s) => s.trim().replace(/^[•\-*]\s*/, ""))
    .filter(Boolean);
}

function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  const nodes: InlineNode[] = [];
  // Master regex covering inline BBCode we care about. Order matters: [url=X]
  // before [url], otherwise the simple [url] arm steals the match.
  const re =
    /\[url=([^\]]+)\]([\s\S]*?)\[\/url\]|\[url\]([\s\S]*?)\[\/url\]|\[b\]([\s\S]*?)\[\/b\]|\[i\]([\s\S]*?)\[\/i\]|\[u\]([\s\S]*?)\[\/u\]|\[s\]([\s\S]*?)\[\/s\]/gi;

  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) {
      nodes.push(...linkifyText(text.slice(lastIdx, m.index)));
    }
    if (m[1] !== undefined) {
      const href = m[1].replace(/^["']|["']$/g, "");
      nodes.push({
        type: "link",
        href,
        children: parseInline(m[2] || href),
      });
    } else if (m[3] !== undefined) {
      const href = m[3].replace(/^["']|["']$/g, "");
      nodes.push({
        type: "link",
        href,
        children: [{ type: "text", text: href }],
      });
    } else if (m[4] !== undefined) {
      nodes.push({ type: "bold", children: parseInline(m[4]) });
    } else if (m[5] !== undefined) {
      nodes.push({ type: "italic", children: parseInline(m[5]) });
    } else if (m[6] !== undefined) {
      nodes.push({ type: "underline", children: parseInline(m[6]) });
    } else if (m[7] !== undefined) {
      nodes.push({ type: "strike", children: parseInline(m[7]) });
    }
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < text.length) {
    nodes.push(...linkifyText(text.slice(lastIdx)));
  }
  return nodes;
}

function linkifyText(s: string): InlineNode[] {
  if (!s) return [];
  const out: InlineNode[] = [];
  const urlRe = /\b(https?:\/\/[^\s<>"')\]]+)/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(s)) !== null) {
    if (m.index > last) {
      out.push({ type: "text", text: s.slice(last, m.index) });
    }
    out.push({
      type: "link",
      href: m[1],
      children: [{ type: "text", text: m[1] }],
    });
    last = m.index + m[0].length;
  }
  if (last < s.length) {
    out.push({ type: "text", text: s.slice(last) });
  }
  return out;
}
