// Geotag + timestamp overlay burn-in (D-02): the overlay is rendered onto
// the capture canvas BEFORE canvas.toBlob() so it becomes part of the
// stored image bytes, not a separate CSS layer that could be stripped or
// spoofed after the fact. RESEARCH.md "Canvas capture with orientation-safe
// sizing + overlay burn-in".

export type OverlayCoordinates = {
  lat: number;
  lng: number;
};

// India-locale date/time via Intl (not moment — CLAUDE.md Supporting
// Libraries guidance). A fixed IANA zone keeps the burned-in timestamp
// deterministic regardless of the capturing device's own timezone setting,
// which matters for an India-only product where "23 Jul 2026, 14:03" should
// always read as IST.
const OVERLAY_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kolkata",
});

// Formats "12.9716, 77.5946 · ±18m · 23 Jul 2026, 14:03". Accuracy is
// defensively clamped to a non-negative integer — `coords.accuracy` should
// never be negative in practice, but the overlay must never render a
// nonsensical "±-5m" if some browser ever produces one. Very large
// (imprecise) accuracy values are rendered in full rather than truncated
// here; graceful wrapping/truncation of the whole overlay line at narrow
// photo aspect ratios is `drawOverlay`'s job, not this formatter's.
export function formatOverlayText(
  coords: OverlayCoordinates,
  accuracy: number,
  date: Date,
): string {
  const lat = coords.lat.toFixed(4);
  const lng = coords.lng.toFixed(4);
  const safeAccuracy = Number.isFinite(accuracy) ? Math.max(0, Math.round(accuracy)) : 0;
  const formattedDate = OVERLAY_DATE_FORMATTER.format(date);

  return `${lat}, ${lng} · ±${safeAccuracy}m · ${formattedDate}`;
}

const OVERLAY_PADDING_PX = 12;
const OVERLAY_MAX_LINES = 2;

function wrapOverlayLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current === "" || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === OVERLAY_MAX_LINES - 1) break;
  }
  if (current) lines.push(current);
  if (lines.length > OVERLAY_MAX_LINES) lines.length = OVERLAY_MAX_LINES;

  // Graceful truncation: if the last line still overflows the available
  // width (e.g. a single very long accuracy string with no break points),
  // ellipsize it rather than letting it spill past the canvas edge.
  const lastIndex = lines.length - 1;
  const last = lines[lastIndex];
  if (last && ctx.measureText(last).width > maxWidth) {
    let truncated = last;
    while (truncated.length > 1 && ctx.measureText(`${truncated}…`).width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    lines[lastIndex] = `${truncated}…`;
  }

  return lines;
}

// Draws a semi-opaque bar across the bottom of the canvas with the overlay
// text in white on top, wrapping (up to 2 lines) or truncating gracefully
// for narrow photo aspect ratios / long accuracy strings (UI-SPEC backstop
// item). Must be called BEFORE canvas.toBlob so the overlay is burned into
// the stored bytes.
export function drawOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  text: string,
): void {
  const fontSize = Math.max(14, Math.round(canvas.width * 0.028));
  const lineHeight = Math.round(fontSize * 1.3);
  const maxTextWidth = canvas.width - OVERLAY_PADDING_PX * 2;

  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "bottom";
  const lines = wrapOverlayLines(ctx, text, maxTextWidth);

  const barHeight = lines.length * lineHeight + OVERLAY_PADDING_PX;
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);

  ctx.fillStyle = "white";
  ctx.font = `${fontSize}px sans-serif`;
  ctx.textBaseline = "bottom";
  lines.forEach((line, index) => {
    const y = canvas.height - OVERLAY_PADDING_PX - (lines.length - 1 - index) * lineHeight;
    ctx.fillText(line, OVERLAY_PADDING_PX, y);
  });
}
