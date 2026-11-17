import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  getDepartments,
  getReminderTime,
  setDepartments,
  setReminderTime,
} from "@/lib/settings";
import {
  departmentsSettingSchema,
  reminderTimeSchema,
} from "@/lib/validators";

let originalDepartments: string[] = [];
let originalReminderTime = "19:00";

beforeAll(async () => {
  originalDepartments = await getDepartments();
  originalReminderTime = await getReminderTime();
});

afterAll(async () => {
  await setDepartments(originalDepartments);
  await setReminderTime(originalReminderTime);
});

describe("admin settings", () => {
  it("stores departments and reads them back", async () => {
    await setDepartments(["Ops", "IT"]);
    expect(await getDepartments()).toEqual(["Ops", "IT"]);

    await setDepartments(originalDepartments);
    expect(await getDepartments()).toEqual(originalDepartments);
  });

  it("stores the reminder time and reads it back", async () => {
    await setReminderTime("18:30");
    expect(await getReminderTime()).toBe("18:30");

    await setReminderTime(originalReminderTime);
    expect(await getReminderTime()).toBe(originalReminderTime);
  });

  it("validates departments and reminder times", () => {
    expect(
      departmentsSettingSchema.safeParse({ departments: ["IT", "it"] }).success,
    ).toBe(false);
    expect(
      departmentsSettingSchema.safeParse({ departments: [] }).success,
    ).toBe(false);
    expect(
      departmentsSettingSchema.safeParse({ departments: ["IT", "HR"] }).success,
    ).toBe(true);

    expect(reminderTimeSchema.safeParse({ time: "19:00" }).success).toBe(true);
    expect(reminderTimeSchema.safeParse({ time: "7 PM" }).success).toBe(false);
    expect(reminderTimeSchema.safeParse({ time: "24:00" }).success).toBe(false);
  });
});
