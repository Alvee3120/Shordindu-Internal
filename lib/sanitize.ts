import sanitizeHtml, { Attributes, Tag } from "sanitize-html";

/**
 * Server-side sanitizer for all rich text (updates, comments, assignments).
 * Text only: images, media, iframes, scripts and file data are discarded.
 */

const ALLOWED_TAGS = ["p", "br", "strong", "em", "ul", "ol", "li", "a", "span"];

const NON_TEXT_TAGS = ["script", "style", "textarea", "option"];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity.startsWith("#")) {
      const isHex = entity[1]?.toLowerCase() === "x";
      const code = parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

/**
 * Cleans rich text for storage and rendering.
 * Only p, br, strong, em, ul, ol, li, a (http/https/mailto) and a safe
 * `span[data-mention]` are kept. Everything else is stripped.
 */
export function sanitizeRichText(dirtyHtml: string): string {
  return sanitizeHtml(dirtyHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ["href", "target", "rel"],
      span: ["data-mention", "class"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    disallowedTagsMode: "discard",
    transformTags: {
      a: (_tagName: string, attribs: Attributes): Tag => {
        const href = attribs.href ?? "";
        const out: Attributes = /^(https?:|mailto:)/i.test(href)
          ? { href, target: "_blank", rel: "noopener noreferrer" }
          : {};
        return { tagName: "a", attribs: out };
      },
      span: (_tagName: string, attribs: Attributes): Tag => {
        const mentionUserId = attribs["data-mention"];
        const out: Attributes = mentionUserId
          ? { "data-mention": mentionUserId, class: "mention" }
          : {};
        return { tagName: "span", attribs: out };
      },
    },
  });
}

/**
 * Converts rich text to plain text for PostgreSQL full-text search.
 * Script and style content is removed entirely, not just its tags.
 */
export function extractPlainText(html: string): string {
  const withoutNonTextContent = html.replace(
    new RegExp(`<(${NON_TEXT_TAGS.join("|")})\\b[\\s\\S]*?</\\1>`, "gi"),
    " "
  );

  const withoutTags = withoutNonTextContent
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/li|\/ul|\/ol|\/div)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "");

  return decodeHtmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

/**
 * Cleans plain-text comments. Comments are not rich text, so any markup a
 * client sends is treated as literal characters and stripped of control
 * codes; the UI escapes it on render.
 */
export function sanitizeCommentText(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .replace(/\r\n?/g, "\n")
      .trim()
      .slice(0, 20_000)
  );
}
