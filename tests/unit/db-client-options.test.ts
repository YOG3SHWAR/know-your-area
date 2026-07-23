import { beforeAll, describe, expect, it } from "vitest";

// Importing @/lib/db/client eagerly instantiates the postgres.js client via
// requireEnv("DATABASE_URL"). ES module imports are hoisted above ordinary
// top-level statements, so a plain `process.env.DATABASE_URL = ...` line
// placed before a static `import` would still run *after* the imported
// module's own top-level code. Set the dummy env var in `beforeAll`, then
// dynamically import the module so evaluation order is guaranteed —
// nothing here opens a real database connection.
let buildClientOptions: (typeof import("@/lib/db/client"))["buildClientOptions"];

beforeAll(async () => {
  process.env.DATABASE_URL ??= "postgres://u:p@localhost:5432/db";
  ({ buildClientOptions } = await import("@/lib/db/client"));
});

describe("buildClientOptions", () => {
  it("disables ssl for localhost", () => {
    expect(buildClientOptions("postgres://u:p@localhost:5432/db")).toEqual({
      prepare: false,
      ssl: false,
    });
  });

  it("disables ssl for 127.0.0.1", () => {
    expect(buildClientOptions("postgres://u:p@127.0.0.1:5432/db")).toEqual({
      prepare: false,
      ssl: false,
    });
  });

  it("requires ssl for a Supabase pooler host", () => {
    expect(
      buildClientOptions(
        "postgres://u:p@aws-0-ap-south-1.pooler.supabase.com:6543/postgres",
      ),
    ).toEqual({
      prepare: false,
      ssl: "require",
    });
  });

  it("requires ssl for a direct Supabase host", () => {
    expect(
      buildClientOptions("postgres://u:p@db.xxxx.supabase.co:5432/postgres"),
    ).toEqual({
      prepare: false,
      ssl: "require",
    });
  });

  it("always sets prepare:false", () => {
    expect(buildClientOptions("postgres://u:p@localhost:5432/db").prepare).toBe(false);
    expect(
      buildClientOptions("postgres://u:p@db.xxxx.supabase.co:5432/postgres").prepare,
    ).toBe(false);
  });
});
