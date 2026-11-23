import { z, type ZodError } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254, "Email is too long");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters")
  .max(200, "Password is too long");

export const otpCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "Enter the 6-digit code from your email");

export const requestRegisterSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(100),
  department: z.string().trim().min(1, "Select a department").max(100),
  position: z.string().trim().min(2, "Enter your position").max(100),
  email: emailSchema,
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});

export const verifyOtpSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
});

export const requestPasswordResetSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  password: passwordSchema,
});

export const userRoleSchema = z.enum(["Admin", "HR", "Manager", "Employee"]);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name").max(100),
  email: emailSchema,
  department: z.string().trim().min(1, "Select a department").max(100),
  position: z.string().trim().min(2, "Enter the position").max(100),
  role: userRoleSchema,
});

export const approveUserSchema = z.object({
  role: userRoleSchema,
  department: z.string().trim().min(1, "Select a department").max(100),
  position: z.string().trim().min(2, "Enter the position").max(100),
});

export const updateUserSchema = z
  .object({
    role: userRoleSchema.optional(),
    department: z.string().trim().min(1).max(100).optional(),
    status: z.enum(["Active", "Disabled"]).optional(),
  })
  .refine(
    (value) =>
      value.role !== undefined ||
      value.department !== undefined ||
      value.status !== undefined,
    { message: "Nothing to update" }
  );

export type RequestRegisterInput = z.infer<typeof requestRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type ApproveUserInput = z.infer<typeof approveUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const updateDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date")
  .refine(
    (value) => !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime()),
    "Choose a valid date"
  );

export const createUpdateSchema = z.object({
  updateDate: updateDateSchema,
  contentHtml: z
    .string()
    .min(1, "Write something before saving")
    .max(50_000, "This update is too long"),
});

export const editUpdateSchema = z.object({
  contentHtml: z
    .string()
    .min(1, "Write something before saving")
    .max(50_000, "This update is too long"),
});

export type CreateUpdateInput = z.infer<typeof createUpdateSchema>;
export type EditUpdateInput = z.infer<typeof editUpdateSchema>;

export const feedQuerySchema = z
  .object({
    from: updateDateSchema.optional(),
    to: updateDateSchema.optional(),
    userId: z.string().uuid("Choose a valid person").optional(),
    department: z.string().trim().max(100).optional(),
    q: z.string().trim().max(200).optional(),
    cursor: z.string().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(30).optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "The start date must be before the end date.",
    path: ["from"],
  });

export type FeedQueryInput = z.infer<typeof feedQuerySchema>;

export const targetTypeSchema = z.enum(["update", "comment", "assignment"]);

export const commentTargetTypeSchema = z.enum(["update", "assignment"]);

export const commentTargetSchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.string().uuid("Choose a valid item"),
});

export const createCommentSchema = commentTargetSchema.extend({
  content: z
    .string()
    .trim()
    .min(1, "Write something before saving")
    .max(20_000, "This comment is too long"),
});

export const editCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write something before saving")
    .max(20_000, "This comment is too long"),
});

export const reactionSchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid("Choose a valid item"),
  kind: z.enum(["like", "dislike"]),
});

export const reactionQuerySchema = z.object({
  targetType: targetTypeSchema,
  targetId: z.string().uuid("Choose a valid item"),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type EditCommentInput = z.infer<typeof editCommentSchema>;
export type ReactionInput = z.infer<typeof reactionSchema>;

export const sendChatMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Write a message before sending")
    .max(5_000, "Keep messages under 5000 characters"),
  replyToId: z.string().uuid().optional(),
});

