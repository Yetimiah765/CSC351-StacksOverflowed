'use client';

import { useRouter } from 'next/navigation';
import RegisterScreen from '../../components/auth/RegisterScreen';
import { useCheckInHandOver } from '../../components/auth/useCheckInHandOver';

export default function RegisterPage() {
  const router = useRouter();
  // With the 3D home page, signing up happens at its front desk (SRS-103.16).
  const showForm = useCheckInHandOver('signup');
  if (!showForm) return null;
  // SRS-101.15: straight to login, which fills in the new username.
  return <RegisterScreen onRegistered={(username) => router.push(`/login?registered=${encodeURIComponent(username)}`)} logIn={{ href: '/login' }} />;
}
