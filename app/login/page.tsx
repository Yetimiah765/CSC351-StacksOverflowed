'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import LoginScreen from '../../components/auth/LoginScreen';
import { useCheckInHandOver } from '../../components/auth/useCheckInHandOver';
import { ENTRANCE_KEY } from '../../lib/casinoFloor';

export default function LoginPage() {
  const router = useRouter();
  // With the 3D home page, logging in happens at its front desk (SRS-103.16).
  const showForm = useCheckInHandOver('login');
  // SRS-101.15: coming straight from sign-up, with the new username. The
  // address is tidied so a refresh doesn't say it again.
  const [registered, setRegistered] = useState<string | null>(null);
  useEffect(() => {
    const name = new URLSearchParams(window.location.search).get('registered');
    if (!name) return;
    setRegistered(name);
    window.history.replaceState(null, '', '/login');
  }, []);

  // SRS-103.11: straight to the casino floor, where play starts, walking in
  // through its doors first (SRS-103.12).
  function goIn() {
    try {
      sessionStorage.setItem(ENTRANCE_KEY, '1');
    } catch {
      // Storage blocked: the floor just opens with the player inside.
    }
    router.push('/');
  }

  if (!showForm) return null;
  return <LoginScreen registered={registered} onLoggedIn={goIn} signUp={{ href: '/register' }} />;
}
