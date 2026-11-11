import { apiClient } from '../../api/client';
import type { components } from './types';

export type User = components['schemas']['User'];
export type UserRole = components['schemas']['UserRole'];
export type LoginRequest = components['schemas']['LoginRequest'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type ChangePasswordRequest = components['schemas']['ChangePasswordRequest'];
export type CreateUserRequest = components['schemas']['CreateUserRequest'];
export type UpdateUserRequest = components['schemas']['UpdateUserRequest'];
export type UserErrorResponse = components['schemas']['ErrorResponse'];

export const usersApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const { data } = await apiClient.post<LoginResponse>('/auth/login', payload);
    return data;
  },

  async logout(): Promise<void> {
    await apiClient.post('/auth/logout');
  },

  async getCurrentUser(): Promise<User> {
    const { data } = await apiClient.get<User>('/auth/me');
    return data;
  },

  async changeOwnPassword(payload: ChangePasswordRequest): Promise<void> {
    await apiClient.put('/auth/password', payload);
  },

  async listUsers(): Promise<User[]> {
    const { data } = await apiClient.get<User[]>('/users');
    return data;
  },

  async getUserById(id: string): Promise<User> {
    const { data } = await apiClient.get<User>(`/users/${id}`);
    return data;
  },

  async createUser(payload: CreateUserRequest): Promise<User> {
    const { data } = await apiClient.post<User>('/users', payload);
    return data;
  },

  async updateUser(id: string, payload: UpdateUserRequest): Promise<User> {
    const { data } = await apiClient.put<User>(`/users/${id}`, payload);
    return data;
  },

  async deleteUser(id: string, confirm: boolean): Promise<void> {
    await apiClient.delete(`/users/${id}`, {
      params: { confirm },
    });
  },
};
