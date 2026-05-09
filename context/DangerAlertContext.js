import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

export const DangerAlertContext = createContext(null);

export const DangerAlertProvider = ({ children }) => {
  const [dangerAlertState, setDangerAlertState] = useState({
    isVisible: false,
    timer: 60,
    isCountingDown: false,
  });

  const showDangerAlert = useCallback(() => {
    setDangerAlertState({
      isVisible: true,
      timer: 60,
      isCountingDown: true,
    });
  }, []);

  const hideDangerAlert = useCallback(() => {
    setDangerAlertState((prev) => ({
      ...prev,
      isVisible: false,
      isCountingDown: false,
      timer: 60,
    }));
  }, []);

  const updateTimer = useCallback((nextTimer) => {
    setDangerAlertState((prev) => {
      const resolvedTimer =
        typeof nextTimer === 'function' ? nextTimer(prev.timer) : nextTimer;

      return {
        ...prev,
        timer: resolvedTimer,
        isCountingDown: resolvedTimer > 0,
      };
    });
  }, []);

  const resetAlert = useCallback(() => {
    setDangerAlertState({
      isVisible: false,
      timer: 60,
      isCountingDown: false,
    });
  }, []);

  const value = useMemo(
    () => ({
      ...dangerAlertState,
      showDangerAlert,
      hideDangerAlert,
      updateTimer,
      resetAlert,
    }),
    [dangerAlertState, showDangerAlert, hideDangerAlert, updateTimer, resetAlert]
  );

  return (
    <DangerAlertContext.Provider value={value}>
      {children}
    </DangerAlertContext.Provider>
  );
};

export const useDangerAlert = () => {
  const context = useContext(DangerAlertContext);
  if (!context) {
    throw new Error('useDangerAlert must be used within DangerAlertProvider');
  }
  return context;
};
