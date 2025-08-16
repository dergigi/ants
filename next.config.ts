import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
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
