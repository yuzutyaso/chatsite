/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  images: {
    domains: ['https://ogyulthpsmfappqslihn.supabase.co'], // Supabase Storageのドメインを追加
  },
};

export default nextConfig;
