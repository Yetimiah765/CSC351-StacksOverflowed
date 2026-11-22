import { createRequire } from 'module';
import { describe, expect, it } from 'vitest';

// SRS-NFR-112: next.config.js sends these headers with every page and API
// response. (Checked on a production build with curl too; see bug #1127.)
const nextConfig = createRequire(__filename)('../../next.config.js') as {
  headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>;
};

describe('browser security headers (SRS-NFR-112)', () => {
  it('are sent for every path', async () => {
    const rules = await nextConfig.headers();
    expect(rules.map((rule) => rule.source)).toEqual(['/:path*']);
  });

  it('forbid framing, content-type guessing and full referrers', async () => {
    const [rule] = await nextConfig.headers();
    const headers = Object.fromEntries(rule.headers.map(({ key, value }) => [key, value]));
    expect(headers).toEqual({
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
    });
  });
});
