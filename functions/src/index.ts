import { initializeApp } from "firebase-admin/app";
import { setGlobalOptions } from "firebase-functions/v2";

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

export { submitSurveyAndUnlock } from "./survey/submitSurveyAndUnlock";
export { recordClick } from "./events/recordClick";
export { rsvpEvent } from "./events/rsvpEvent";
export { adminTriggerIngest } from "./admin/adminTriggerIngest";
export { scheduledIngest } from "./ingest/scheduledIngest";
