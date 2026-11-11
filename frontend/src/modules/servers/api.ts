import { apiClient } from '../../api/client';
import type { components } from './types';

export type Server = components['schemas']['Server'];
export type ServerStatus = components['schemas']['ServerStatus'];
export type ServerMonitoringConfig = components['schemas']['ServerMonitoringConfig'];
export type HostPillarConfig = components['schemas']['HostPillarConfig'];
export type HostThresholdsConfig = components['schemas']['HostThresholdsConfig'];
export type DockerPillarConfig = components['schemas']['DockerPillarConfig'];
export type HttpEndpointCheckConfig = components['schemas']['HttpEndpointCheckConfig'];
export type PostgresPillarConfig = components['schemas']['PostgresPillarConfig'];
export type PostgresInstanceConfig = components['schemas']['PostgresInstanceConfig'];
export type SmtpNotificationConfig = components['schemas']['SmtpNotificationConfig'];
export type CreateServerRequest = components['schemas']['CreateServerRequest'];
export type CreateServerResponse = components['schemas']['CreateServerResponse'];
export type UpdateServerRequest = components['schemas']['UpdateServerRequest'];
export type RotateApiKeyResponse = components['schemas']['RotateApiKeyResponse'];
export type ServerYamlBundleResponse = components['schemas']['ServerYamlBundleResponse'];
export type ServerErrorResponse = components['schemas']['ErrorResponse'];
export type DeploymentStatus = components['schemas']['DeploymentStatus'];
export type Deployment = components['schemas']['Deployment'];
export type CreateDeploymentRequest = components['schemas']['CreateDeploymentRequest'];
export type ListDeploymentsResponse = components['schemas']['ListDeploymentsResponse'];

export const serversApi = {
  async listServers(): Promise<Server[]> {
    const { data } = await apiClient.get<Server[]>('/servers');
    return data;
  },

  async createServer(payload: CreateServerRequest): Promise<CreateServerResponse> {
    const { data } = await apiClient.post<CreateServerResponse>('/servers', payload);
    return data;
  },

  async getServerById(id: string): Promise<Server> {
    const { data } = await apiClient.get<Server>(`/servers/${id}`);
    return data;
  },

  async updateServer(id: string, payload: UpdateServerRequest): Promise<Server> {
    const { data } = await apiClient.put<Server>(`/servers/${id}`, payload);
    return data;
  },

  async deleteServer(id: string, confirm: boolean): Promise<void> {
    await apiClient.delete(`/servers/${id}`, {
      params: { confirm },
    });
  },

  async rotateServerApiKey(id: string): Promise<RotateApiKeyResponse> {
    const { data } = await apiClient.post<RotateApiKeyResponse>(`/servers/${id}/rotate-key`);
    return data;
  },

  async getServerConfigYaml(id: string): Promise<ServerYamlBundleResponse> {
    const { data } = await apiClient.get<ServerYamlBundleResponse>(`/servers/${id}/config-yaml`);
    return data;
  },

  async listServerDeployments(
    serverId: string,
    params?: { limit?: number; offset?: number }
  ): Promise<ListDeploymentsResponse> {
    const { data } = await apiClient.get<ListDeploymentsResponse>(
      `/servers/${serverId}/deploys`,
      { params }
    );
    return data;
  },

  async createServerDeployment(
    serverId: string,
    payload: CreateDeploymentRequest
  ): Promise<Deployment> {
    const { data } = await apiClient.post<Deployment>(
      `/servers/${serverId}/deploys`,
      payload
    );
    return data;
  },
};
