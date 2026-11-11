import { create } from 'zustand';
import { AxiosError } from 'axios';
import {
  telemetryApi,
  type DashboardOverviewResponse,
  type ServerLiveDetailResponse,
  type ServerHistoryResponse,
  type RetentionSettings,
  type HistoryRange,
  type TelemetryErrorResponse,
} from './api';

export interface TelemetryState {
  dashboard: DashboardOverviewResponse | null;
  liveDetail: ServerLiveDetailResponse | null;
  history: ServerHistoryResponse | null;
  retention: RetentionSettings | null;
  loading: boolean;
  error: string | null;

  fetchDashboard: () => Promise<void>;
  fetchLiveDetail: (serverId: string) => Promise<void>;
  fetchHistory: (serverId: string, range: HistoryRange) => Promise<void>;
  fetchRetention: () => Promise<void>;
  updateRetention: (retentionDays: number) => Promise<RetentionSettings>;
  clearError: () => void;
}

function extractTelemetryError(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as TelemetryErrorResponse | undefined;
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const useTelemetryStore = create<TelemetryState>((set) => ({
  dashboard: null,
  liveDetail: null,
  history: null,
  retention: { retention_days: 365, updated_at: new Date().toISOString() },
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchDashboard: async () => {
    set({ loading: true, error: null });
    try {
      const data = await telemetryApi.getDashboardOverview();
      set({ dashboard: data, loading: false });
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractTelemetryError(err, "No s'ha pogut carregar el Dashboard de servidors."),
      });
    }
  },

  fetchLiveDetail: async (serverId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await telemetryApi.getServerLatestTelemetry(serverId);
      set({ liveDetail: data, loading: false });
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractTelemetryError(err, "No s'ha pogut carregar el detall en viu del servidor."),
      });
    }
  },

  fetchHistory: async (serverId: string, range: HistoryRange) => {
    set({ loading: true, error: null });
    try {
      const data = await telemetryApi.getServerTelemetryHistory(serverId, { range });
      set({ history: data, loading: false });
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractTelemetryError(
          err,
          "No s'ha pogut carregar l'històric de telemetria del servidor."
        ),
      });
    }
  },

  fetchRetention: async () => {
    try {
      const data = await telemetryApi.getRetentionSettings();
      set({ retention: data });
    } catch {
      // Keep default 365 days if not yet loaded
    }
  },

  updateRetention: async (retentionDays: number) => {
    set({ error: null });
    try {
      const updated = await telemetryApi.updateRetentionSettings({
        retention_days: retentionDays,
      });
      set({ retention: updated });
      return updated;
    } catch (err: unknown) {
      const msg = extractTelemetryError(
        err,
        "No s'ha pogut actualitzar la política de retenció."
      );
      set({ error: msg });
      throw new Error(msg);
    }
  },
}));
