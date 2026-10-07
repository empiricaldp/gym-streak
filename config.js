// Supabase connection settings.
// These two values are PUBLIC by design: every visitor's browser needs them to talk to the database.
// The data is protected by the Row Level Security rules in supabase/schema.sql, not by hiding these.
// NEVER put the service_role / secret key or the database password in this file.
window.GYM_CONFIG = {
  SUPABASE_URL: "",       // e.g. "https://abcd1234.supabase.co"
  SUPABASE_ANON_KEY: ""   // the "anon" / "publishable" key
};
