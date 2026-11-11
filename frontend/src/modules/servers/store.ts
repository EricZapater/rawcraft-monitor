import { create } from 'zustand';
import { AxiosError } from 'axios';
import {
  serversApi,
  type Server,
  type CreateServerRequest,
  type CreateServerResponse,
  type UpdateServerRequest,
  type RotateApiKeyResponse,
  type ServerYamlBundleResponse,
  type ServerErrorResponse,
} from './api';

export interface ServersState {
  servers: Server[];
  currentServer: Server | null;
  yamlBundle: ServerYamlBundleResponse | null;
  loading: boolean;
  error: string | null;

  fetchServers: () => Promise<void>;
  fetchServerById: (id: string) => Promise<Server | null>;
  createServer: (payload: CreateServerRequest) => Promise<CreateServerResponse>;
  updateServer: (id: string, payload: UpdateServerRequest) => Promise<Server>;
  deleteServer: (id: string, confirm: boolean) => Promise<void>;
  rotateApiKey: (id: string) => Promise<RotateApiKeyResponse>;
  fetchConfigYaml: (id: string) => Promise<ServerYamlBundleResponse>;
  clearError: () => void;
}

function extractServerError(err: unknown, fallback: string): string {
  if (err instanceof AxiosError) {
    const data = err.response?.data as ServerErrorResponse | undefined;
    if (data?.message) return data.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

export const useServersStore = create<ServersState>((set) => ({
  servers: [],
  currentServer: null,
  yamlBundle: null,
  loading: false,
  error: null,

  clearError: () => set({ error: null }),

  fetchServers: async () => {
    set({ loading: true, error: null });
    try {
      const items = await serversApi.listServers();
      set({ servers: items, loading: false });
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractServerError(err, "No s'ha pogut carregar l'inventari de servidors."),
      });
    }
  },

  fetchServerById: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const server = await serversApi.getServerById(id);
      set({ currentServer: server, loading: false });
      return server;
    } catch (err: unknown) {
      set({
        loading: false,
        error: extractServerError(err, "No s'ha pogut carregar la configuració del servidor."),
      });
      return null;
    }
  },

  createServer: async (payload: CreateServerRequest) => {
    set({ error: null });
    try {
      const res = await serversApi.createServer(payload);
      set((state) => ({ servers: [...state.servers, res.server] }));
      return res;
    } catch (err: unknown) {
      const msg = extractServerError(err, "No s'ha pogut registrar el servidor.");
      set({ error: msg });
      throw new Error(msg);
    }
  },

  updateServer: async (id: string, payload: UpdateServerRequest) => {
    set({ error: null });
    try {
      const updated = await serversApi.updateServer(id, payload);
      set((state) => ({
        servers: state.servers.map((s) => (s.id === id ? updated : s)),
        currentServer: state.currentServer?.id === id ? updated : state.currentServer,
      }));
      return updated;
    } catch (err: unknown) {
      const msg = extractServerError(err, "No s'ha pogut desar la configuració del servidor.");
      set({ error: msg });
      throw new Error(msg);
    }
  },

  deleteServer: async (id: string, confirm: boolean) => {
    set({ error: null });
    try {
      await serversApi.deleteServer(id, confirm);
      set((state) => ({
        servers: state.servers.filter((s) => s.id !== id),
      }));
    } catch (err: unknown) {
      const msg = extractServerError(err, "No s'ha pogut donar de baixa el servidor.");
      set({ error: msg });
      throw new Error(msg);
    }
  },

  rotateApiKey: async (id: string) => {
    set({ error: null });
    try {
      return await serversApi.rotateServerApiKey(id);
    } catch (err: unknown) {
      const msg = extractServerError(err, "No s'ha pogut regenerar l'API Key.");
      set({ error: msg });
      throw new Error(msg);
    }
  },

  fetchConfigYaml: async (id: string) => {
    set({ error: null });
    try {
      const bundle = await serversApi.getServerConfigYaml(id);
      set({ yamlBundle: bundle });
      return bundle;
    } catch (err: unknown) {
      const msg = extractServerError(err, "No s'ha pogut generar el paquet config.yaml.");
      set({ error: msg });
      throw new Error(msg);
    }
  },
}));
