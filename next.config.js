const { execSync } = require('child_process');

// Get git commit hash at build time
let gitHash = 'dev';
try {
  gitHash = execSync('git rev-parse --short HEAD').toString().trim();
} catch (e) {
  // Fallback if git is not available
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  experimental: {
    cpus: 1,
    serverActions: {
      allowedOrigins: ["localhost:3000", "freerent.money", "www.freerent.money"],
    },
  },
  env: {
    NEXT_PUBLIC_BUILD_ID: gitHash,
    NEXT_PUBLIC_BUILD_TIME: new Date().toISOString().split("T")[0],
  },
};

module.exports = nextConfig;
