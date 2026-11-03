const express = require('express');
const supabase = require('../services/supabaseClient');
const { checkGeofences } = require('../services/geofencing');
const { estimateEta } = require('../services/eta');

const router = express.Router();

/**
 * POST /api/location
 * Called by the driver app every few seconds.
 * Body: { busId, routeId, lat, lon, speed }
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

    const events = await checkGeofences({ busId, routeId, lat, lon });

    return res.status(200).json({ ok: true, events });
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
