import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

export const recordClick = onCall({ invoker: "public" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");
  const eventId = request.data?.eventId as string | undefined;
  if (!eventId) throw new HttpsError("invalid-argument", "eventId required.");

  const db = getFirestore();
  const eventRef = db.doc(`events/${eventId}`);
  const eventSnap = await eventRef.get();
  if (!eventSnap.exists) throw new HttpsError("not-found", "Event not found.");

  await db.collection("eventClicks").add({
    eventId,
    userId: uid,
    createdAt: FieldValue.serverTimestamp(),
  });
  await eventRef.update({
    "metrics.clickCount": FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});
