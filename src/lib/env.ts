// WR-04: required env vars were previously accessed with blind `!`
// non-null assertions across the DB client and R2 client. When one is
// missing/misspelled, failure used to happen deep inside a third-party
// library at request time with an opaque error (e.g. a literal
// `"undefined"` baked into the R2 endpoint URL). `requireEnv` fails fast
// with a clear, descriptive error at module load instead.
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}
