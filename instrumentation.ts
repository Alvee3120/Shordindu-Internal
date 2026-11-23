export async function register() {
  // NEXT_RUNTIME is inlined at build time, so the edge bundle drops this import.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
