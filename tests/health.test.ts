import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("Health Check API Route", () => {
  it("returns status ok and database connected", async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.companyTimezone).toBe("Asia/Dhaka");
    expect(data.database.status).toBe("connected");
    expect(typeof data.database.latencyMs).toBe("number");
  });
});
