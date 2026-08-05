import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

export const rsvpEvent = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const eventId = request.data?.eventId as string | undefined;
  const status = (request.data?.status || "interested") as string;
  if (!eventId) throw new HttpsError("invalid-argument", "eventId required.");
  if (!["interested", "going", "cancelled"].includes(status)) {
    throw new HttpsError("invalid-argument", "Invalid RSVP status.");
  }

  const db = getFirestore();
  const eventRef = db.doc(`events/${eventId}`);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

  const rsvpId = `${eventId}_${uid}`;
  const rsvpRef = db.doc(`rsvps/${rsvpId}`);
  const existing = await rsvpRef.get();
  const prev = existing.data()?.status as string | undefined;

  await rsvpRef.set(
    {
      eventId,
      userId: uid,
      status,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: existing.exists
        ? existing.data()?.createdAt
        : FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  const wasActive = prev === "interested" || prev === "going";
  const isActive = status === "interested" || status === "going";
  if (!wasActive && isActive) {
    await eventRef.update({
      "metrics.rsvpCount": FieldValue.increment(1),
    });
  } else if (wasActive && !isActive) {
    await eventRef.update({
      "metrics.rsvpCount": FieldValue.increment(-1),
    });
  }

  return { ok: true, status };
});
