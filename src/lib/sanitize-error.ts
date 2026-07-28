// G-01-CR-01 / 01-12: the ONE mechanism every UI-facing catch block routes
// through. Four independent call sites (CameraCapture camera-start +
// geolocation in 01-05, the feed API route in 01-06, CameraCapture's upload
// catch in 01-11, and the missed submitComplaint publish path found in the
// 01-12 code review) each previously re-implemented this same "sanitize an
// error for the user" guard by hand. This utility collapses all of that into
// one implementation: it ALWAYS returns the caller-supplied fixed `fallback`
// string and NEVER returns or interpolates the caught error's own message —
// the console.error log is the only place raw detail ever appears.
export function sanitizeError(error: unknown, fallback: string, context: string): string {
  if (error instanceof Error) {
    const code = (error as Error & { code?: unknown }).code;
    console.error(context, error.name, error.message, code);
  } else {
    console.error(context, String(error));
  }
  return fallback;
}
