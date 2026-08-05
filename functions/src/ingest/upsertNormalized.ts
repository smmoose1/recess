import { FieldValue, getFirestore } from "firebase-admin/firestore";
import type { NormalizedEvent } from "@recess/shared";
import * as ngeohash from "ngeohash";
import { fingerprintEvent } from "../lib/fingerprint";
import { metrosForPoint } from "../lib/metros";

export type UpsertResult = {
  created: number;
  updated: number;
  skipped: number;
  skipReasons: Record<string, number>;
  sampleTitles: string[];
  sampleExternalIds: string[];
  eventIds: string[];
};

function bump(reasons: Record<string, number>, key: string) {
  reasons[key] = (reasons[key] || 0) + 1;
}

export async function upsertNormalized(
  events: NormalizedEvent[]
): Promise<UpsertResult> {
  const db = getFirestore();
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const skipReasons: Record<string, number> = {};
  const sampleTitles: string[] = [];
  const sampleExternalIds: string[] = [];
  const eventIds: string[] = [];

  for (const event of events) {
    if (!event.title?.trim()) {
      skipped += 1;
      bump(skipReasons, "missing_title");
      continue;
    }
    if (!event.startsAt || Number.isNaN(event.startsAt.getTime())) {
      skipped += 1;
      bump(skipReasons, "invalid_startsAt");
      continue;
    }
    if (
      Number.isNaN(event.location.lat) ||
      Number.isNaN(event.location.lng)
    ) {
      skipped += 1;
      bump(skipReasons, "invalid_geo");
      continue;
    }

    const fingerprint = fingerprintEvent({
      title: event.title,
      startsAt: event.startsAt,
      lat: event.location.lat,
      lng: event.location.lng,
      platform: event.platform,
      externalId: event.externalId,
    });

    const docId = `${event.platform}_${event.externalId}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "_"
    );
    const geohash = ngeohash.encode(event.location.lat, event.location.lng, 9);
    const metroIds = metrosForPoint(event.location.lat, event.location.lng);
    if (metroIds.length === 0) {
      metroIds.push("nyc");
    }

    const ref = db.collection("events").doc(docId);
    const existing = await ref.get();

    // Admin-edited or hidden events stay locked until unlocked in the admin UI.
    if (existing.exists && existing.data()?.adminLocked === true) {
      await ref.set(
        {
          source: {
            lastIngestedAt: FieldValue.serverTimestamp(),
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      skipped += 1;
      bump(skipReasons, "admin_locked");
      eventIds.push(docId);
      if (sampleTitles.length < 8) {
        sampleTitles.push(event.title);
        sampleExternalIds.push(event.externalId);
      }
      continue;
    }

    const payload = {
      title: event.title,
      organization: event.organization,
      eventType: event.eventType,
      ageGroup: event.ageGroup,
      description: event.description,
      links: event.links,
      phone: event.phone ?? null,
      startsAt: event.startsAt,
      endsAt: event.endsAt ?? null,
      timezone: event.timezone,
      location: { ...event.location, geohash },
      source: {
        platform: event.platform,
        externalId: event.externalId,
        sourceUrl: event.links.source || event.links.primary,
        lastIngestedAt: FieldValue.serverTimestamp(),
      },
      fingerprint,
      metroIds,
      status: "active" as const,
      updatedAt: FieldValue.serverTimestamp(),
      ...(existing.exists
        ? {}
        : {
            metrics: {
              clickCount: 0,
              rsvpCount: 0,
              ratingAverage: 0,
              ratingCount: 0,
            },
            createdAt: FieldValue.serverTimestamp(),
          }),
    };

    await ref.set(payload, { merge: true });
    eventIds.push(docId);
    if (existing.exists) updated += 1;
    else created += 1;

    if (sampleTitles.length < 8) {
      sampleTitles.push(event.title);
      sampleExternalIds.push(event.externalId);
    }
  }

  return {
    created,
    updated,
    skipped,
    skipReasons,
    sampleTitles,
    sampleExternalIds,
    eventIds,
  };
}
