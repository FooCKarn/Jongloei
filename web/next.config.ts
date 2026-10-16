import type { NextConfig } from "next";

// Built as plain static files (out/) that the Cloudflare Worker serves next to its API
// (wrangler.jsonc assets.directory = ./web/out). Pages read their ids from the query string,
// so every route is a fixed file and no Node server is needed.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: false,
};

export default nextConfig;
