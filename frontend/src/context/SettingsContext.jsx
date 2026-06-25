import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../api/client';
import { useAuth } from './AuthContext';

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const { user } = useAuth();
  const [settings, setSettings] = useState({
    store_name: 'My Supermarket',
    currency_symbol: 'Rs.',
    default_tax_percent: '5',
    invoice_prefix: 'INV',
  });

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/settings');
      setSettings((prev) => ({ ...prev, ...data.settings }));
    } catch {
      // Keep defaults if not yet logged in or request fails
    }
  }, []);

  useEffect(() => {
    if (user) refresh();
  }, [user, refresh]);

  const formatMoney = useCallback(
    (value) => {
      const num = Number(value || 0);
      return `${settings.currency_symbol} ${num.toFixed(2)}`;
    },
    [settings.currency_symbol]
  );

  return (
    <SettingsContext.Provider value={{ settings, refresh, formatMoney }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
