import { apiClient } from '../../api/client';
import type { components, operations } from './types';

export type DiskMountUsage = components['schemas']['DiskMountUsage'];
export type HostMetricsSnapshot = components['schemas']['HostMetricsSnapshot'];
export type DockerContainerSnapshot = components['schemas']['DockerContainerSnapshot'];
export type DockerMetricsSnapshot = components['schemas']['DockerMetricsSnapshot'];
export type HttpEndpointSnapshot = components['schemas']['HttpEndpointSnapshot'];
export type PostgresDatabaseInfo = components['schemas']['PostgresDatabaseInfo'];
export type PostgresInstanceSnapshot = components['schemas']['PostgresInstanceSnapshot'];
export type ServerDashboardSummary = components['schemas']['ServerDashboardSummary'];
export type DashboardOverviewResponse = components['schemas']['DashboardOverviewResponse'];
export type ServerLiveDetailResponse = components['schemas']['ServerLiveDetailResponse'];
export type TelemetryHistoryPoint = components['schemas']['TelemetryHistoryPoint'];
export type ServerHistoryResponse = components['schemas']['ServerHistoryResponse'];
export type RetentionSettings = components['schemas']['RetentionSettings'];
export type UpdateRetentionRequest = components['schemas']['UpdateRetentionRequest'];
export type TelemetryErrorResponse = components['schemas']['ErrorResponse'];
export type HistoryRange = NonNullable<
  NonNullable<operations['getServerTelemetryHistory']['parameters']['query']>['range']
>;

export const telemetryApi = {
  async getDashboardOverview(): Promise<DashboardOverviewResponse> {
    const { data } = await apiClient.get<DashboardOverviewResponse>('/telemetry/dashboard');
    return data;
  },

  async getServerLatestTelemetry(serverId: string): Promise<ServerLiveDetailResponse> {
    const { data } = await apiClient.get<ServerLiveDetailResponse>(
      `/servers/${serverId}/telemetry/latest`
    );
    return data;
  },

  async getServerTelemetryHistory(
    serverId: string,
    params?: { range?: HistoryRange; from?: string; to?: string }
  ): Promise<ServerHistoryResponse> {
    const { data } = await apiClient.get<ServerHistoryResponse>(
      `/servers/${serverId}/telemetry/history`,
      { params }
    );
    return data;
  },

  async getRetentionSettings(): Promise<RetentionSettings> {
    const { data } = await apiClient.get<RetentionSettings>('/settings/retention');
    return data;
  },

  async updateRetentionSettings(payload: UpdateRetentionRequest): Promise<RetentionSettings> {
    const { data } = await apiClient.put<RetentionSettings>('/settings/retention', payload);
    return data;
  },
};
