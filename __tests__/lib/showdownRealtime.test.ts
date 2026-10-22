import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SHOWDOWN_CHANNEL_NAME, SHOWDOWN_EVENT_CHANGED, notifyShowdownChanged } from '../../lib/sports/showdownRealtime';

function fakeClient(httpSend: (event: string, payload: unknown) => Promise<unknown>) {
  const channel = vi.fn(() => ({ httpSend }));
  const removeChannel = vi.fn(async () => 'ok');
  return { client: { channel, removeChannel } as unknown as SupabaseClient, channel, removeChannel };
}

describe('notifyShowdownChanged', () => {
  it('broadcasts a "changed" ping on the public Showdown channel', async () => {
    const httpSend = vi.fn(async () => ({ success: true }));
    const { client, channel, removeChannel } = fakeClient(httpSend);

    expect(await notifyShowdownChanged(client, { showdownId: 3, reason: 'bet' })).toBe(true);

    expect(channel).toHaveBeenCalledWith(SHOWDOWN_CHANNEL_NAME);
    expect(httpSend).toHaveBeenCalledWith(SHOWDOWN_EVENT_CHANGED, { showdownId: 3, reason: 'bet' });
    expect(removeChannel).toHaveBeenCalled();
  });

  it('never throws when the ping fails, since the change is already saved', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client, removeChannel } = fakeClient(async () => {
      throw new Error('Realtime unavailable');
    });

    expect(await notifyShowdownChanged(client, { showdownId: null, reason: 'settled' })).toBe(false);
    expect(removeChannel).toHaveBeenCalled();
  });
});
