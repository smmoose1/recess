import { onSchedule } from "firebase-functions/v2/scheduler";
import { runIngest } from "./runIngest";

/** Daily — runs every enabled ingestSources doc */
export const scheduledIngest = onSchedule(
  {
    schedule: "0 11 * * *",
    timeZone: "America/New_York",
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async () => {
    await runIngest({ sourceId: "all", trigger: "schedule" });
  }
);
