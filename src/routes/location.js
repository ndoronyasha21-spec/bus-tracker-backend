const express = require('express');
const supabase = require('../services/supabaseClient');
const { checkGeofences } = require('../services/geofencing');
const { checkSpeed } = require('../services/speed');
const { estimateEta } = require('../services/eta');

const router = express.Router();

/**
 * POST /api/location
 * Called by the driver app every few seconds.
 * Body: { busId, routeId, lat, lon, speed }   (speed in metres per second)
 *
 * Updates the bus's live position, records the reading in the history table, checks
 * the speed limit, and checks stop geofences.
 */
router.post('/location', async (req, res) => {
  const { busId, routeId, lat, lon, speed } = req.body;

  if (!busId || lat === undefined || lon === undefined) {
    return res.status(400).json({ error: 'busId, lat, and lon are required' });
  }

  try {
    const { error: updateError } = await supabase
      .from('buses')
      .update({
        current_lat: lat,
        current_lon: lon,
        speed: speed ?? 0,
        status: 'active',
        last_updated: new Date().toISOString(),
      })
      .eq('id', busId);

    if (updateError) {
      return res.status(500).json({ error: `Failed to update bus position: ${updateError.message}` });
    }

    // History + speed check are best-effort: if either fails (for example the database
    // migration hasn't been run yet) we log it, but live tracking must keep working.
    let speedInfo = null;
    try {
      const { error: positionError } = await supabase
        .from('positions')
        .insert({ bus_id: busId, lat, lon, speed: speed ?? 0 });

      if (positionError) {
        // eslint-disable-next-line no-console
        console.error(`[positions] insert failed: ${positionError.message}`);
      }

      speedInfo = await checkSpeed({ busId, routeId, lat, lon, speedMps: speed ?? 0 });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[speed] check failed: ${err.message}`);
    }

    const events = await checkGeofences({ busId, routeId, lat, lon });

    return res.status(200).json({ ok: true, events, speed: speedInfo });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/eta?busId=...&stopId=...
 * Called by the passenger app to get an ETA to a chosen stop.
 */
router.get('/eta', async (req, res) => {
  const { busId, stopId } = req.query;

  if (!busId || !stopId) {
    return res.status(400).json({ error: 'busId and stopId query params are required' });
  }

  try {
    const { data: bus, error: busError } = await supabase
      .from('buses')
      .select('current_lat, current_lon, speed')
      .eq('id', busId)
      .single();

    if (busError || !bus) {
      return res.status(404).json({ error: 'Bus not found' });
    }

    const { data: stop, error: stopError } = await supabase
      .from('stops')
      .select('lat, lon')
      .eq('id', stopId)
      .single();

    if (stopError || !stop) {
      return res.status(404).json({ error: 'Stop not found' });
    }

    const { distanceMeters, etaSeconds } = estimateEta({
      busLat: bus.current_lat,
      busLon: bus.current_lon,
      busSpeedMps: bus.speed,
      stopLat: stop.lat,
      stopLon: stop.lon,
    });

    return res.status(200).json({ distanceMeters, etaSeconds });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
