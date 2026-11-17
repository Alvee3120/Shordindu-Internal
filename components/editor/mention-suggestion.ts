import type {
  SuggestionKeyDownProps,
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import tippy, { type Instance } from "tippy.js";

export interface MentionUser {
  id: string;
  name: string;
  department: string;
}

let peoplePromise: Promise<MentionUser[]> | null = null;

/** Loads the mentionable people once per browser session. */
export function loadMentionUsers(): Promise<MentionUser[]> {
  peoplePromise ??= fetch("/api/people", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) return [];
      const data = (await response.json()) as { people?: MentionUser[] };
      return data.people ?? [];
    })
    .catch(() => []);

  return peoplePromise;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function createMentionSuggestion(
  getUsers: () => MentionUser[],
): Omit<SuggestionOptions<MentionUser>, "editor"> {
  return {
    char: "@",
    items: ({ query }) => {
      const search = query.toLowerCase();
      return getUsers()
        .filter((user) => user.name.toLowerCase().includes(search))
        .slice(0, 6);
    },
    render: () => {
      let element: HTMLDivElement | null = null;
      let popup: Instance | null = null;
      let selected = 0;
      let current: MentionUser[] = [];
      let choose: ((user: MentionUser) => void) | null = null;

      const paint = () => {
        if (!element) return;
        element.innerHTML = "";

        if (current.length === 0) {
          const empty = document.createElement("div");
          empty.className = "px-3 py-2 text-xs text-muted-foreground";
          empty.textContent = "No matching people";
          element.appendChild(empty);
          return;
        }

        current.forEach((user, index) => {
          const button = document.createElement("button");
          button.type = "button";
          button.className = `flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm ${
            index === selected
              ? "bg-slate-100 dark:bg-slate-800"
              : "hover:bg-slate-50 dark:hover:bg-slate-800/60"
          }`;
          button.innerHTML = `<span class="font-medium">${escapeHtml(
            user.name,
          )}</span><span class="text-xs text-muted-foreground">${escapeHtml(
            user.department,
          )}</span>`;
          button.addEventListener("mousedown", (event) => {
            event.preventDefault();
            choose?.(user);
          });
          element?.appendChild(button);
        });
      };

      const start = (props: SuggestionProps<MentionUser>) => {
        choose = (user) => props.command({ id: user.id, label: user.name });
        current = props.items;
        selected = 0;
        element = document.createElement("div");
        element.className =
          "z-50 w-64 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900";
        paint();

        if (!props.clientRect) return;
        popup = tippy(document.body, {
          getReferenceClientRect: props.clientRect as () => DOMRect,
          appendTo: () => document.body,
          content: element,
          showOnCreate: true,
          interactive: true,
          trigger: "manual",
          placement: "bottom-start",
          theme: "shordindu",
        });
      };

      const update = (props: SuggestionProps<MentionUser>) => {
        choose = (user) => props.command({ id: user.id, label: user.name });
        current = props.items;
        selected = 0;
        paint();
        if (props.clientRect) {
          popup?.setProps({
            getReferenceClientRect: props.clientRect as () => DOMRect,
          });
        }
      };

      const keyDown = (props: SuggestionKeyDownProps): boolean => {
        const { event } = props;

        if (current.length === 0) return false;

        if (event.key === "ArrowDown") {
          selected = (selected + 1) % current.length;
          paint();
          return true;
        }
        if (event.key === "ArrowUp") {
          selected = (selected - 1 + current.length) % current.length;
          paint();
          return true;
        }
        if (event.key === "Enter") {
          const user = current[selected];
          if (user) choose?.(user);
          return true;
        }
        if (event.key === "Escape") {
          popup?.destroy();
          element?.remove();
          element = null;
          popup = null;
          return true;
        }

        return false;
      };

      const exit = () => {
        popup?.destroy();
        element?.remove();
        element = null;
        popup = null;
      };

      return { onStart: start, onUpdate: update, onKeyDown: keyDown, onExit: exit };
    },
  };
}
