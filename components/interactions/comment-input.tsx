"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  loadMentionUsers,
  type MentionUser,
} from "@/components/editor/mention-suggestion";
import { cn } from "@/lib/utils";

/**
 * Plain-text comment box with an @mention picker. A chosen person is inserted
 * as `@[Name](id)`, which the server reads to store mentions and notify them;
 * the UI renders it back as a highlighted name.
 */
export function CommentInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Write a comment, type @ to mention someone",
  disabled = false,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  /** When set, Enter sends (Shift+Enter still inserts a newline). */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [users, setUsers] = useState<MentionUser[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    void loadMentionUsers().then(setUsers);
  }, []);

  const matches = useMemo(() => {
    if (query === null) return [];
    const search = query.toLowerCase();
    return users
      .filter((user) => user.name.toLowerCase().includes(search))
      .slice(0, 6);
  }, [query, users]);

  /** Finds the `@word` immediately before the caret. */
  function readQuery(
    text: string,
    caret: number
  ): { query: string; start: number } | null {
    const upToCaret = text.slice(0, caret);
    const at = upToCaret.lastIndexOf("@");
    if (at === -1) return null;

    const typed = upToCaret.slice(at + 1);
    if (typed.includes("\n") || typed.length > 30) return null;

    return { query: typed.trimStart(), start: at };
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = event.target.value;
    onChange(next);

    const found = readQuery(next, event.target.selectionStart ?? next.length);
    if (found) {
      setQuery(found.query);
      setHighlighted(0);
    } else {
      setQuery(null);
    }
  }

  function insert(user: MentionUser) {
    const node = textareaRef.current;
    const caret = node?.selectionStart ?? value.length;
    const found = readQuery(node?.value ?? value, caret);
    if (!found) return;

    const current = node?.value ?? value;
    const before = current.slice(0, found.start);
    const after = current.slice(caret);
    const mention = `@${user.name} `;
    const next = `${before}${mention}${after}`;

    onChange(next);
    setQuery(null);

    const caretAfter = before.length + mention.length;
    requestAnimationFrame(() => {
      node?.focus();
      node?.setSelectionRange(caretAfter, caretAfter);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const pickerOpen = query !== null && matches.length > 0;

    if (pickerOpen) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setHighlighted((index) => (index + 1) % matches.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setHighlighted(
          (index) => (index - 1 + matches.length) % matches.length
        );
      } else if (event.key === "Enter" || event.key === "Tab") {
        const user = matches[highlighted];
        if (!user) return;
        event.preventDefault();
        insert(user);
      } else if (event.key === "Escape") {
        event.preventDefault();
        setQuery(null);
      }
      return;
    }

    // Enter sends; Shift+Enter keeps the newline. isComposing protects IME
    // input, where Enter confirms the candidate instead of submitting.
    if (
      onSubmit &&
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      onSubmit();
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setQuery(null)}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
        className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        style={{ fontSize: "16px" }}
      />

      {query !== null && matches.length > 0 ? (
        <ul
          role="listbox"
          aria-label="Mention someone"
          className="absolute bottom-full left-0 z-50 mb-1 w-72 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
        >
          {matches.map((user, index) => (
            <li key={user.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                onMouseDown={(event) => {
                  event.preventDefault();
                  insert(user);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm",
                  index === highlighted ? "bg-secondary" : "hover:bg-muted"
                )}
              >
                <span className="font-medium">{user.name}</span>
                <span className="text-xs text-muted-foreground">
                  {user.department}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {query !== null && matches.length === 0 ? (
        <p className="absolute bottom-full left-0 z-50 mb-1 w-72 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground shadow-lg">
          No matching people
        </p>
      ) : null}
    </div>
  );
}
