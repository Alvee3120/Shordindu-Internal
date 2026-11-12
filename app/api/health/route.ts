import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { COMPANY_TIMEZONE, dhakaToday } from "@/lib/time";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();

  try {
    // Ping database with raw query to test active connection
    await prisma.$queryRaw`SELECT 1 as healthy`;
    const latencyMs = Date.now() - startTime;

    return NextResponse.json(
      {
        status: "ok",
        uptimeSeconds: Math.floor(process.uptime()),
        timestampUtc: new Date().toISOString(),
        companyTimezone: COMPANY_TIMEZONE,
        dhakaCurrentDate: dhakaToday(),
        database: {
          status: "connected",
          latencyMs,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    console.error("[HEALTH CHECK ERROR]", error);

    return NextResponse.json(
      {
        status: "error",
        uptimeSeconds: Math.floor(process.uptime()),
        timestampUtc: new Date().toISOString(),
        companyTimezone: COMPANY_TIMEZONE,
        database: {
          status: "disconnected",
          latencyMs,
          error:
            error instanceof Error
              ? error.message
              : "Database connection failed",
        },
      },
      { status: 503 }
    );
  }
}
