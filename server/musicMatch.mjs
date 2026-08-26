/**
 * Music library comparison + Lidarr orchestration.
 *
 * Compares Spotify playlist tracks against a Lidarr library index
 * (artists + their albums / records) and exposes helpers to add a
 * missing artist via Lidarr's API.
 */

import { httpRequestJson } from './servicePollers.mjs';

function arrHeaders(service) {
  const key = ((service && service.apiKey) || '').trim();
  if (!key) throw new Error('The Lidarr service is missing an API key');
  return { 'X-Api-Key': key };
}

function lidarrBase(service) {
  return (service.host || '').replace(/\/+$/, '');
}

/** Pick the first enabled Lidarr service. */
export function pickLidarrService(homelabConfig) {
  const services = homelabConfig.services || [];
  return services.find((s) => s.type === 'lidarr' && !s.disabled) || null;
}

/**
 * Fetch all Lidarr artists and build a normalized lookup index.
 * Returns { artistsMap, artistNames, albumTitles }.
 */
export async function buildLidarrIndex(lidarrService) {
  const base = lidarrBase(lidarrService);
  const headers = arrHeaders(lidarrService);
  const artists = await httpRequestJson(`${base}/api/v1/artist`, { headers, timeout: 10000 });

  const artistsMap = new Map(); // normalized name + musicbrainzId -> artist record
  const albumTitles = new Set();

  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9+]+/g, ' ')
      .trim();

  for (const artist of (Array.isArray(artists) ? artists : [])) {
    const key = normalize(artist.artistName);
    if (key) artistsMap.set(`${key}|${normalize(artist.foreignArtistId)}`, artist);
    for (const album of artist.albums || []) {
      const title = normalize(album.title);
      if (title) albumTitles.add(`${key}|${title}`);
    }
  }

  return { artistsMap, albumTitles };
}

/**
 * Compare Spotify tracks against the Lidarr index.
 * status: 'exists' | 'missingAlbum' | 'missing' | 'unknown'
 */
export function matchTracks(tracks, index) {
  const normalize = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  return (tracks || []).map((t) => {
    // Use the first-listed artist (frequently the primary artist on Spotify).
    const artistName = String(t.artist || '').split(',')[0].trim();
    const aKey = normalize(artistName);
    const albumKey = normalize(t.album);

    const artistFound = aKey && [...index.artistsMap.keys()].some((k) => k.startsWith(`${aKey}|`));

    let status = 'missing';
    if (artistFound && albumKey && index.albumTitles.has(`${aKey}|${albumKey}`)) {
      status = 'exists';
    } else if (artistFound) {
      status = 'missingAlbum';
    } else {
      status = 'missing';
    }

    return {
      title: t.title,
      artist: artistName,
      allArtists: t.artist,
      album: t.album,
      trackId: t.trackId,
      isrc: t.isrc,
      status,
    };
  });
}

/** Search Lidarr's artist lookup endpoint for a term. */
export async function lookupLidarrArtist(lidarrService, term) {
  const base = lidarrBase(lidarrService);
  const headers = arrHeaders(lidarrService);
  const res = await httpRequestJson(
    `${base}/api/v1/artist/lookup?term=${encodeURIComponent(term)}`,
    { headers, timeout: 10000 }
  );
  return Array.isArray(res) ? res : [];
}

/**
 * Add an artist to Lidarr using lookup results.
 * Resolves the best match by name, then POSTs /api/v1/artist.
 * defaults: { rootFolderPath?, qualityProfileId?, metadataProfileId?, monitor? }
 */
export async function addArtistToLidarr(lidarrService, name, defaults = {}) {
  const base = lidarrBase(lidarrService);
  const headers = arrHeaders(lidarrService);

  const lookupResults = await lookupLidarrArtist(lidarrService, name);
  const match =
    lookupResults.find((a) => {
      const n = (a.artistName || '').toLowerCase().trim();
      return n === name.toLowerCase().trim();
    }) || lookupResults[0];
  if (!match) throw new Error(`No Lidarr match found for "${name}"`);

  const qualityProfileId =
    defaults.qualityProfileId ?? match.qualityProfileId ?? (await firstQualityProfileId(lidarrService));
  const metadataProfileId = defaults.metadataProfileId ?? match.metadataProfileId ?? 1;
  const rootFolderPath =
    defaults.rootFolderPath ?? match.rootFolderPath ?? (await firstRootFolderPath(lidarrService));

  if (!rootFolderPath) throw new Error('No Lidarr root folder is configured to add this artist to');
  if (!qualityProfileId) throw new Error('No Lidarr quality profile is available');

  const body = {
    artistName: match.artistName || match.id,
    foreignArtistId: match.foreignArtistId || match.id,
    images: match.images || [],
    links: match.links || [],
    monitored: defaults.monitor !== false,
    rootFolderPath,
    qualityProfileId,
    metadataProfileId,
    addOptions: {
      monitor: 'all',
      searchForNewAlbum: defaults.searchForNewAlbum !== false,
    },
  };

  const res = await httpRequestJson(`${base}/api/v1/artist`, {
    method: 'POST',
    headers,
    body,
    timeout: 15000,
  });
  return res;
}

async function firstQualityProfileId(lidarrService) {
  const base = lidarrBase(lidarrService);
  const headers = arrHeaders(lidarrService);
  try {
    const res = await httpRequestJson(`${base}/api/v1/qualityprofile`, { headers, timeout: 8000 });
    return (Array.isArray(res) && res[0]?.id) || null;
  } catch {
    return null;
  }
}

async function firstRootFolderPath(lidarrService) {
  const base = lidarrBase(lidarrService);
  const headers = arrHeaders(lidarrService);
  try {
    const res = await httpRequestJson(`${base}/api/v1/rootfolder`, { headers, timeout: 8000 });
    return (Array.isArray(res) && res[0]?.path) || null;
  } catch {
    return null;
  }
}