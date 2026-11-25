'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useStream } from '@/contexts/StreamContext';

const ComputerClient: React.FC = () => {
  const { user, logout } = useAuth();
  const {
    isConnected,
    isStreaming,
    isRecording,
    localStream,
    connectionState,
    onlineDevices,
    motionAlertsEnabled,
    setMotionAlertsEnabled,
    startStreaming,
    stopStreaming,
    error
  } = useStream();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [streamQuality, setStreamQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [isGhostMode, setIsGhostMode] = useState(false);

  useEffect(() => {
    if (localStream && localVideoRef.current) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Ghost mode keyboard listener
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isGhostMode) {
        setIsGhostMode(false);
      }
    };

    if (isGhostMode) {
      document.addEventListener('keydown', handleKeyDown);
      // Prevent scrolling when in ghost mode
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isGhostMode]);

  const handleStartStream = async () => {
    try {
      await startStreaming();
    } catch (error) {
      console.error('Failed to start streaming:', error);
    }
  };

  const toggleGhostMode = () => {
    setIsGhostMode(!isGhostMode);
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

  const mobileDevices = onlineDevices.filter(device => device.deviceType === 'mobile');
  return (
    <React.Fragment>
      {/* Ghost Mode Overlay - Covers absolutely everything */}
      {isGhostMode && (
        <div className="fixed inset-0 bg-black z-[999999] cursor-none select-none">
          {/* Completely black screen - looks like computer is asleep */}
        </div>
      )}

      <div className="min-h-screen bg-black">
        {/* LCARS command bar */}
        <header className="bg-black px-4 pt-3 pb-2">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <div className="lcars-sweep h-9 px-4 flex items-center" style={{ borderRadius: '9999px 0 0 9999px' }}>
              <span className="text-black font-bold tracking-widest text-sm">LCARS</span>
            </div>
            <div className="flex-1">
              <h1 className="lcars-heading text-lg leading-none">StealthCam · Camera Station</h1>
              <p className="lcars-label mt-1" style={{ color: 'var(--lcars-purple)' }}>Operator: {user?.username}</p>
            </div>
            <div className="flex items-center gap-2 px-3 h-8" style={{ background: '#141414', borderRadius: '9999px' }}>
              <span className={`w-3 h-3 rounded-full lcars-blink ${getConnectionStatusColor()}`} />
              <span className="lcars-label" style={{ color: 'var(--lcars-peach)' }}>{getConnectionStatusText()}</span>
            </div>
            <button
              onClick={logout}
              className="lcars-btn text-xs"
              style={{ background: 'var(--lcars-red)' }}
            >
              Logout
            </button>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Video Preview */}
            <div className="lg:col-span-2">
              <div className="lcars-panel">
                <div className="p-6">
                  <h2 className="text-lg font-medium text-[#ffcc99] mb-4">
                    Video Preview
                  </h2>
                  
                  <div className="relative bg-black rounded-lg overflow-hidden">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-64 sm:h-80 lg:h-96 object-cover"
                    />
                    
                    {!isStreaming && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50">
                        <p className="text-white text-lg">Camera not active</p>
                      </div>
                    )}

                    {isStreaming && (
                      <div className="absolute top-4 left-4">
                        <div className="flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full">
                          <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          <span className="text-sm font-medium">LIVE</span>
                        </div>
                        {isRecording && (
                          <div className="mt-2 flex items-center space-x-2 bg-gray-900 bg-opacity-75 text-white px-3 py-1 rounded-full">
                            <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                            <span className="text-sm font-medium">REC</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stream Controls */}
                  <div className="mt-6 flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="lcars-label block mb-2">
                        Stream Quality
                      </label>
                      <select
                        value={streamQuality}
                        onChange={(e) => setStreamQuality(e.target.value as 'low' | 'medium' | 'high')}
                        disabled={isStreaming}
                        className="lcars-input"
                      >
                        <option value="low">Low (640x480, 15fps)</option>
                        <option value="medium">Medium (1280x720, 30fps)</option>
                        <option value="high">High (1920x1080, 30fps)</option>
                      </select>
                    </div>
                    
                    <div className="flex space-x-3">
                      {!isStreaming ? (
                        <button
                          onClick={handleStartStream}
                          disabled={!isConnected}
                          className="lcars-btn"
                          style={{ background: 'var(--lcars-gold)' }}
                        >
                          Start Stream
                        </button>
                      ) : (
                        <button
                          onClick={stopStreaming}
                          className="lcars-btn"
                          style={{ background: 'var(--lcars-red)' }}
                        >
                          Stop Stream
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ghost Mode Button */}
                  <div className="mt-4">
                    <button
                      onClick={toggleGhostMode}
                      className="lcars-btn w-full flex items-center justify-center space-x-2"
                      style={{ background: 'var(--lcars-purple)' }}
                      title="Enable Ghost Mode - Press ESC to exit"
                    >
                      <span>👻</span>
                      <span>Ghost Mode</span>
                    </button>
                  </div>

                  {error && (
                    <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
                      <p className="text-red-600 text-sm">{error}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Connected Devices */}
              <div className="lcars-panel">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-[#ffcc99] mb-4">
                    Connected Mobile Devices
                  </h3>
                  
                  {mobileDevices.length === 0 ? (
                    <div className="text-center py-6">
                      <div className="text-[#9977aa] mb-2">
                        📱
                      </div>
                      <p className="text-sm text-[#9977aa]">
                        No mobile devices connected
                      </p>
                      <p className="text-xs text-[#9977aa] mt-1">
                        Login with the same username on your mobile device
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {mobileDevices.map((device, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3"
                          style={{ background: '#0d0d0d', border: '2px solid var(--lcars-blue)', borderRadius: '9999px' }}
                        >
                          <div className="flex items-center space-x-3 pl-2">
                            <div className="w-2.5 h-2.5 rounded-full lcars-blink" style={{ background: 'var(--lcars-blue)' }}></div>
                            <span className="text-sm font-medium" style={{ color: 'var(--lcars-peach)' }}>
                              Viewer Device
                            </span>
                          </div>
                          <span className="lcars-label pr-2" style={{ color: 'var(--lcars-blue)' }}>Linked</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Stream Status */}
              <div className="lcars-panel">
                <div className="p-6">
                  <h3 className="text-lg font-medium text-[#ffcc99] mb-4">
                    Stream Status
                  </h3>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#ffcc99]">Status:</span>
                      <span className={`text-sm font-medium ${isStreaming ? 'text-green-600' : 'text-[#9977aa]'}`}>
                        {isStreaming ? 'Streaming' : 'Stopped'}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#ffcc99]">Quality:</span>
                      <span className="text-sm font-medium text-[#ffcc99] capitalize">
                        {streamQuality}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-[#ffcc99]">Connection:</span>
                      <span className={`text-sm font-medium ${
                        connectionState === 'connected' ? 'text-green-600' :
                        connectionState === 'connecting' ? 'text-yellow-600' : 'text-[#9977aa]'
                      }`}>
                        {connectionState || 'Not connected'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                      <span className="text-sm text-[#ffcc99]">Motion alerts &amp; recording:</span>
                      <button
                        onClick={() => setMotionAlertsEnabled(!motionAlertsEnabled)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          motionAlertsEnabled ? 'bg-green-600' : 'bg-gray-300'
                        }`}
                        title="When the camera sees movement: alert the phone and record a clip"
                        aria-pressed={motionAlertsEnabled}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            motionAlertsEnabled ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>
                    {motionAlertsEnabled && (
                      <p className="text-xs" style={{ color: 'var(--lcars-peach)' }}>
                        Armed — the camera records motion clips on its own, even with no phone connected. Turn this off to disarm.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="lcars-panel" style={{ borderColor: 'var(--lcars-blue)' }}>
                <div className="p-6">
                  <h3 className="lcars-heading text-sm mb-2" style={{ color: 'var(--lcars-blue)' }}>
                    Operating procedure
                  </h3>
                  <ul className="text-xs space-y-1" style={{ color: 'var(--lcars-peach)' }}>
                    <li>1. Ensure your viewer device is connected</li>
                    <li>2. Select your preferred stream quality</li>
                    <li>3. Click &quot;Start Stream&quot; to begin</li>
                    <li>4. The phone connects and alerts on motion</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>        </div>
      </div>
    </React.Fragment>
  );
};

export default ComputerClient;
