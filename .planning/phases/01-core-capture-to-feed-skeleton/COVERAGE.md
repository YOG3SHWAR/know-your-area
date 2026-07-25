# API Coverage — Cloudflare R2 (S3-compatible, via @aws-sdk/client-s3)

> Full coverage by default. Opt-outs are explicit, reasoned decisions.
>
> Phase 1 integrates exactly one external service surface: object storage on Cloudflare R2 through the
> S3-compatible AWS SDK v3 client + presigner. The capability surface below is the S3 object/bucket API;
> Phase 1 uses only the presigned-PUT write path plus public-URL reads. Everything else is opt-out for
> this phase with a reason. (Supabase Postgres and the browser Geolocation/MediaStream Web APIs are not
> "external API integrations" in the coverage sense — they are the datastore and platform primitives.)

| capability | decision | reason |
|---|---|---|
| presign PutObject (upload photo) | INTEGRATE | Core write path — browser PUTs the captured photo blob to a server-minted, `ContentType`-pinned, server-generated-key presigned URL. |
| serve object via public/CDN URL (read photo) | INTEGRATE | Feed cards and permalink pages display the stored photo via its R2 public object URL (Next.js `<Image>`); no SDK GetObject call needed for public reads. |
| bucket CORS configuration | INTEGRATE | Required for direct browser→R2 PUT to succeed; configured once on the bucket as `user_setup` (allow PUT from the app origin), not an SDK call. |
| presign GetObject (private/time-limited read) | OPT-OUT | not needed — Phase 1 photos are public on the feed; no private-object access pattern exists yet. |
| DeleteObject | OPT-OUT | not needed yet — no takedown/removal path until Phase 6 (ENGAGE-04); revisit then. |
| HeadObject / server-side object validation | OPT-OUT | not needed yet — `ContentType` is pinned at presign time; deep image sanity-check + AI verification land in Phase 4. Tracked as a Phase-4 follow-up. |
| ListObjects / ListBuckets | OPT-OUT | not needed — the app never enumerates storage; object keys are derived deterministically from the complaint `publicId`. |
| CopyObject | OPT-OUT | not needed — no duplication/move workflow in Phase 1. |
| multipart upload | OPT-OUT | not needed — a single compressed camera photo is well under the single-PUT ceiling; multipart adds no value at this size. |
| lifecycle / retention rules | OPT-OUT | not needed yet — retention/expiry policy is a Phase 6 compliance concern (IT Rules), not MVP skeleton. |
| bucket create/delete (control plane) | OPT-OUT | explicitly out of scope — the bucket is provisioned once by a human via `user_setup`, never managed by app code. |

---

## Gap Closure — Round 3 (plan 01-09)

No external API integration: this round is a pure client-side canvas text-wrapping bugfix in an already-shipped function (`wrapOverlayLines` in `src/lib/overlay.ts`) plus unit-test hardening (`tests/unit/overlay.test.ts`) — no new API/SDK/service is touched, so the R2 capability matrix above is unchanged and no new coverage decision is required.
