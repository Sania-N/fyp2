import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

const TravelSessionContext = createContext(null);

export const TravelSessionProvider = ({ children }) => {
  const [travelSession, setTravelSession] = useState({
    isTraveling: false,
    destination: null,
    startedAt: null,
    activeRouteIndex: null,
    travelMode: null,
  });

  const startTravelSession = useCallback((destination, options = {}) => {
    setTravelSession({
      isTraveling: true,
      destination: destination || null,
      startedAt: Date.now(),
      activeRouteIndex: Number.isInteger(options?.activeRouteIndex)
        ? options.activeRouteIndex
        : null,
      travelMode: typeof options?.travelMode === 'string' ? options.travelMode : null,
    });
  }, []);

  const stopTravelSession = useCallback(() => {
    setTravelSession({
      isTraveling: false,
      destination: null,
      startedAt: null,
      activeRouteIndex: null,
      travelMode: null,
    });
  }, []);

  const value = useMemo(
    () => ({
      ...travelSession,
      startTravelSession,
      stopTravelSession,
    }),
    [travelSession, startTravelSession, stopTravelSession]
  );

  return <TravelSessionContext.Provider value={value}>{children}</TravelSessionContext.Provider>;
};

export const useTravelSession = () => {
  const context = useContext(TravelSessionContext);

  if (!context) {
    throw new Error('useTravelSession must be used within a TravelSessionProvider');
  }

  return context;
};
