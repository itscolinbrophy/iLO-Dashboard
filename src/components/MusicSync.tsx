import { useEffect, useState } from 'react';
import { Icon } from './common/Icon';
import {
  fetchMusicConfig,
  searchSpotifyPlaylists,
  compareMusicPlaylist,
  addLidarrArtist,
} from '../api/homelabClient';
import type {
  SpotifyConfig,
  SpotifyPlaylist,
  CompareTrack,
  MusicCompareResult,
  MusicTrackStatus,
} from '../types/homelab';

interface MusicSyncProps {
  config?: SpotifyConfig;
  onOpenSettings: () => void;
}

const STATUS_META: Record<MusicTrackStatus, { label: string; cls: string }> = {
  exists: { label: 'In Library', cls: 'exists' },
  missing: { label: 'Missing', cls: 'missing' },
  missingAlbum: { label: 'Artist Only', cls: 'missing-album' },
};

export function MusicSync({ config, onOpenSettings }: MusicSyncProps) {
  const [cfg, setCfg] = useState<SpotifyConfig | null>(config || null);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SpotifyPlaylist[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    playlist: NonNullable<NonNullable<MusicCompareResult>['playlist']>;
    tracks: CompareTrack[];
    counts: Record<MusicTrackStatus, number>;
  } | null>(null);
  const [compareError, setCompareError] = useState<string | null>(null);

  const [busyArtists, setBusyArtists] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<{ id: number; msg: string; ok: boolean }[]>([]);

  useEffect(() => {
    fetchMusicConfig()
      .then((c) => setCfg(c))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (config) setCfg(config);
  }, [config]);

  const pushToast = (msg: string, ok: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, msg, ok }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchSpotifyPlaylists(query.trim());
      if (!res.ok) {
        setSearchError(res.error || 'Search failed');
        setSearchResults([]);
      } else {
        setSearchResults(res.playlists);
      }
    } catch (err: any) {
      setSearchError(err.message || 'Search failed');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleCompare = async (target?: string) => {
    const value = target || input;
    if (!value.trim()) return;
    setLoading(true);
    setCompareError(null);
    try {
      const res = await compareMusicPlaylist(value.trim());
      if (!res.ok || !res.playlist || !res.tracks) {
        setCompareError(res.error || 'Comparison failed');
        setResult(null);
      } else {
        setResult({
          playlist: res.playlist,
          tracks: res.tracks,
          counts: (res.counts || { exists: 0, missing: 0, missingAlbum: 0 }) as Record<MusicTrackStatus, number>,
        });
      }
    } catch (err: any) {
      setCompareError(err.message || 'Comparison failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const runAddArtist = async (artist: string, opts?: Parameters<typeof addLidarrArtist>[1]) => {
    if (!artist) return;
    setBusyArtists((prev) => new Set(prev).add(artist));
    try {
      const res = await addLidarrArtist(artist, opts);
      pushToast(
        res.ok
          ? `Added "${res.name || artist}" to Lidarr`
          : `Failed to add "${artist}": ${res.error || 'Unknown error'}`,
        res.ok
      );
    } catch (err: any) {
      pushToast(`Failed to add "${artist}": ${err.message}`, false);
    } finally {
      setBusyArtists((prev) => {
        const next = new Set(prev);
        next.delete(artist);
        return next;
      });
    }
  };

  const handleAddAll = async () => {
    if (!result) return;
    const missingArtists = Array.from(
      new Set(
        result.tracks
          .filter((t) => t.status !== 'exists')
          .map((t) => t.artist)
          .filter(Boolean)
      )
    );
    for (const artist of missingArtists) {
      pushToast(`Adding "${artist}" to Lidarr…`, true);
      await runAddArtist(artist);
    }
  };

  const missingArtists = result
    ? Array.from(new Set(result.tracks.filter((t) => t.status !== 'exists').map((t) => t.artist).filter(Boolean)))
    : [];
  const [filter, setFilter] = useState<'all' | MusicTrackStatus>('all');

  const visibleTracks =
    result && filter === 'all' ? result.tracks : result ? result.tracks.filter((t) => t.status === filter) : [];

  return (
    <div className="category-view-container music-sync-view">
      <div className="view-header">
        <h2>Spotify Music Sync</h2>
        <p className="subtext">
          Compare Spotify playlist tracks against your Lidarr library and add missing artists with one click.
        </p>
      </div>

      {toasts.length > 0 && (
        <div className="music-toast-stack">
          {toasts.map((t) => (
            <div key={t.id} className={`music-toast ${t.ok ? 'ok' : 'err'}`}>
              {t.msg}
            </div>
          ))}
        </div>
      )}

      {!cfg?.configured ? (
        <div className="homelab-widget">
          <div className="widget-header">
            <div className="widget-title-group">
              <div className="service-badge-icon music-badge">
                <Icon name="music" size={16} />
              </div>
              <div>
                <h3 className="widget-title">Spotify not connected</h3>
                <span className="widget-sub">Client ID / Secret required</span>
              </div>
            </div>
          </div>
          <div className="empty-widget-state" style={{ padding: '20px' }}>
            <span>
              Add your Spotify App Client ID &amp; Secret (and optional default Lidarr folders) in Settings to enable
              playlist comparison.
            </span>
            <button className="btn primary" style={{ marginTop: 14 }} onClick={onOpenSettings}>
              <Icon name="settings" size={14} /> Open Settings
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="homelab-widget">
            <div className="widget-header">
              <div className="widget-title-group">
                <div className="service-badge-icon music-badge">
                  <Icon name="music" size={16} />
                </div>
                <div>
                  <h3 className="widget-title">Pick a Playlist</h3>
                  <span className="widget-sub">Paste a Spotify playlist link / ID, or search public playlists</span>
                </div>
              </div>
            </div>
            <div className="music-search-area">
              <div className="music-input-row">
                <input
                  type="text"
                  className="music-input"
                  placeholder="Paste playlist URL or ID (open.spotify.com/playlist/…)"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCompare()}
                />
                <button className="btn primary" onClick={() => handleCompare()} disabled={loading || !input.trim()}>
                  <Icon name="activity" size={14} /> {loading ? 'Comparing…' : 'Compare'}
                </button>
              </div>

              <div className="music-search-row">
                <input
                  type="text"
                  className="music-input"
                  placeholder="Search public Spotify playlists (artist, mood, genre…)"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button className="btn secondary" onClick={handleSearch} disabled={searching || !query.trim()}>
                  <Icon name="search" size={14} /> {searching ? 'Searching…' : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="music-playlist-grid">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      className="music-playlist-card"
                      onClick={() => {
                        setInput(p.url);
                        handleCompare(p.url);
                      }}
                    >
                      {p.imageUrl ? (
                        <img className="music-playlist-thumb" src={p.imageUrl} alt={p.name} loading="lazy" />
                      ) : (
                        <div className="music-playlist-thumb fallback">
                          <Icon name="music" size={18} />
                        </div>
                      )}
                      <div className="music-playlist-meta">
                        <span className="music-playlist-name">{p.name}</span>
                        <span className="text-muted">{p.owner} • {p.trackCount} tracks</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {searchError && <div className="banner error" style={{ marginTop: 10 }}>{searchError}</div>}
            </div>
          </div>

          {compareError && <div className="banner error" style={{ marginBottom: 12 }}>{compareError}</div>}

          {result && (
            <>
              <div className="music-result-header">
                <div className="music-result-title-wrap">
                  {result.playlist.imageUrl && (
                    <img className="music-result-thumb" src={result.playlist.imageUrl} alt={result.playlist.name} />
                  )}
                  <div>
                    <h3 className="widget-title">{result.playlist.name}</h3>
                    <span className="widget-sub">
                      {result.playlist.owner} • {result.tracks.length} resolvable tracks
                    </span>
                  </div>
                </div>
                <div className="music-count-row">
                  <span className="music-count exists">
                    <span className="count-num">{result.counts.exists || 0}</span> In Library
                  </span>
                  <span className="music-count missing-album">
                    <span className="count-num">{result.counts.missingAlbum || 0}</span> Artist Only
                  </span>
                  <span className="music-count missing">
                    <span className="count-num">{result.counts.missing || 0}</span> Missing
                  </span>
                </div>
              </div>

              {missingArtists.length > 0 && (
                <div className="music-add-strip">
                  <div className="music-add-strip-info">
                    <span className="font-medium">{missingArtists.length} artist{missingArtists.length === 1 ? '' : 's'}</span>
                    <span className="text-muted"> not fully in your Lidarr library</span>
                  </div>
                  <button className="btn primary" onClick={handleAddAll} disabled={busyArtists.size > 0}>
                    <Icon name="plus" size={14} /> Add All Missing Artists
                  </button>
                </div>
              )}

              <div className="music-filter-row">
                <button className={`music-filter-chip ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
                  All ({result.tracks.length})
                </button>
                <button
                  className={`music-filter-chip exists ${filter === 'exists' ? 'active' : ''}`}
                  onClick={() => setFilter('exists')}
                >
                  In Library ({result.counts.exists || 0})
                </button>
                <button
                  className={`music-filter-chip missing-album ${filter === 'missingAlbum' ? 'active' : ''}`}
                  onClick={() => setFilter('missingAlbum')}
                >
                  Artist Only ({result.counts.missingAlbum || 0})
                </button>
                <button
                  className={`music-filter-chip missing ${filter === 'missing' ? 'active' : ''}`}
                  onClick={() => setFilter('missing')}
                >
                  Missing ({result.counts.missing || 0})
                </button>
              </div>

              <div className="music-track-list">
                {visibleTracks.length === 0 ? (
                  <div className="empty-widget-state">
                    <span>No tracks in this category.</span>
                  </div>
                ) : (
                  visibleTracks.map((t, i) => {
                    const meta = STATUS_META[t.status];
                    const isBusy = busyArtists.has(t.artist);
                    return (
                      <div key={`${t.trackId || t.title}-${i}`} className={`music-track-row ${meta.cls}`}>
                        <div className={`music-track-status ${meta.cls}`} title={meta.label} />
                        <div className="music-track-main">
                          <span className="music-track-title">{t.title}</span>
                          <span className="music-track-artist">{t.artist} — {t.album}</span>
                        </div>
                        <div className="music-track-right">
                          <span className={`badge badge-sm badge-${meta.cls}`}>{meta.label}</span>
                          {t.status !== 'exists' && (
                            <button
                              className="btn sm secondary"
                              disabled={isBusy || !!busyArtists.size}
                              onClick={() => runAddArtist(t.artist)}
                            >
                              {isBusy ? 'Adding…' : 'Add Artist'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </>
      )}

      <div className="music-hint">
        <span className="text-muted text-sm">
          Status is based on the artist + album being present in the configured Lidarr library. “Artist Only” means the
          artist exists but the album isn’t managed (yet).
        </span>
      </div>
    </div>
  );
}