import { z } from "zod";

// The 5 fixed categories (kept intentionally small for v1 moderation
// simplicity — see PROJECT.md Out of Scope). Labels match the UI-SPEC
// Copywriting Contract exactly.
export const CATEGORIES = [
  { value: "pothole", label: "Pothole/Road damage" },
  { value: "garbage", label: "Garbage/Sanitation" },
  { value: "streetlight", label: "Streetlight/Electrical" },
  { value: "water", label: "Water/Drainage" },
  { value: "traffic_light", label: "Traffic lights" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [Category, ...Category[]];

// Server-side re-validation of every submission payload (V5 Input
// Validation — never trust client-only enforcement of the category enum
// or the India coordinate bounds). India's bounding box is a coarse sanity
// check, not a precise border.
export const submissionSchema = z.object({
  category: z.enum(CATEGORY_VALUES),
  lat: z.number().min(6.0).max(37.5),
  lng: z.number().min(68.0).max(97.5),
  accuracy: z.number().finite().nonnegative().max(100_000),
  photoKey: z
    .string()
    .regex(/^complaints\/KYA-[A-Z0-9]{7}\.(jpe?g|webp)$/),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

// Shared feed/permalink contract consumed by Plans 02/04 — only the opaque
// publicId is ever exposed, never the internal serial id.
export type FeedItem = {
  publicId: string;
  category: Category;
  distanceM: number | null;
  createdAt: Date;
  photoUrl: string;
};
