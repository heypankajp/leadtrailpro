"use client";

import { Fragment, type ReactNode } from "react";
import { parseRichText, type Inline } from "@/lib/richtext";

const inline = (nodes: Inline[]): ReactNode => nodes.map((node, index) => {
  switch (node.kind) {
    case "text": return <Fragment key={index}>{node.text}</Fragment>;
    case "bold": return <strong key={index}>{inline(node.children)}</strong>;
    case "italic": return <em key={index}>{inline(node.children)}</em>;
    case "link": return <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">{node.text}</a>;
  }
});

/** Renders the stored rich-text format (NOTE-03): bold, italics, lists, and links, never raw HTML. */
export default function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseRichText(text);
  return (
    <div className={`rich-text ${className}`}>
      {blocks.map((block, index) => block.kind === "paragraph"
        ? <p key={index}>{inline(block.children)}</p>
        : block.ordered
          ? <ol key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ol>
          : <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inline(item)}</li>)}</ul>)}
    </div>
  );
}
