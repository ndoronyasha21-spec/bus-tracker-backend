const supabase = require('./supabaseClient');

const EARTH_RADIUS_M = 6371000;

/**
 * Great-circle distance between two lat/lon points, in meters.
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

/**
 * For a bus's new position, check every stop on its route and figure out
 * whether this position triggers an arrival or departure event.
 *
 * State is derived from the most recent event per stop (not kept in memory),
 * so this works correctly even if the server restarts.
 */
async function checkGeofences({ busId, routeId, lat, lon }) {
  if (!routeId) return [];

  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('id, name, lat, lon, radius_m')
    .eq('route_id', routeId);

  if (stopsError) {
    throw new Error(`Failed to load stops: ${stopsError.message}`);
  }

  const triggeredEvents = [];

  for (const stop of stops) {
    const distance = haversineDistanceMeters(lat, lon, stop.lat, stop.lon);
    const isInside = distance <= stop.radius_m;

    // Look up the most recent event for this bus+stop to know the last known state.
    const { data: lastEventRows, error: lastEventError } = await supabase
      .from('events')
      .select('type, created_at')
      .eq('bus_id', busId)
      .eq('stop_id', stop.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (lastEventError) {
      throw new Error(`Failed to load last event: ${lastEventError.message}`);
    }

    const lastEvent = lastEventRows?.[0];
    const wasInside = lastEvent?.type === 'arrival';

    let newEventType = null;
    if (isInside && !wasInside) {
      newEventType = 'arrival';
    } else if (!isInside && wasInside) {
      newEventType = 'departure';
    }

    if (newEventType) {
      const { error: insertError } = await supabase.from('events').insert({
        bus_id: busId,
        stop_id: stop.id,
        type: newEventType,
      });

      if (insertError) {
        throw new Error(`Failed to insert event: ${insertError.message}`);
      }

      triggeredEvents.push({ stopId: stop.id, stopName: stop.name, type: newEventType });
    }
  }

  return triggeredEvents;
}

module.exports = { checkGeofences, haversineDistanceMeters };
