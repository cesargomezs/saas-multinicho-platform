/** @type {import('next').NextConfig} */
const nextConfig = {
    allowedDevOrigins: ['192.168.252.243', '192.168.1.128', 'localhost:3000'],
    async rewrites() {
      return [
        {
          source: '/api/:path*',
          destination: 'http://localhost:4000/api/:path*',
        },
      ];
    },
  };
  
  export default nextConfig;