# Bus Tracker Backend

Express API for the NCSC203 university bus tracker MVP. Sits in front of Supabase, handling
geofencing (arrival/departure detection) and ETA calculation.

## Setup

1. Create a Supabase project at https://supabase.com
2. In the Supabase SQL Editor, run `../supabase/schema.sql`
3. Copy `.env.example` to `.env` and fill in your `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
   (Project Settings → API → use the **service_role** key here, not the anon key)
4. Install dependencies:
   ```
   npm install
   ```
5. Run the dev server:
   ```
   npm run dev
   ```
6. Confirm it's up: `GET http://localhost:3000/health` should return `{ "status": "ok" }`

## Endpoints

### `POST /api/location`
Called by the driver app on a timer.

```json
{
  "busId": "uuid-of-the-bus-row",
  "routeId": "uuid-of-the-route",
  "lat": -17.821,
  "lon": 31.053,
  "speed": 3.2
}
```

Updates the bus's position in Supabase and checks every stop on the route for arrival/departure.
Returns any events that were triggered:

```json
{ "ok": true, "events": [{ "stopId": "...", "stopName": "Library", "type": "arrival" }] }
```

### `GET /api/eta?busId=...&stopId=...`
Called by the passenger app. Returns straight-line distance and a simple ETA:

```json
{ "distanceMeters": 412.3, "etaSeconds": 137.4 }
```

## Notes

- Realtime updates to the passenger app happen via **Supabase Realtime**, subscribed to
  directly from the React Native app — this API doesn't push updates itself, it only handles
  writes and the logic Supabase's auto-generated REST API can't express (geofencing, ETA).
- The service role key bypasses Row Level Security — never expose this key to the mobile app.
  The app should use the Supabase **anon** key with the RLS policies in `schema.sql`.
