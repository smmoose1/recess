import { z } from "zod";
import { EVENT_TYPES, SOURCE_PLATFORMS } from "./constants";

export const AgeGroupSchema = z.object({
  min: z.number().min(0).max(18),
  max: z.number().min(0).max(18),
  label: z.string(),
});

export const EventLocationSchema = z.object({
  name: z.string(),
  address: z.string().default(""),
  city: z.string().default(""),
  region: z.string().default("NY"),
  country: z.string().default("US"),
  lat: z.number(),
  lng: z.number(),
  geohash: z.string().optional(),
});

export const EventMetricsSchema = z.object({
  clickCount: z.number().int().nonnegative().default(0),
  rsvpCount: z.number().int().nonnegative().default(0),
  ratingAverage: z.number().min(0).max(5).default(0),
  ratingCount: z.number().int().nonnegative().default(0),
});

export const EventSourceSchema = z.object({
  platform: z.enum(SOURCE_PLATFORMS),
  externalId: z.string(),
  sourceUrl: z.string().url(),
  lastIngestedAt: z.any().optional(),
});

export const RecessEventSchema = z.object({
  title: z.string().min(1),
  organization: z.string().default(""),
  eventType: z.enum(EVENT_TYPES).or(z.string()),
  ageGroup: AgeGroupSchema,
  description: z.string().default(""),
  links: z.object({
    primary: z.string().url(),
    tickets: z.string().url().optional(),
    source: z.string().url().optional(),
  }),
  phone: z.string().optional(),
  startsAt: z.any(),
  endsAt: z.any().optional(),
  timezone: z.string().default("America/New_York"),
  location: EventLocationSchema,
  source: EventSourceSchema,
  fingerprint: z.string(),
  metroIds: z.array(z.string()).default([]),
  status: z.enum(["active", "hidden", "ended"]).default("active"),
  metrics: EventMetricsSchema.default({
    clickCount: 0,
    rsvpCount: 0,
    ratingAverage: 0,
    ratingCount: 0,
  }),
  createdAt: z.any().optional(),
  updatedAt: z.any().optional(),
});

export type RecessEvent = z.infer<typeof RecessEventSchema>;

export const SurveyQuestionTypeSchema = z.enum([
  "single_choice",
  "multi_choice",
  "text",
  "scale",
  "lead_capture",
]);

export const SurveyQuestionSchema = z.object({
  prompt: z.string(),
  type: SurveyQuestionTypeSchema,
  options: z.array(z.string()).optional(),
  active: z.boolean().default(true),
  weight: z.number().default(1),
  sortOrder: z.number().int().default(0),
  createdAt: z.any().optional(),
  createdBy: z.string().optional(),
});

export type SurveyQuestion = z.infer<typeof SurveyQuestionSchema>;

export const LeadCaptureAnswerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  zip: z.string().min(5).max(10),
});

export type LeadCaptureAnswer = z.infer<typeof LeadCaptureAnswerSchema>;

export const SurveyResponseSchema = z.object({
  questionId: z.string(),
  answer: z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    LeadCaptureAnswerSchema,
  ]),
  userId: z.string(),
  sessionId: z.string().optional(),
  filtersSnapshot: z
    .object({
      metroId: z.string().optional(),
      eventType: z.string().optional(),
      ageGroup: z.string().optional(),
      businessName: z.string().optional(),
    })
    .optional(),
  unlockedPage: z.number().int().positive(),
  createdAt: z.any().optional(),
});

export type SurveyResponse = z.infer<typeof SurveyResponseSchema>;

export const AdminSchema = z.object({
  role: z.literal("admin"),
  email: z.string().email(),
  createdAt: z.any().optional(),
});

/** @deprecated use IngestSourceConfig from ingestSources.ts */
export { IngestSourceConfigSchema as IngestSourceSchema } from "./ingestSources";
export type { IngestSourceConfig as IngestSource } from "./ingestSources";

export const IngestLogLineSchema = z.object({
  at: z.string(),
  level: z.enum(["info", "warn", "error"]),
  source: z.string().optional(),
  message: z.string(),
  detail: z.string().optional(),
});

export const SourceRunStatsSchema = z.object({
  platform: z.string(),
  status: z.enum(["success", "partial", "failed", "skipped"]),
  startedAt: z.string(),
  finishedAt: z.string().optional(),
  durationMs: z.number().optional(),
  fetched: z.number(),
  created: z.number(),
  updated: z.number(),
  skipped: z.number(),
  skipReasons: z.record(z.number()).default({}),
  sampleTitles: z.array(z.string()).default([]),
  sampleExternalIds: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
});

export const IngestRunSchema = z.object({
  platform: z.string(),
  trigger: z.enum(["schedule", "manual"]),
  status: z.enum(["running", "success", "partial", "failed"]),
  startedAt: z.any().optional(),
  finishedAt: z.any().optional(),
  durationMs: z.number().optional(),
  triggeredBy: z.string().nullable().optional(),
  stats: z.object({
    fetched: z.number(),
    created: z.number(),
    updated: z.number(),
    upserted: z.number(),
    skipped: z.number(),
    errors: z.number(),
    warnings: z.number(),
  }),
  sources: z.array(SourceRunStatsSchema).default([]),
  logs: z.array(IngestLogLineSchema).default([]),
  errorSummary: z.string().nullable().optional(),
  warningSummary: z.string().nullable().optional(),
});

export type IngestRun = z.infer<typeof IngestRunSchema>;

export const NormalizedEventSchema = z.object({
  externalId: z.string(),
  platform: z.enum(SOURCE_PLATFORMS),
  title: z.string(),
  organization: z.string().default(""),
  eventType: z.string().default("other"),
  ageGroup: AgeGroupSchema,
  description: z.string().default(""),
  links: z.object({
    primary: z.string(),
    tickets: z.string().optional(),
    source: z.string().optional(),
  }),
  phone: z.string().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  timezone: z.string().default("America/New_York"),
  location: EventLocationSchema.omit({ geohash: true }),
});

export type NormalizedEvent = z.infer<typeof NormalizedEventSchema>;
