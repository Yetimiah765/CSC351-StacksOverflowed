'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { handOverToCheckIn, type CheckInForm } from '../../lib/checkIn';

/**
 * In a browser that can show the 3D home page, the login and registration
 * pages hand over to its front desk (SRS-103.16): the home page walks a
 * guest to a check-in tablet and opens it on the same form, and puts a
 * logged-in player on the casino floor (it checks the session first, so a
 * player whose session has ended gets the tablet). Elsewhere the page shows
 * its own form. Null until that's known, then whether to show it.
 */
export function useCheckInHandOver(form: CheckInForm): boolean | null {
  const router = useRouter();
  const [showForm, setShowForm] = useState<boolean | null>(null);
  useEffect(() => {
    if (handOverToCheckIn(form)) router.replace('/');
    else setShowForm(true);
  }, [router, form]);
  return showForm;
}
