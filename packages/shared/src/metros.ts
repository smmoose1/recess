export type MetroId =
  | "nyc"
  | "scarsdale_bronxville"
  | "chappaqua"
  | "connecticut";

export type Metro = {
  id: MetroId;
  label: string;
  shortLabel: string;
  center: { lat: number; lng: number };
  radiusKm: number;
};

export const METROS: Metro[] = [
  {
    id: "nyc",
    label: "New York City",
    shortLabel: "NYC",
    center: { lat: 40.7128, lng: -74.006 },
    radiusKm: 25,
  },
  {
    id: "scarsdale_bronxville",
    label: "Scarsdale / Bronxville",
    shortLabel: "Scarsdale",
    center: { lat: 40.942, lng: -73.807 },
    radiusKm: 12,
  },
  {
    id: "chappaqua",
    label: "Chappaqua",
    shortLabel: "Chappaqua",
    center: { lat: 41.1595, lng: -73.7649 },
    radiusKm: 12,
  },
  {
    id: "connecticut",
    label: "Connecticut",
    shortLabel: "CT",
    center: { lat: 41.3083, lng: -72.9279 },
    radiusKm: 70,
  },
];

export const METRO_BY_ID: Record<MetroId, Metro> = METROS.reduce(
  (acc, metro) => {
    acc[metro.id] = metro;
    return acc;
  },
  {} as Record<MetroId, Metro>
);
