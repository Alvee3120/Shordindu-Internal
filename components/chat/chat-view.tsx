"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, Loader2, MessageSquare, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentInput } from "@/components/interactions/comment-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { callApi, callApiJson, fetchJson } from "@/components/api-client";
import { useToast } from "@/components/ui/toast";
import { formatDhakaDate, toDhakaDate } from "@/lib/time";
import { stripMentionTokens } from "@/lib/mentions";
import type { ChatMessageDto } from "@/components/chat/types";

const POLL_INTERVAL_MS = 5_000;

interface Viewer {
  id: string;
  name: string;
  position: string;
  department: string;
}

interface SyncCursor {
  updatedAt: string;
  id: string;
}

interface ChatDelta {
  messages: ChatMessageDto[];
  deletedIds: string[];
  syncCursor: SyncCursor;
}

function dateSeparatorLabel(dateString: string): string {
  const today = toDhakaDate(new Date());
  if (dateString === today) return "Today";
  return formatDhakaDate(`${dateString}T00:00:00.000Z`);
}

export function ChatView({ viewer }: { viewer: Viewer }) {
  const toast = useToast();
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessageDto | null>(null);
  const [sending, setSending] = useState(false);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Position in the change stream; the poller resumes from here.
  const cursorRef = useRef<SyncCursor | null>(null);
  // Mirrors `messages` so the poller can compare against what is on screen.
  const messagesRef = useRef<ChatMessageDto[]>([]);
  messagesRef.current = messages;
  // Set when a new message arrives; the effect below scrolls once it is painted.
  const stickToBottomRef = useRef<"instant" | "smooth" | null>(null);

  function isNearBottom(): boolean {
    const node = scrollRef.current;
    if (!node) return true;
    return node.scrollHeight - node.scrollTop - node.clientHeight < 120;
  }

  function scrollToBottom(smooth = false) {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({
      top: node.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  /**
   * Scrolls after the new message is actually in the DOM. Doing it inside the
   * poll handler was too early: React has not painted the row yet, so the
   * scroll landed above the newest message.
   */
  useEffect(() => {
    const mode = stickToBottomRef.current;
    if (!mode) return;
    stickToBottomRef.current = null;
    scrollToBottom(mode === "smooth");
  }, [messages]);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{
      messages: ChatMessageDto[];
      nextCursor: string | null;
      syncCursor: SyncCursor | null;
    }>("/api/chat");
    setLoading(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load the chat.");
      return;
    }

    setError(null);
    setMessages(result.data.messages);
    setNextCursor(result.data.nextCursor);
    cursorRef.current = result.data.syncCursor;
    // Opening the room clears the unread badge.
    void fetch("/api/chat/unread", { method: "POST" });
    // Land on the newest message without animating.
    stickToBottomRef.current = "instant";
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Pulls every change since the last cursor: new messages, edits and
   * deletions. This is what keeps other people's edits and deletes visible
   * without a reload.
   */
  const poll = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor) {
      void load();
      return;
    }

    const params = new URLSearchParams({
      since: cursor.updatedAt,
      sinceId: cursor.id,
    });
    const result = await fetchJson<ChatDelta>(`/api/chat/changes?${params}`);
    if (!result.ok || !result.data) return;

    const { messages: changed, deletedIds, syncCursor } = result.data;
    if (changed.length === 0 && deletedIds.length === 0) return;

    const shouldStick = isNearBottom();

    // Work out what is genuinely new here, outside the state updater, so the
    // scroll decision is correct. React may call the updater later (or twice in
    // StrictMode), so reading a flag from inside it is unreliable.
    const removed = new Set(deletedIds);
    const known = new Set(messagesRef.current.map((message) => message.id));
    const previousNewest =
      messagesRef.current[messagesRef.current.length - 1]?.createdAt;
    const fresh = changed
      .filter(
        (message) =>
          !removed.has(message.id) &&
          !known.has(message.id) &&
          (!previousNewest || message.createdAt > previousNewest)
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

    setMessages((previous) => {
      const byId = new Map(changed.map((message) => [message.id, message]));

      // Apply edits in place and drop deletions.
      const updated = previous
        .filter((message) => !removed.has(message.id))
        .map((message) => byId.get(message.id) ?? message);

      // Only append genuinely new messages. An edit to an older message the
      // reader has not paged in yet must not jump to the bottom.
      const present = new Set(updated.map((message) => message.id));
      const toAppend = fresh.filter((message) => !present.has(message.id));

      return toAppend.length > 0 ? [...updated, ...toAppend] : updated;
    });

    cursorRef.current = syncCursor;

    // A new message should always bring the room to the bottom, unless the
    // reader has deliberately scrolled up to read history.
    if (fresh.length > 0 && shouldStick) {
      stickToBottomRef.current = "smooth";
    }
    // Still in the room, so keep the read marker moving forward.
    void fetch("/api/chat/unread", { method: "POST" });
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [poll]);

  async function loadOlder() {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);

    const node = scrollRef.current;
    const previousHeight = node?.scrollHeight ?? 0;

    const result = await fetchJson<{
      messages: ChatMessageDto[];
      nextCursor: string | null;
      syncCursor: SyncCursor | null;
    }>(`/api/chat?before=${nextCursor}`);
    setLoadingOlder(false);

    if (!result.ok || !result.data) {
      setError(result.error ?? "Could not load older messages.");
      return;
    }

    setMessages((previous) => [...result.data!.messages, ...previous]);
    setNextCursor(result.data.nextCursor);
    // Older pages do not move the sync position, but keep it if it was unset.
    cursorRef.current ??= result.data.syncCursor;

    // Keep the reading position steady after prepending.
    requestAnimationFrame(() => {
      if (!node) return;
      node.scrollTop = node.scrollHeight - previousHeight;
    });
  }

  async function submitMessage() {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    const result = await callApiJson<{ message: ChatMessageDto }>(
      "/api/chat",
      "POST",
      { content, ...(replyTo ? { replyToId: replyTo.id } : {}) }
    );
    setSending(false);

    if (!result.ok || !result.data) {
      toast.show(result.error ?? "Could not send the message.", "error");
      return;
    }

    setDraft("");
    setReplyTo(null);
    setMessages((previous) => {
      if (previous.some((item) => item.id === result.data!.message.id)) {
        return previous;
      }
      return [...previous, result.data!.message];
    });
    // Your own message always brings you to the bottom.
    stickToBottomRef.current = "smooth";
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMessage();
  }

  async function editMessage(
    id: string,
    content: string
  ): Promise<string | null> {
    const result = await callApiJson<{ message: ChatMessageDto }>(
      `/api/chat/${id}`,
      "PATCH",
      { content }
    );
    if (!result.ok || !result.data) {
      return result.error ?? "Could not save the message.";
    }

    setMessages((previous) =>
      previous.map((item) => (item.id === id ? result.data!.message : item))
    );
    return null;
  }

  async function deleteMessage(id: string): Promise<string | null> {
    const result = await callApi("/api/chat/" + id, "DELETE");
    if (!result.ok) return result.error ?? "Could not delete the message.";

    setMessages((previous) => previous.filter((item) => item.id !== id));
    return null;
  }

  function handleScroll() {
    setAtBottom(isNearBottom());
    const node = scrollRef.current;
    if (node && node.scrollTop < 80) void loadOlder();
  }

  let lastDate = "";

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Group chat</h1>
        <p className="text-sm text-muted-foreground">
          One shared room for everyone. Type @ to mention someone.
        </p>
      </header>

      {error ? (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <div className="relative rounded-xl border border-border bg-card">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex h-[calc(100vh-19rem)] min-h-[18rem] flex-col gap-1 overflow-y-auto p-3"
        >
          {loading ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading messages
            </div>
          ) : (
            <>
              {loadingOlder ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Loading older messages...
                </p>
              ) : null}

              {!nextCursor && messages.length > 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  This is the start of the conversation.
                </p>
              ) : null}

              {messages.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                  <MessageSquare className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">No messages yet</p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Say hello to the team to start the conversation.
                  </p>
                </div>
              ) : null}

              {messages.map((message) => {
                const day = toDhakaDate(message.createdAt);
                const showSeparator = day !== lastDate;
                lastDate = day;

                return (
                  <div key={message.id}>
                    {showSeparator ? (
                      <div className="my-3 flex items-center gap-3">
                        <span className="h-px flex-1 bg-border" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {dateSeparatorLabel(day)}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    ) : null}

                    <ChatMessage
                      message={message}
                      isMine={message.author.id === viewer.id}
                      onEdit={editMessage}
                      onDelete={deleteMessage}
                      onReply={setReplyTo}
                    />
                  </div>
                );
              })}
            </>
          )}
        </div>

        {!atBottom && !loading ? (
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-24 right-4 rounded-full shadow-md"
            onClick={() => scrollToBottom(true)}
            aria-label="Jump to the latest messages"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        ) : null}

        <form onSubmit={send} className="space-y-2 border-t border-border p-3">
          {replyTo ? (
            <div className="flex items-start justify-between gap-2 rounded-md border-l-2 border-primary bg-secondary px-2 py-1.5 text-xs">
              <div className="min-w-0">
                <p className="font-medium">Replying to {replyTo.author.name}</p>
                <p className="line-clamp-2 break-words text-muted-foreground">
                  {stripMentionTokens(replyTo.content)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                aria-label="Cancel reply"
                className="shrink-0 rounded p-0.5 text-muted-foreground transition hover:bg-background hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <CommentInput
                value={draft}
                onChange={setDraft}
                onSubmit={() => void submitMessage()}
                placeholder="Write a message, type @ to mention someone"
                rows={2}
                disabled={sending}
              />
            </div>
            <Button type="submit" disabled={sending || !draft.trim()}>
              <Send className="mr-1.5 h-4 w-4" />
              {sending ? "Sending" : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
