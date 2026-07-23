import { customAlphabet } from "nanoid";

// 32-symbol ambiguity-free alphabet: excludes 0/O, 1/I/L so opaque IDs are
// easy to read aloud, type, or write on a physical sign (D-11).
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// 7 chars (not D-11's literal 5-char example) per RESEARCH.md's collision
// math: 32^5 hits a 1% collision risk at only ~820 IDs, while 32^7 pushes
// that to ~830,000 IDs. The DB UNIQUE constraint + retry-on-conflict insert
// loop (see src/actions/submit-complaint.ts in a later plan) remains the
// actual correctness guarantee regardless of ID-space size.
const generateSuffix = customAlphabet(ALPHABET, 7);

export function generatePublicId(): string {
  return `KYA-${generateSuffix()}`;
}
