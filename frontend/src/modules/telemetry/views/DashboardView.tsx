import React, { useEffect } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Alert,
  CircularProgress,
  Button,
} from '@mui/material';
import { useTelemetryStore } from '../store';
import type { ServerDashboardSummary } from '../api';

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'mai';
  const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diffSec < 60) return `fa ${diffSec} segons`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `fa ${mins} min`;
  const hours = Math.floor(mins / 60);
  return `fa ${hours}h`;
}

export const DashboardView: React.FC = () => {
  const { dashboard, loading, error, fetchDashboard, clearError } = useTelemetryStore();

  useEffect(() => {
    void fetchDashboard();
    const timer = window.setInterval(() => {
      void fetchDashboard();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [fetchDashboard]);

  if (loading && !dashboard) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const servers: ServerDashboardSummary[] = dashboard?.servers ?? [];

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* KPI Strip */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
          <Typography sx={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            Servidors Monitoritzats
          </Typography>
          <Typography sx={{ fontSize: 24, fontWeight: 700, mt: 0.5, color: '#1e293b' }}>
            {dashboard?.online_servers ?? 0} / {dashboard?.total_servers ?? 0} Online
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
          <Typography sx={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            Contenidors Docker
          </Typography>
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 700,
              mt: 0.5,
              color: (dashboard?.total_down_containers ?? 0) > 0 ? '#dc2626' : '#16a34a',
            }}
          >
            {(dashboard?.total_down_containers ?? 0) > 0
              ? `${dashboard?.total_running_containers ?? 0} Run / ${dashboard?.total_down_containers} Down`
              : `${dashboard?.total_running_containers ?? 0} Running`}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
          <Typography sx={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            Endpoints HTTP (200/202)
          </Typography>
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 700,
              mt: 0.5,
              color:
                (dashboard?.http_endpoints_ok ?? 0) < (dashboard?.http_endpoints_total ?? 0)
                  ? '#dc2626'
                  : '#16a34a',
            }}
          >
            {dashboard?.http_endpoints_ok ?? 0} / {dashboard?.http_endpoints_total ?? 0} OK
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
          <Typography sx={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>
            Instàncies PostgreSQL
          </Typography>
          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 700,
              mt: 0.5,
              color:
                (dashboard?.postgres_instances_up ?? 0) < (dashboard?.postgres_instances_total ?? 0)
                  ? '#dc2626'
                  : '#16a34a',
            }}
          >
            {dashboard?.postgres_instances_up ?? 0} / {dashboard?.postgres_instances_total ?? 0} UP
          </Typography>
        </Paper>
      </Box>

      {/* Estat Buit si no hi ha servidors */}
      {servers.length === 0 ? (
        <Paper
          elevation={0}
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: '12px',
            p: '64px 24px',
            textAlign: 'center',
            bgcolor: '#ffffff',
          }}
        >
          <Typography component="h2" sx={{ fontSize: 18, fontWeight: 700, mb: 1, color: '#1e293b' }}>
            No tens cap servidor assignat
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#64748b', mb: 2.5 }}>
            Contacta amb un administrador (`ADMIN`) perquè et doni permís d&apos;accés als servidors que necessitis monitoritzar.
          </Typography>
          <Button
            component={RouterLink}
            to="/servers"
            variant="outlined"
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1976d2' }}
          >
            Anar a Inventari de Servidors
          </Button>
        </Paper>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
            gap: 3,
          }}
        >
          {servers.map((srv) => {
            const host = srv.host;
            const rootDisk = host?.disks?.find((d) => d.mount_point === '/') ?? host?.disks?.[0];
            const isCritical = srv.status === 'CRITICAL' || srv.status === 'OFFLINE';
            const isWarning = srv.status === 'WARNING';
            const needsReboot = srv.reboot_required || host?.reboot_required;
            const dockerHasDown = srv.docker_stopped_count > 0;
            const httpHasDown = srv.http_ok_count < srv.http_total_count;
            const pgHasDown = srv.postgres_up_count < srv.postgres_total_count;

            const memUsedGb = host ? (host.memory_used_mb / 1024).toFixed(2) : '0.00';
            const memTotalGb = host ? (host.memory_total_mb / 1024).toFixed(2) : '0.00';
            const swapUsedGb = host ? (host.swap_used_mb / 1024).toFixed(2) : '0.00';
            const swapTotalGb = host ? (host.swap_total_mb / 1024).toFixed(2) : '0.00';

            return (
              <Paper
                key={srv.server_id}
                elevation={0}
                sx={{
                  border: `1px solid ${isCritical ? '#fca5a5' : isWarning ? '#fde68a' : '#e2e8f0'}`,
                  borderRadius: '12px',
                  overflow: 'hidden',
                  bgcolor: '#ffffff',
                }}
              >
                {/* Capçalera de la targeta */}
                <Box
                  sx={{
                    p: '18px 22px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: 1.5,
                  }}
                >
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, color: '#1e293b' }}>
                        {srv.server_name}
                      </Typography>
                      {needsReboot && (
                        <Box
                          component="span"
                          sx={{
                            bgcolor: '#fef3c7',
                            color: '#92400e',
                            border: '1px solid #fde68a',
                            fontSize: 11,
                            fontWeight: 600,
                            px: 1,
                            py: 0.35,
                            borderRadius: '6px',
                          }}
                        >
                          ⚠ Reboot required
                        </Box>
                      )}
                    </Box>
                    <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.5 }}>
                      {host
                        ? `${host.os_name} • Kernel ${host.kernel_version} (${host.arch}) • Uptime: ${formatUptime(host.uptime_seconds)}`
                        : srv.description || 'Pendent de rebre el primer snapshot de telemetria'}
                    </Typography>
                  </Box>

                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 1.25,
                      py: 0.5,
                      borderRadius: '12px',
                      fontSize: 12,
                      fontWeight: 600,
                      bgcolor: isCritical ? '#fee2e2' : isWarning ? '#fef3c7' : '#dcfce7',
                      color: isCritical ? '#991b1b' : isWarning ? '#92400e' : '#166534',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {isCritical
                      ? `▲ ${srv.status}${srv.active_alerts_count > 0 ? ` (${srv.active_alerts_count} Alertes)` : ''}`
                      : `● ${srv.status}`}
                  </Box>
                </Box>

                {/* Bloc Consola MOTD fidel a l'especificació */}
                <Box
                  sx={{
                    bgcolor: '#0f172a',
                    color: '#f8fafc',
                    m: '18px 22px',
                    p: '16px 18px',
                    borderRadius: '8px',
                    fontFamily: '"Roboto Mono", monospace',
                    fontSize: 12.5,
                    lineHeight: 1.65,
                  }}
                >
                  <Box
                    sx={{
                      color: '#94a3b8',
                      mb: 1.25,
                      borderBottom: '1px dashed #334155',
                      pb: 0.75,
                    }}
                  >
                    System information as of{' '}
                    {srv.last_seen_at ? new Date(srv.last_seen_at).toUTCString() : 'N/A'}
                  </Box>
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: '4px 18px',
                    }}
                  >
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        System load:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host ? host.load_1m.toFixed(2) : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Processes:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host ? host.processes_count : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Usage of /:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {rootDisk
                          ? `${rootDisk.used_percent.toFixed(1)}% of ${rootDisk.total_gb.toFixed(2)}GB`
                          : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Users logged in:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host ? host.users_logged_in : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Memory usage:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host
                          ? `${Math.round(host.memory_percent)}% (${memUsedGb} / ${memTotalGb} GB)`
                          : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        IPv4 for {host?.network_interface || 'eth0'}:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host?.ipv4_address || '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Swap usage:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host
                          ? `${Math.round(host.swap_percent)}% (${swapUsedGb} / ${swapTotalGb} GB)`
                          : '—'}
                      </Box>
                    </Box>
                    <Box>
                      <Box component="span" sx={{ color: '#38bdf8' }}>
                        Agent RAM:{' '}
                      </Box>
                      <Box component="span" sx={{ fontWeight: 500 }}>
                        {host?.agent_memory_mb !== undefined
                          ? `${host.agent_memory_mb.toFixed(1)} MB / 30 MB`
                          : '9.2 MB / 30 MB'}
                      </Box>
                    </Box>
                  </Box>
                </Box>

                {/* Semàfor de les altres 3 potetes */}
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                    gap: 1.25,
                    px: '22px',
                    pb: '18px',
                  }}
                >
                  <Box
                    sx={{
                      border: `1px solid ${dockerHasDown ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      p: '10px 12px',
                      bgcolor: dockerHasDown ? '#fef2f2' : '#f8fafc',
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', mb: 0.5 }}>
                      Dockers
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: dockerHasDown ? '#dc2626' : '#16a34a' }}>
                      {srv.docker_running_count} running / {srv.docker_stopped_count}{' '}
                      {dockerHasDown ? 'EXITED' : 'caiguts'}
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      border: `1px solid ${httpHasDown ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      p: '10px 12px',
                      bgcolor: httpHasDown ? '#fef2f2' : '#f8fafc',
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', mb: 0.5 }}>
                      Endpoints HTTP
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: httpHasDown ? '#dc2626' : '#16a34a' }}>
                      {srv.http_ok_count}/{srv.http_total_count} OK (200/202
                      {srv.http_avg_latency_ms !== undefined ? ` • ${srv.http_avg_latency_ms}ms` : ''})
                    </Typography>
                  </Box>

                  <Box
                    sx={{
                      border: `1px solid ${pgHasDown ? '#fecaca' : '#e2e8f0'}`,
                      borderRadius: '8px',
                      p: '10px 12px',
                      bgcolor: pgHasDown ? '#fef2f2' : '#f8fafc',
                    }}
                  >
                    <Typography sx={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#64748b', mb: 0.5 }}>
                      PostgreSQL
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 600, color: pgHasDown ? '#dc2626' : '#16a34a' }}>
                      {srv.postgres_total_count === 0
                        ? 'No configurat'
                        : pgHasDown
                          ? `${srv.postgres_up_count}/${srv.postgres_total_count} UP (KO)`
                          : `UP • ${Math.round(srv.postgres_max_conn_percent ?? 0)}% conn (${((srv.postgres_total_size_mb ?? 0) / 1024).toFixed(1)} GB)`}
                    </Typography>
                  </Box>
                </Box>

                {/* Peu de la targeta */}
                <Box
                  sx={{
                    p: '12px 22px',
                    bgcolor: '#f8fafc',
                    borderTop: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: 12,
                    color: '#64748b',
                    flexWrap: 'wrap',
                    gap: 1,
                  }}
                >
                  <Box component="span">
                    Últim report: {formatRelativeTime(srv.last_seen_at)} (cicle{' '}
                    {Math.round((srv.report_interval_seconds ?? 300) / 60)}m)
                  </Box>
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <RouterLink
                      to={`/servers/${srv.server_id}/history`}
                      style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                    >
                      Històric &amp; Gràfiques
                    </RouterLink>
                    <RouterLink
                      to={`/servers/${srv.server_id}`}
                      style={{ color: '#1976d2', textDecoration: 'none', fontWeight: 600, fontSize: 13 }}
                    >
                      Veure Detall Complet →
                    </RouterLink>
                  </Box>
                </Box>
              </Paper>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
