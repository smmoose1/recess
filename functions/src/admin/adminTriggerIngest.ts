import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assertAdmin } from "../lib/admin";
import { runIngest } from "../ingest/runIngest";

/**
 * Catch-all manual ingest trigger.
 * Pass `{ sourceId }` for one Firestore ingestSources doc,
 * or `{ sourceId: "all" }` / omit to run every enabled source.
 */
export const adminTriggerIngest = onCall(
  {
    timeoutSeconds: 540,
    memory: "2GiB",
    // Gen2 blocks browser preflight unless Cloud Run invoker is public.
    // Firebase Auth + assertAdmin still gate the handler.
    invoker: "public",
  },
  async (request) => {
    await assertAdmin(request.auth?.uid);
    const sourceId = (request.data?.sourceId ||
      request.data?.platform || // backward compatible
      "all") as string;

    if (typeof sourceId !== "string" || !sourceId.trim()) {
      throw new HttpsError("invalid-argument", "sourceId required.");
    }

    return runIngest({
      sourceId: sourceId.trim(),
      trigger: "manual",
      uid: request.auth!.uid,
    });
  }
);
