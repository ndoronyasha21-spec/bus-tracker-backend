const supabase = require('./supabaseClient');

const MS_TO_KMH = 3.6;
const DEFAULT_LIMIT_KMH = 30;
const VIOLATION_COOLDOWN_SECONDS = 30; // log at most one violation per bus per 30s
const LIMIT_CACHE_TTL_MS = 60 * 1000; // re-read a route's limit at most once a minute

const limitCache = new Map(); // routeId -> { limitKmh, fetchedAt }

/**
 * Metres/second -> km/h, rounded to one decimal place. Rounding means a reading that is
 * "exactly at the limit" is never counted as speeding because of floating-point noise,
 * and it matches the precision shown to the driver.
 */
function toKmh(speedMps) {
  return Math.round((speedMps || 0) * MS_TO_KMH * 10) / 10;
}

/**
 * A route's speed limit in km/h. Cached briefly so we aren't querying the database
 * on every GPS update. Falls back to a default if the column/route can't be read.
 */
async function getSpeedLimitKmh(routeId) {
  if (!routeId) return DEFAULT_LIMIT_KMH;

  const cached = limitCache.get(routeId);
  if (cached && Date.now() - cached.fetchedAt < LIMIT_CACHE_TTL_MS) {
    return cached.limitKmh;
  }

  const { data, error } = await supabase
    .from('routes')
    .select('speed_limit_kmh')
    .eq('id', routeId)
    .maybeSingle();

  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[speed] could not read speed limit, using default: ${error.message}`);
  }

  const limitKmh =
    !error && data && data.speed_limit_kmh != null
      ? Number(data.speed_limit_kmh)
      : DEFAULT_LIMIT_KMH;

  limitCache.set(routeId, { limitKmh, fetchedAt: Date.now() });
  return limitKmh;
}

/**
 * Checks the latest reading against the route's limit.
 *
 * - `speeding` is true the moment a single reading is over the limit (the driver app
 *   uses this to show an immediate warning).
 * - A violation is only LOGGED when the previous reading was also over the limit (so one
 *   noisy GPS spike doesn't count) and none was logged for this bus in the last 30s (so a
 *   long stretch of speeding isn't logged every few seconds).
 *
 * Call this AFTER the new position row has been inserted, because it looks at the
 * two most recent rows (the newest one is the current reading).
 */
async function checkSpeed({ busId, routeId, lat, lon, speedMps }) {
  const limitKmh = await getSpeedLimitKmh(routeId);
  const speedKmh = toKmh(speedMps);
  const speeding = speedKmh > limitKmh;

  const result = { speedKmh, limitKmh, speeding, violationLogged: false };
  if (!speeding) return result; // the common case: no extra database queries at all

  const { data: lastTwo, error: positionsError } = await supabase
    .from('positions')
    .select('speed')
    .eq('bus_id', busId)
    .order('id', { ascending: false })
    .limit(2);

  if (positionsError) {
    throw new Error(`Failed to load recent positions: ${positionsError.message}`);
  }

  const previous = lastTwo && lastTwo[1];
  if (!previous || toKmh(previous.speed) <= limitKmh) {
    return result; // first over-limit reading: wait for confirmation
  }

  const since = new Date(Date.now() - VIOLATION_COOLDOWN_SECONDS * 1000).toISOString();
  const { data: recent, error: recentError } = await supabase
    .from('speed_violations')
    .select('id')
    .eq('bus_id', busId)
    .gte('created_at', since)
    .limit(1);

  if (recentError) {
    throw new Error(`Failed to check recent violations: ${recentError.message}`);
  }
  if (recent && recent.length > 0) {
    return result; // already logged one very recently
  }

  const { error: insertError } = await supabase.from('speed_violations').insert({
    bus_id: busId,
    route_id: routeId || null,
    speed_kmh: speedKmh,
    limit_kmh: limitKmh,
    lat,
    lon,
  });

  if (insertError) {
    throw new Error(`Failed to log violation: ${insertError.message}`);
  }

  result.violationLogged = true;
  return result;
}

module.exports = { checkSpeed, getSpeedLimitKmh };
