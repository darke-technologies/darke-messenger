/**
 * Drop this on https://www.darkemessenger.com (before </body>).
 * Unique visitors per invite link: https://www.darkemessenger.com/?ref=<username>
 *
 * Set your public Supabase URL + anon key (same values as the DARKE app .env).
 */
(function () {
  var SUPABASE_URL = "YOUR_SUPABASE_URL";
  var SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

  try {
    var params = new URLSearchParams(window.location.search);
    var referrer = (params.get("ref") || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!referrer) return;

    var vid = localStorage.getItem("darke_vid");
    if (!vid) {
      vid =
        crypto.randomUUID && crypto.randomUUID()
          ? crypto.randomUUID()
          : "v" + String(Date.now()) + Math.random().toString(36).slice(2);
      localStorage.setItem("darke_vid", vid);
    }

    var url = String(SUPABASE_URL).replace(/\/$/, "") + "/rest/v1/rpc/record_invite_visit";
    fetch(url, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ referrer: referrer, visitor_key: vid }),
      keepalive: true,
    }).catch(function () {});
  } catch (e) {}
})();
