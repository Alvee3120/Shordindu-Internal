import {
  runAssignmentDueReminder,
  runCalendarReminder,
  runDailyUpdateReminder,
} from "../jobs/reminders";
import { enqueueEmail } from "../lib/queue";

async function main() {
  const argument = process.argv[2];
  const which =
    argument === "due" ? "due" : argument === "calendar" ? "calendar" : "daily";

  const result =
    which === "due"
      ? await runAssignmentDueReminder(enqueueEmail)
      : which === "calendar"
        ? await runCalendarReminder(enqueueEmail)
        : await runDailyUpdateReminder(enqueueEmail);

  console.log(`[REMINDER ${which.toUpperCase()}]`);
  console.log(JSON.stringify(result, null, 2));

  if (result.recipients.length > 0) {
    console.log(
      `Queued ${result.emailCount} email(s) for: ${result.recipients
        .map((recipient) => recipient.name)
        .join(", ")}`,
    );
  }
}

main()
  .catch((error) => {
    console.error("[REMINDER] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit();
  });
