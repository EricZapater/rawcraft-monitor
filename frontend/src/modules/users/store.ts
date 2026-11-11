import { create } from 'zustand';
import { AxiosError } from 'axios';
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from '../../api/client';
import {
  usersApi,
  type User,
  type LoginRequest,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type UpdateUserRequest,
  type UserErrorResponse,
} from './api';

function loadStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export interface UsersState {
  token: string | null;
  currentUser: User | null;
  authLoading: boolean;
  authError: string | null;
  authErrorStatus: number | null;

  users: User[];
  usersLoading: boolean;
  usersError: string | null;
  usersErrorStatus: number | null;

  login: (payload: LoginRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  fetchCurrentUser: () => Promise<void>;
  changeOwnPassword: (payload: ChangePasswordRequest) => Promise<void>;
  clearAuthError: () => void;

  fetchUsers: () => Promise<void>;
  createUser: (payload: CreateUserRequest) => Promise<User>;
  updateUser: (id: string, payload: UpdateUserRequest) => Promise<User>;
  deleteUser: (id: string, confirm: boolean) => Promise<void>;
  clearUsersError: () => void;
}

function extractApiError(err: unknown, fallback: string): { message: string; status: number | null } {
  if (err instanceof AxiosError) {
    const data = err.response?.data as UserErrorResponse | undefined;
    const status = err.response?.status ?? null;
    if (data?.message) {
      return { message: data.message, status };
    }
    if (status === 401) {
      return { message: "Credencials invàlides o compte d'usuari inactiu.", status: 401 };
    }
    if (status === 409) {
      return { message: 'Ja existeix un usuari registrat amb aquest correu electrònic.', status: 409 };
    }
  }
  if (err instanceof Error) {
    return { message: err.message, status: null };
  }
  return { message: fallback, status: null };
}

export const useUsersStore = create<UsersState>((set, get) => ({
  token: localStorage.getItem(TOKEN_STORAGE_KEY),
  currentUser: loadStoredUser(),
  authLoading: false,
  authError: null,
  authErrorStatus: null,

  users: [],
  usersLoading: false,
  usersError: null,
  usersErrorStatus: null,

  clearAuthError: () => set({ authError: null, authErrorStatus: null }),
  clearUsersError: () => set({ usersError: null, usersErrorStatus: null }),

  login: async (payload: LoginRequest) => {
    set({ authLoading: true, authError: null, authErrorStatus: null });
    try {
      const response = await usersApi.login(payload);
      localStorage.setItem(TOKEN_STORAGE_KEY, response.token);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.user));
      set({
        token: response.token,
        currentUser: response.user,
        authLoading: false,
        authError: null,
        authErrorStatus: null,
      });
      return true;
    } catch (err: unknown) {
      const { message, status } = extractApiError(
        err,
        "No s'ha pogut iniciar sessió. Comprova les teves credencials."
      );
      set({
        authLoading: false,
        authError: message,
        authErrorStatus: status ?? 401,
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await usersApi.logout();
    } catch {
      // Ignore network error on logout; always clear local session
    } finally {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      localStorage.removeItem(USER_STORAGE_KEY);
      set({
        token: null,
        currentUser: null,
        authError: null,
        authErrorStatus: null,
      });
    }
  },

  fetchCurrentUser: async () => {
    const token = get().token;
    if (!token) return;
    set({ authLoading: true });
    try {
      const user = await usersApi.getCurrentUser();
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      set({ currentUser: user, authLoading: false });
    } catch {
      set({ authLoading: false });
    }
  },

  changeOwnPassword: async (payload: ChangePasswordRequest) => {
    set({ authLoading: true, authError: null, authErrorStatus: null });
    try {
      await usersApi.changeOwnPassword(payload);
      set({ authLoading: false });
    } catch (err: unknown) {
      const { message, status } = extractApiError(
        err,
        "No s'ha pogut actualitzar la contrasenya."
      );
      set({ authLoading: false, authError: message, authErrorStatus: status });
      throw new Error(message);
    }
  },

  fetchUsers: async () => {
    set({ usersLoading: true, usersError: null, usersErrorStatus: null });
    try {
      const items = await usersApi.listUsers();
      set({ users: items, usersLoading: false });
    } catch (err: unknown) {
      const { message, status } = extractApiError(err, "Error carregant el llistat d'usuaris.");
      set({ usersLoading: false, usersError: message, usersErrorStatus: status });
    }
  },

  createUser: async (payload: CreateUserRequest) => {
    set({ usersError: null, usersErrorStatus: null });
    try {
      const created = await usersApi.createUser(payload);
      set((state) => ({ users: [...state.users, created] }));
      return created;
    } catch (err: unknown) {
      const { message, status } = extractApiError(err, "No s'ha pogut crear l'usuari.");
      set({ usersError: message, usersErrorStatus: status });
      throw err;
    }
  },

  updateUser: async (id: string, payload: UpdateUserRequest) => {
    set({ usersError: null, usersErrorStatus: null });
    try {
      const updated = await usersApi.updateUser(id, payload);
      set((state) => ({
        users: state.users.map((u) => (u.id === id ? updated : u)),
        currentUser: state.currentUser?.id === id ? updated : state.currentUser,
      }));
      return updated;
    } catch (err: unknown) {
      const { message, status } = extractApiError(err, "No s'ha pogut actualitzar l'usuari.");
      set({ usersError: message, usersErrorStatus: status });
      throw err;
    }
  },

  deleteUser: async (id: string, confirm: boolean) => {
    set({ usersError: null, usersErrorStatus: null });
    try {
      await usersApi.deleteUser(id, confirm);
      set((state) => ({
        users: state.users.filter((u) => u.id !== id),
      }));
    } catch (err: unknown) {
      const { message, status } = extractApiError(err, "No s'ha pogut donar de baixa l'usuari.");
      set({ usersError: message, usersErrorStatus: status });
      throw err;
    }
  },
}));
