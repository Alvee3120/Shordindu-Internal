type AlertSource = "notifications" | "chat";

interface AlertPayload {
  title: string;
  body: string;
  link?: string;
  tag?: string;
}

/**
 * Drives the three "you have new mail" signals a tab can show:
 * - a red unread count drawn onto the favicon
 * - an "(N)" prefix on the document title
 * - a native browser notification (when the user granted permission)
 *
 * Counts are pushed in by the existing pollers (notification bell and chat
 * FAB), so this module never polls on its own.
 */
const counts: Record<AlertSource, number> = { notifications: 0, chat: 0 };
const previous: Record<AlertSource, number | null> = {
  notifications: null,
  chat: null,
};

let started = false;
let baseTitle = "Shordindu";
let baseIconHref: string | null = null;
let baseIcon: HTMLImageElement | null = null;
let iconLoading: Promise<HTMLImageElement | null> | null = null;
let renderToken = 0;

const DEFAULT_ICON = "/favicon.svg";

function totalUnread(): number {
  return counts.notifications + counts.chat;
}

function findIconLink(): HTMLLinkElement {
  const existing =
    document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  if (existing) return existing;

  const link = document.createElement("link");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function loadBaseIcon(): Promise<HTMLImageElement | null> {
  if (baseIcon) return Promise.resolve(baseIcon);
  if (!iconLoading) {
    iconLoading = (async () => {
      const image = await loadImage(baseIconHref || DEFAULT_ICON);
      if (image) {
        baseIcon = image;
        return image;
      }
      // Fall back to the logo if the favicon cannot be decoded.
      const fallback = await loadImage("/logo.png");
      if (fallback) baseIcon = fallback;
      return fallback;
    })();
  }
  return iconLoading;
}

async function renderIcon(): Promise<void> {
  const link = findIconLink();
  const total = totalUnread();

  if (total <= 0) {
    link.href = baseIconHref || DEFAULT_ICON;
    return;
  }

  const token = ++renderToken;
  const image = await loadBaseIcon();
  // A newer count landed while the icon was loading; that render wins.
  if (token !== renderToken) return;

  const size = 64;
  const dotRadius = 11;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");
  if (!context) return;

  if (image) {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const isVector =
      (baseIconHref || "").toLowerCase().endsWith(".svg") ||
      width === 0 ||
      height === 0;

    if (isVector) {
      // Our favicon is a square viewBox, so fill the square without stretching.
      context.drawImage(image, 0, 0, size, size);
    } else {
      const scale = Math.max(size / width, size / height);
      const drawWidth = width * scale;
      const drawHeight = height * scale;
      context.drawImage(
        image,
        (size - drawWidth) / 2,
        (size - drawHeight) / 2,
        drawWidth,
        drawHeight
      );
    }
  }

  // A plain red dot marks unread activity; the exact count lives in the title.
  context.beginPath();
  context.arc(size - dotRadius, dotRadius, dotRadius, 0, Math.PI * 2);
  context.fillStyle = "#dc2626";
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();

  link.href = canvas.toDataURL("image/png");
}

function renderTitle(): void {
  const total = totalUnread();
  document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
}

function canNotify(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function showBrowserNotification(payload: AlertPayload): void {
  if (!canNotify() || Notification.permission !== "granted") return;

  try {
    const notification = new Notification(payload.title, {
      body: payload.body,
      icon: "/logo.png",
      tag: payload.tag,
    });
    notification.onclick = () => {
      window.focus();
      if (payload.link) window.location.assign(payload.link);
      notification.close();
    };
  } catch {
    // Some browsers throw when notifications are disabled at the OS level.
  }
}

/** Called by each poller with its latest unread count. */
export function setAlertCount(
  source: AlertSource,
  count: number,
  payload?: AlertPayload
): void {
  if (typeof window === "undefined") return;

  const next = Math.max(0, Math.floor(count));
  const before = previous[source];
  counts[source] = next;
  previous[source] = next;

  // Notify only on an increase after the first load, and never for chat
  // messages while the user is already looking at the room.
  const onChatPage =
    source === "chat" && window.location.pathname.startsWith("/chat");
  if (before !== null && next > before && payload && !onChatPage) {
    showBrowserNotification(payload);
  }

  renderTitle();
  void renderIcon();
}

/** Captures the base title/icon and asks for notification permission on first use. */
export function initBrowserAlerts(): void {
  if (typeof window === "undefined" || started) return;
  started = true;

  baseTitle = document.title.replace(/^\(\d+\)\s*/, "") || "Shordindu";
  const existing =
    document.head.querySelector<HTMLLinkElement>('link[rel~="icon"]');
  baseIconHref = existing?.getAttribute("href") ?? DEFAULT_ICON;
  findIconLink().href = baseIconHref;
  renderTitle();

  // Browsers require a user gesture before showing the permission prompt.
  const askPermission = () => {
    if (canNotify() && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };
  window.addEventListener("pointerdown", askPermission, { once: true });
  window.addEventListener("keydown", askPermission, { once: true });
}
