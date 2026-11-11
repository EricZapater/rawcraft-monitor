import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUsersStore } from '../modules/users/store';
import { AppLayout } from '../components/AppLayout';
import { LoginView } from '../modules/users/views/LoginView';
import { UsersView } from '../modules/users/views/UsersView';
import { ServersListView } from '../modules/servers/views/ServersListView';
import { ServerConfigYamlView } from '../modules/servers/views/ServerConfigYamlView';
import { DashboardView } from '../modules/telemetry/views/DashboardView';
import { ServerDetailView } from '../modules/telemetry/views/ServerDetailView';
import { ServerHistoryView } from '../modules/telemetry/views/ServerHistoryView';
import { AlertsView } from '../modules/alerts/views/AlertsView';

const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const token = useUsersStore((s) => s.token);
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const currentUser = useUsersStore((s) => s.currentUser);
  if (currentUser && currentUser.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return children;
};

export const AppRouter: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginView />} />

        <Route
          path="/"
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route index element={<DashboardView />} />
          <Route path="servers" element={<ServersListView />} />
          <Route path="servers/:id" element={<ServerDetailView />} />
          <Route path="servers/:id/history" element={<ServerHistoryView />} />
          <Route path="servers/:id/config" element={<ServerConfigYamlView />} />
          <Route path="alerts" element={<AlertsView />} />
          <Route
            path="users"
            element={
              <RequireAdmin>
                <UsersView />
              </RequireAdmin>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
