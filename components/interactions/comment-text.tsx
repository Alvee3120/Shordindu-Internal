import { stripMentionTokens } from "@/lib/mentions";

const TOKEN = /@\[([^\]]+)\]\(([0-9a-zA-Z-]+)\)/g;

/**
 * Renders plain comment text. A stored mention token is shown as a highlighted
 * `@Name`; everything else is literal text, so no markup a user types can run.
 */
export function CommentText({ content }: { content: string }) {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN.lastIndex = 0;

  while ((match = TOKEN.exec(content)) !== null) {
    const [full, name] = match;
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`${match.index}-${name}`} className="mention">
        @{name}
      </span>
    );
    lastIndex = match.index + full.length;
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {parts.length > 0 ? parts : stripMentionTokens(content)}
    </p>
  );
}
