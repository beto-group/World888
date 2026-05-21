const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, options) => {
    config.module.rules.push({
      test: /\.jsx?$/,
      include: [path.resolve(__dirname, '../src')],
      use: [
        options.defaultLoaders.babel,
        {
          loader: path.resolve(__dirname, './dc-loader.js'),
        },
      ],
    });
    
    // Ignore Node.js and Electron specific imports used by the Obsidian context
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      electron: false,
      '@electron/remote': false,
    };

    return config;
  },
};

module.exports = nextConfig;
