/** @type {import('next').NextConfig} */

// SRS-NFR-112: sent with every page and API response. Other websites may not
// show the site inside a frame (so they can't trick a player into clicking
// its buttons, e.g. Delete account), browsers may not guess a response's
// content type, and other websites get only our address as the referrer.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

module.exports = nextConfig;
