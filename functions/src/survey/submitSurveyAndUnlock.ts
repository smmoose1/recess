import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { LeadCaptureAnswerSchema } from "@recess/shared";
import {
  answerSummary,
  extractRequestIp,
  lookupGeo,
} from "./geoFromIp";

export const submitSurveyAndUnlock = onCall(
  { invoker: "public" },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in required.");

    const {
      questionId,
      answer,
      unlockedPage,
      filtersSnapshot,
      clientMeta,
      context,
      eventId,
    } = request.data || {};
    if (!questionId) {
      throw new HttpsError("invalid-argument", "Missing questionId.");
    }

    const db = getFirestore();
    const questionSnap = await db.doc(`surveyQuestions/${questionId}`).get();
    if (!questionSnap.exists || questionSnap.data()?.active !== true) {
      throw new HttpsError("failed-precondition", "Question not active.");
    }

    const question = questionSnap.data()!;
    let normalizedAnswer = answer;

    if (question.type === "lead_capture") {
      const parsed = LeadCaptureAnswerSchema.safeParse(answer);
      if (!parsed.success) {
        throw new HttpsError(
          "invalid-argument",
          "Name, email, and zip are required."
        );
      }
      normalizedAnswer = parsed.data;
      await db.doc(`users/${uid}`).set(
        {
          lead: {
            ...parsed.data,
            capturedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } else if (question.type === "multi_choice") {
      if (!Array.isArray(answer) || answer.length === 0) {
        throw new HttpsError("invalid-argument", "Answer required.");
      }
      normalizedAnswer = answer.map(String);
    } else if (question.type === "scale") {
      const n = Number(answer);
      if (!Number.isFinite(n)) {
        throw new HttpsError("invalid-argument", "Answer required.");
      }
      normalizedAnswer = n;
    } else if (
      answer === undefined ||
      answer === null ||
      (typeof answer === "string" && !answer.trim())
    ) {
      throw new HttpsError("invalid-argument", "Answer required.");
    }

    const raw = request.rawRequest;
    const headerMap: Record<string, string | string[] | undefined> = {};
    for (const [k, v] of Object.entries(raw.headers || {})) {
      headerMap[k.toLowerCase()] = v as string | string[] | undefined;
    }
    const ip = extractRequestIp({
      ip: raw.ip,
      headers: headerMap,
    });
    const userAgent =
      (typeof headerMap["user-agent"] === "string"
        ? headerMap["user-agent"]
        : undefined) || null;
    const geo = await lookupGeo(ip);

    const safeClientMeta =
      clientMeta && typeof clientMeta === "object"
        ? {
            timezone: String((clientMeta as { timezone?: string }).timezone || ""),
            locale: String((clientMeta as { locale?: string }).locale || ""),
            languages: Array.isArray(
              (clientMeta as { languages?: string[] }).languages
            )
              ? (clientMeta as { languages: string[] }).languages.slice(0, 8)
              : [],
            platform: String((clientMeta as { platform?: string }).platform || ""),
            screen: String((clientMeta as { screen?: string }).screen || ""),
            referrer: String((clientMeta as { referrer?: string }).referrer || ""),
          }
        : null;

    const filters =
      filtersSnapshot && typeof filtersSnapshot === "object"
        ? filtersSnapshot
        : null;

    const shouldUnlock =
      unlockedPage != null &&
      unlockedPage !== "" &&
      Number.isFinite(Number(unlockedPage));

    // Stable id so progressive edits upsert instead of duplicating.
    const responseId = `${uid}_${questionId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    const responseRef = db.collection("surveyResponses").doc(responseId);
    const existing = await responseRef.get();

    await responseRef.set(
      {
        questionId,
        questionPrompt: question.prompt || "",
        questionType: question.type || "",
        answer: normalizedAnswer,
        answerSummary: answerSummary(normalizedAnswer),
        userId: uid,
        filtersSnapshot: filters,
        metroId:
          filters && typeof filters === "object"
            ? (filters as { metroId?: string }).metroId || null
            : null,
        unlockedPage: shouldUnlock ? Number(unlockedPage) : null,
        context: typeof context === "string" ? context : null,
        eventId: typeof eventId === "string" ? eventId : null,
        meta: {
          ip: ip || null,
          userAgent,
          geo: geo
            ? {
                city: geo.city || null,
                region: geo.region || null,
                regionCode: geo.regionCode || null,
                country: geo.country || null,
                countryCode: geo.countryCode || null,
                postal: geo.postal || null,
                lat: geo.lat ?? null,
                lng: geo.lng ?? null,
                timezone: geo.timezone || null,
                isp: geo.isp || null,
                org: geo.org || null,
                source: geo.source,
              }
            : null,
          client: safeClientMeta,
        },
        geoCity: geo?.city || null,
        geoRegion: geo?.region || null,
        geoCountry: geo?.country || null,
        geoCountryCode: geo?.countryCode || null,
        geoPostal: geo?.postal || null,
        updatedAt: FieldValue.serverTimestamp(),
        ...(existing.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );

    if (shouldUnlock) {
      await db.doc(`users/${uid}`).set(
        {
          unlocks: FieldValue.arrayUnion(Number(unlockedPage)),
          maxUnlockedPage: Number(unlockedPage),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }

    return {
      ok: true,
      responseId,
      unlockedPage: shouldUnlock ? Number(unlockedPage) : null,
    };
  }
);
