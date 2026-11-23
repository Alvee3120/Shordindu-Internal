import { describe, expect, it } from "vitest";
import {
  buildApprovalEmail,
  buildAssignmentDueEmail,
  buildRejectionEmail,
} from "@/lib/email";

describe("email templates", () => {
  it("escapes user-controlled names and roles", () => {
    const mail = buildApprovalEmail({
      to: "user@test.local",
      name: '<img src=x onerror="alert(1)">',
      role: "Employee",
    });

    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img");
  });

  it("escapes rejection names", () => {
    const mail = buildRejectionEmail({
      to: "user@test.local",
      name: "<script>alert(1)</script>",
    });

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });

  it("escapes assignment summaries", () => {
    const mail = buildAssignmentDueEmail({
      to: "user@test.local",
      name: "Tester",
      summary: '<a href="https://evil.test">click</a>',
      link: "http://localhost:3000/assignments",
    });

    expect(mail.html).not.toContain('href="https://evil.test"');
    expect(mail.html).toContain("&lt;a href=");
  });
});
