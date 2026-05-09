const baseConfig = require('./app.json');

const pickFirstValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string') {
      const normalized = value.trim();
      if (
        normalized.length > 0 &&
        normalized.toLowerCase() !== 'undefined' &&
        normalized.toLowerCase() !== 'null'
      ) {
        return normalized;
      }
    }
  }

  return undefined;
};

module.exports = ({ config }) => {
  const googleMapsApiKey = pickFirstValue(
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    process.env.GOOGLE_MAPS_API_KEY
  );

  const geminiApiKey = pickFirstValue(
    process.env.EXPO_PUBLIC_GEMINI_API_KEY,
    process.env.GEMINI_API_KEY
  );

  const existingPlugins = Array.isArray(baseConfig.expo.plugins)
    ? baseConfig.expo.plugins
    : [];

  return {
    ...baseConfig.expo,
    ...config,
    extra: {
      ...baseConfig.expo.extra,
      ...config.extra,
      geminiApiKey,
      googleMapsApiKey,
    },
    android: {
      ...baseConfig.expo.android,
      ...config.android,
      usesCleartextTraffic: true,
      config: {
        ...baseConfig.expo.android?.config,
        ...config.android?.config,
        googleMaps: {
          ...baseConfig.expo.android?.config?.googleMaps,
          ...config.android?.config?.googleMaps,
          ...(googleMapsApiKey ? { apiKey: googleMapsApiKey } : {}),
        },
      },
    },
    plugins: [
      ...existingPlugins,
    ],
  };
};