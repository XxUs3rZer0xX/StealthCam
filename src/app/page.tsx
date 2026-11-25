'use client';

import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import LoginForm from '@/components/LoginForm';
import ComputerClient from '@/components/ComputerClient';
import MobileClient from '@/components/MobileClient';

export default function Home() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: 'var(--lcars-gold)' }}></div>
          <p className="lcars-heading" style={{ color: 'var(--lcars-gold)' }}>Initializing LCARS…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginForm />;
  }

  if (user.deviceType === 'computer') {
    return <ComputerClient />;
  }

  return <MobileClient />;
}
