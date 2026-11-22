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
    const opens = page.match(/onClick=\{\(\) => \{([^}]*)setEditing\('deleteAccount'\);\s*\}\}/);
    expect(opens).not.toBeNull();
    expect(opens![1]).not.toContain('deleteAccount(');
    expect(page.match(/deleteAccount\(token/g)).toHaveLength(1);
    expect(page).toMatch(/async function confirmDeletion\(\)[\s\S]*?deleteAccount\(token/);
    expect(page).toContain('onConfirm={confirmDeletion}');
  });

  it('asks for the password in the pop-up, and keeps Delete locked until it is typed (SRS-106.2)', () => {
    const page = readFileSync(join(__dirname, '../../app/profile/page.tsx'), 'utf8');
    expect(page).toContain('confirmDisabled={!deletePassword}');
    expect(page).toMatch(/<DeleteAccountDialog[\s\S]*?type="password"[\s\S]*?<\/DeleteAccountDialog>/);
    expect(page).toContain('deleteAccount(token, deletePassword)');

    const html = dialog({ confirmDisabled: true, children: createElement('input', { type: 'password' }) });
    expect(html).toContain('type="password"');
    expect(html).toMatch(/<button type="submit" disabled=""[^>]*>Delete my account<\/button>/);
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

    expect(await deleteAccount('tok-123', 'Secret123')).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/profile');
    expect(init.method).toBe('DELETE');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok-123');
    // SRS-106.2: with the password the server checks.
    expect(JSON.parse(init.body as string)).toEqual({ password: 'Secret123' });
  });

  it("passes on the server's reason, or a general one", async () => {
    stubFetch(403, { error: 'Incorrect password.' });
    expect(await deleteAccount('tok', 'Wrong1234')).toEqual({ ok: false, error: 'Incorrect password.' });

    stubFetch(500, {});
    expect(await deleteAccount('tok', 'pw')).toEqual({ ok: false, error: 'Could not delete your account. Please try again.' });

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    expect(await deleteAccount('tok', 'pw')).toEqual({ ok: false, error: 'Could not delete your account. Please try again.' });
  });

  it('passes on the poker table to leave first (SRS-106.10)', async () => {
    stubFetch(409, { error: "You're seated at a poker table. Leave the table first, then delete your account.", tableKey: 'low-1' });
    expect(await deleteAccount('tok', 'pw')).toEqual({
      ok: false,
      error: "You're seated at a poker table. Leave the table first, then delete your account.",
      tableKey: 'low-1',
    });

    const page = readFileSync(join(__dirname, '../../app/profile/page.tsx'), 'utf8');
    expect(page).toContain('setDeleteTableKey(result.tableKey ?? null)');
    expect(page).toMatch(/errorLink=\{[\s\S]*?href=\{`\/poker\/\$\{deleteTableKey\}`\}[\s\S]*?Go to your poker table/);

    // The link goes under the message that explains it.
    const html = dialog({ error: 'Leave the table first.', errorLink: createElement('a', { href: '/poker/low-1' }, 'Go to your poker table') });
    expect(html.indexOf('Leave the table first.')).toBeLessThan(html.indexOf('Go to your poker table'));
    expect(dialog({ errorLink: createElement('a', null, 'Go to your poker table') })).not.toContain('Go to your poker table');
  });

  it('says when the session has ended, so the page can send the player to log in', async () => {
    stubFetch(401, { error: 'Invalid or expired session.' });
    expect(await deleteAccount('tok', 'pw')).toMatchObject({ ok: false, expired: true });
  });
});
