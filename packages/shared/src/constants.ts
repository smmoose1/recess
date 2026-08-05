export const PAGE_SIZE = 10;

export const EVENT_TYPES = [
  "class",
  "park",
  "museum",
  "party",
  "camp",
  "show",
  "sports",
  "outdoors",
  "other",
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const AGE_GROUP_PRESETS = [
  { label: "All ages", min: 0, max: 18 },
  { label: "0–2", min: 0, max: 2 },
  { label: "3–5", min: 3, max: 5 },
  { label: "6–8", min: 6, max: 8 },
  { label: "9–12", min: 9, max: 12 },
  { label: "Teens", min: 13, max: 18 },
] as const;

export const SOURCE_PLATFORMS = [
  "mommy_poppins",
  "eventbrite",
  "luma",
  "partiful",
  "manual",
] as const;

export type SourcePlatform = (typeof SOURCE_PLATFORMS)[number];
