import { describe, expect, it } from "vitest";
import { extractPlainText, sanitizeRichText } from "@/lib/sanitize";

describe("sanitizeRichText", () => {
  it("keeps allowed text formatting", () => {
    const html =
      "<p>Hello <strong>world</strong> <em>now</em></p><ul><li>one</li><li>two</li></ul>";
    expect(sanitizeRichText(html)).toBe(html);
  });

  it("strips scripts, styles, images, iframes and media", () => {
    const dirty =
      '<p>Safe</p><script>alert(1)</script><img src="x" onerror="alert(1)"><iframe src="//evil"></iframe><video src="x"></video>';
    expect(sanitizeRichText(dirty)).toBe("<p>Safe</p>");
  });

  it("removes event handlers and unknown attributes", () => {
    expect(sanitizeRichText('<p onclick="steal()">Hi</p>')).toBe("<p>Hi</p>");
  });

  it("hardens external links", () => {
    expect(sanitizeRichText('<a href="https://example.com">ok</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">ok</a>',
    );
  });

  it("drops javascript: links but keeps the text", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">bad</a>')).toBe(
      "<a>bad</a>",
    );
  });

  it("keeps only safe mention spans", () => {
    expect(
      sanitizeRichText(
        '<span data-mention="u1" class="x" onclick="p()">@Rahim</span>',
      ),
    ).toBe('<span data-mention="u1" class="mention">@Rahim</span>');
  });
});

describe("extractPlainText", () => {
  it("extracts readable text from rich content", () => {
    expect(
      extractPlainText(
        "<p>Hello <strong>world</strong></p><ul><li>One</li><li>Two</li></ul>",
      ),
    ).toBe("Hello world One Two");
  });

  it("drops script and style content entirely", () => {
    expect(
      extractPlainText("<p>Hi</p><script>alert('x')</script><style>p{}</style>"),
    ).toBe("Hi");
  });

  it("decodes HTML entities", () => {
    expect(
      extractPlainText("<p>Tom &amp; Jerry &#39;quoted&#39; &#x2713;</p>"),
    ).toBe("Tom & Jerry 'quoted' ✓");
  });

  it("removes HTML comments and collapses whitespace", () => {
    expect(extractPlainText("<p>A</p><!-- note --><p>B</p>")).toBe("A B");
  });
});
