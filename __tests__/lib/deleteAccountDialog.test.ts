import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { join } from 'path';
import * as React from 'react';
import { createElement, type ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DeleteAccountDialog from '../../components/profile/DeleteAccountDialog';
import { deleteAccount } from '../../lib/deleteAccount';

// Vitest compiles .tsx with the classic JSX transform, which calls the global React.
(globalThis as { React?: typeof React }).React = React;
// The project has no @types/react-dom, so the one function used here is typed by hand.
const { renderToStaticMarkup } = createRequire(__filename)('react-dom/server') as {
  renderToStaticMarkup: (element: ReactElement) => string;
};

const noop = () => {};
const dialog = (props: Partial<Parameters<typeof DeleteAccountDialog>[0]> = {}) =>
  renderToStaticMarkup(createElement(DeleteAccountDialog, { deleting: false, error: '', onConfirm: noop, onCancel: noop, ...props }));

describe('the account-deletion confirmation (SRS-106.1)', () => {
  it('asks before deleting, saying the deletion is permanent', () => {
    const html = dialog();
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('Delete your account?');
    expect(html).toContain('can&#x27;t be undone');
    // A way out, and the one button that deletes, which submits the pop-up.
    expect(html).toMatch(/<button type="button"[^>]*>Cancel<\/button>/);
    expect(html).toMatch(/<button type="submit"[^>]*>Delete my account<\/button>/);
  });

  it('locks both buttons while deleting and shows a failure', () => {
    const html = dialog({ deleting: true, error: 'Could not delete your account. Please try again.' });
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Cancel<\/button>/);
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Deleting…<\/button>/);
    expect(html).toContain('Could not delete your account. Please try again.');
  });

  it('is the only way the profile page deletes the account', () => {
    const page = readFileSync(join(__dirname, '../../app/profile/page.tsx'), 'utf8');
    // The Delete account button opens the pop-up; deleteAccount() runs only from its confirmation.
    expect(page).toMatch(/onClick=\{\(\) => \{\s*setDeleteError\(''\);\s*setEditing\('deleteAccount'\);\s*\}\}/);
    expect(page.match(/deleteAccount\(token/g)).toHaveLength(1);
    expect(page).toMatch(/async function confirmDeletion\(\)[\s\S]*?deleteAccount\(token/);
    expect(page).toContain('onConfirm={confirmDeletion}');
  });
});

describe('the request the confirmation sends (UR-106)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(status: number, body: unknown) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it("deletes the account the player's token belongs to", async () => {
    const fetchMock = stubFetch(200, { deleted: true });

    expect(await deleteAccount('tok-123')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/profile');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
  });

  it("passes on the server's reason, or a general one", async () => {
    stubFetch(409, { error: 'Something the server said.' });
    expect(await deleteAccount('tok')).toEqual({ ok: false, error: 'Something the server said.' });

    stubFetch(500, {});
    expect(await deleteAccount('tok')).toEqual({ ok: false, error: 'Could not delete your account. Please try again.' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await deleteAccount('tok')).toEqual({ ok: false, error: 'Could not delete your account. Please try again.' });
  });

  it('says when the session has ended, so the page can send the player to log in', async () => {
    stubFetch(401, { error: 'Invalid or expired session.' });
    expect(await deleteAccount('tok')).toMatchObject({ ok: false, expired: true });
  });
});
