// Car Mode Radio: free Creative Commons music from Jamendo. The client id is a public identifier
// meant for apps (not a secret); set VITE_JAMENDO_CLIENT_ID to use your own.
const CLIENT_ID = import.meta.env.VITE_JAMENDO_CLIENT_ID || "41471db3";
const API = "https://api.jamendo.com/v3.0";

export const musicConfigured = () => !!CLIENT_ID;
export const MUSIC_GENRES = ["Chill", "Focus", "Electronic", "Jazz", "Rock", "Ambient", "Hip hop", "Afrobeat"];

export async function fetchTracks({ query = "", tag = "", limit = 24 } = {}) {
  const params = new URLSearchParams({ client_id: CLIENT_ID, format: "json", limit: String(limit), include: "musicinfo", audioformat: "mp32", order: query ? "relevance" : "popularity_total" });
  if (query) params.set("search", query);
  if (tag) params.set("tags", tag.toLowerCase().replace(/\s+/g, ""));
  const res = await fetch(`${API}/tracks/?${params}`);
  if (!res.ok) throw new Error("Couldn't load music.");
  const data = await res.json();
  return (data.results || []).map((t) => ({ id: String(t.id), name: t.name, artist: t.artist_name, image: t.album_image || t.image, audio: t.audio, duration: t.duration }));
}
