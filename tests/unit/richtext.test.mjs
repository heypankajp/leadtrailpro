import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseInline, parseRichText, richTextToPlain } from "../../src/lib/richtext.ts";

describe("rich text (NOTE-03)", () => {
  test("bold, italics, and links become inline nodes", () => {
    assert.deepEqual(parseInline("Call **Priya** _today_ via [the portal](https://portal.example/x)"), [
      { kind: "text", text: "Call " },
      { kind: "bold", children: [{ kind: "text", text: "Priya" }] },
      { kind: "text", text: " " },
      { kind: "italic", children: [{ kind: "text", text: "today" }] },
      { kind: "text", text: " via " },
      { kind: "link", href: "https://portal.example/x", text: "the portal" },
    ]);
  });

  test("bare URLs link and trailing punctuation stays outside", () => {
    assert.deepEqual(parseInline("See https://example.com/a?b=1, then reply."), [
      { kind: "text", text: "See " },
      { kind: "link", href: "https://example.com/a?b=1", text: "https://example.com/a?b=1" },
      { kind: "text", text: ", then reply." },
    ]);
  });

  test("unsafe link targets stay as plain text", () => {
    assert.deepEqual(parseInline("[x](javascript:alert(1))"), [{ kind: "text", text: "[x](javascript:alert(1))" }]);
    assert.deepEqual(parseInline("<b>not html</b>"), [{ kind: "text", text: "<b>not html</b>" }]);
  });

  test("underscores inside words are not italics", () => {
    assert.deepEqual(parseInline("file_name_here"), [{ kind: "text", text: "file_name_here" }]);
  });

  test("bulleted and numbered lists become list blocks around paragraphs", () => {
    const blocks = parseRichText("Agenda:\n- Intro\n- **Pricing**\n\n1. First\n2. Second\nClosing line");
    assert.equal(blocks.length, 4);
    assert.deepEqual(blocks[0], { kind: "paragraph", children: [{ kind: "text", text: "Agenda:" }] });
    assert.equal(blocks[1].kind, "list");
    assert.equal(blocks[1].ordered, false);
    assert.equal(blocks[1].items.length, 2);
    assert.deepEqual(blocks[1].items[1], [{ kind: "bold", children: [{ kind: "text", text: "Pricing" }] }]);
    assert.equal(blocks[2].kind, "list");
    assert.equal(blocks[2].ordered, true);
    assert.deepEqual(blocks[3], { kind: "paragraph", children: [{ kind: "text", text: "Closing line" }] });
  });

  test("plain text keeps the words and drops the markup", () => {
    assert.equal(richTextToPlain("**Bold** and _soft_\n- a\n- [b](https://b.example)"), "Bold and soft\n\n- a\n- b (https://b.example)");
  });
});
