import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: false,
  // `next build` / Vercel must emit `.next`. Local `next dev` uses `.next-dev`
  // so a locked `.next/trace` on Windows cannot blank :3000.
  distDir: process.env.NODE_ENV === "production" ? ".next" : ".next-dev",
  outputFileTracingRoot: projectRoot,
  transpilePackages: [
    "@wppconnect/libsignal-protocol",
    "@wppconnect/curve25519",
  ],
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  turbopack: {
    resolveAlias: {
      sharp: "./src/shims/empty.ts",
      "onnxruntime-node": "./src/shims/empty.ts",
    },
  },
  webpack: (config) => {
    const prev = config.watchOptions?.ignored;
    config.watchOptions = {
      ...config.watchOptions,
      ignored: Array.isArray(prev)
        ? [...prev, "**/src-tauri/**"]
        : ["**/src-tauri/**"],
    };
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
      crypto: false,
    };
    return config;
  },
  async rewrites() {
    return [
      { source: "/app", destination: "/" },
      { source: "/app/:path*", destination: "/" },
    ];
  },
  env: {
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || "",
    VITE_SUPABASE_URL:
      process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY ||
      "",
    VITE_SUPABASE_ANON_KEY:
      process.env.VITE_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      "",
    NEXT_PUBLIC_AUTH_REDIRECT_URL:
      process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
      process.env.VITE_AUTH_REDIRECT_URL ||
      "",
    VITE_AUTH_REDIRECT_URL:
      process.env.VITE_AUTH_REDIRECT_URL ||
      process.env.NEXT_PUBLIC_AUTH_REDIRECT_URL ||
      "",
    NEXT_PUBLIC_TMDB_API_KEY:
      process.env.NEXT_PUBLIC_TMDB_API_KEY || process.env.VITE_TMDB_API_KEY || "",
    VITE_TMDB_API_KEY:
      process.env.VITE_TMDB_API_KEY || process.env.NEXT_PUBLIC_TMDB_API_KEY || "",
    NEXT_PUBLIC_OPENLIBRARY_BASE:
      process.env.NEXT_PUBLIC_OPENLIBRARY_BASE ||
      process.env.VITE_OPENLIBRARY_BASE ||
      "",
    VITE_OPENLIBRARY_BASE:
      process.env.VITE_OPENLIBRARY_BASE ||
      process.env.NEXT_PUBLIC_OPENLIBRARY_BASE ||
      "",
    NEXT_PUBLIC_OPENLIBRARY_COVERS:
      process.env.NEXT_PUBLIC_OPENLIBRARY_COVERS ||
      process.env.VITE_OPENLIBRARY_COVERS ||
      "",
    VITE_OPENLIBRARY_COVERS:
      process.env.VITE_OPENLIBRARY_COVERS ||
      process.env.NEXT_PUBLIC_OPENLIBRARY_COVERS ||
      "",
  },
};

export default nextConfig;
