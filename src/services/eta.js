const { haversineDistanceMeters } = require('./geofencing');

/**
 * Very simple ETA: straight-line distance to the target stop divided by
 * current speed. Good enough for an MVP demo; swap for a routed distance
 * and a smoothed/averaged speed later.
 *
 * @returns {{ distanceMeters: number, etaSeconds: number|null }}
 */
function estimateEta({ busLat, busLon, busSpeedMps, stopLat, stopLon }) {
  const distanceMeters = haversineDistanceMeters(busLat, busLon, stopLat, stopLon);

  const MIN_SPEED_MPS = 0.5; // avoid divide-by-zero / huge ETAs when stopped
  if (!busSpeedMps || busSpeedMps < MIN_SPEED_MPS) {
    return { distanceMeters, etaSeconds: null };
  }

  const etaSeconds = distanceMeters / busSpeedMps;
  return { distanceMeters, etaSeconds };
}

module.exports = { estimateEta };
