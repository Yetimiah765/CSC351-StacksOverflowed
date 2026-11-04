'use client';

import { useRouter } from 'next/navigation';
import RegisterScreen from '../../components/auth/RegisterScreen';

export default function RegisterPage() {
  const router = useRouter();
  // SRS-101.15: straight to login, which fills in the new username.
  return <RegisterScreen onRegistered={(username) => router.push(`/login?registered=${encodeURIComponent(username)}`)} logIn={{ href: '/login' }} />;
}
