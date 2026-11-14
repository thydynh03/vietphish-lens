export async function safeBrowsing(url) {
  const key = process.env.SAFE_BROWSING_KEY;
  if (!key) return "skipped";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 3000);

  try {
    const res = await fetch("https://safebrowsing.googleapis.com/v4/threatMatches:find?key=" + encodeURIComponent(key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        client: { clientId: "vietphish-lens", clientVersion: "1.0.0" },
        threatInfo: {
          threatTypes: ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE"],
          platformTypes: ["ANY_PLATFORM"],
          threatEntryTypes: ["URL"],
          threatEntries: [{ url }]
        }
      })
    });
    if (!res.ok) return "error";
    const data = await res.json();
    if (data.matches?.length > 0) return "hit";
    return "clean";
  } catch (e) {
    return "error";
  } finally {
    clearTimeout(timer);
  }
}
