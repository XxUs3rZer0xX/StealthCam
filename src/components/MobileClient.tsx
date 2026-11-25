'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStream } from '@/contexts/StreamContext';
import { registerPushNotifications } from '@/lib/push';

const MobileClient: React.FC = () => {
  const { user, logout } = useAuth();  const {
    isConnected,
    remoteStream,
    connectionState,
    onlineDevices,
    lastMotion,
    requestStream,
    error
  } = useStream();

  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission>('default');
  const [motionBanner, setMotionBanner] = useState<string | null>(null);
  const handledMotionAt = useRef<number>(0);

  const [viewMode, setViewMode] = useState<'live' | 'recordings'>('live');
  const [recordings, setRecordings] = useState<{ id: string; bytes: number; mtime: number }[]>([]);
  const [loadingRecordings, setLoadingRecordings] = useState(false);
  const [selectedClip, setSelectedClip] = useState<string | null>(null);
  const [recordingsError, setRecordingsError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const loadRecordings = React.useCallback(async () => {
    if (!user) return;
    setLoadingRecordings(true);
    setRecordingsError(null);
    try {
      const res = await fetch('/api/recordings', {
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(`Failed to load recordings (${res.status})`);
      const data = await res.json();
      setRecordings(data.recordings || []);
    } catch (err) {
      setRecordingsError(err instanceof Error ? err.message : 'Failed to load recordings');
    } finally {
      setLoadingRecordings(false);
    }
  }, [user]);

  // Delete a recording from the archive.
  const deleteClip = React.useCallback(async (id: string) => {
    if (!user) return;
    try {
      const res = await fetch(`/api/recordings/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${user.token}` },
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
      setSelectedClip((cur) => (cur === id ? null : cur));
      setConfirmDeleteId((cur) => (cur === id ? null : cur));
    } catch (err) {
      setRecordingsError(err instanceof Error ? err.message : 'Failed to delete recording');
    }
  }, [user]);

  // Refresh the list whenever the Recordings tab is opened or a new motion event lands.
  useEffect(() => {
    if (viewMode === 'recordings') loadRecordings();
  }, [viewMode, lastMotion, loadRecordings]);

  // Turn a recording id (2026-11-24_20-29-43-480) into a readable label.
  const formatClipLabel = (id: string): string => {
    const m = /^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})-\d{3}$/.exec(id);
    if (!m) return id;
    const [, y, mo, d, h, min, s] = m;
    return `${y}-${mo}-${d}  ${h}:${min}:${s}`;
  };

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Reflect the current browser notification permission on mount.
  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setNotifyPermission(Notification.permission);
    }
  }, []);

  // On the native Android app, register for FCM background push so motion
  // alerts arrive even when the app is closed. No-op in a plain browser.
  useEffect(() => {
    if (user?.token) {
      registerPushNotifications(user.token).catch((err) =>
        console.error('Push registration failed:', err)
      );
    }
  }, [user?.token]);

  const enableNotifications = async () => {
    // Native app: this drives the Android FCM permission + registration.
    if (user?.token) {
      registerPushNotifications(user.token).catch((err) =>
        console.error('Push registration failed:', err)
      );
    }
    // Browser: fall back to the Web Notifications permission.
    if (typeof Notification === 'undefined') return;
    try {
      const result = await Notification.requestPermission();
      setNotifyPermission(result);
    } catch (err) {
      console.error('Notification permission error:', err);
    }
  };

  // When a new motion event arrives, raise a push notification + in-app banner.
  useEffect(() => {
    if (!lastMotion || lastMotion.at === handledMotionAt.current) return;
    handledMotionAt.current = lastMotion.at;

    const time = new Date(lastMotion.at).toLocaleTimeString();
    setMotionBanner(`Motion detected at ${time}`);
    const timeout = setTimeout(() => setMotionBanner(null), 8000);

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('StealthCam: motion detected', {
          body: `Movement seen on your camera at ${time}.`,
          tag: 'stealthcam-motion',
        });
      } catch (err) {
        console.error('Failed to show notification:', err);
      }
    }

    return () => clearTimeout(timeout);
  }, [lastMotion]);

  useEffect(() => {
    if (remoteStream && remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = remoteStream;
      remoteVideoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [remoteStream, volume, isMuted]);

  const toggleFullscreen = async () => {
    const video = remoteVideoRef.current;
    if (!video) return;

    try {
      if (!document.fullscreenElement) {
        if (video.requestFullscreen) await video.requestFullscreen();
      } else if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Fullscreen isn't always available in the in-app WebView — ignore quietly.
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = isMuted ? 0 : newVolume;
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
    if (remoteVideoRef.current) {
      remoteVideoRef.current.volume = !isMuted ? 0 : volume;
    }
  };

  const getConnectionStatusColor = () => {
    if (!isConnected) return 'bg-red-500';
    if (connectionState === 'connected') return 'bg-green-500';
    if (connectionState === 'connecting') return 'bg-yellow-500';
    return 'bg-gray-500';
  };

  const getConnectionStatusText = () => {
    if (!isConnected) return 'Disconnected';
    if (connectionState === 'connected') return 'Connected';
    if (connectionState === 'connecting') return 'Connecting';
    return 'Waiting';
  };

  const computerDevices = onlineDevices.filter(device => device.deviceType === 'computer');
  const hasRemoteStream = remoteStream !== null;

  // Auto-start the stream: whenever the PC camera is online and we don't have a
  // stream yet, ask for it — so the user never has to tap "Request Stream". The
  // guard resets once a stream arrives, so if it later drops we re-request.
  const autoRequestedRef = useRef(false);
  useEffect(() => {
    if (!isConnected || hasRemoteStream) {
      autoRequestedRef.current = false;
      return;
    }
    if (computerDevices.length > 0 && !autoRequestedRef.current) {
      autoRequestedRef.current = true;
      // Small delay so the peer connection is fully ready before requesting.
      const t = setTimeout(() => requestStream(), 600);
      return () => clearTimeout(t);
    }
  }, [isConnected, hasRemoteStream, computerDevices.length, requestStream]);

  return (
    <div className="lcars-frame">
      {/* Top-left elbow */}
      <div className="lcars-elbow-top" />

      {/* Header bar */}
      <div className="lcars-top">
        <span className="font-bold tracking-widest text-sm sm:text-base truncate">STEALTHCAM</span>
        <span className="ml-auto flex items-center gap-2 shrink-0">
          <span className={`w-3 h-3 rounded-full lcars-blink ${getConnectionStatusColor()}`} />
          <span className="font-bold text-xs uppercase tracking-wider">{getConnectionStatusText()}</span>
        </span>
      </div>

      {/* Left rail = the menu */}
      <nav className="lcars-rail">
        <button
          onClick={() => setViewMode('live')}
          className="lcars-rail-btn"
          style={{ background: viewMode === 'live' ? 'var(--lcars-gold)' : '#3a3320' }}
        >
          <span className="tag">01</span><span className="lbl">Live</span>
        </button>
        <button
          onClick={() => setViewMode('recordings')}
          className="lcars-rail-btn"
          style={{ background: viewMode === 'recordings' ? 'var(--lcars-lavender)' : '#2a2030' }}
        >
          <span className="tag">02</span><span className="lbl">Archive</span>
        </button>
        {notifyPermission !== 'granted' && (
          <button
            onClick={enableNotifications}
            className="lcars-rail-btn"
            style={{ background: 'var(--lcars-blue)' }}
            title="Allow push notifications for motion alerts"
          >
            <span className="tag">03</span><span className="lbl">Alerts</span>
          </button>
        )}
        {/* Filler block grows to push the rest down */}
        <div className="lcars-rail-block" style={{ background: 'var(--lcars-orange)', flex: '1 1 auto' }}>
          <span className="lbl">{(user?.username || '').slice(0, 10)}</span>
        </div>
        <button
          onClick={logout}
          className="lcars-rail-btn"
          style={{ background: 'var(--lcars-red)' }}
        >
          <span className="tag">04</span><span className="lbl">Logout</span>
        </button>
        <div className="lcars-rail-block" style={{ background: 'var(--lcars-purple)' }}>
          <span className="lbl">NCC-1701</span>
        </div>
      </nav>

      {/* Main content area */}
      <main className="lcars-main bg-black">
        {viewMode === 'live' && (
          <div className="relative h-full min-h-[60vh] bg-black">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain bg-black"
              onClick={toggleFullscreen}
            />

            {!hasRemoteStream && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                <div className="text-center px-6">
                  <div className="text-6xl mb-4">🛰️</div>
                  <h2 className="lcars-heading text-xl mb-2">No Signal</h2>
                  <p className="lcars-label mb-6" style={{ color: 'var(--lcars-peach)' }}>
                    {computerDevices.length === 0 ? 'Camera station offline' : 'Acquiring feed…'}
                  </p>
                  {computerDevices.length > 0 && (
                    <button
                      onClick={requestStream}
                      disabled={!isConnected}
                      className="lcars-btn"
                      style={{ background: 'var(--lcars-orange)' }}
                    >
                      Request Feed
                    </button>
                  )}
                </div>
              </div>
            )}

            {hasRemoteStream && (
              <div className="absolute top-3 left-3">
                <div className="flex items-center gap-2 px-3 h-7" style={{ background: 'var(--lcars-red)', borderRadius: '9999px' }}>
                  <span className="w-2 h-2 bg-white rounded-full lcars-blink" />
                  <span className="text-black font-bold tracking-widest text-xs">LIVE</span>
                </div>
              </div>
            )}

            {hasRemoteStream && (
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/50 to-transparent">
                <div className="p-4 flex items-center space-x-3">
                  <button
                    onClick={toggleMute}
                    className="p-2 text-black rounded-full"
                    style={{ background: 'var(--lcars-gold)' }}
                  >
                    {isMuted ? (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.906 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.906l3.477-3.793a1 1 0 011.617.793zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.617.793L4.906 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.906l3.477-3.793a1 1 0 011.617.793zM12 8a1 1 0 012 0v4a1 1 0 11-2 0V8zM15 7a1 1 0 012 0v6a1 1 0 11-2 0V7z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.1"
                    value={volume}
                    onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                    className="flex-1 h-2 rounded-lg appearance-none cursor-pointer slider"
                  />
                  <button
                    onClick={toggleFullscreen}
                    className="p-2 text-black rounded-full"
                    style={{ background: 'var(--lcars-gold)' }}
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 6.414V8a1 1 0 01-2 0V4zm9 1a1 1 0 010-2h4a1 1 0 011 1v4a1 1 0 01-2 0V6.414l-2.293 2.293a1 1 0 11-1.414-1.414L13.586 5H12zm-9 7a1 1 0 012 0v1.586l2.293-2.293a1 1 0 111.414 1.414L6.414 15H8a1 1 0 010 2H4a1 1 0 01-1-1v-4zm13-1a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 13.586V12a1 1 0 011-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'recordings' && (
          <div className="p-3 pb-6">
            <div className="flex items-center gap-2 mb-4">
              <h2 className="lcars-heading text-lg flex-1">Motion Archive</h2>
              <button
                onClick={loadRecordings}
                className="lcars-btn text-xs"
                style={{ background: 'var(--lcars-blue)' }}
              >
                ↻ Refresh
              </button>
            </div>

            {selectedClip && (
              <div className="mb-4">
                <video
                  key={selectedClip}
                  src={`/api/recordings/${selectedClip}?token=${encodeURIComponent(user?.token || '')}`}
                  controls
                  autoPlay
                  playsInline
                  className="w-full bg-black"
                  style={{ borderRadius: '1rem', border: '2px solid var(--lcars-gold)' }}
                />
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => setSelectedClip(null)}
                    className="lcars-btn text-xs"
                    style={{ background: '#2a2030' }}
                  >
                    ✕ Close
                  </button>
                  <button
                    onClick={() => deleteClip(selectedClip)}
                    className="lcars-btn text-xs"
                    style={{ background: 'var(--lcars-red)' }}
                  >
                    🗑 Delete
                  </button>
                </div>
              </div>
            )}

            {loadingRecordings && (
              <p className="lcars-label" style={{ color: 'var(--lcars-peach)' }}>Scanning…</p>
            )}
            {recordingsError && (
              <p className="lcars-label" style={{ color: 'var(--lcars-red)' }}>{recordingsError}</p>
            )}
            {!loadingRecordings && !recordingsError && recordings.length === 0 && (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">🗄️</div>
                <p className="lcars-label" style={{ color: 'var(--lcars-peach)' }}>Archive empty</p>
                <p className="lcars-label mt-1" style={{ color: 'var(--lcars-purple)' }}>
                  Clips log here when the camera detects movement
                </p>
              </div>
            )}

            <div className="space-y-2">
              {recordings.map((rec, i) => {
                const accent = ['var(--lcars-gold)', 'var(--lcars-lavender)', 'var(--lcars-orange)', 'var(--lcars-blue)'][i % 4];
                const active = selectedClip === rec.id;
                const confirming = confirmDeleteId === rec.id;
                return (
                  <div
                    key={rec.id}
                    className="w-full flex items-center gap-2 p-2"
                    style={{
                      background: active ? '#1a1a1a' : '#0d0d0d',
                      border: `2px solid ${active ? accent : '#1f1f1f'}`,
                      borderRadius: '9999px',
                    }}
                  >
                    <button
                      onClick={() => setSelectedClip(rec.id)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="h-8 w-14 shrink-0" style={{ background: accent, borderRadius: '9999px' }} />
                      <span className="flex-1 text-sm truncate" style={{ color: 'var(--lcars-peach)', letterSpacing: '0.05em' }}>
                        {formatClipLabel(rec.id)}
                      </span>
                      <span className="lcars-label" style={{ color: accent }}>{formatBytes(rec.bytes)}</span>
                    </button>
                    {confirming ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => deleteClip(rec.id)}
                          className="lcars-btn text-xs"
                          style={{ background: 'var(--lcars-red)', padding: '0.35rem 0.7rem' }}
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="lcars-btn text-xs"
                          style={{ background: '#2a2030', padding: '0.35rem 0.6rem' }}
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(rec.id)}
                        className="shrink-0 text-lg px-2"
                        style={{ color: 'var(--lcars-red)' }}
                        title="Delete recording"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Fixed overlays */}
      {viewMode === 'live' && computerDevices.length === 0 && (
        <div className="fixed bottom-4 left-4 right-4 z-40">
          <div className="flex items-center gap-3 p-3" style={{ background: '#2a2410', border: '2px solid var(--lcars-gold)', borderRadius: '9999px' }}>
            <span className="text-xl">⚠</span>
            <div>
              <p className="lcars-heading text-sm" style={{ color: 'var(--lcars-gold)' }}>Camera station offline</p>
              <p className="lcars-label" style={{ color: 'var(--lcars-peach)' }}>
                Log in with the same username on your PC
              </p>
            </div>
          </div>
        </div>
      )}

      {motionBanner && (
        <div className="fixed top-16 left-4 right-4 z-50">
          <div className="flex items-center gap-3 p-3 lcars-blink" style={{ background: 'var(--lcars-orange)', borderRadius: '9999px' }}>
            <span className="text-lg">🚨</span>
            <p className="text-black font-bold text-sm tracking-wider uppercase">{motionBanner}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="fixed bottom-4 left-4 right-4 z-40">
          <div className="p-3" style={{ background: '#2a1414', border: '2px solid var(--lcars-red)', borderRadius: '9999px' }}>
            <p className="text-sm" style={{ color: 'var(--lcars-red)' }}>{error}</p>
          </div>
        </div>
      )}

      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ffcc66;
          cursor: pointer;
        }
        
        .slider::-moz-range-thumb {
          height: 16px;
          width: 16px;
          border-radius: 50%;
          background: #ffcc66;
          cursor: pointer;
          border: none;
        }
      `}</style>
    </div>
  );
};

export default MobileClient;
