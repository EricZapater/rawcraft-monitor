import { create } from 'zustand';
import { AxiosError } from 'axios';
import {
  alertsApi,
  type Alert,
  type ListAlertsQuery,
  type AlertErrorResponse,
} from './api';

export interface AlertsState {
  items: Alert[];
  activeFiringCount: number;
  loading: boolean;
  error: string | null;

  fetchAlerts: (params?: ListAlertsQuery) => Promise<void>;
  acknowledgeAlert: (id: string) => Promise<void>;
  clearError: () => void;
}

function extractAlertError(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as AlertErrorResponse | undefined;
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  items: [],
  activeFiringCount: 0,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchAlerts: async (params?: ListAlertsQuery) => {
    set({ loading: true, error: null });
    try {
      const response = await alertsApi.listAlerts(params);
      set({
        items: response.items,
        activeFiringCount: response.active_firing_count,
        loading: false,
      });
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractAlertError(err, "No s'ha pogut carregar el llistat d'alertes."),
      });
    }
  },

  acknowledgeAlert: async (id: string) => {
    set({ error: null });
    try {
      const updated = await alertsApi.acknowledgeAlert(id);
      set((state) => ({
        items: state.items.map((item) => (item.id === id ? updated : item)),
      }));
    } catch (err: unknown) {
      const msg = extractAlertError(err, "No s'ha pogut reconèixer l'alerta.");
      set({ error: msg });
      throw new Error(msg);
    }
  },
}));
