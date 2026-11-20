/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel uses the default `.next`; set NEXT_DIST_DIR for a throwaway preview build.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  reactStrictMode: true,
  poweredByHeader: false,
  // keep the dev overlay badge out of local previews and screenshots
  devIndicators: false,
};

export default nextConfig;
