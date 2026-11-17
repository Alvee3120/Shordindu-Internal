"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import {
  createMentionSuggestion,
  loadMentionUsers,
  type MentionUser,
} from "@/components/editor/mention-suggestion";
import {
  Bold,
  Italic,
  Link2,
  Link2Off,
  List,
  ListOrdered,
  Redo2,
  Undo2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MentionNode = Mention.extend({
  parseHTML() {
    return [
      {
        tag: "span[data-mention]",
        getAttrs: (element) => {
          const el = element as HTMLElement;
          const id = el.getAttribute("data-mention");
          if (!id) return false;
          return {
            id,
            label: (el.textContent ?? "").replace(/^@/, ""),
          };
        },
      },
    ];
  },
  renderHTML({ node }) {
    return [
      "span",
      { "data-mention": node.attrs.id, class: "mention" },
      `@${node.attrs.label ?? ""}`,
    ];
  },
  renderText({ node }) {
    return `@${node.attrs.label ?? ""}`;
  },
});

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-accent-foreground disabled:opacity-40",
        active && "bg-accent text-accent-foreground",
      )}
    >
      {children}
    </button>
  );
}

function addLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Link URL", previous ?? "https://");
  if (url === null) return;

  if (url === "") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }

  editor
    .chain()
    .focus()
    .extendMarkRange("link")
    .setLink({ href: url })
    .run();
}

export function RichTextEditor({
  value,
  onChange,
  editable = true,
  placeholder = "Write your update...",
}: {
  value: string;
  onChange: (html: string) => void;
  editable?: boolean;
  placeholder?: string;
}) {
  const mentionUsers = useRef<MentionUser[]>([]);
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      MentionNode.configure({
        suggestion: createMentionSuggestion(() => mentionUsers.current),
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: "tiptap",
        "aria-label": placeholder,
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
  });

  useEffect(() => {
    void loadMentionUsers().then((users) => {
      mentionUsers.current = users;
    });
  }, []);

  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-background focus-within:ring-2 focus-within:ring-ring",
        !editable && "opacity-80",
      )}
    >
      {editable && editor ? (
        <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 p-1.5 dark:border-slate-800">
          <ToolbarButton
            label="Bold"
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Italic"
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Bullet list"
            active={editor.isActive("bulletList")}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Numbered list"
            active={editor.isActive("orderedList")}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Add or edit link"
            active={editor.isActive("link")}
            onClick={() => addLink(editor)}
          >
            <Link2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Remove link"
            disabled={!editor.isActive("link")}
            onClick={() =>
              editor.chain().focus().extendMarkRange("link").unsetLink().run()
            }
          >
            <Link2Off className="h-4 w-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
          <ToolbarButton
            label="Undo"
            disabled={!editor.can().undo()}
            onClick={() => editor.chain().focus().undo().run()}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            label="Redo"
            disabled={!editor.can().redo()}
            onClick={() => editor.chain().focus().redo().run()}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>
        </div>
      ) : null}

      <EditorContent editor={editor} />
    </div>
  );
}
