/**
 * Server-side Rich Text Sanitizer.
 * Only safe HTML tags allowed: p, br, strong, em, ul, ol, li, a, span[data-mention].
 * Strips all scripts, images, videos, iframes, files.
 * Fully implemented and tested in Module 1.
 */

export function sanitizeRichText(dirtyHtml: string): string {
  // Skeleton placeholder for Module 0.
  // Full sanitize-html implementation in Module 1.
  return dirtyHtml;
}

export function extractPlainText(html: string): string {
  // Extracts plain text for PostgreSQL full-text search indexing.
  return html.replace(/<[^>]*>?/gm, "").trim();
}
