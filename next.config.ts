import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Apple's root certificates are read from disk at runtime by
  // `src/lib/appleReceipt.ts`, through a path built with `process.cwd()`.
  // Next's file tracing follows imports, so it cannot see a path assembled at
  // runtime and would ship these routes without the certs — `verifier()` then
  // throws ENOENT in production, and only on the requests that matter.
  //
  // Nothing calls these routes yet, so the failure would have stayed hidden
  // until the first real purchase.
  outputFileTracingIncludes: {
    "/api/v1/subscription": ["./certs/apple/**"],
    "/api/appstore/notifications": ["./certs/apple/**"],
  },
};

export default nextConfig;
