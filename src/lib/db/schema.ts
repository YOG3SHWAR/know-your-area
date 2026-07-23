import {
  pgTable,
  serial,
  text,
  geometry,
  index,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

// `id` (serial PK) is internal-only and must never be exposed in any URL,
// API response, or client-visible payload — only `publicId` is externally
// visible (RESEARCH.md Security Domain / IDOR mitigation).
export const complaints = pgTable(
  "complaints",
  {
    id: serial("id").primaryKey(),
    publicId: text("public_id").notNull().unique(),
    submitterId: text("submitter_id").notNull(),
    category: text("category").notNull(),
    // CONFIRMED drizzle-kit 0.31.10 bug (RESEARCH.md Assumption A3): both
    // `drizzle-kit generate` and `drizzle-kit push` silently drop this SRID
    // from the emitted DDL (`geometry(point)` instead of
    // `geometry(point, 4326)`), even though it's declared here. After ANY
    // `drizzle-kit push` (including future ones), re-run:
    //   ALTER TABLE complaints ALTER COLUMN location TYPE geometry(Point, 4326)
    //     USING ST_SetSRID(location, 4326);
    // and verify with:
    //   SELECT srid FROM geometry_columns WHERE f_table_name = 'complaints';
    // (expect 4326, not 0). Re-check whether a newer drizzle-kit fixes this
    // before removing this workaround.
    location: geometry("location", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }).notNull(),
    accuracyM: integer("accuracy_m"),
    photoKey: text("photo_key").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("complaints_location_gist").using("gist", t.location)],
);
