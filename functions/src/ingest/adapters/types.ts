import type { NormalizedEvent } from "@recess/shared";

export type AdapterResult = {
  events: NormalizedEvent[];
  diagnostics: string[];
};
