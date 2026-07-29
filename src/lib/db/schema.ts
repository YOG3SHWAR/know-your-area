import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  geometry,
  index,
  integer,
  timestamp,
  boolean,
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

// Better Auth core tables (generated via `npx @better-auth/cli generate`,
// merged into this file to keep a single schema source — RESEARCH.md
// Assumption A3: default singular table names, `usePlural` not set).
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
