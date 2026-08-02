/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // sharp (native bindings) and ffmpeg/ffprobe (bundled binaries) need to
  // run as real Node modules rather than being bundled by webpack.
  experimental: {
    serverComponentsExternalPackages: ["sharp", "ffmpeg-static", "ffprobe-static", "busboy", "archiver"],
  },
};

module.exports = nextConfig;
