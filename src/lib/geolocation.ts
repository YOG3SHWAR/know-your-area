export type GeoFix = {
  lat: number;
  lng: number;
  accuracy: number;
};

// D-04 / RESEARCH.md Pitfall 4: the first `getCurrentPosition` callback is
// often the least accurate reading (GPS still "warming up", especially in
// dense urban areas), so a single-shot read can produce 50m+ errors.
// `captureBestFix` instead runs a `waitMs` wait-for-fix window with
// `watchPosition`, keeps the best-accuracy reading seen, clears the watch,
// and resolves with whatever accuracy resulted — submission is never
// blocked on an accuracy threshold. If no reading arrives in the window it
// rejects with a distinct `no-fix` error rather than ever resolving a
// fabricated/default coordinate (D-03). Location is always read live from
// the browser here, never from image EXIF (SUBM-03).
export function captureBestFix(waitMs = 4000): Promise<GeoFix> {
  return new Promise((resolve, reject) => {
    let best: GeolocationPosition | null = null;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        if (!best || position.coords.accuracy < best.coords.accuracy) {
          best = position;
        }
      },
      (err) => {
        // Only reject here if we truly never got a reading — an error
        // callback firing after we already have a `best` reading (e.g. a
        // late timeout from the underlying watch) must not clobber it.
        if (!best) reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: waitMs },
    );

    setTimeout(() => {
      navigator.geolocation.clearWatch(watchId);
      if (best) {
        resolve({
          lat: best.coords.latitude,
          lng: best.coords.longitude,
          accuracy: best.coords.accuracy,
        });
      } else {
        reject(new Error("no-fix"));
      }
    }, waitMs);
  });
}
