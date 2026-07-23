export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

// Basic single-shot GPS read for the Plan 02 tracer: reads live coordinates
// from the browser at submit time (never from image EXIF — RESEARCH.md
// Anti-Patterns/SUBM-03). The 3-5s wait-for-fix `watchPosition` window
// (D-04, RESEARCH.md Pitfall 4) and the hard-block-on-permission-denial flow
// (D-03) are Plan 03's refinement of this same interface.
export function captureBestFix(): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      (error) => reject(error),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10_000 },
    );
  });
}
