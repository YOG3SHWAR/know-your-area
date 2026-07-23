import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Excludes PostGIS-managed catalog tables (e.g. spatial_ref_sys) from
  // introspection so `drizzle-kit push` doesn't prompt a spurious
  // create-vs-rename resolution against them.
  extensionsFilters: ["postgis"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
