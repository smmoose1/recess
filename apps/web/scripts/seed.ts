/**
 * Seed survey questions + sample events into recess-app-nyc.
 * Uses Firebase client SDK with admin email/password from env.
 *
 * SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD required.
 */
import { initializeApp } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const email = process.env.SEED_ADMIN_EMAIL || "byonedegree@gmail.com";
const password = process.env.SEED_ADMIN_PASSWORD;

if (!password) {
  console.error("Set SEED_ADMIN_PASSWORD to run seed.");
  process.exit(1);
}

const sampleEvents = [
  {
    id: "manual_storytime_bryant",
    title: "Storytime Under the Trees",
    organization: "Bryant Park Reading Room",
    eventType: "outdoors",
    ageGroup: { min: 2, max: 6, label: "2–6" },
    description: "Picture books, songs, and a little wiggle break.",
    links: {
      primary: "https://bryantpark.org",
      source: "https://bryantpark.org",
    },
    location: {
      name: "Bryant Park",
      address: "42nd St & 6th Ave",
      city: "New York",
      region: "NY",
      country: "US",
      lat: 40.7536,
      lng: -73.9832,
      geohash: "dr5ru",
    },
    metroIds: ["nyc"],
    daysFromNow: 2,
  },
  {
    id: "manual_scarsdale_art",
    title: "Family Clay Morning",
    organization: "Scarsdale Studio Kids",
    eventType: "class",
    ageGroup: { min: 4, max: 9, label: "4–9" },
    description: "Make a tiny monster bowl. Messy aprons provided.",
    links: {
      primary: "https://example.com/scarsdale-clay",
      source: "https://example.com/scarsdale-clay",
    },
    location: {
      name: "Scarsdale Studio Kids",
      address: "1 Spencer Pl",
      city: "Scarsdale",
      region: "NY",
      country: "US",
      lat: 40.9887,
      lng: -73.7868,
      geohash: "dr7b",
    },
    metroIds: ["scarsdale_bronxville"],
    daysFromNow: 4,
  },
  {
    id: "manual_chappaqua_hike",
    title: "Little Hikers at Whippoorwill",
    organization: "Chappaqua Nature Club",
    eventType: "outdoors",
    ageGroup: { min: 3, max: 8, label: "3–8" },
    description: "Short trail loop with stick collecting and snack share.",
    links: {
      primary: "https://example.com/chappaqua-hike",
      source: "https://example.com/chappaqua-hike",
    },
    location: {
      name: "Whippoorwill Park",
      address: "Whippoorwill Rd",
      city: "Chappaqua",
      region: "NY",
      country: "US",
      lat: 41.1595,
      lng: -73.7649,
      geohash: "dr7c",
    },
    metroIds: ["chappaqua"],
    daysFromNow: 5,
  },
];

// Generate more NYC fillers so Load more has pages
for (let i = 1; i <= 24; i++) {
  sampleEvents.push({
    id: `manual_nyc_filler_${i}`,
    title: `Neighborhood Fun #${i}`,
    organization: i % 2 === 0 ? "NYC Parks" : "Library Friends",
    eventType: i % 3 === 0 ? "museum" : i % 2 === 0 ? "park" : "class",
    ageGroup: { min: 0, max: 10, label: "0–10" },
    description: "A seeded placeholder event so the feed feels full on day one.",
    links: {
      primary: "https://example.com/recess-seed",
      source: "https://example.com/recess-seed",
    },
    location: {
      name: "Community Spot",
      address: `${100 + i} Main St`,
      city: "New York",
      region: "NY",
      country: "US",
      lat: 40.71 + i * 0.002,
      lng: -74.0 + i * 0.001,
      geohash: "dr5r",
    },
    metroIds: ["nyc"],
    daysFromNow: 1 + i,
  });
}

async function main() {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  await signInWithEmailAndPassword(auth, email, password);

  await setDoc(
    doc(db, "surveyQuestions", "lead_capture_v1"),
    {
      prompt: "Want more events? Tell us who to cheer for.",
      type: "lead_capture",
      active: true,
      weight: 10,
      sortOrder: 1,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "surveyQuestions", "weekend_pref_v1"),
    {
      prompt: "When do you usually look for kid activities?",
      type: "single_choice",
      options: ["Weekends", "After school", "School breaks", "Whenever — surprise me"],
      active: true,
      weight: 5,
      sortOrder: 2,
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );

  const defaultSources = [
    {
      id: "mp_nyc",
      name: "Mommy Poppins NYC",
      url: "https://mommypoppins.com/events/118/new-york-city/all/tag/all/age/all/all/all/type/0/deals/0/near/all",
      adapter: "mommy_poppins",
      metroIds: ["nyc"],
      days: 30,
    },
    {
      id: "mp_westchester",
      name: "Mommy Poppins Westchester",
      url: "https://mommypoppins.com/events/120/westchester/all/tag/all/age/all/all/all/type/0/deals/0/near/all",
      adapter: "mommy_poppins",
      metroIds: ["scarsdale_bronxville", "chappaqua"],
      days: 30,
    },
    {
      id: "mp_connecticut",
      name: "Mommy Poppins Connecticut",
      url: "https://mommypoppins.com/events/114/connecticut/all/tag/all/age/all/all/all/type/0/deals/0/near/all",
      adapter: "mommy_poppins",
      metroIds: ["connecticut"],
      days: 30,
    },
    {
      id: "eb_nyc_kids",
      name: "Eventbrite NYC Kids",
      url: "https://www.eventbrite.com/d/ny--new-york/kids/",
      adapter: "eventbrite",
      metroIds: ["nyc"],
      days: 30,
    },
  ];

  for (const source of defaultSources) {
    await setDoc(
      doc(db, "ingestSources", source.id),
      {
        name: source.name,
        url: source.url,
        adapter: source.adapter,
        enabled: true,
        metroIds: source.metroIds,
        days: source.days,
        maxDetails: 120,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  }

  const batch = writeBatch(db);
  for (const event of sampleEvents) {
    const starts = new Date();
    starts.setDate(starts.getDate() + event.daysFromNow);
    starts.setHours(10, 0, 0, 0);
    const ends = new Date(starts);
    ends.setHours(11, 30, 0, 0);
    batch.set(doc(collection(db, "events"), event.id), {
      title: event.title,
      organization: event.organization,
      eventType: event.eventType,
      ageGroup: event.ageGroup,
      description: event.description,
      links: event.links,
      startsAt: Timestamp.fromDate(starts),
      endsAt: Timestamp.fromDate(ends),
      timezone: "America/New_York",
      location: event.location,
      source: {
        platform: "manual",
        externalId: event.id,
        sourceUrl: event.links.source,
        lastIngestedAt: serverTimestamp(),
      },
      fingerprint: event.id,
      metroIds: event.metroIds,
      status: "active",
      metrics: {
        clickCount: Math.floor(Math.random() * 20),
        rsvpCount: Math.floor(Math.random() * 8),
        ratingAverage: 4 + Math.random(),
        ratingCount: Math.floor(Math.random() * 12),
      },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
  console.log(`Seeded ${sampleEvents.length} events + survey questions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
