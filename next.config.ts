import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'haven.sovereignengineering.io',
      },
      {
        protocol: 'https',
        hostname: 'nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'image.nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'cdn.nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'i.nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'media.nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'imgproxy.nostr.build',
      },
      {
        protocol: 'https',
        hostname: 'pbs.twimg.com',
      },
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
      },
      {
        protocol: 'https',
        hostname: 'graph.facebook.com',
      },
      {
        protocol: 'https',
        hostname: 'platform-lookaside.fbsbx.com',
      },
      {
        protocol: 'https',
        hostname: '*.amazonaws.com',
      },
      {
        protocol: 'https',
        hostname: '*.cloudfront.net',
      },
    ],
  },
  webpack: (config) => {
    // Exclude nostr-band-app from the build
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ['**/nostr-band-app/**', '**/npub.world/**', '**/olas/**']
    };
    return config;
  }
};

export default nextConfig;
