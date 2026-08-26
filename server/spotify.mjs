/**
 * Spotify Web API client (Client Credentials flow).
 *
 * Public playlists can be read with a simple app token issued to the
 * Spotify App's client_id/client_secret — no user OAuth is required.
 */

import { httpRequestJson } from './servicePollers.mjs';

const API_BASE = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

let cachedToken = null;

export function hasSpotifyCredentials(spotify) {
  return Boolean(spotify && spotify.clientId && spotify.clientSecret);
}

/** Return a valid (cached or fresh) Spotify access token. */
export async function getSpotifyToken(spotify) {
  if (!hasSpotifyCredentials(spotify)) throw new Error('Spotify credentials not configured');
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const cred = Buffer.from(`${spotify.clientId}:${spotify.clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

  const res = await httpRequestJson(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${cred}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
    timeout: 8000,
    rejectUnauthorized: true,
  });

  if (!res.access_token) throw new Error('Spotify token response did not include an access_token');
  cachedToken = {
    token: res.access_token,
    expiresAt: Date.now() + (Number(res.expires_in || 3600) - 60) * 1000,
  };
  return cachedToken.token;
}

async function spotifyGet(spotify, path, label = '') {
  const token = await getSpotifyToken(spotify);
  try {
    return await httpRequestJson(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
      rejectUnauthorized: true,
    });
  } catch (err) {
    throw enrichSpotifyError(err, label || path);
  }
}

/** Rewrite a raw Spotify HTTP error into a clear, friendly message. */
function enrichSpotifyError(err, label) {
  const msg = err.message || String(err);
  const m = msg.match(/HTTP (\d{3}):\s*(.*)$/s);
  if (!m) return err;
  const status = Number(m[1]);
  let detail = m[2];
  try {
    const j = JSON.parse(detail);
    detail = j?.error?.message || j?.message || detail;
  } catch {
    /* keep raw text */
  }

  let hint = null;
  if (status === 401) hint = 'Spotify rejected the API token — double-check your Client ID / Client Secret in Settings.';
  if (status === 403)
    hint =
      'Spotify returned 403 Forbidden. This playlist is likely private — only PUBLIC playlists can be read with an app token. Make the playlist public, or add OAuth for private playlists.';
  if (status === 404) hint = 'That Spotify playlist was not found. Check the URL / playlist ID.';
  if (status === 429) hint = 'Spotify is rate-limiting requests. Wait a moment and try again.';

  const error = new Error(hint ? `${hint} (${detail})` : `Spotify request failed (${status}): ${detail}`);
  error.status = status;
  error.label = label;
  return error;
}

function playlistIdFromInput(input) {
  let id = input.trim();
  const match = id.match(/playlist[/]([A-Za-z0-9]+)/);
  if (match) id = match[1];
  const uriMatch = id.match(/^spotify:playlist:([A-Za-z0-9]+)$/);
  if (uriMatch) id = uriMatch[1];
  return id;
}

/** Search for public playlists by query string. */
export async function searchSpotifyPlaylists(spotify, query, limit = 10) {
  if (!query.trim()) return [];
  const res = await spotifyGet(
    spotify,
    `/search?type=playlist&q=${encodeURIComponent(query)}&limit=${Math.min(50, Math.max(1, limit))}`
  );
  const items = res?.playlists?.items || [];
  return items.map((p) => ({
    id: p.id,
    name: p.name || 'Untitled Playlist',
    description: p.description || '',
    owner: p.owner?.display_name || 'Unknown',
    trackCount: p.tracks?.total || 0,
    imageUrl: p.images?.[0]?.url || undefined,
    url: p.external_urls?.spotify || `https://open.spotify.com/playlist/${p.id}`,
  }));
}

/**
 * Fetch all tracks from a playlist (paginated).
 * Returns: { id, name, owner, imageUrl, tracks: [{ title, artist, album, trackId, isrc }] }
 */
export async function fetchSpotifyPlaylist(spotify, input) {
  const id = playlistIdFromInput(input);
  if (!id) throw new Error('Invalid Spotify playlist URL or ID');

  const info = await spotifyGet(spotify, `/playlists/${id}?fields=id,name,description,owner,images,tracks.total,external_urls`, 'loading playlist info');
  const tracks = [];
  let url = `/playlists/${id}/tracks?limit=50`;
  while (url) {
    const page = await spotifyGet(spotify, url, 'loading playlist tracks');
    for (const item of page.items || []) {
      const t = item.track;
      if (!t) continue; // skip local / unavailable tracks
      const artists = (t.artists || []).map((a) => a.name).join(', ') || 'Unknown Artist';
      tracks.push({
        title: t.name || 'Unknown Track',
        artist: artists,
        album: t.album?.name || 'Unknown Album',
        trackId: t.id,
        isrc: (t.external_ids && t.external_ids.isrc) || undefined,
      });
    }
    url = page.next ? page.next.replace(API_BASE, '') : null;
  }

  return {
    id,
    name: info.name || 'Playlist',
    description: info.description || '',
    owner: info.owner?.display_name || 'Unknown',
    trackCount: info.tracks?.total || tracks.length,
    imageUrl: info.images?.[0]?.url,
    url: info.external_urls?.spotify || `https://open.spotify.com/playlist/${id}`,
    tracks,
  };
}