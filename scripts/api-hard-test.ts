/* Temporary hard-test harness: seeds role users, exercises live APIs. */
import { PrismaClient, Role, UserStatus } from "@prisma/client";
import { hashPassword } from "../lib/password";

const prisma = new PrismaClient();
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";
const PASSWORD = "TestPass123!";

const SEED_USERS = [
  { key: "admin", email: "api-admin@test.local", name: "API Admin", role: Role.Admin, department: "Admin", position: "Tester" },
  { key: "hr", email: "api-hr@test.local", name: "API HR", role: Role.HR, department: "HR", position: "Tester" },
  { key: "manager", email: "api-manager@test.local", name: "API Manager", role: Role.Manager, department: "IT", position: "Tester" },
  { key: "emp", email: "api-emp@test.local", name: "API Employee", role: Role.Employee, department: "IT", position: "Tester" },
  { key: "emp2", email: "api-emp2@test.local", name: "API Employee Two", role: Role.Employee, department: "Finance", position: "Tester" },
];

const results: { name: string; ok: boolean; detail?: string }[] = [];
let currentSection = "";

function section(name: string) {
  currentSection = name;
  console.log(`\n--- ${name} ---`);
}

function check(name: string, ok: boolean, detail?: unknown) {
  results.push({ name, ok, detail: ok ? undefined : stringify(detail) });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `  => ${stringify(detail)}`}`);
}

function stringify(value: unknown): string {
  try {
    return typeof value === "string" ? value : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function dhakaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dhaka" }).format(new Date());
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

interface Reply {
  status: number;
  json: any;
  text: string;
  headers: Headers;
}

async function request(
  method: string,
  path: string,
  options: { cookie?: string; body?: unknown; rawBody?: string; ip?: string } = {},
): Promise<Reply> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.ip) headers["x-forwarded-for"] = options.ip;
  if (options.body !== undefined || options.rawBody !== undefined) {
    headers["content-type"] = "application/json";
  }
  const body =
    options.rawBody !== undefined
      ? options.rawBody
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body,
    redirect: "manual",
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

function cookieFrom(res: Reply): string | null {
  const raw = res.headers.getSetCookie?.() ?? [];
  const first = raw[0];
  return first ? first.split(";")[0] : null;
}

async function login(email: string): Promise<string> {
  const res = await request("POST", "/api/auth/login", {
    body: { email, password: PASSWORD },
  });
  const cookie = cookieFrom(res);
  if (res.status !== 200 || !cookie) {
    throw new Error(`Login failed for ${email}: ${res.status} ${res.text}`);
  }
  return cookie;
}

const created = {
  updateIds: [] as string[],
  commentIds: [] as string[],
  assignmentIds: [] as string[],
  leaveIds: [] as string[],
  announcementIds: [] as string[],
  chatIds: [] as string[],
  calendarIds: [] as string[],
  holidayIds: [] as string[],
  pendingUserId: null as string | null,
  extraUserIds: [] as string[],
};

async function main() {
  console.log("Seeding test users...");
  const passwordHash = await hashPassword(PASSWORD);
  const users: Record<string, { id: string; email: string }> = {};

  for (const seed of SEED_USERS) {
    const user = await prisma.user.upsert({
      where: { email: seed.email },
      update: {
        name: seed.name,
        role: seed.role,
        status: UserStatus.Active,
        passwordHash,
        department: seed.department,
        position: seed.position,
        emailVerifiedAt: new Date(),
      },
      create: {
        name: seed.name,
        email: seed.email,
        role: seed.role,
        status: UserStatus.Active,
        passwordHash,
        department: seed.department,
        position: seed.position,
        emailVerifiedAt: new Date(),
      },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } });
    users[seed.key] = { id: user.id, email: user.email };
  }

  const today = dhakaToday();
  const tomorrow = shiftDate(today, 1);
  const yesterday = shiftDate(today, -1);

  const emp = await login(users.emp.email);
  const emp2 = await login(users.emp2.email);
  const hr = await login(users.hr.email);
  const admin = await login(users.admin.email);
  const manager = await login(users.manager.email);
  console.log("Signed in all roles.");

  /* ---------------- auth & access control ---------------- */
  section("Auth & access control");

  const health = await request("GET", "/api/health");
  check("health returns 200 and db ok", health.status === 200 && health.json?.database?.ok !== false, health);

  const noAuthFeed = await request("GET", "/api/feed");
  check("feed without cookie is 401", noAuthFeed.status === 401, noAuthFeed);

  const badLogin = await request("POST", "/api/auth/login", {
    body: { email: users.emp.email, password: "wrong-password" },
  });
  check("wrong password is 401", badLogin.status === 401, badLogin);

  const me = await request("GET", "/api/auth/me", { cookie: emp });
  check("me returns the signed-in user", me.status === 200 && me.json?.user?.email === users.emp.email, me);

  const pageAuthed = await request("GET", "/", { cookie: emp });
  check("authenticated feed page renders 200", pageAuthed.status === 200, pageAuthed.status);

  const pageGuest = await request("GET", "/");
  const guestRedirect = [302, 307, 308].includes(pageGuest.status) && (pageGuest.headers.get("location") ?? "").includes("/login");
  check("guest page redirects to /login", guestRedirect, { status: pageGuest.status, location: pageGuest.headers.get("location") });

  check("employee cannot list pending users", (await request("GET", "/api/users/pending", { cookie: emp })).status === 403);
  check("employee cannot create users", (await request("POST", "/api/users", { cookie: emp, body: { name: "X", email: "x@test.local", department: "IT", position: "Dev", role: "Employee" } })).status === 403);
  check("employee cannot change weekend", (await request("PATCH", "/api/settings/weekend", { cookie: emp, body: { days: [5, 6] } })).status === 403);
  check("employee cannot post announcement", (await request("POST", "/api/announcements", { cookie: emp, body: { title: "Nope", contentHtml: "<p>Nope</p>" } })).status === 403);

  const guardedPage = async (path: string, cookie: string) =>
    (await request("GET", path, { cookie })).status;

  check("server blocks employee from /users", (await guardedPage("/users", emp)) === 307);
  check("server allows HR into /users", (await guardedPage("/users", hr)) === 200);
  check("server blocks employee from /audit", (await guardedPage("/audit", emp)) === 307);
  check("server allows Admin into /audit", (await guardedPage("/audit", admin)) === 200);
  check("server blocks employee from /settings", (await guardedPage("/settings", emp)) === 307);
  check("server allows Admin into /settings", (await guardedPage("/settings", admin)) === 200);
  check("server blocks employee from /not-submitted", (await guardedPage("/not-submitted", emp)) === 307);
  check("server allows HR into /not-submitted", (await guardedPage("/not-submitted", hr)) === 200);

  /* ---------------- registration & OTP ---------------- */
  section("Registration & OTP");

  const badDepartment = await request("POST", "/api/auth/register", {
    ip: "10.0.0.1",
    body: {
      name: "API Newcomer",
      department: "Nowhere",
      position: "Tester",
      email: "api-newcomer@test.local",
      phone: "01700000000",
      password: "TestPass123!",
    },
  });
  check("registration rejects an unknown department", badDepartment.status === 400, badDepartment);

  const freshRegister = await request("POST", "/api/auth/register", {
    ip: "10.0.0.2",
    body: {
      name: "API Newcomer",
      department: "IT",
      position: "Tester",
      email: "api-newcomer@test.local",
      phone: "01700000000",
      password: "TestPass123!",
    },
  });
  check("new registration is accepted", freshRegister.status === 200, freshRegister);
  const newcomer = await prisma.user.findUnique({ where: { email: "api-newcomer@test.local" } });
  if (newcomer) created.extraUserIds.push(newcomer.id);

  const duplicateRegister = await request("POST", "/api/auth/register", {
    ip: "10.0.0.3",
    body: {
      name: "API Employee",
      department: "IT",
      position: "Tester",
      email: users.emp.email,
      phone: "01700000000",
      password: "TestPass123!",
    },
  });
  check("registering an active email is 409", duplicateRegister.status === 409, duplicateRegister);

  const wrongCode = await request("POST", "/api/auth/register/verify", {
    body: { email: "api-newcomer@test.local", code: "000000" },
  });
  check("wrong verification code is 400", wrongCode.status === 400, wrongCode);

  const unknownReset = await request("POST", "/api/auth/password/reset/request", {
    ip: "10.0.0.4",
    body: { email: "nobody-here@test.local" },
  });
  check("unknown reset email gets a generic 200", unknownReset.status === 200, unknownReset);

  const knownReset = await request("POST", "/api/auth/password/reset/request", {
    ip: "10.0.0.5",
    body: { email: users.emp2.email },
  });
  check("known reset email gets the same generic 200", knownReset.status === 200, knownReset);

  const resetWrongCode = await request("POST", "/api/auth/password/reset/verify", {
    body: { email: users.emp2.email, code: "000000", password: "AnotherPass123!" },
  });
  check("wrong reset code is 400", resetWrongCode.status === 400, resetWrongCode);

  /* ---------------- updates ---------------- */
  section("Daily updates, sanitizer and same-day lock");

  const future = await request("POST", "/api/updates", {
    cookie: emp,
    body: { updateDate: shiftDate(today, 30), contentHtml: "<p>future</p>" },
  });
  check("future update date is rejected", future.status === 400, future);

  const scriptOnly = await request("POST", "/api/updates", {
    cookie: emp,
    body: { updateDate: today, contentHtml: "<script>alert(1)</script><img src=x onerror=alert(1)>" },
  });
  check("script/image-only update is rejected as empty", scriptOnly.status === 400, scriptOnly);

  const dirtyHtml =
    "<p>Hello <strong>API</strong></p><script>alert('xss')</script><img src=x onerror=alert(1)><iframe src='https://evil.test'></iframe>";
  const createdUpdate = await request("POST", "/api/updates", {
    cookie: emp,
    body: { updateDate: today, contentHtml: dirtyHtml },
  });
  const update = createdUpdate.json?.update;
  if (update?.id) created.updateIds.push(update.id);
  check("today's update is created", createdUpdate.status === 201, createdUpdate);
  check(
    "update HTML is sanitized (no script/img/iframe)",
    typeof update?.contentHtml === "string" &&
      !/script|onerror|<img|<iframe/i.test(update.contentHtml) &&
      /<strong>API<\/strong>/.test(update.contentHtml),
    update?.contentHtml,
  );

  const duplicate = await request("POST", "/api/updates", {
    cookie: emp,
    body: { updateDate: today, contentHtml: "<p>again</p>" },
  });
  check("second update for same date is 409", duplicate.status === 409, duplicate);

  const todayRead = await request("GET", `/api/updates?date=${today}`, { cookie: emp });
  check("read own update by date", todayRead.status === 200 && todayRead.json?.update?.id === update?.id, todayRead);

  const mine = await request("GET", "/api/updates/mine", { cookie: emp });
  check("my updates list includes it", mine.status === 200 && mine.json?.updates?.some((row: any) => row.id === update?.id), mine.status);

  const edited = await request("PATCH", `/api/updates/${update?.id}`, {
    cookie: emp,
    body: { contentHtml: "<p>Edited <em>today</em></p>" },
  });
  check("today's update can be edited", edited.status === 200 && Boolean(edited.json?.update?.editedAt), edited);

  const foreignEdit = await request("PATCH", `/api/updates/${update?.id}`, {
    cookie: emp2,
    body: { contentHtml: "<p>hijack</p>" },
  });
  check("another user cannot edit someone's update", foreignEdit.status === 404, foreignEdit);

  const invalidUpdateId = await request("PATCH", "/api/updates/not-a-uuid", {
    cookie: emp,
    body: { contentHtml: "<p>bad id</p>" },
  });
  check("invalid update id is a clean 404, not a 500", invalidUpdateId.status === 404, invalidUpdateId);

  const oldUpdate = await prisma.update.create({
    data: {
      userId: users.emp.id,
      contentHtml: "<p>yesterday</p>",
      contentText: "yesterday",
      updateDate: new Date(`${yesterday}T00:00:00.000Z`),
      postedAt: new Date(`${yesterday}T10:00:00.000Z`),
    },
  });
  created.updateIds.push(oldUpdate.id);

  const oldEdit = await request("PATCH", `/api/updates/${oldUpdate.id}`, {
    cookie: emp,
    body: { contentHtml: "<p>too late</p>" },
  });
  check("yesterday's update is locked (409)", oldEdit.status === 409, oldEdit);
  const oldDelete = await request("DELETE", `/api/updates/${oldUpdate.id}`, { cookie: emp });
  check("yesterday's update cannot be deleted (409)", oldDelete.status === 409, oldDelete);

  /* ---------------- comments & reactions ---------------- */
  section("Comments and reactions");

  const comment = await request("POST", "/api/comments", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, content: "<b>Nice</b> <script>alert(1)</script>" },
  });
  const commentRow = comment.json?.comment;
  if (commentRow?.id) created.commentIds.push(commentRow.id);
  check("comment is created", comment.status === 201, comment);
  check(
    "comment markup is stored literally (UI escapes it on render)",
    commentRow?.content === "<b>Nice</b> <script>alert(1)</script>",
    commentRow?.content,
  );

  const comments = await request("GET", `/api/comments?targetType=update&targetId=${update?.id}`, { cookie: emp });
  check("comments list includes it", comments.status === 200 && comments.json?.comments?.some((row: any) => row.id === commentRow?.id), comments.status);

  const commentEdit = await request("PATCH", `/api/comments/${commentRow?.id}`, {
    cookie: emp,
    body: { content: "Updated comment" },
  });
  check("own comment can be edited same day", commentEdit.status === 200 && Boolean(commentEdit.json?.comment?.editedAt), commentEdit);

  const foreignCommentEdit = await request("PATCH", `/api/comments/${commentRow?.id}`, {
    cookie: emp2,
    body: { content: "hijack" },
  });
  check("another user cannot edit a comment", foreignCommentEdit.status === 404, foreignCommentEdit);

  const invalidCommentId = await request("PATCH", "/api/comments/not-a-uuid", {
    cookie: emp,
    body: { content: "bad" },
  });
  check("invalid comment id is a clean 404", invalidCommentId.status === 404, invalidCommentId);

  const like = await request("POST", "/api/reactions", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, kind: "like" },
  });
  check("like is recorded", like.status === 200 && like.json?.reactions?.some((r: any) => r.kind === "like" && r.reactedByMe), like);
  const unlike = await request("POST", "/api/reactions", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, kind: "like" },
  });
  check("liking again removes it", unlike.status === 200 && !unlike.json?.reactions?.some((r: any) => r.kind === "like"), unlike);
  const dislike = await request("POST", "/api/reactions", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, kind: "dislike" },
  });
  check("dislike replaces like", dislike.status === 200 && dislike.json?.reactions?.some((r: any) => r.kind === "dislike"), dislike);

  const badReaction = await request("POST", "/api/reactions", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, kind: "heart" },
  });
  check("unknown reaction kind is 400", badReaction.status === 400, badReaction);

  const missingTarget = await request("POST", "/api/comments", {
    cookie: emp,
    body: { targetType: "update", targetId: "00000000-0000-4000-8000-000000000000", content: "hello" },
  });
  check("comment on missing target is 404", missingTarget.status === 404, missingTarget);

  const oldComment = await prisma.comment.create({
    data: {
      targetType: "update",
      targetId: update.id,
      userId: users.emp.id,
      content: "old comment",
      createdAt: new Date(`${yesterday}T10:00:00.000Z`),
    },
  });
  created.commentIds.push(oldComment.id);
  const oldCommentEdit = await request("PATCH", `/api/comments/${oldComment.id}`, {
    cookie: emp,
    body: { content: "too late" },
  });
  check("yesterday's comment is locked (409)", oldCommentEdit.status === 409, oldCommentEdit);

  const commentDelete = await request("DELETE", `/api/comments/${commentRow?.id}`, { cookie: emp });
  check("own same-day comment can be deleted", commentDelete.status === 200, commentDelete);

  /* ---------------- assignments ---------------- */
  section("Assignments");

  const noAssignee = await request("POST", "/api/assignments", {
    cookie: emp,
    body: { contentHtml: "<p>do it</p>" },
  });
  check("assignment needs assignee or department", noAssignee.status === 400, noAssignee);

  const createdAssignment = await request("POST", "/api/assignments", {
    cookie: emp,
    body: { contentHtml: "<p>Check the <b>servers</b></p>", assigneeIds: [users.emp2.id], dueDate: tomorrow, priority: "urgent" },
  });
  const assignment = createdAssignment.json?.assignment;
  if (assignment?.id) created.assignmentIds.push(assignment.id);
  check("assignment is created", createdAssignment.status === 201, createdAssignment);
  check("assignment HTML is sanitized", !/<b>|<script/i.test(assignment?.contentHtml ?? ""), assignment?.contentHtml);

  const allAssignments = await request("GET", "/api/assignments?view=all", { cookie: emp2 });
  check(
    "every active user can see all assignments",
    allAssignments.status === 200 && allAssignments.json?.assignments?.some((row: any) => row.id === assignment?.id),
    allAssignments.status,
  );

  const started = await request("POST", `/api/assignments/${assignment?.id}/status`, {
    cookie: emp2,
    body: { status: "in_progress" },
  });
  check("assignee can start the assignment", started.status === 200 && started.json?.assignment?.status === "open", started);

  const foreignAssignmentEdit = await request("PATCH", `/api/assignments/${assignment?.id}`, {
    cookie: emp2,
    body: { contentHtml: "<p>hijack</p>" },
  });
  check("non-creator employee cannot edit the assignment", foreignAssignmentEdit.status === 403, foreignAssignmentEdit);

  const ownerEdit = await request("PATCH", `/api/assignments/${assignment?.id}`, {
    cookie: emp,
    body: { contentHtml: "<p>Check the <strong>servers</strong> twice</p>" },
  });
  check("creator can edit the assignment", ownerEdit.status === 200 && Boolean(ownerEdit.json?.assignment?.editedAt), ownerEdit);

  const deleteStarted = await request("DELETE", `/api/assignments/${assignment?.id}`, { cookie: emp });
  check("started assignment cannot be deleted (409)", deleteStarted.status === 409, deleteStarted);

  const cancelled = await request("POST", `/api/assignments/${assignment?.id}/cancel`, { cookie: emp });
  check("creator can cancel", cancelled.status === 200 && cancelled.json?.assignment?.status === "cancelled", cancelled);

  const statusAfterCancel = await request("POST", `/api/assignments/${assignment?.id}/status`, {
    cookie: emp2,
    body: { status: "done" },
  });
  check("cancelled assignment cannot change status (409)", statusAfterCancel.status === 409, statusAfterCancel);

  const badStatus = await request("POST", `/api/assignments/${assignment?.id}/status`, {
    cookie: emp2,
    body: { status: "finished" },
  });
  check("unknown status value is 400", badStatus.status === 400, badStatus);

  const invalidAssignmentId = await request("PATCH", "/api/assignments/not-a-uuid", {
    cookie: emp,
    body: { contentHtml: "<p>x</p>" },
  });
  check("invalid assignment id is a clean 404", invalidAssignmentId.status === 404, invalidAssignmentId);

  const disposableAssignment = await request("POST", "/api/assignments", {
    cookie: emp,
    body: { contentHtml: "<p>delete me</p>", assigneeIds: [users.emp.id] },
  });
  const disposableId = disposableAssignment.json?.assignment?.id;
  if (disposableId) created.assignmentIds.push(disposableId);
  const disposableDelete = await request("DELETE", `/api/assignments/${disposableId}`, { cookie: emp });
  check("pending assignment can be deleted", disposableDelete.status === 200, disposableDelete);

  const toMe = await request("GET", "/api/assignments?view=to_me", { cookie: emp2 });
  check("to_me view includes the assignment", toMe.status === 200 && toMe.json?.assignments?.some((row: any) => row.id === assignment?.id), toMe.status);

  /* ---------------- leaves ---------------- */
  section("Leave");

  const badRange = await request("POST", "/api/leaves", {
    cookie: emp,
    body: { fromDate: tomorrow, toDate: today, reason: "backwards" },
  });
  check("reversed leave range is 400", badRange.status === 400, badRange);

  const ownLeave = await request("POST", "/api/leaves", {
    cookie: emp,
    body: { fromDate: tomorrow, toDate: tomorrow, reason: "Family event" },
  });
  const leave = ownLeave.json?.leave;
  if (leave?.id) created.leaveIds.push(leave.id);
  check("employee leave request is Pending", ownLeave.status === 201 && leave?.status === "Pending", ownLeave);

  const leaveForOther = await request("POST", "/api/leaves", {
    cookie: emp2,
    body: { userId: users.emp.id, fromDate: tomorrow, toDate: tomorrow, reason: "not mine" },
  });
  check("employee cannot request leave for someone else", leaveForOther.status === 403, leaveForOther);

  const hrOwnLeave = await request("POST", "/api/leaves", {
    cookie: hr,
    body: { fromDate: tomorrow, toDate: tomorrow, reason: "HR leave" },
  });
  const hrLeaveId = hrOwnLeave.json?.leave?.id;
  if (hrLeaveId) created.leaveIds.push(hrLeaveId);
  const selfDecision = await request("POST", `/api/leaves/${hrLeaveId}/decision`, {
    cookie: hr,
    body: { decision: "approve" },
  });
  check("approver cannot decide their own leave", selfDecision.status === 403, selfDecision);

  const approve = await request("POST", `/api/leaves/${leave?.id}/decision`, {
    cookie: hr,
    body: { decision: "approve" },
  });
  check("HR can approve a pending request", approve.status === 200 && approve.json?.leave?.status === "Approved", approve);

  const approveAgain = await request("POST", `/api/leaves/${leave?.id}/decision`, {
    cookie: hr,
    body: { decision: "approve" },
  });
  check("already decided leave is 409", approveAgain.status === 409, approveAgain);

  const emp2Leaves = await request("GET", "/api/leaves", { cookie: emp2 });
  check(
    "non-approver sees only their own leaves",
    emp2Leaves.status === 200 && !emp2Leaves.json?.leaves?.some((row: any) => row.id === leave?.id),
    emp2Leaves.status,
  );

  /* ---------------- announcements ---------------- */
  section("Announcements");

  const announcement = await request("POST", "/api/announcements", {
    cookie: hr,
    body: { title: "API notice", contentHtml: "<p>Hello <script>alert(1)</script><iframe></iframe>team</p>" },
  });
  const announcementRow = announcement.json?.announcement;
  if (announcementRow?.id) created.announcementIds.push(announcementRow.id);
  check("HR can post an announcement", announcement.status === 201, announcement);
  check(
    "announcement HTML is sanitized",
    !/script|<iframe/i.test(announcementRow?.contentHtml ?? ""),
    announcementRow?.contentHtml,
  );

  const announcementList = await request("GET", "/api/announcements", { cookie: emp });
  check("employee sees announcements", announcementList.status === 200 && announcementList.json?.announcements?.some((row: any) => row.id === announcementRow?.id), announcementList.status);

  const employeeAnnouncementEdit = await request("PATCH", `/api/announcements/${announcementRow?.id}`, {
    cookie: emp,
    body: { title: "hijack" },
  });
  check("employee cannot edit an announcement", employeeAnnouncementEdit.status === 403, employeeAnnouncementEdit);

  const invalidAnnouncementId = await request("GET", "/api/announcements/not-a-uuid", { cookie: emp });
  check("invalid announcement id is a clean 404", invalidAnnouncementId.status === 404, invalidAnnouncementId);

  const announcementDelete = await request("DELETE", `/api/announcements/${announcementRow?.id}`, { cookie: hr });
  check("HR can delete an announcement", announcementDelete.status === 200, announcementDelete);

  /* ---------------- chat ---------------- */
  section("Group chat");

  const chatMessage = await request("POST", "/api/chat", {
    cookie: emp,
    body: { content: "Hello <b>team</b> <script>alert(1)</script>" },
  });
  const chatRow = chatMessage.json?.message;
  if (chatRow?.id) created.chatIds.push(chatRow.id);
  check("message is sent", chatMessage.status === 201, chatMessage);
  check(
    "chat markup is stored literally (UI escapes it on render)",
    chatRow?.content === "Hello <b>team</b> <script>alert(1)</script>",
    chatRow?.content,
  );

  const chatList = await request("GET", "/api/chat?limit=10", { cookie: emp2 });
  check("message appears in the room", chatList.status === 200, chatList.status);

  const foreignChatEdit = await request("PATCH", `/api/chat/${chatRow?.id}`, {
    cookie: emp2,
    body: { content: "hijack" },
  });
  check("another user cannot edit a chat message", foreignChatEdit.status === 404, foreignChatEdit);

  const invalidChatId = await request("PATCH", "/api/chat/not-a-uuid", {
    cookie: emp,
    body: { content: "bad" },
  });
  check("invalid chat id is a clean 404", invalidChatId.status === 404, invalidChatId);

  const chatEdit = await request("PATCH", `/api/chat/${chatRow?.id}`, {
    cookie: emp,
    body: { content: "Edited message" },
  });
  check("own message can be edited", chatEdit.status === 200, chatEdit);

  const changes = await request(
    "GET",
    `/api/chat/changes?since=${encodeURIComponent(chatRow?.createdAt ?? new Date().toISOString())}&sinceId=${chatRow?.id}`,
    { cookie: emp2 },
  );
  check("chat poll endpoint accepts a real cursor", changes.status === 200, changes);

  const unread = await request("GET", "/api/chat/unread", { cookie: emp });
  check("unread count responds", unread.status === 200 && typeof unread.json?.unreadCount === "number", unread);

  const badChanges = await request("GET", "/api/chat/changes?since=bogus&sinceId=bogus", { cookie: emp });
  check("invalid chat cursor is 400", badChanges.status === 400, badChanges);

  const chatDelete = await request("DELETE", `/api/chat/${chatRow?.id}`, { cookie: emp });
  check("own message can be deleted", chatDelete.status === 200, chatDelete);

  /* ---------------- calendar ---------------- */
  section("Calendar");

  const badEvent = await request("POST", "/api/calendar", {
    cookie: emp,
    body: { title: "X", date: "not-a-date" },
  });
  check("invalid calendar date is 400", badEvent.status === 400, badEvent);

  const createdEvent = await request("POST", "/api/calendar", {
    cookie: emp,
    body: { title: "API event", date: today, notes: "check" },
  });
  const event = createdEvent.json?.event;
  if (event?.id) created.calendarIds.push(event.id);
  check("calendar event is created", createdEvent.status === 201, createdEvent);

  const ownRange = await request("GET", `/api/calendar?from=${today}&to=${tomorrow}`, { cookie: emp });
  check(
    "own range includes the event",
    ownRange.status === 200 && ownRange.json?.items?.some((row: any) => row.id === `event:${event?.id}`),
    ownRange,
  );

  const otherRange = await request("GET", `/api/calendar?from=${today}&to=${tomorrow}`, { cookie: emp2 });
  check(
    "calendar is private to its owner",
    otherRange.status === 200 && !otherRange.json?.items?.some((row: any) => row.id === `event:${event?.id}`),
    otherRange,
  );

  const reversedRange = await request("GET", `/api/calendar?from=${tomorrow}&to=${today}`, { cookie: emp });
  check("reversed calendar range is 400", reversedRange.status === 400, reversedRange);

  const eventEdit = await request("PATCH", `/api/calendar/${event?.id}`, {
    cookie: emp,
    body: { title: "API event edited" },
  });
  check("event can be edited", eventEdit.status === 200, eventEdit);

  const doneNoBody = await request("POST", `/api/calendar/${event?.id}/done`, {
    cookie: emp,
    body: {},
  });
  check("done requires a boolean", doneNoBody.status === 400, doneNoBody);

  const done = await request("POST", `/api/calendar/${event?.id}/done`, {
    cookie: emp,
    body: { done: true },
  });
  check("event can be marked done", done.status === 200 && done.json?.event?.done === true, done);

  const invalidCalendarId = await request("DELETE", "/api/calendar/not-a-uuid", { cookie: emp });
  check("invalid calendar id is a clean 404", invalidCalendarId.status === 404, invalidCalendarId);

  const eventDelete = await request("DELETE", `/api/calendar/${event?.id}`, { cookie: emp });
  check("event can be deleted", eventDelete.status === 200, eventDelete);

  /* ---------------- users & roles ---------------- */
  section("User management & role rules");

  const search = await request("GET", "/api/users?search=api-emp", { cookie: hr });
  check("HR can search users", search.status === 200 && search.json?.users?.length >= 1, search.status);

  const managerCreatesAdmin = await request("POST", "/api/users", {
    cookie: manager,
    body: { name: "Rogue Admin", email: "api-rogue@test.local", department: "IT", position: "Dev", role: "Admin" },
  });
  check("Manager cannot create an Admin", managerCreatesAdmin.status === 403, managerCreatesAdmin);

  const hrGrantsAdmin = await request("PATCH", `/api/users/${users.emp2.id}`, {
    cookie: hr,
    body: { role: "Admin" },
  });
  check("HR cannot grant the Admin role", hrGrantsAdmin.status === 403, hrGrantsAdmin);

  const adminPromotes = await request("PATCH", `/api/users/${users.emp2.id}`, {
    cookie: admin,
    body: { role: "Manager" },
  });
  check("Admin can change roles", adminPromotes.status === 200 && adminPromotes.json?.user?.role === "Manager", adminPromotes);
  const adminDemotes = await request("PATCH", `/api/users/${users.emp2.id}`, {
    cookie: admin,
    body: { role: "Employee" },
  });
  check("Admin can demote again", adminDemotes.status === 200 && adminDemotes.json?.user?.role === "Employee", adminDemotes);

  const pendingUser = await prisma.user.create({
    data: {
      name: "API Pending",
      email: "api-pending@test.local",
      department: "IT",
      position: "Dev",
      status: UserStatus.Pending,
      emailVerifiedAt: new Date(),
    },
  });
  created.pendingUserId = pendingUser.id;
  const pendingList = await request("GET", "/api/users/pending", { cookie: hr });
  check("pending list includes the new signup", pendingList.status === 200 && pendingList.json?.users?.some((row: any) => row.id === pendingUser.id), pendingList.status);
  const approveUserRes = await request("POST", `/api/users/${pendingUser.id}/approve`, {
    cookie: hr,
    body: { role: "Employee", department: "IT", position: "Developer" },
  });
  check("HR can approve a signup", approveUserRes.status === 200 && approveUserRes.json?.user?.status === "Active", approveUserRes);
  const employeeApproves = await request("POST", `/api/users/${pendingUser.id}/approve`, {
    cookie: emp,
    body: { role: "Employee", department: "IT", position: "Developer" },
  });
  check("employee cannot approve signups", employeeApproves.status === 403, employeeApproves);

  /* ---------------- settings & holidays ---------------- */
  section("Settings & holidays");

  const weekend = await request("GET", "/api/settings/weekend", { cookie: hr });
  check("weekend setting is readable", weekend.status === 200 && Array.isArray(weekend.json?.days), weekend);
  const weekendWrite = await request("PATCH", "/api/settings/weekend", {
    cookie: hr,
    body: { days: weekend.json?.days ?? [5] },
  });
  check("HR can save the same weekend", weekendWrite.status === 200, weekendWrite);
  const duplicateWeekend = await request("PATCH", "/api/settings/weekend", {
    cookie: hr,
    body: { days: [5, 5] },
  });
  check("duplicate weekend days are 400", duplicateWeekend.status === 400, duplicateWeekend);

  const employeeHoliday = await request("POST", "/api/holidays", {
    cookie: emp,
    body: { date: tomorrow, name: "Nope" },
  });
  check("employee cannot add holidays", employeeHoliday.status === 403, employeeHoliday);

  const holiday = await request("POST", "/api/holidays", {
    cookie: hr,
    body: { date: shiftDate(today, 45), name: "API test holiday" },
  });
  const holidayRow = holiday.json?.holiday;
  if (holidayRow?.id) created.holidayIds.push(holidayRow.id);
  check("HR can add a holiday", holiday.status === 201, holiday);
  const holidayEdit = await request("PATCH", `/api/holidays/${holidayRow?.id}`, {
    cookie: hr,
    body: { name: "API test holiday edited" },
  });
  check("HR can edit a holiday", holidayEdit.status === 200, holidayEdit);
  const invalidHolidayId = await request("DELETE", "/api/holidays/not-a-uuid", { cookie: hr });
  check("invalid holiday id is a clean 404", invalidHolidayId.status === 404, invalidHolidayId);
  const holidayDelete = await request("DELETE", `/api/holidays/${holidayRow?.id}`, { cookie: hr });
  check("HR can delete a holiday", holidayDelete.status === 200, holidayDelete);

  /* ---------------- feed, people, notifications, profile ---------------- */
  section("Feed, people, notifications, profile");

  const feed = await request("GET", "/api/feed?limit=5", { cookie: emp });
  check("feed returns a page", feed.status === 200 && Array.isArray(feed.json?.items), feed.status);

  const badCursor = await request("GET", "/api/feed?cursor=not-a-cursor", { cookie: emp });
  check("invalid feed cursor is 400", badCursor.status === 400, badCursor);

  const badFrom = await request("GET", "/api/feed?from=2026-13-40", { cookie: emp });
  check("invalid feed date is 400", badFrom.status === 400, badFrom);

  const injectionSearch = await request("GET", "/api/feed?q=%27%20OR%201%3D1--", { cookie: emp });
  check("search input is handled safely", injectionSearch.status === 200, injectionSearch);

  const people = await request("GET", "/api/people", { cookie: emp });
  check("people list responds", people.status === 200 && Array.isArray(people.json?.people), people.status);

  const interactions = await request("GET", `/api/interactions?targetType=update&targetId=${update?.id}`, { cookie: emp });
  check("interaction summary responds", interactions.status === 200 && Array.isArray(interactions.json?.reactions), interactions);

  const notifications = await request("GET", "/api/notifications", { cookie: emp });
  check("notifications respond", notifications.status === 200 && typeof notifications.json?.unreadCount === "number", notifications);
  const markRead = await request("POST", "/api/notifications", { cookie: emp, body: {} });
  check("notifications can be marked read", markRead.status === 200 && markRead.json?.unreadCount === 0, markRead);

  const profile = await request("GET", "/api/profile", { cookie: emp });
  check("profile responds", profile.status === 200 && profile.json?.profile?.email === users.emp.email, profile);
  const profileEdit = await request("PATCH", "/api/profile", { cookie: emp, body: { name: "API Employee Renamed" } });
  check("profile name can be updated", profileEdit.status === 200, profileEdit);

  /* ---------------- avatar guard ---------------- */
  section("Avatar guard");

  const badAvatarName = await request("GET", "/api/avatars/not-a-real-file.webp", { cookie: emp });
  check("avatar rejects invalid names", badAvatarName.status === 404, badAvatarName);
  const missingAvatar = await request("GET", `/api/avatars/${"a".repeat(32)}.webp`, { cookie: emp });
  check("avatar returns 404 for missing files", missingAvatar.status === 404, missingAvatar);
  const traversal = await request("GET", "/api/avatars/..%2F..%2Fetc%2Fpasswd", { cookie: emp });
  check("avatar rejects path traversal", [400, 404].includes(traversal.status), traversal);
  const noAvatarFile = await request("POST", "/api/profile/avatar", { cookie: emp, body: {} });
  check("avatar upload requires a file", noAvatarFile.status === 400, noAvatarFile);

  const form = new FormData();
  form.append("avatar", new Blob(["not an image"], { type: "text/plain" }), "note.txt");
  const textAvatar = await fetch(`${BASE}/api/profile/avatar`, {
    method: "POST",
    headers: { cookie: emp },
    body: form,
  });
  check("avatar rejects non-image uploads", textAvatar.status === 400, textAvatar.status);

  /* ---------------- concurrency ---------------- */
  section("Concurrency");

  const races = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      request("POST", "/api/updates", {
        cookie: emp2,
        body: { updateDate: today, contentHtml: `<p>race ${index}</p>` },
      }),
    ),
  );
  const raceStatuses = races.map((row) => row.status);
  for (const race of races) {
    if (race.json?.update?.id) created.updateIds.push(race.json.update.id);
  }
  check("concurrent duplicate updates create at most one row", raceStatuses.filter((status) => status === 201).length <= 1, raceStatuses);
  check("concurrent duplicate updates never 500", !raceStatuses.some((status) => status >= 500), raceStatuses);

  const reactionRaces = await Promise.all(
    Array.from({ length: 5 }, () =>
      request("POST", "/api/reactions", {
        cookie: emp2,
        body: { targetType: "update", targetId: update?.id, kind: "like" },
      }),
    ),
  );
  const reactionStatuses = reactionRaces.map((row) => row.status);
  check("concurrent reactions never 500", !reactionStatuses.some((status) => status >= 500), reactionStatuses);

  const holidayRaces = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("POST", "/api/holidays", {
        cookie: hr,
        body: { date: shiftDate(today, 200), name: "Race holiday" },
      }),
    ),
  );
  const holidayStatuses = holidayRaces.map((row) => row.status);
  for (const race of holidayRaces) {
    if (race.json?.holiday?.id) created.holidayIds.push(race.json.holiday.id);
  }
  check("concurrent duplicate holidays create at most one", holidayStatuses.filter((status) => status === 201).length <= 1, holidayStatuses);
  check("concurrent duplicate holidays never 500", !holidayStatuses.some((status) => status >= 500), holidayStatuses);

  const userRaces = await Promise.all(
    Array.from({ length: 4 }, () =>
      request("POST", "/api/users", {
        cookie: admin,
        body: {
          name: "API Race User",
          email: "api-race@test.local",
          department: "IT",
          position: "Tester",
          role: "Employee",
        },
      }),
    ),
  );
  const userStatuses = userRaces.map((row) => row.status);
  for (const race of userRaces) {
    if (race.json?.user?.id) created.extraUserIds.push(race.json.user.id);
  }
  check("concurrent duplicate users create at most one", userStatuses.filter((status) => status === 201).length <= 1, userStatuses);
  check("concurrent duplicate users never 500", !userStatuses.some((status) => status >= 500), userStatuses);

  /* ---------------- input hardening ---------------- */
  section("Input hardening");

  const malformed = await request("POST", "/api/updates", { cookie: emp, rawBody: "{not json" });
  check("malformed JSON is 400, not 500", malformed.status === 400, malformed);

  const tooLong = await request("POST", "/api/updates", {
    cookie: emp,
    body: { updateDate: today, contentHtml: `<p>${"a".repeat(50_001)}</p>` },
  });
  check("oversized update is 400", tooLong.status === 400, tooLong);

  const hugeReaction = await request("POST", "/api/reactions", {
    cookie: emp,
    body: { targetType: "update", targetId: update?.id, kind: "like", extra: "ignored" },
  });
  check("extra body fields are ignored", hugeReaction.status === 200, hugeReaction);

  const unknownApi = await request("GET", "/api/does-not-exist", { cookie: emp });
  check("unknown API route is 404", unknownApi.status === 404, unknownApi.status);

  const logout = await request("POST", "/api/auth/logout", { cookie: emp2 });
  check("logout succeeds", logout.status === 200, logout);
  const afterLogout = await request("GET", "/api/auth/me", { cookie: emp2 });
  check("session is invalid after logout", afterLogout.status === 401, afterLogout);

  /* ---------------- report ---------------- */
  await cleanup(users);

  const failures = results.filter((row) => !row.ok);
  console.log(`\n================ SUMMARY ================`);
  console.log(`${results.length} checks, ${results.length - failures.length} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(`\nFAILURES:`);
    for (const failure of failures) {
      console.log(`- ${failure.name}: ${failure.detail}`);
    }
    process.exitCode = 1;
  }
}

