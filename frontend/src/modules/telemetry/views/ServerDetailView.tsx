import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTelemetryStore } from '../store';
import type { DockerContainerSnapshot } from '../api';

type SortField = 'name' | 'cpu_percent' | 'memory_percent';

export const ServerDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { liveDetail, loading, error, fetchLiveDetail, clearError } = useTelemetryStore();

  const [sortBy, setSortBy] = useState<SortField>('memory_percent');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!id) return;
    void fetchLiveDetail(id);
    const timer = window.setInterval(() => {
      void fetchLiveDetail(id);
    }, 15000);
    return () => window.clearInterval(timer);
  }, [id, fetchLiveDetail]);

  const sortedContainers: DockerContainerSnapshot[] = useMemo(() => {
    const list = [...(liveDetail?.docker?.containers ?? [])];
    list.sort((a, b) => {
      const mul = sortAsc ? 1 : -1;
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name) * mul;
      }
      return (a[sortBy] - b[sortBy]) * mul;
    });
    return list;
  }, [liveDetail?.docker?.containers, sortBy, sortAsc]);

  const handleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(field);
      setSortAsc(false);
    }
  };

  if (loading && !liveDetail) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const host = liveDetail?.host;
  const rootDisk = host?.disks?.find((d) => d.mount_point === '/') ?? host?.disks?.[0];
  const httpEndpoints = liveDetail?.http_endpoints ?? [];
  const pgInstances = liveDetail?.postgres_instances ?? [];
  const dockerDaemonUp = liveDetail?.docker?.docker_daemon_up ?? true;

  return (
    <Box>
      {/* Barra de navegació del detall */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2.5,
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            component={RouterLink}
            to="/"
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
          >
            ← Tornar al Dashboard
          </Button>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            Detall en viu: <code>{liveDetail?.server_name || id}</code> (`HU-TEL-03`)
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12.5, color: '#64748b' }}>
            System information as of{' '}
            {liveDetail?.recorded_at ? new Date(liveDetail.recorded_at).toUTCString() : 'N/A'}
          </Typography>
          {id && (
            <Button
              component={RouterLink}
              to={`/servers/${id}/history`}
              variant="outlined"
              size="small"
              sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1976d2', fontWeight: 600 }}
            >
              Històric &amp; Gràfiques →
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Banner de Sistema Operatiu + Reboot Required */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          p: '16px 20px',
          mb: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1.5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#1e293b' }}>
            {liveDetail?.server_name}{' '}
            <Box
              component="span"
              sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 13, color: '#64748b', fontWeight: 400 }}
            >
              ({host?.network_interface || 'eth0'}: {host?.ipv4_address || '—'})
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5 }}>
            <strong>SO:</strong> {host?.os_name || '—'} &nbsp;|&nbsp;{' '}
            <strong>Kernel:</strong> {host?.kernel_version || '—'} ({host?.arch || 'amd64'}) &nbsp;|&nbsp;{' '}
            <strong>Load:</strong>{' '}
            {host
              ? `${host.load_1m.toFixed(2)} / ${host.load_5m.toFixed(2)} / ${host.load_15m.toFixed(2)}`
              : '—'}{' '}
            &nbsp;|&nbsp; <strong>Disc /:</strong>{' '}
            {rootDisk ? `${rootDisk.used_percent.toFixed(1)}% of ${rootDisk.total_gb.toFixed(2)}GB` : '—'}{' '}
            &nbsp;|&nbsp; <strong>RAM:</strong> {host ? `${Math.round(host.memory_percent)}%` : '—'}{' '}
            &nbsp;|&nbsp; <strong>Swap:</strong> {host ? `${Math.round(host.swap_percent)}%` : '—'}{' '}
            &nbsp;|&nbsp; <strong>Procs:</strong> {host?.processes_count ?? '—'} &nbsp;|&nbsp;{' '}
            <strong>Users:</strong> {host?.users_logged_in ?? '—'}
          </Typography>
        </Box>

        {host?.reboot_required && (
          <Box
            component="span"
            sx={{
              bgcolor: '#fef3c7',
              color: '#92400e',
              border: '1px solid #fde68a',
              fontSize: 12,
              fontWeight: 600,
              px: 1.25,
              py: 0.6,
              borderRadius: '6px',
            }}
          >
            ⚠ Reboot required (`/var/run/reboot-required`)
          </Box>
        )}
      </Paper>

      {/* TAULA DE CONTENIDORS DOCKER AMB CPU I RAM */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          mb: 2.5,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            p: '14px 20px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 1,
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
              Contenidors Docker Monitoritzats (Llista Blanca)
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.25 }}>
              {sortedContainers.length} monitoritzats • Total al host: {liveDetail?.docker?.total_host_containers ?? sortedContainers.length} ({liveDetail?.docker?.running_host_containers ?? sortedContainers.length} actius, {liveDetail?.docker?.stopped_host_containers ?? 0} aturats)
            </Typography>
          </Box>
          <Typography
            sx={{
              fontFamily: '"Roboto Mono", monospace',
              fontSize: 12,
              fontWeight: 600,
              color: dockerDaemonUp ? '#16a34a' : '#dc2626',
            }}
          >
            dockerd: {dockerDaemonUp ? 'UP' : 'DOWN'}
          </Typography>
        </Box>

        <Box
          tabIndex={0}
          role="region"
          aria-label="Taula de contenidors Docker amb CPU i RAM"
          sx={{ overflowX: 'auto', maxWidth: '100%' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead style={{ position: 'sticky', insetBlockStart: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th
                  onClick={() => handleSort('name')}
                  style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Contenidor {sortBy === 'name' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Imatge
                </th>
                <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Estat &amp; Healthcheck
                </th>
                <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Uptime / Status
                </th>
                <th
                  onClick={() => handleSort('cpu_percent')}
                  style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  CPU (%) {sortBy === 'cpu_percent' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
                <th
                  onClick={() => handleSort('memory_percent')}
                  style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Memòria RAM (MB / Límit / %) {sortBy === 'memory_percent' ? (sortAsc ? '↑' : '↓') : ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedContainers.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                    Cap contenidor reportat en l&apos;últim snapshot.
                  </td>
                </tr>
              ) : (
                sortedContainers.map((c) => {
                  const isOk = c.state === 'running' && c.health !== 'unhealthy';
                  return (
                    <tr key={c.container_id || c.name} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}>
                        {c.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {c.image}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.35,
                            borderRadius: '12px',
                            fontSize: 11,
                            fontWeight: 600,
                            bgcolor: isOk ? '#dcfce7' : '#fee2e2',
                            color: isOk ? '#166534' : '#991b1b',
                          }}
                        >
                          {c.state}
                          {c.health && c.health !== 'none' ? ` (${c.health})` : ''}
                          {!isOk && c.exit_code ? ` [${c.exit_code}]` : ''}
                        </Box>
                      </td>
                      <td style={{ padding: '12px 16px' }}>{c.status}</td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {c.cpu_percent.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        <Box
                          component="span"
                          sx={{
                            width: 110,
                            height: 7,
                            bgcolor: '#e2e8f0',
                            borderRadius: '4px',
                            overflow: 'hidden',
                            display: 'inline-block',
                            verticalAlign: 'middle',
                            mr: 1,
                          }}
                        >
                          <Box
                            sx={{
                              height: '100%',
                              width: `${Math.min(100, Math.max(0, c.memory_percent))}%`,
                              bgcolor: c.memory_percent > 85 ? '#dc2626' : '#1976d2',
                            }}
                          />
                        </Box>
                        {Math.round(c.memory_used_mb)} MB / {Math.round(c.memory_limit_mb)} MB (
                        {c.memory_percent.toFixed(1)}%)
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Box>
      </Paper>

      {/* GRID ENDPOINTS HTTP (200/202) & POTETA POSTGRESQL */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.2fr 0.8fr' },
          gap: 2.5,
        }}
      >
        {/* TAULA D'ENDPOINTS HTTP */}
        <Paper
          elevation={0}
          sx={{
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <Box sx={{ p: '14px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
              Endpoints HTTP d&apos;Aplicacions (Esperant 200 / 202)
            </Typography>
          </Box>
          <Box
            tabIndex={0}
            role="region"
            aria-label="Taula d'endpoints HTTP d'aplicacions"
            sx={{ overflowX: 'auto', maxWidth: '100%' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Aplicació
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    URL
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Esperat
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Rebut
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Latència
                  </th>
                </tr>
              </thead>
              <tbody>
                {httpEndpoints.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Cap endpoint HTTP configurat.
                    </td>
                  </tr>
                ) : (
                  httpEndpoints.map((ep) => (
                    <tr key={`${ep.name}-${ep.url}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{ep.name}</td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {ep.url}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {ep.expected_status_codes.join(', ')}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            px: 1,
                            py: 0.35,
                            borderRadius: '12px',
                            fontSize: 11,
                            fontWeight: 600,
                            bgcolor: ep.up ? '#dcfce7' : '#fee2e2',
                            color: ep.up ? '#166534' : '#991b1b',
                          }}
                        >
                          {ep.status_code > 0
                            ? `${ep.status_code} ${ep.up ? 'OK' : 'KO'}`
                            : ep.error_message || 'Timeout / Conn Error'}
                        </Box>
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {ep.response_time_ms} ms
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </Box>
        </Paper>

        {/* POTETA POSTGRESQL DINS DOCKER */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {pgInstances.length === 0 ? (
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 1 }}>
                Poteta PostgreSQL
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                Cap instància PostgreSQL activa en aquest servidor.
              </Typography>
            </Paper>
          ) : (
            pgInstances.map((pg) => (
              <Paper
                key={pg.name}
                elevation={0}
                sx={{
                  border: '1px solid #e2e8f0',
                  borderRadius: '10px',
                  overflow: 'hidden',
                }}
              >
                <Box
                  sx={{
                    p: '14px 20px',
                    borderBottom: '1px solid #e2e8f0',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                    Poteta PostgreSQL (`{pg.name}`)
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      px: 1,
                      py: 0.35,
                      borderRadius: '12px',
                      fontSize: 11,
                      fontWeight: 600,
                      bgcolor: pg.up ? '#dcfce7' : '#fee2e2',
                      color: pg.up ? '#166534' : '#991b1b',
                    }}
                  >
                    SELECT 1: {pg.up ? `UP (${pg.latency_ms} ms)` : 'DOWN'}
                  </Box>
                </Box>

                <Box sx={{ p: '18px 20px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                        Connexions Actives vs. `max_connections`
                      </Typography>
                      <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        {pg.active_connections} / {pg.max_connections} ({pg.connections_percent.toFixed(1)}%)
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: '100%',
                        height: 9,
                        bgcolor: '#e2e8f0',
                        borderRadius: '4px',
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          height: '100%',
                          width: `${Math.min(100, Math.max(0, pg.connections_percent))}%`,
                          bgcolor: pg.connections_percent > 80 ? '#dc2626' : '#1976d2',
                        }}
                      />
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #e2e8f0',
                      pt: 1.25,
                    }}
                  >
                    <Box component="span">Mida Total Bases de Dades (`pg_database_size`):</Box>
                    <Box component="strong" sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                      {Math.round(pg.database_size_mb).toLocaleString()} MB (
                      {(pg.database_size_mb / 1024).toFixed(2)} GB)
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #e2e8f0',
                      pt: 1.25,
                    }}
                  >
                    <Box component="span">Consultes lentes (&gt; 60s):</Box>
                    <Box
                      component="strong"
                      sx={{
                        fontFamily: '"Roboto Mono", monospace',
                        fontSize: 12,
                        color: pg.long_running_queries > 0 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {pg.long_running_queries}
                    </Box>
                  </Box>

                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #e2e8f0',
                      pt: 1.25,
                    }}
                  >
                    <Box component="span">Locks en espera (`locks_waiting`):</Box>
                    <Box
                      component="strong"
                      sx={{
                        fontFamily: '"Roboto Mono", monospace',
                        fontSize: 12,
                        color: pg.locks_waiting > 0 ? '#dc2626' : '#16a34a',
                      }}
                    >
                      {pg.locks_waiting}
                    </Box>
                  </Box>
                </Box>
              </Paper>
            ))
          )}
        </Box>
      </Box>
    </Box>
  );
};
