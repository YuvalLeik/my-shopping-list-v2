import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  // Serwist's webpack plugin is incompatible with Turbopack, which `next dev`
  // uses by default since Next 16. The service worker is only needed in
  // production builds, so disable it in dev to keep `npm run dev` working.
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  // Acknowledge Turbopack explicitly so Next doesn't abort over the webpack
  // config key that @serwist/next injects (harmless in dev where it's disabled).
  turbopack: {},
};

export default withSerwist(nextConfig);