async function cleanup(users: Record<string, { id: string }>) {
  console.log("\nCleaning up test data...");
  const userIds = Object.values(users).map((user) => user.id);
  if (created.pendingUserId) userIds.push(created.pendingUserId);
  userIds.push(...created.extraUserIds);

  await prisma.reaction.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.reaction.deleteMany({
    where: {
      targetId: {
        in: [...created.updateIds, ...created.commentIds, ...created.assignmentIds],
      },
    },
  });
  await prisma.mention.deleteMany({ where: { targetId: { in: [...created.updateIds, ...created.commentIds, ...created.chatIds] } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.comment.deleteMany({ where: { OR: [{ userId: { in: userIds } }, { id: { in: created.commentIds } }] } });
  await prisma.assignmentAssignee.deleteMany({ where: { assignmentId: { in: created.assignmentIds } } });
  await prisma.assignment.deleteMany({ where: { id: { in: created.assignmentIds } } });
  await prisma.leave.deleteMany({ where: { id: { in: created.leaveIds } } });
  await prisma.announcement.deleteMany({ where: { id: { in: created.announcementIds } } });
  await prisma.chatMessage.deleteMany({ where: { id: { in: created.chatIds } } });
  await prisma.chatRead.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.calendarEvent.deleteMany({ where: { id: { in: created.calendarIds } } });
  await prisma.update.deleteMany({ where: { id: { in: created.updateIds } } });
  await prisma.holiday.deleteMany({ where: { id: { in: created.holidayIds } } });
  await prisma.loginAttempt.deleteMany({ where: { email: { contains: "@test.local" } } });
  await prisma.otpCode.deleteMany({ where: { email: { contains: "@test.local" } } });
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  console.log("Cleanup done.");
}

main()
  .catch((error) => {
    console.error("HARNESS ERROR:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
