//@ts-check

const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions}
 **/
const nextConfig = {
  nx: {},
  devIndicators: { position: 'bottom-right' },
};

module.exports = composePlugins(withNx)(nextConfig);
