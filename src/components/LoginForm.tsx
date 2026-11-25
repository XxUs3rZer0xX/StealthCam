'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const LoginForm: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [deviceType, setDeviceType] = useState<'computer' | 'mobile'>('computer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, error, clearError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    // Clear any existing errors
    clearError();
    
    setIsSubmitting(true);
    try {
      await login(username, password, deviceType);
    } catch (err) {
      // Error is handled by the context, but log it for debugging
      console.error('Login submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const detectDeviceType = () => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(userAgent);
    setDeviceType(isMobile ? 'mobile' : 'computer');
  };
  React.useEffect(() => {
    detectDeviceType();
  }, []);

  // Clear errors when user starts typing
  React.useEffect(() => {
    if (error && (username || password)) {
      clearError();
    }
  }, [username, password, error, clearError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full">
        {/* Top elbow bar */}
        <div className="flex items-end gap-2 mb-1">
          <div className="lcars-sweep h-10 w-24 rounded-tr-none" style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
          <div className="flex-1 h-5" style={{ background: 'var(--lcars-lavender)', borderRadius: '9999px' }} />
          <div className="h-5 w-10" style={{ background: 'var(--lcars-blue)', borderRadius: '9999px' }} />
        </div>

        <div className="lcars-panel p-6 pt-5">
          <div className="mb-6">
            <h1 className="lcars-heading text-3xl">StealthCam</h1>
            <p className="lcars-label mt-1" style={{ color: 'var(--lcars-peach)' }}>
              LCARS · Remote Surveillance Interface
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="username" className="lcars-label block mb-2">Username</label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="lcars-input"
                placeholder="ENTER USERNAME"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="lcars-label block mb-2">Access Code</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="lcars-input"
                placeholder="ENTER ACCESS CODE"
                required
              />
            </div>

            <div>
              <label className="lcars-label block mb-2">Station Role</label>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeviceType('computer')}
                  className="lcars-btn flex-1"
                  style={{ background: deviceType === 'computer' ? 'var(--lcars-gold)' : '#3a3320' }}
                >
                  Camera (PC)
                </button>
                <button
                  type="button"
                  onClick={() => setDeviceType('mobile')}
                  className="lcars-btn flex-1"
                  style={{ background: deviceType === 'mobile' ? 'var(--lcars-blue)' : '#1f2a33' }}
                >
                  Viewer (Phone)
                </button>
              </div>
            </div>

            {error && (
              <div className="p-3" style={{ background: '#2a1414', border: '2px solid var(--lcars-red)', borderRadius: '9999px' }}>
                <p className="text-sm" style={{ color: 'var(--lcars-red)' }}>⚠ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting || !username || !password}
              className="lcars-btn w-full text-lg"
              style={{ background: 'var(--lcars-orange)' }}
            >
              {isSubmitting ? 'Engaging…' : 'Engage'}
            </button>
          </form>

          <p className="lcars-label mt-5 text-center" style={{ color: 'var(--lcars-purple)' }}>
            New operators are auto-registered · use the same login on both stations
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
