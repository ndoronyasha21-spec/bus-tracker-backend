const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  // eslint-disable-next-line no-console
  console.warn(
    '[supabaseClient] SUPABASE_URL or SUPABASE_SERVICE_KEY is missing. ' +
      'Copy .env.example to .env and fill in your Supabase project details.'
  );
}

// Server-side client using the service role key — bypasses RLS.
// Only ever use this on the backend, never ship the service key to the mobile app.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

module.exports = supabase;