export const chatMessageListQuerySchema = z.object({
  before: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** Poll cursor: everything that changed after this (updatedAt, id) pair. */
export const chatChangesQuerySchema = z.object({
  since: z.string().datetime(),
  sinceId: z.string().uuid(),
});

export type SendChatMessageInput = z.infer<typeof sendChatMessageSchema>;
export type ChatMessageListQuery = z.infer<typeof chatMessageListQuerySchema>;
export type ChatChangesQuery = z.infer<typeof chatChangesQuerySchema>;

export const assignmentPrioritySchema = z.enum(["normal", "urgent"]);

export const assigneeStatusSchema = z.enum(["pending", "in_progress", "done"]);

export const createAssignmentSchema = z
  .object({
    contentHtml: z
      .string()
      .min(1, "Write the instruction")
      .max(20_000, "This assignment is too long"),
    assigneeIds: z.array(z.string().uuid()).max(100).optional(),
    department: z.string().trim().max(100).optional(),
    dueDate: updateDateSchema.nullable().optional(),
    priority: assignmentPrioritySchema.optional(),
  })
  .refine(
    (value) =>
      (value.assigneeIds && value.assigneeIds.length > 0) ||
      Boolean(value.department),
    {
      message: "Choose at least one assignee or a department",
      path: ["assigneeIds"],
    }
  );

export const updateAssignmentSchema = z
  .object({
    contentHtml: z
      .string()
      .min(1, "Write the instruction")
      .max(20_000, "This assignment is too long")
      .optional(),
    dueDate: updateDateSchema.nullable().optional(),
    priority: assignmentPrioritySchema.optional(),
    addAssigneeIds: z.array(z.string().uuid()).max(100).optional(),
    removeAssigneeIds: z.array(z.string().uuid()).max(100).optional(),
  })
  .refine(
    (value) =>
      value.contentHtml !== undefined ||
      value.dueDate !== undefined ||
      value.priority !== undefined ||
      (value.addAssigneeIds && value.addAssigneeIds.length > 0) ||
      (value.removeAssigneeIds && value.removeAssigneeIds.length > 0),
    { message: "Nothing to update" }
  );

export const updateAssigneeStatusSchema = z.object({
  status: assigneeStatusSchema,
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .optional(),
});

export const assignmentListQuerySchema = z.object({
  view: z.enum(["to_me", "by_me", "all"]).optional(),
  personId: z.string().uuid().optional(),
  department: z.string().trim().max(100).optional(),
  status: z.enum(["open", "completed", "cancelled"]).optional(),
  dueFrom: updateDateSchema.optional(),
  dueTo: updateDateSchema.optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type UpdateAssigneeStatusInput = z.infer<
  typeof updateAssigneeStatusSchema
>;
export type AssignmentListQuery = z.infer<typeof assignmentListQuerySchema>;

export const leaveSchema = z
  .object({
    userId: z.string().uuid().optional(),
    fromDate: updateDateSchema,
    toDate: updateDateSchema,
    reason: z
      .string()
      .trim()
      .min(3, "Explain the reason for the leave")
      .max(1_000, "Keep the reason under 1000 characters"),
  })
  .refine((value) => value.fromDate <= value.toDate, {
    message: "The end date must be on or after the start date.",
    path: ["toDate"],
  });

export const leaveDecisionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export const holidaySchema = z.object({
  date: updateDateSchema,
  name: z.string().trim().min(2, "Enter a holiday name").max(100),
});

export const profileNameSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your full name")
    .max(100, "Keep your name under 100 characters"),
});

export const calendarEventSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a title")
    .max(160, "Keep the title under 160 characters"),
  // An empty notes box is sent as null, so accept null as well as a missing key.
  notes: z
    .string()
    .trim()
    .max(2_000, "Keep notes under 2000 characters")
    .nullable()
    .optional(),
  date: updateDateSchema,
});

export const updateCalendarEventSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a title")
      .max(160, "Keep the title under 160 characters")
      .optional(),
    notes: z
      .string()
      .trim()
      .max(2_000, "Keep notes under 2000 characters")
      .nullable()
      .optional(),
    date: updateDateSchema.optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.notes !== undefined ||
      value.date !== undefined,
    { message: "Nothing to update" }
  );

export const calendarRangeSchema = z
  .object({
    from: updateDateSchema,
    to: updateDateSchema,
  })
  .refine((value) => value.from <= value.to, {
    message: "The range start must be on or before the end.",
    path: ["to"],
  });

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
export type UpdateCalendarEventInput = z.infer<
  typeof updateCalendarEventSchema
>;

export const updateHolidaySchema = z
  .object({
    date: updateDateSchema.optional(),
    name: z.string().trim().min(2, "Enter a holiday name").max(100).optional(),
  })
  .refine((value) => value.date !== undefined || value.name !== undefined, {
    message: "Nothing to update",
  });

export const weekendSchema = z.object({
  days: z
    .array(z.number().int().min(1).max(7))
    .max(7, "Choose at most seven days")
    .refine((days) => new Set(days).size === days.length, {
      message: "Choose each day once",
    }),
});

export type LeaveInput = z.infer<typeof leaveSchema>;
export type HolidayInput = z.infer<typeof holidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type WeekendInput = z.infer<typeof weekendSchema>;

export const announcementSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Enter a title")
    .max(160, "Keep the title under 160 characters"),
  contentHtml: z
    .string()
    .min(1, "Write the announcement")
    .max(20_000, "This announcement is too long"),
  // Off by default: one announcement for a large team can consume a whole
  // day's email allowance, so emailing is a deliberate choice.
  sendEmail: z.boolean().optional().default(false),
});

export const updateAnnouncementSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a title")
      .max(160, "Keep the title under 160 characters")
      .optional(),
    contentHtml: z
      .string()
      .min(1, "Write the announcement")
      .max(20_000, "This announcement is too long")
      .optional(),
  })
  .refine(
    (value) => value.title !== undefined || value.contentHtml !== undefined,
    { message: "Nothing to update" }
  );

export type AnnouncementInput = z.infer<typeof announcementSchema>;
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

export const departmentsSettingSchema = z.object({
  departments: z
    .array(z.string().trim().min(1, "Enter a department name").max(100))
    .min(1, "Keep at least one department")
    .max(50, "Too many departments")
    .refine(
      (departments) =>
        new Set(departments.map((name) => name.toLowerCase())).size ===
        departments.length,
      { message: "Department names must be unique" }
    ),
});

export const reminderTimeSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24-hour)"),
});

/** Flattens a Zod error into `{ field: firstMessage }` for form display. */
export function formatFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }
  return fieldErrors;
}
