/**
 * Rich text for notes and collaboration messages (NOTE-03, COLL-03): a small, safe text format that supports
 * bold (**text**), italics (_text_ or *text*), bulleted (- item) and numbered (1. item) lists, links
 * ([text](https://…)) and bare URLs. Stored as written; rendered through `parseRichText` into a tree the client
 * turns into React elements, so no HTML from users ever reaches the page.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; children: Inline[] }
  | { kind: "italic"; children: Inline[] }
  | { kind: "link"; href: string; text: string };

export type Block =
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] };

const safeHref = (href: string) => /^(https?:\/\/|mailto:)/i.test(href.trim()) ? href.trim() : null;

/** Inline markup: links first (so their text can be bold), then bold, then italics, then bare URLs. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  const linkPattern = /\[([^\]\n]{1,200})\]\(([^)\s]{1,2048})\)/;
  const boldPattern = /\*\*([^*\n]+?)\*\*/;
  const italicPattern = /(?:^|[^\w*])(?:_([^_\n]+?)_|\*([^*\n]+?)\*)(?![\w*])/;
  const urlPattern = /https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/;
  while (rest.length) {
    const candidates = [
      { type: "link" as const, match: linkPattern.exec(rest) },
      { type: "bold" as const, match: boldPattern.exec(rest) },
      { type: "italic" as const, match: italicPattern.exec(rest) },
      { type: "url" as const, match: urlPattern.exec(rest) },
    ].filter((entry) => entry.match) as { type: "link" | "bold" | "italic" | "url"; match: RegExpExecArray }[];
    if (!candidates.length) { out.push({ kind: "text", text: rest }); break; }
    candidates.sort((a, b) => a.match.index - b.match.index);
    const { type, match } = candidates[0];
    let start = match.index;
    let length = match[0].length;
    if (type === "italic" && match[0][0] !== "_" && match[0][0] !== "*") { start += 1; length -= 1; } // leading boundary character
    if (start > 0) out.push({ kind: "text", text: rest.slice(0, start) });
    if (type === "link") {
      const href = safeHref(match[2]);
      out.push(href ? { kind: "link", href, text: match[1] } : { kind: "text", text: match[0] });
    } else if (type === "bold") {
      out.push({ kind: "bold", children: parseInline(match[1]) });
    } else if (type === "italic") {
      out.push({ kind: "italic", children: parseInline(match[1] ?? match[2] ?? "") });
    } else {
      out.push({ kind: "link", href: match[0], text: match[0] });
    }
    rest = rest.slice(start + length);
  }
  // Adjacent text pieces (for example around a rejected link) read as one node.
  return out.reduce<Inline[]>((merged, node) => {
    const last = merged[merged.length - 1];
    if (node.kind === "text" && last?.kind === "text") merged[merged.length - 1] = { kind: "text", text: last.text + node.text };
    else merged.push(node);
    return merged;
  }, []);
}

export function parseRichText(text: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Inline[][] } | null = null;
  const flushParagraph = () => { if (paragraph.length) { blocks.push({ kind: "paragraph", children: parseInline(paragraph.join("\n")) }); paragraph = []; } };
  const flushList = () => { if (list) { blocks.push({ kind: "list", ordered: list.ordered, items: list.items }); list = null; } };
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(parseInline((bullet ?? numbered)![1]));
      continue;
    }
    flushList();
    if (!line.trim()) { flushParagraph(); continue; }
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Plain text for previews and emails: markup stripped, lists kept as lines. */
export function richTextToPlain(text: string): string {
  const inline = (nodes: Inline[]): string => nodes.map((node) => node.kind === "text" ? node.text : node.kind === "link" ? (node.text === node.href ? node.href : `${node.text} (${node.href})`) : inline(node.children)).join("");
  return parseRichText(text).map((block) => block.kind === "paragraph" ? inline(block.children) : block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : "-"} ${inline(item)}`).join("\n")).join("\n\n");
}
