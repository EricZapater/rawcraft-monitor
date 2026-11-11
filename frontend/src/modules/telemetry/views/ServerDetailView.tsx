import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
  TablePagination,
} from '@mui/material';
import { useTelemetryStore } from '../store';
import type {
  DockerContainerSnapshot,
  HttpEndpointSnapshot,
  PostgresDatabaseInfo,
  PostgresInstanceSnapshot,
} from '../api';

type DockerSortField = 'name' | 'cpu_percent' | 'memory_percent';
type DbSortField = 'name' | 'size_mb';

interface FlattenedDatabaseItem extends PostgresDatabaseInfo {
  instanceName: string;
  instanceTotalMB: number;
}

function a11yProps(index: number) {
  return {
    id: `server-tab-${index}`,
    'aria-controls': `server-tabpanel-${index}`,
  };
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`server-tabpanel-${index}`}
      aria-labelledby={`server-tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ pt: 1.5 }}>{children}</Box>}
    </div>
  );
}

function formatBytesOrMB(mb: number): string {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

export const ServerDetailView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { liveDetail, loading, error, fetchLiveDetail, clearError } = useTelemetryStore();

  const [activeTab, setActiveTab] = useState<number>(0);

  // Paginació i ordenació de Docker
  const [dockerSortBy, setDockerSortBy] = useState<DockerSortField>('memory_percent');
  const [dockerSortAsc, setDockerSortAsc] = useState(false);
  const [dockerPage, setDockerPage] = useState<number>(0);
  const [dockerRowsPerPage, setDockerRowsPerPage] = useState<number>(20);

  // Paginació d'Endpoints HTTP
  const [httpPage, setHttpPage] = useState<number>(0);
  const [httpRowsPerPage, setHttpRowsPerPage] = useState<number>(20);

  // Paginació i ordenació de Bases de Dades PostgreSQL
  const [dbSortBy, setDbSortBy] = useState<DbSortField>('size_mb');
  const [dbSortAsc, setDbSortAsc] = useState<boolean>(false);
  const [dbPage, setDbPage] = useState<number>(0);
  const [dbRowsPerPage, setDbRowsPerPage] = useState<number>(20);

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
      const mul = dockerSortAsc ? 1 : -1;
      if (dockerSortBy === 'name') {
        return a.name.localeCompare(b.name) * mul;
      }
      return (a[dockerSortBy] - b[dockerSortBy]) * mul;
    });
    return list;
  }, [liveDetail?.docker?.containers, dockerSortBy, dockerSortAsc]);

  const handleDockerSort = (field: DockerSortField) => {
    if (dockerSortBy === field) {
      setDockerSortAsc((prev) => !prev);
    } else {
      setDockerSortBy(field);
      setDockerSortAsc(false);
    }
    setDockerPage(0);
  };

  const httpEndpoints: HttpEndpointSnapshot[] = useMemo(() => {
    return liveDetail?.http_endpoints ?? [];
  }, [liveDetail?.http_endpoints]);

  const pgInstances: PostgresInstanceSnapshot[] = useMemo(() => {
    return liveDetail?.postgres_instances ?? [];
  }, [liveDetail?.postgres_instances]);

  const allDatabases: FlattenedDatabaseItem[] = useMemo(() => {
    const list: FlattenedDatabaseItem[] = [];
    for (const pg of pgInstances) {
      if (pg.databases && pg.databases.length > 0) {
        for (const db of pg.databases) {
          list.push({
            ...db,
            instanceName: pg.name,
            instanceTotalMB: pg.database_size_mb || 0,
          });
        }
      }
    }
    list.sort((a, b) => {
      const mul = dbSortAsc ? 1 : -1;
      if (dbSortBy === 'name') {
        return a.name.localeCompare(b.name) * mul;
      }
      return (a.size_mb - b.size_mb) * mul;
    });
    return list;
  }, [pgInstances, dbSortBy, dbSortAsc]);

  const handleDbSort = (field: DbSortField) => {
    if (dbSortBy === field) {
      setDbSortAsc((prev) => !prev);
    } else {
      setDbSortBy(field);
      setDbSortAsc(false);
    }
    setDbPage(0);
  };

  const totalPostgresSizeMB = useMemo(() => {
    return pgInstances.reduce((acc, inst) => acc + (inst.database_size_mb || 0), 0);
  }, [pgInstances]);

  if (loading && !liveDetail) {
    return (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const host = liveDetail?.host;
  const rootDisk = host?.disks?.find((d) => d.mount_point === '/') ?? host?.disks?.[0];
  const dockerDaemonUp = liveDetail?.docker?.docker_daemon_up ?? true;

  // Paginació de llistes
  const paginatedContainers = sortedContainers.slice(
    dockerPage * dockerRowsPerPage,
    (dockerPage + 1) * dockerRowsPerPage
  );

  const paginatedHttpEndpoints = httpEndpoints.slice(
    httpPage * httpRowsPerPage,
    (httpPage + 1) * httpRowsPerPage
  );

  const paginatedDatabases = allDatabases.slice(
    dbPage * dbRowsPerPage,
    (dbPage + 1) * dbRowsPerPage
  );

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
            Detall en viu: <code>{liveDetail?.server_name || id}</code>
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: 12.5, color: '#64748b' }}>
            Informació actualitzada:{' '}
            {liveDetail?.recorded_at ? new Date(liveDetail.recorded_at).toLocaleTimeString() : 'N/A'}
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
            {rootDisk ? `${rootDisk.used_percent.toFixed(1)}% de ${rootDisk.total_gb.toFixed(2)}GB` : '—'}{' '}
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

      {/* PESTANYES DE MONITORATGE */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          bgcolor: '#fff',
          mb: 2.5,
          px: 1,
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_e, val) => setActiveTab(val)}
          aria-label="Pestanyes de recursos del servidor"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              minHeight: 48,
              color: '#64748b',
              '&.Mui-selected': {
                color: '#1976d2',
              },
            },
            '& .MuiTabs-indicator': {
              backgroundColor: '#1976d2',
              height: 3,
              borderRadius: '3px 3px 0 0',
            },
          }}
        >
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>🐳 Dockers</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 0 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 0 ? '#1e40af' : '#475569',
                    px: 1,
                    py: 0.2,
                    borderRadius: '10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {sortedContainers.length}
                </Box>
              </Box>
            }
            {...a11yProps(0)}
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>🌐 Endpoints HTTP</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 1 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 1 ? '#1e40af' : '#475569',
                    px: 1,
                    py: 0.2,
                    borderRadius: '10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {httpEndpoints.length}
                </Box>
              </Box>
            }
            {...a11yProps(1)}
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>🐘 Bases de Dades (PostgreSQL)</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 2 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 2 ? '#1e40af' : '#475569',
                    px: 1,
                    py: 0.2,
                    borderRadius: '10px',
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  {allDatabases.length > 0 ? `${allDatabases.length} bbdd` : `${pgInstances.length} inst.`}
                </Box>
              </Box>
            }
            {...a11yProps(2)}
          />
        </Tabs>
      </Paper>

      {/* PESTANYA 0: DOCKERS */}
      <TabPanel value={activeTab} index={0}>
        <Paper
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
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Contenidors Docker Monitoritzats (Llista Blanca)
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.25 }}>
                {sortedContainers.length} monitoritzats • Total al host:{' '}
                {liveDetail?.docker?.total_host_containers ?? sortedContainers.length} (
                {liveDetail?.docker?.running_host_containers ?? sortedContainers.length} actius,{' '}
                {liveDetail?.docker?.stopped_host_containers ?? 0} aturats)
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
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <th
                    onClick={() => handleDockerSort('name')}
                    style={{
                      padding: '11px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Contenidor {dockerSortBy === 'name' ? (dockerSortAsc ? '↑' : '↓') : ''}
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
                    onClick={() => handleDockerSort('cpu_percent')}
                    style={{
                      padding: '11px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    CPU (%) {dockerSortBy === 'cpu_percent' ? (dockerSortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th
                    onClick={() => handleDockerSort('memory_percent')}
                    style={{
                      padding: '11px 16px',
                      fontSize: 11,
                      fontWeight: 600,
                      color: '#64748b',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }}
                  >
                    Memòria RAM (MB / Límit / %) {dockerSortBy === 'memory_percent' ? (dockerSortAsc ? '↑' : '↓') : ''}
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedContainers.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Cap contenidor reportat en aquest snapshot.
                    </td>
                  </tr>
                ) : (
                  paginatedContainers.map((c) => {
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

          <TablePagination
            component="div"
            count={sortedContainers.length}
            page={dockerPage}
            onPageChange={(_e, newPage) => setDockerPage(newPage)}
            rowsPerPage={dockerRowsPerPage}
            onRowsPerPageChange={(e) => {
              setDockerRowsPerPage(parseInt(e.target.value, 10));
              setDockerPage(0);
            }}
            rowsPerPageOptions={[20, 50]}
            labelRowsPerPage="Files per pàgina:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        </Paper>
      </TabPanel>

      {/* PESTANYA 1: ENDPOINTS HTTP */}
      <TabPanel value={activeTab} index={1}>
        <Paper
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
              flexWrap: 'wrap',
              gap: 1,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Endpoints HTTP d&apos;Aplicacions (Esperant 200 / 202)
              </Typography>
              <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.25 }}>
                {httpEndpoints.filter((e) => e.up).length} operatius de {httpEndpoints.length} totals
              </Typography>
            </Box>
          </Box>

          <Box
            tabIndex={0}
            role="region"
            aria-label="Taula d'endpoints HTTP d'aplicacions"
            sx={{ overflowX: 'auto', maxWidth: '100%' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
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
                {paginatedHttpEndpoints.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Cap endpoint HTTP configurat en aquest servidor.
                    </td>
                  </tr>
                ) : (
                  paginatedHttpEndpoints.map((ep) => (
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

          <TablePagination
            component="div"
            count={httpEndpoints.length}
            page={httpPage}
            onPageChange={(_e, newPage) => setHttpPage(newPage)}
            rowsPerPage={httpRowsPerPage}
            onRowsPerPageChange={(e) => {
              setHttpRowsPerPage(parseInt(e.target.value, 10));
              setHttpPage(0);
            }}
            rowsPerPageOptions={[20, 50]}
            labelRowsPerPage="Files per pàgina:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        </Paper>
      </TabPanel>

      {/* PESTANYA 2: BASES DE DADES (POSTGRESQL) */}
      <TabPanel value={activeTab} index={2}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* CARDS D'ESTAT DE LES INSTÀNCIES POSTGRESQL */}
          {pgInstances.length === 0 ? (
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 3 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15, mb: 1 }}>
                Instàncies PostgreSQL
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                Cap instància PostgreSQL configurada o activa en aquest servidor.
              </Typography>
            </Paper>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: pgInstances.length > 1 ? 'repeat(2, 1fr)' : '1fr' },
                gap: 2,
              }}
            >
              {pgInstances.map((pg) => (
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
                      Instància PostgreSQL: <code>{pg.name}</code>
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

                  <Box sx={{ p: '16px 20px', fontSize: 13, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                    <Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                          Connexions Actives vs. <code>max_connections</code>
                        </Typography>
                        <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                          {pg.active_connections} / {pg.max_connections} ({pg.connections_percent.toFixed(1)}%)
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: '100%',
                          height: 8,
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
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                        gap: 1.5,
                        pt: 1,
                        borderTop: '1px solid #e2e8f0',
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>Mida Total Instància:</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 700, fontFamily: '"Roboto Mono", monospace' }}>
                          {formatBytesOrMB(pg.database_size_mb)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>Bases de Dades Detectades:</Typography>
                        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                          {pg.databases_count ?? pg.databases?.length ?? 0} bbdd
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>Consultes lentes (&gt; 60s):</Typography>
                        <Typography
                          sx={{
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: '"Roboto Mono", monospace',
                            color: pg.long_running_queries > 0 ? '#dc2626' : '#16a34a',
                          }}
                        >
                          {pg.long_running_queries}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography sx={{ fontSize: 12, color: '#64748b' }}>Locks en espera:</Typography>
                        <Typography
                          sx={{
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: '"Roboto Mono", monospace',
                            color: pg.locks_waiting > 0 ? '#dc2626' : '#16a34a',
                          }}
                        >
                          {pg.locks_waiting}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                </Paper>
              ))}
            </Box>
          )}

          {/* TAULA DE BASES DE DADES (AMB MIDA EN MB/GB I PAGINACIÓ) */}
          <Paper
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
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                  Detall de Bases de Dades PostgreSQL (<code>pg_database</code>)
                </Typography>
                <Typography sx={{ fontSize: 12, color: '#64748b', mt: 0.25 }}>
                  {allDatabases.length} bases de dades no-plantilla detectades • Mida acumulada:{' '}
                  {formatBytesOrMB(totalPostgresSizeMB)}
                </Typography>
              </Box>
            </Box>

            <Box
              tabIndex={0}
              role="region"
              aria-label="Taula de bases de dades PostgreSQL"
              sx={{ overflowX: 'auto', maxWidth: '100%' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th
                      onClick={() => handleDbSort('name')}
                      style={{
                        padding: '11px 16px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Base de Dades {dbSortBy === 'name' ? (dbSortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Instància
                    </th>
                    <th
                      onClick={() => handleDbSort('size_mb')}
                      style={{
                        padding: '11px 16px',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#64748b',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      Mida (MB) {dbSortBy === 'size_mb' ? (dbSortAsc ? '↑' : '↓') : ''}
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Mida (Formatada)
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      % Ocupació a la Instància
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedDatabases.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                        Cap base de dades individual reportada en aquest snapshot.
                      </td>
                    </tr>
                  ) : (
                    paginatedDatabases.map((db) => {
                      const pct =
                        db.instanceTotalMB > 0
                          ? Math.min(100, Math.max(0, (db.size_mb / db.instanceTotalMB) * 100))
                          : 0;
                      return (
                        <tr key={`${db.instanceName}-${db.name}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}>
                            {db.name}
                          </td>
                          <td style={{ padding: '12px 16px', color: '#64748b' }}>{db.instanceName}</td>
                          <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                            {db.size_mb.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12, fontWeight: 600 }}>
                            {formatBytesOrMB(db.size_mb)}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box
                                sx={{
                                  width: 100,
                                  height: 7,
                                  bgcolor: '#e2e8f0',
                                  borderRadius: '4px',
                                  overflow: 'hidden',
                                }}
                              >
                                <Box
                                  sx={{
                                    height: '100%',
                                    width: `${pct}%`,
                                    bgcolor: '#1976d2',
                                  }}
                                />
                              </Box>
                              <Typography sx={{ fontSize: 11.5, color: '#64748b', fontFamily: '"Roboto Mono", monospace' }}>
                                {pct.toFixed(1)}%
                              </Typography>
                            </Box>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </Box>

            <TablePagination
              component="div"
              count={allDatabases.length}
              page={dbPage}
              onPageChange={(_e, newPage) => setDbPage(newPage)}
              rowsPerPage={dbRowsPerPage}
              onRowsPerPageChange={(e) => {
                setDbRowsPerPage(parseInt(e.target.value, 10));
                setDbPage(0);
              }}
              rowsPerPageOptions={[20, 50]}
              labelRowsPerPage="Files per pàgina:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </Paper>
        </Box>
      </TabPanel>
    </Box>
  );
};
