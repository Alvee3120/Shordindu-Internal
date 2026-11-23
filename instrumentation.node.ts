/**
 * Starts the pg-boss workers and cron schedules as soon as the Node server
 * boots. Without this the queue only starts on the first email, so a freshly
 * deployed instance would miss its scheduled reminders and digests until then.
 */
async function startQueue() {
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") return;

  const { getBoss } = await import("@/lib/queue");
  try {
    await getBoss();
  } catch (error) {
    // Keep serving requests even if the queue cannot start.
    console.error("[queue] Could not start background workers", error);
  }
}

void startQueue();

export {};
