// log-steps: the simple doorway for the iPhone Shortcut.
// One personal link does everything, no headers or JSON needed:
//   GET https://<project>.supabase.co/functions/v1/log-steps?key=YOUR_KEY&steps=8421
// It forwards to the log_steps database function, which checks the key and saves the count.
// Deployed with JWT verification OFF so the Shortcut doesn't need to log in; the steps key is the secret.
Deno.serve(async (req) => {
  const u = new URL(req.url);
  const key = (u.searchParams.get("key") || "").trim();
  const raw = (u.searchParams.get("steps") || "").trim();
  // "8,421" or "8421.0" -> 8421. Blank = no steps recorded yet today (e.g. just after midnight) -> 0.
  const digits = raw.replace(/[^0-9.]/g, "");
  const steps = digits === "" ? 0 : Number(digits);
  if (!key) {
    return new Response("Gym Streak: the link is missing your key. Copy your link again from the app (You tab).", { status: 400 });
  }
  if (!Number.isFinite(steps)) {
    return new Response("Gym Streak: couldn't read the step count: " + raw, { status: 400 });
  }
  const res = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/rpc/log_steps", {
    method: "POST",
    headers: { apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ p_key: key, p_steps: steps }),
  });
  const body = await res.json().catch(() => null);
  const msg = res.ok ? String(body) : (body?.message ?? "Something went wrong");
  return new Response("Gym Streak: " + msg, {
    status: res.ok ? 200 : 400,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
