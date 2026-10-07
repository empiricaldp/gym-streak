// Supabase connection settings.
// These two values are PUBLIC by design: every visitor's browser needs them to talk to the database.
// The data is protected by the Row Level Security rules in supabase/schema.sql, not by hiding these.
// NEVER put the service_role / secret key or the database password in this file.
window.GYM_CONFIG = {
  SUPABASE_URL: "https://ktmntyzswewnnxpzzuhb.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_tanh_bk9W-mi2-jOvhzePg_9FvSE6q0"   // publishable key: safe in public code
};
