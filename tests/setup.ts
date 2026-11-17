import { loadEnvConfig } from "@next/env";

// Tests use the same .env values as the app (DATABASE_URL, SESSION_SECRET).
loadEnvConfig(process.cwd());
