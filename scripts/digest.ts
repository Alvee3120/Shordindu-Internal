import { processPendingDigests } from "../jobs/digest";

processPendingDigests()
  .then((result) => {
    console.log(
      `[DIGEST] Sent ${result.emails} email(s) covering ${result.notifications} notification(s).`,
    );
  })
  .catch((error) => {
    console.error("[DIGEST] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => {
    process.exit();
  });
