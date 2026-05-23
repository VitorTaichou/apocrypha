/**
 * Minimal BBCode → plain-text cleaner for ESOUI descriptions and changelogs.
 *
 * ESOUI text is authored with BBCode markup ([b], [i], [url=...], [img], [list],
 * [color=...], etc). For now we strip the markup rather than rendering it as
 * formatted HTML — keeps the panel safe (no innerHTML) and readable.
 *
 * List-block tags are swallowed completely (whitespace either side) because each
 * [*] item already lives on its own line in the source; emitting newlines around
 * the surrounding [list]/[/list] just balloons the gaps. Paragraph rendering on
 * the consumer side splits on blank lines, so we want the source as tight as
 * possible.
 */
export function stripBBCode(text: string): string {
  if (!text) return "";
  return text
    // [url=...]label[/url] → "label (url)"
    .replace(/\[url=([^\]]+)\]([\s\S]*?)\[\/url\]/gi, "$2 ($1)")
    .replace(/\[url\]([\s\S]*?)\[\/url\]/gi, "$1")
    // [img]url[/img] → drop entirely
    .replace(/\[img(?:=[^\]]*)?\][\s\S]*?\[\/img\]/gi, "")
    // bullets — keep on their own line
    .replace(/\[\*\]\s*/gi, "• ")
    // list wrappers — swallow trailing whitespace so we don't pad with blank lines
    .replace(/\[list(?:=[^\]]*)?\]\s*/gi, "")
    .replace(/\[\/list\]\s*/gi, "\n")
    // table cells get flattened to inline
    .replace(/\[\/?(?:table|tr|td)(?:=[^\]]*)?\]\s*/gi, "")
    // quote/code/spoiler — keep as paragraph break
    .replace(/\[(?:quote|code|spoiler)(?:=[^\]]*)?\]/gi, "\n")
    .replace(/\[\/(?:quote|code|spoiler)\]/gi, "\n")
    // simple inline tags (strip wrapper, keep content)
    .replace(
      /\[(?:b|i|u|s|center|left|right|sup|sub|font|size|color|highlight|h\d)(?:=[^\]]*)?\]/gi,
      "",
    )
    .replace(
      /\[\/(?:b|i|u|s|center|left|right|sup|sub|font|size|color|highlight|h\d)\]/gi,
      "",
    )
    .replace(/\[hr\]/gi, "\n———————————\n")
    .replace(/\[br\]/gi, "\n")
    // collapse runs of blank lines down to one
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Split cleaned text into paragraphs. A paragraph is a chunk separated by one
 * or more blank lines. Useful for rendering with controlled spacing instead of
 * relying on `white-space: pre-wrap` and source-driven blank lines.
 */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}
