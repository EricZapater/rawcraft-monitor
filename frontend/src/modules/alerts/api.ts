import { apiClient } from '../../api/client';
import type { components, operations } from './types';

export type Alert = components['schemas']['Alert'];
export type AlertStatus = components['schemas']['AlertStatus'];
export type AlertCategory = components['schemas']['AlertCategory'];
export type AlertSeverity = components['schemas']['AlertSeverity'];
export type AlertsListResponse = components['schemas']['AlertsListResponse'];
export type AlertErrorResponse = components['schemas']['ErrorResponse'];
export type ListAlertsQuery = NonNullable<operations['listAlerts']['parameters']['query']>;

export const alertsApi = {
  async listAlerts(params?: ListAlertsQuery): Promise<AlertsListResponse> {
    const { data } = await apiClient.get<AlertsListResponse>('/alerts', { params });
    return data;
  },

  async acknowledgeAlert(id: string): Promise<Alert> {
    const { data } = await apiClient.post<Alert>(`/alerts/${id}/acknowledge`);
    return data;
  },

  async resolveAlert(id: string): Promise<Alert> {
    const { data } = await apiClient.post<Alert>(`/alerts/${id}/resolve`);
    return data;
  },
};
