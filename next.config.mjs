/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/adapter-pg",
    ],
  },
};

export default nextConfig;
