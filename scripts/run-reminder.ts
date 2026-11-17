import {
  runAssignmentDueReminder,
  runDailyUpdateReminder,
} from "../jobs/reminders";
import { enqueueEmail } from "../lib/queue";

async function main() {
  const which = process.argv[2] === "due" ? "due" : "daily";

  const result =
    which === "due"
      ? await runAssignmentDueReminder(enqueueEmail)
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
