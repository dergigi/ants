import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get git commit hash at build time
function getGitCommitHash(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    NEXT_PUBLIC_GIT_COMMIT: getGitCommitHash(),
  },
  images: {
    unoptimized: true,
    // Allow loading images from any remote host (http and https)
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' }
    ]
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
