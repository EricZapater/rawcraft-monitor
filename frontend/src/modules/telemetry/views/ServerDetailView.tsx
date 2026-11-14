import React, { useEffect, useState, useMemo, useCallback } from 'react';
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
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
} from '@mui/material';
import { useTelemetryStore } from '../store';
import { serversApi, type Deployment } from '../../servers/api';
import { CopyApiKeyDialog } from '../../servers/components/CopyApiKeyDialog';
import { ContainerLogsModal } from '../components/ContainerLogsModal';
import {
  telemetryApi,
  type DockerContainerSnapshot,
  type HttpEndpointSnapshot,
  type PostgresDatabaseInfo,
  type PostgresInstanceSnapshot,
  type TelemetryHistoryPoint,
} from '../api';

type DockerSortField = 'name' | 'cpu_percent' | 'memory_percent' | 'image_size_mb';
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

function formatRelativeTime(dateStr: string): string {
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return `fa ${diffSec}s`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `fa ${diffMin}m`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `fa ${diffHours}h`;
    const diffDays = Math.floor(diffHours / 24);
    return `fa ${diffDays}d`;
  } catch {
    return dateStr;
  }
}

interface EndpointTimelineCheck {
  timestamp: string;
  up: boolean;
  statusCode: number;
  latencyMs: number;
}

interface EndpointTimelineBarProps {
  checks: EndpointTimelineCheck[];
  currentUp: boolean;
  currentStatus: number;
  currentLatency: number;
  currentTimestamp?: string | null;
}

const EndpointTimelineBar: React.FC<EndpointTimelineBarProps> = ({
  checks,
  currentUp,
  currentStatus,
  currentLatency,
  currentTimestamp,
}) => {
  const allChecks = useMemo(() => {
    const list = [...checks];
    if (list.length === 0 && currentTimestamp) {
      list.push({
        timestamp: currentTimestamp,
        up: currentUp,
        statusCode: currentStatus,
        latencyMs: currentLatency,
      });
    }
    return list.slice(-25);
  }, [checks, currentUp, currentStatus, currentLatency, currentTimestamp]);

  const uptimePercent = useMemo(() => {
    if (allChecks.length === 0) return currentUp ? 100 : 0;
    const okCount = allChecks.filter((c) => c.up).length;
    return Math.round((okCount / allChecks.length) * 100);
  }, [allChecks, currentUp]);

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: '3px',
          bgcolor: '#f1f5f9',
          p: '4px 6px',
          borderRadius: '6px',
          border: '1px solid #e2e8f0',
        }}
      >
        {allChecks.map((c, idx) => {
          const isCurrent = idx === allChecks.length - 1;
          const title = `🕒 ${new Date(c.timestamp).toLocaleTimeString()} (${formatRelativeTime(c.timestamp)})\nEstat: ${c.statusCode} ${c.up ? 'OK' : 'KO'}\nLatència: ${c.latencyMs}ms${isCurrent ? ' (Actual)' : ''}`;
          return (
            <Box
              key={`${c.timestamp}-${idx}`}
              title={title}
              sx={{
                width: 7,
                height: 18,
                borderRadius: '2px',
                bgcolor: c.up ? '#16a34a' : '#dc2626',
                cursor: 'pointer',
                transition: 'transform 0.1s',
                '&:hover': {
                  transform: 'scaleY(1.25)',
                  filter: 'brightness(1.15)',
                },
              }}
            />
          );
        })}
      </Box>

      <Box
        component="span"
        sx={{
          fontSize: 11,
          fontWeight: 700,
          fontFamily: '"Roboto Mono", monospace',
          color: uptimePercent >= 99 ? '#16a34a' : uptimePercent >= 90 ? '#d97706' : '#dc2626',
          bgcolor: uptimePercent >= 99 ? '#dcfce7' : uptimePercent >= 90 ? '#fef3c7' : '#fee2e2',
          px: 0.8,
          py: 0.2,
          borderRadius: '4px',
        }}
      >
        {uptimePercent}% OK
      </Box>
    </Box>
  );
};

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

  // Desplegaments (Deploy Tracking)
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [deploymentsTotal, setDeploymentsTotal] = useState<number>(0);
  const [deployPage, setDeployPage] = useState<number>(0);
  const [deployRowsPerPage, setDeployRowsPerPage] = useState<number>(20);
  const [selectedCommitDeployment, setSelectedCommitDeployment] = useState<Deployment | null>(null);
  const [commitCopiedSnackbar, setCommitCopiedSnackbar] = useState<boolean>(false);
  const [actionsModalOpen, setActionsModalOpen] = useState<boolean>(false);
  const [copySnackbar, setCopySnackbar] = useState<boolean>(false);
  const [copyKeyOpen, setCopyKeyOpen] = useState<boolean>(false);
  const [logsModalOpen, setLogsModalOpen] = useState<boolean>(false);
  const [logsSelectedContainer, setLogsSelectedContainer] = useState<string | undefined>(undefined);
  const [historyPoints, setHistoryPoints] = useState<TelemetryHistoryPoint[]>([]);

  const handleOpenLogs = (containerName?: string) => {
    setLogsSelectedContainer(containerName);
    setLogsModalOpen(true);
  };

  const fetchHistoryPoints = useCallback(async () => {
    if (!id) return;
    try {
      const res = await telemetryApi.getServerTelemetryHistory(id, { range: '6h' });
      if (res?.points) {
        setHistoryPoints(res.points);
      }
    } catch {
      // Ignorar error silenciós
    }
  }, [id]);

  const endpointHistory = useMemo(() => {
    const map: Record<string, EndpointTimelineCheck[]> = {};
    for (const pt of historyPoints) {
      if (pt.http_latency_ms) {
        for (const epName of Object.keys(pt.http_latency_ms)) {
          if (!map[epName]) map[epName] = [];
          const isUp = pt.http_up ? (pt.http_up[epName] ?? true) : true;
          const status = pt.http_status ? (pt.http_status[epName] ?? 200) : 200;
          const lat = pt.http_latency_ms[epName] ?? 0;
          map[epName].push({
            timestamp: pt.timestamp,
            up: isUp,
            statusCode: status,
            latencyMs: lat,
          });
        }
      }
    }
    return map;
  }, [historyPoints]);

  const fetchDeployments = useCallback(async () => {
    if (!id) return;
    try {
      const res = await serversApi.listServerDeployments(id, {
        limit: deployRowsPerPage,
        offset: deployPage * deployRowsPerPage,
      });
      setDeployments(res.items || []);
      setDeploymentsTotal(res.total || 0);
    } catch {
      // Ignorar error silenciós per refrescos en segon pla
    }
  }, [id, deployPage, deployRowsPerPage]);

  useEffect(() => {
    if (!id) return;
    void fetchLiveDetail(id);
    void fetchDeployments();
    void fetchHistoryPoints();

    const timer = window.setInterval(() => {
      void fetchLiveDetail(id);
      void fetchDeployments();
      void fetchHistoryPoints();
    }, 15000);
    return () => window.clearInterval(timer);
  }, [id, fetchLiveDetail, fetchDeployments, fetchHistoryPoints]);

  const sortedContainers: DockerContainerSnapshot[] = useMemo(() => {
    const list = [...(liveDetail?.docker?.containers ?? [])];
    list.sort((a, b) => {
      const mul = dockerSortAsc ? 1 : -1;
      if (dockerSortBy === 'name') {
        return a.name.localeCompare(b.name) * mul;
      }
      return (((a[dockerSortBy] as number | undefined) ?? 0) - ((b[dockerSortBy] as number | undefined) ?? 0)) * mul;
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

  const latestDeploy = deployments[0];

  const githubActionsSnippet = useMemo(() => {
    return `# .github/workflows/deploy.yml
# Afegir aquest pas al final del teu job de desplegament a GitHub Actions

- name: 🚀 Registrar Desplegament a RawCraft Monitor
  if: always()
  run: |
    curl -fsSL -X POST https://api.monitor.ericzapater.cat/api/v1/deploys \\
      -H "Content-Type: application/json" \\
      -H "X-Agent-Key: \${{ secrets.RAWCRAFT_API_KEY }}" \\
      -d '{
        "product_name": "NOM_DEL_PRODUCTE",
        "environment": "production",
        "version": "'"\${{ github.ref_name }}"'",
        "commit_sha": "'"\${{ github.sha }}"'",
        "commit_message": '"\$(echo "\${{ github.event.head_commit.message }}" | jq -sR .)"',
        "branch": "'"\${{ github.ref_name }}"'",
        "deployed_by": "'"\${{ github.actor }}"'",
        "status": "'"\${{ job.status == 'success' && 'SUCCESS' || 'FAILED' }}"'"
      }'`;
  }, []);

  const handleCopySnippet = () => {
    void navigator.clipboard.writeText(githubActionsSnippet);
    setCopySnackbar(true);
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
      {/* Barra de navegació del detall - Responsive */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          mb: 2.5,
          gap: 1.5,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Button
            component={RouterLink}
            to="/"
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
          >
            ← Tornar al Dashboard
          </Button>
          <Typography sx={{ fontSize: { xs: 14, sm: 15 }, fontWeight: 700, color: '#1e293b' }}>
            Detall en viu: <code>{liveDetail?.server_name || id}</code>
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <Box
            title={`Estat del servidor: ${liveDetail?.status || 'UNKNOWN'}`}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1,
              px: 1.25,
              py: 0.5,
              bgcolor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '8px',
              cursor: 'help',
            }}
          >
            <Box
              sx={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                bgcolor:
                  liveDetail?.status === 'ONLINE'
                    ? '#16a34a'
                    : liveDetail?.status === 'WARNING'
                      ? '#d97706'
                      : liveDetail?.status === 'CRITICAL' || liveDetail?.status === 'OFFLINE'
                        ? '#dc2626'
                        : '#64748b',
                boxShadow:
                  liveDetail?.status === 'ONLINE'
                    ? '0 0 0 2px rgba(22, 163, 74, 0.2)'
                    : liveDetail?.status === 'WARNING'
                      ? '0 0 0 2px rgba(217, 119, 6, 0.2)'
                      : '0 0 0 2px rgba(220, 38, 38, 0.2)',
              }}
            />
            <Typography sx={{ fontSize: 12, color: '#1e293b', fontWeight: 600 }}>
              ⏱️ Registre de control:
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#475569', fontFamily: '"Roboto Mono", monospace' }}>
              {liveDetail?.recorded_at
                ? `${new Date(liveDetail.recorded_at).toLocaleTimeString()} (${formatRelativeTime(liveDetail.recorded_at)})`
                : 'Pendent'}
            </Typography>
          </Box>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setCopyKeyOpen(true)}
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b', fontWeight: 600 }}
          >
            🔒 Copiar API Key
          </Button>
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

      {/* Banner de Sistema Operatiu + Reboot Required - Responsive */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          p: { xs: '14px 16px', sm: '16px 20px' },
          mb: 2.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          gap: 1.5,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: { xs: 16, sm: 18 }, fontWeight: 700, color: '#1e293b' }}>
            {liveDetail?.server_name}{' '}
            <Box
              component="span"
              sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 13, color: '#64748b', fontWeight: 400 }}
            >
              ({host?.network_interface || 'eth0'}: {host?.ipv4_address || '—'})
            </Box>
          </Typography>
          <Typography sx={{ fontSize: { xs: 12, sm: 13 }, color: '#64748b', mt: 0.5, lineHeight: 1.6 }}>
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
            <strong>Users:</strong> {host?.users_logged_in ?? '—'} &nbsp;|&nbsp;{' '}
            <strong>Comprovat:</strong>{' '}
            {liveDetail?.recorded_at
              ? `${new Date(liveDetail.recorded_at).toLocaleTimeString()} (${formatRelativeTime(liveDetail.recorded_at)})`
              : '—'}
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
              whiteSpace: 'nowrap',
            }}
          >
            ⚠ Reboot required (`/var/run/reboot-required`)
          </Box>
        )}
      </Paper>

      {/* PESTANYES DE MONITORATGE - Scrollable i tàctil per a mòbils */}
      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          bgcolor: '#fff',
          mb: 2.5,
          px: { xs: 0.5, sm: 1 },
        }}
      >
        <Tabs
          value={activeTab}
          onChange={(_e, val) => setActiveTab(val)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Pestanyes de recursos del servidor"
          sx={{
            '& .MuiTab-root': {
              textTransform: 'none',
              fontWeight: 600,
              fontSize: { xs: 13, sm: 14 },
              minHeight: 48,
              color: '#64748b',
              whiteSpace: 'nowrap',
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>🐳 Dockers</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 0 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 0 ? '#1e40af' : '#475569',
                    px: 0.8,
                    py: 0.15,
                    borderRadius: '10px',
                    fontSize: 11,
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>🌐 Endpoints HTTP</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 1 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 1 ? '#1e40af' : '#475569',
                    px: 0.8,
                    py: 0.15,
                    borderRadius: '10px',
                    fontSize: 11,
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>🐘 Bases de Dades</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 2 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 2 ? '#1e40af' : '#475569',
                    px: 0.8,
                    py: 0.15,
                    borderRadius: '10px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {allDatabases.length > 0 ? `${allDatabases.length} bbdd` : `${pgInstances.length} inst.`}
                </Box>
              </Box>
            }
            {...a11yProps(2)}
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <span>🚀 Desplegaments</span>
                <Box
                  component="span"
                  sx={{
                    bgcolor: activeTab === 3 ? '#dbeafe' : '#f1f5f9',
                    color: activeTab === 3 ? '#1e40af' : '#475569',
                    px: 0.8,
                    py: 0.15,
                    borderRadius: '10px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {deploymentsTotal}
                </Box>
              </Box>
            }
            {...a11yProps(3)}
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
                {typeof liveDetail?.docker?.total_images_size_mb === 'number' && (
                  <> • 📦 Espai imatges a disc: <strong>{formatBytesOrMB(liveDetail.docker.total_images_size_mb)}</strong></>
                )}
                {liveDetail?.recorded_at && (
                  <> • 🕒 Comprovació: <strong>{new Date(liveDetail.recorded_at).toLocaleTimeString()} ({formatRelativeTime(liveDetail.recorded_at)})</strong></>
                )}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Button
                variant="outlined"
                size="small"
                onClick={() => handleOpenLogs(sortedContainers[0]?.name)}
                sx={{
                  textTransform: 'none',
                  borderColor: '#cbd5e1',
                  color: '#1e293b',
                  fontWeight: 600,
                  fontSize: 12,
                  '&:hover': { borderColor: '#1976d2', color: '#1976d2', bgcolor: '#f0f7ff' },
                }}
              >
                📜 Explorador de Logs
              </Button>
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
          </Box>

          <Box
            tabIndex={0}
            role="region"
            aria-label="Taula de contenidors Docker amb CPU i RAM"
            sx={{ overflowX: 'auto', maxWidth: '100%' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, minWidth: 650 }}>
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
                  <th
                    onClick={() => handleDockerSort('image_size_mb')}
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
                    Mida Imatge {dockerSortBy === 'image_size_mb' ? (dockerSortAsc ? '↑' : '↓') : ''}
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', textAlign: 'center' }}>
                    Logs
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedContainers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
                      Cap contenidor reportat en aquest snapshot.
                    </td>
                  </tr>
                ) : (
                  paginatedContainers.map((c) => {
                    const isOk = c.state === 'running' && c.health !== 'unhealthy';
                    const isRestarting = c.state === 'restarting';
                    return (
                      <tr key={c.container_id || c.name} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: isRestarting ? '#fff5f5' : 'inherit' }}>
                        <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontWeight: 700 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <span>{c.name}</span>
                            {isRestarting && (
                              <Box
                                component="span"
                                sx={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: '#b91c1c',
                                  bgcolor: '#fee2e2',
                                  border: '1px solid #fca5a5',
                                  px: 0.7,
                                  py: 0.15,
                                  borderRadius: '4px',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                ⚠️ CrashLoop
                              </Box>
                            )}
                          </Box>
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
                              fontWeight: 700,
                              bgcolor: isRestarting ? '#fecaca' : isOk ? '#dcfce7' : '#fee2e2',
                              color: isRestarting ? '#991b1b' : isOk ? '#166534' : '#991b1b',
                              border: isRestarting ? '1px solid #f87171' : 'none',
                            }}
                          >
                            {isRestarting ? '⚠️ restarting' : c.state}
                            {c.health && c.health !== 'none' ? ` (${c.health})` : ''}
                            {!isOk && c.exit_code ? ` [codi ${c.exit_code}]` : ''}
                          </Box>
                        </td>
                        <td style={{ padding: '12px 16px', color: isRestarting ? '#991b1b' : 'inherit', fontWeight: isRestarting ? 600 : 400 }}>
                          {c.status}
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                          {c.cpu_percent.toFixed(1)}%
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                          <Box
                            component="span"
                            sx={{
                              width: 100,
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
                        <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                          {c.image_size_mb ? formatBytesOrMB(c.image_size_mb) : '—'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleOpenLogs(c.name)}
                            sx={{
                              textTransform: 'none',
                              fontSize: 11,
                              py: 0.2,
                              px: 1,
                              minWidth: 0,
                              borderColor: '#cbd5e1',
                              color: '#1e293b',
                              fontWeight: 600,
                              '&:hover': { borderColor: '#1976d2', color: '#1976d2', bgcolor: '#f0f7ff' },
                            }}
                          >
                            📜 Logs
                          </Button>
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
                {liveDetail?.recorded_at && (
                  <> • 🕒 Última comprovació: <strong>{new Date(liveDetail.recorded_at).toLocaleTimeString()} ({formatRelativeTime(liveDetail.recorded_at)})</strong></>
                )}
              </Typography>
            </Box>
          </Box>

          <Box
            tabIndex={0}
            role="region"
            aria-label="Taula d'endpoints HTTP d'aplicacions"
            sx={{ overflowX: 'auto', maxWidth: '100%' }}
          >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, minWidth: 800 }}>
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
                    Estat Rebut
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Latència
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Última Crida / Hora
                  </th>
                  <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                    Timeline Crides (OK / KO)
                  </th>
                </tr>
              </thead>
              <tbody>
                {paginatedHttpEndpoints.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>
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
                      <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                        <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                          {ep.last_checked_at
                            ? new Date(ep.last_checked_at).toLocaleTimeString()
                            : liveDetail?.recorded_at
                              ? new Date(liveDetail.recorded_at).toLocaleTimeString()
                              : '—'}
                        </Typography>
                        <Typography sx={{ fontSize: 11, color: '#64748b' }}>
                          {ep.last_checked_at
                            ? formatRelativeTime(ep.last_checked_at)
                            : liveDetail?.recorded_at
                              ? formatRelativeTime(liveDetail.recorded_at)
                              : ''}
                        </Typography>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <EndpointTimelineBar
                          checks={endpointHistory[ep.name] || []}
                          currentUp={ep.up}
                          currentStatus={ep.status_code}
                          currentLatency={ep.response_time_ms}
                          currentTimestamp={ep.last_checked_at || liveDetail?.recorded_at}
                        />
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
                  {liveDetail?.recorded_at && (
                    <> • 🕒 Comprovació: <strong>{new Date(liveDetail.recorded_at).toLocaleTimeString()} ({formatRelativeTime(liveDetail.recorded_at)})</strong></>
                  )}
                </Typography>
              </Box>
            </Box>

            <Box
              tabIndex={0}
              role="region"
              aria-label="Taula de bases de dades PostgreSQL"
              sx={{ overflowX: 'auto', maxWidth: '100%' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, minWidth: 600 }}>
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

      {/* PESTANYA 3: DESPLEGAMENTS (DEPLOY TRACKING) */}
      <TabPanel value={activeTab} index={3}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
          {/* BANNER D'INTEGRACIÓ I RESUM DE DEPLOYS */}
          <Paper
            elevation={0}
            sx={{
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              p: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: { xs: 'flex-start', sm: 'center' },
              flexDirection: { xs: 'column', sm: 'row' },
              flexWrap: 'wrap',
              gap: 2,
            }}
          >
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                Seguiment de Desplegaments (Deploy Tracking)
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5 }}>
                {deploymentsTotal} desplegament(s) registrats
                {latestDeploy && (
                  <span>
                    {' '}• Últim: <strong>{latestDeploy.product_name}</strong> (<code>{latestDeploy.version}</code>) {formatRelativeTime(latestDeploy.deployed_at)}
                  </span>
                )}
              </Typography>
            </Box>

            <Button
              variant="contained"
              size="small"
              onClick={() => setActionsModalOpen(true)}
              sx={{
                textTransform: 'none',
                fontWeight: 600,
                boxShadow: 'none',
                bgcolor: '#1976d2',
                '&:hover': { bgcolor: '#1565c0', boxShadow: 'none' },
              }}
            >
              🛠️ Com integrar amb GitHub Actions
            </Button>
          </Paper>

          {/* TAULA / TARGETES DE DESPLEGAMENTS */}
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
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Historial de Canvis i Desplegaments
              </Typography>
            </Box>

            {/* Vista Responsive: Targetes en Mòbil */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', p: 1.5, gap: 1.5 }}>
              {deployments.length === 0 ? (
                <Box sx={{ p: 3, textAlign: 'center', color: '#64748b' }}>
                  Cap desplegament registrat encara.
                </Box>
              ) : (
                deployments.map((d) => {
                  const isSuccess = d.status === 'SUCCESS';
                  return (
                    <Paper
                      key={d.id}
                      elevation={0}
                      sx={{
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        p: 1.75,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                      }}
                    >
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Box
                            component="span"
                            sx={{
                              px: 1,
                              py: 0.25,
                              borderRadius: '6px',
                              bgcolor: '#eff6ff',
                              color: '#1d4ed8',
                              fontWeight: 700,
                              fontSize: 12,
                            }}
                          >
                            {d.product_name}
                          </Box>
                          <Typography sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 12, fontWeight: 600 }}>
                            {d.version}
                          </Typography>
                        </Box>
                        <Box
                          component="span"
                          sx={{
                            px: 1,
                            py: 0.2,
                            borderRadius: '12px',
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: isSuccess ? '#dcfce7' : '#fee2e2',
                            color: isSuccess ? '#166534' : '#991b1b',
                          }}
                        >
                          {d.status}
                        </Box>
                      </Box>

                      {d.commit_message && (
                        <Box sx={{ mt: 0.5, mb: 0.5 }}>
                          <Typography
                            sx={{
                              fontSize: 12.5,
                              color: '#334155',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              wordBreak: 'break-word',
                            }}
                          >
                            {d.commit_message}
                          </Typography>
                          {(d.commit_message.includes('\n') || d.commit_message.length > 70) && (
                            <Button
                              size="small"
                              variant="text"
                              onClick={() => setSelectedCommitDeployment(d)}
                              sx={{
                                fontSize: 11.5,
                                fontWeight: 600,
                                p: 0,
                                mt: 0.5,
                                minWidth: 'auto',
                                textTransform: 'none',
                                color: '#2563eb',
                                '&:hover': { textDecoration: 'underline' },
                              }}
                            >
                              Veure comentari complet →
                            </Button>
                          )}
                        </Box>
                      )}

                      <Box
                        sx={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          pt: 0.75,
                          borderTop: '1px solid #f1f5f9',
                          fontSize: 11.5,
                          color: '#64748b',
                        }}
                      >
                        <Box>
                          {d.commit_sha && (
                            <Box component="span" sx={{ fontFamily: '"Roboto Mono", monospace', mr: 1 }}>
                              #{d.commit_sha.slice(0, 7)}
                            </Box>
                          )}
                          {d.deployed_by && <span>per <strong>{d.deployed_by}</strong></span>}
                        </Box>
                        <Box>{formatRelativeTime(d.deployed_at)}</Box>
                      </Box>
                    </Paper>
                  );
                })
              )}
            </Box>

            {/* Vista Desktop: Taula Completa */}
            <Box
              tabIndex={0}
              role="region"
              aria-label="Taula de desplegaments d'aplicacions"
              sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto', maxWidth: '100%' }}
            >
              <table style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13, tableLayout: 'fixed' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 95 }}>
                      Estat
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 140 }}>
                      Producte
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 125 }}>
                      Versió / Tag
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Commit &amp; Missatge
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 95 }}>
                      Entorn
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 135 }}>
                      Desplegat per
                    </th>
                    <th style={{ padding: '11px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', width: 165 }}>
                      Data &amp; Hora
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {deployments.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
                        Cap desplegament registrat encara. Utilitza GitHub Actions per començar a trackejar canvis!
                      </td>
                    </tr>
                  ) : (
                    deployments.map((d) => {
                      const isSuccess = d.status === 'SUCCESS';
                      const firstLine = d.commit_message ? d.commit_message.split('\n')[0].trim() : '';
                      const hasMoreContent = Boolean(d.commit_message && (d.commit_message.includes('\n') || d.commit_message.length > 40));
                      return (
                        <tr key={d.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <Box
                              component="span"
                              sx={{
                                display: 'inline-block',
                                px: 1,
                                py: 0.3,
                                borderRadius: '12px',
                                fontSize: 11,
                                fontWeight: 700,
                                bgcolor: isSuccess ? '#dcfce7' : '#fee2e2',
                                color: isSuccess ? '#166534' : '#991b1b',
                              }}
                            >
                              {d.status}
                            </Box>
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Box
                              component="span"
                              sx={{
                                px: 1,
                                py: 0.25,
                                borderRadius: '6px',
                                bgcolor: '#eff6ff',
                                color: '#1d4ed8',
                                fontWeight: 700,
                                fontSize: 12,
                                display: 'inline-block',
                                maxWidth: '100%',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={d.product_name}
                            >
                              {d.product_name}
                            </Box>
                          </td>
                          <td style={{ padding: '12px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.version}>
                            {d.version}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', minWidth: 0 }}>
                              {d.commit_sha && (
                                <Box
                                  component="span"
                                  sx={{
                                    fontFamily: '"Roboto Mono", monospace',
                                    fontSize: 11.5,
                                    color: '#475569',
                                    bgcolor: '#f1f5f9',
                                    px: 0.6,
                                    py: 0.2,
                                    borderRadius: '4px',
                                    border: '1px solid #e2e8f0',
                                    flexShrink: 0,
                                  }}
                                >
                                  #{d.commit_sha.slice(0, 7)}
                                </Box>
                              )}
                              <Typography
                                sx={{
                                  fontSize: 12.5,
                                  color: '#1e293b',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  flex: 1,
                                  minWidth: 0,
                                }}
                                title={d.commit_message || ''}
                              >
                                {firstLine || '—'}
                              </Typography>
                              {hasMoreContent && (
                                <Button
                                  size="small"
                                  variant="text"
                                  onClick={() => setSelectedCommitDeployment(d)}
                                  sx={{
                                    fontSize: 11,
                                    fontWeight: 600,
                                    p: '2px 8px',
                                    minWidth: 'auto',
                                    textTransform: 'none',
                                    color: '#2563eb',
                                    bgcolor: '#eff6ff',
                                    flexShrink: 0,
                                    borderRadius: '4px',
                                    border: '1px solid #bfdbfe',
                                    whiteSpace: 'nowrap',
                                    '&:hover': { bgcolor: '#dbeafe' },
                                  }}
                                >
                                  Veure tot
                                </Button>
                              )}
                            </Box>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                            {d.environment}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.deployed_by || ''}>
                            {d.deployed_by || '—'}
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: 12, color: '#64748b' }}>
                            <Box component="span" sx={{ fontWeight: 600, color: '#1e293b' }}>
                              {formatRelativeTime(d.deployed_at)}
                            </Box>
                            <Box sx={{ fontSize: 11 }}>
                              {new Date(d.deployed_at).toLocaleString()}
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
              count={deploymentsTotal}
              page={deployPage}
              onPageChange={(_e, newPage) => setDeployPage(newPage)}
              rowsPerPage={deployRowsPerPage}
              onRowsPerPageChange={(e) => {
                setDeployRowsPerPage(parseInt(e.target.value, 10));
                setDeployPage(0);
              }}
              rowsPerPageOptions={[20, 50]}
              labelRowsPerPage="Files per pàgina:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </Paper>
        </Box>
      </TabPanel>

      {/* MODAL: COM INTEGRAR AMB GITHUB ACTIONS */}
      <Dialog
        open={actionsModalOpen}
        onClose={() => setActionsModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 18, borderBottom: '1px solid #e2e8f0' }}>
          🚀 Com integrar el seguiment de Desplegaments amb GitHub Actions
        </DialogTitle>
        <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography sx={{ fontSize: 13.5, color: '#475569' }}>
            Cada vegada que fas un deploy des d&apos;una GitHub Action (per exemple, construint contenidors o fent SSH al servidor), pots afegir aquest senzill pas al workflow per registrar el canvi a RawCraft Monitor:
          </Typography>

          <Box sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', p: 2 }}>
            <Typography sx={{ fontWeight: 700, fontSize: 13, mb: 1, color: '#1e293b' }}>
              Pas 1: Configura el Secret al teu repositori de GitHub
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#64748b' }}>
              Ves a <strong>Settings → Secrets and variables → Actions</strong> i afegeix un nou secret anomenat <code>RAWCRAFT_API_KEY</code> amb l&apos;API Key d&apos;aquest servidor (o descarrega-la des d&apos;Inventari &amp; YAML).
            </Typography>
          </Box>

          <Box sx={{ bgcolor: '#0f172a', borderRadius: '8px', p: 2, overflowX: 'auto', position: 'relative' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography sx={{ color: '#94a3b8', fontSize: 12, fontFamily: '"Roboto Mono", monospace' }}>
                .github/workflows/deploy.yml
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={handleCopySnippet}
                sx={{
                  color: '#38bdf8',
                  borderColor: '#38bdf8',
                  fontSize: 11,
                  textTransform: 'none',
                  py: 0.25,
                }}
              >
                Copiar Codi
              </Button>
            </Box>
            <pre style={{ margin: 0, color: '#f8fafc', fontFamily: '"Roboto Mono", monospace', fontSize: 12, lineHeight: 1.5 }}>
              {githubActionsSnippet}
            </pre>
          </Box>

          <Typography sx={{ fontSize: 12.5, color: '#64748b' }}>
            💡 <strong>Nota:</strong> Reemplaça <code>NOM_DEL_PRODUCTE</code> pel nom de la teva aplicació (per exemple, <code>nasc-frontend</code>, <code>nasc-backend</code>, o el nom del contenidor Docker corresponent).
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: '14px 24px', borderTop: '1px solid #e2e8f0' }}>
          <Button
            variant="contained"
            onClick={() => setActionsModalOpen(false)}
            sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
          >
            Tancar
          </Button>
        </DialogActions>
      </Dialog>

      {/* SNACKBAR DE COPIAT */}
      <Snackbar
        open={copySnackbar}
        autoHideDuration={3000}
        onClose={() => setCopySnackbar(false)}
        message="Snippet de GitHub Actions copiat al porta-retalls!"
      />

      {/* DIÀLEG COPIAR API KEY PROTEGIT PER CONTRASENYA */}
      <CopyApiKeyDialog
        open={copyKeyOpen}
        onClose={() => setCopyKeyOpen(false)}
        serverId={id || ''}
        serverName={liveDetail?.server_name}
      />

      {/* MODAL EXPLORADOR DE LOGS DE CONTENIDOR (MINI-LOKI) */}
      <ContainerLogsModal
        open={logsModalOpen}
        onClose={() => setLogsModalOpen(false)}
        serverId={id || ''}
        serverName={liveDetail?.server_name || id || ''}
        initialContainerName={logsSelectedContainer}
        availableContainers={sortedContainers.map((c) => c.name)}
      />

      {/* MODAL DETALL DEL DESPLEGAMENT I COMENTARI COMPLET */}
      <Dialog
        open={Boolean(selectedCommitDeployment)}
        onClose={() => setSelectedCommitDeployment(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>🚀 Detall del Desplegament</span>
          {selectedCommitDeployment && (
            <Box
              component="span"
              sx={{
                px: 1.25,
                py: 0.3,
                borderRadius: '12px',
                fontSize: 11,
                fontWeight: 700,
                bgcolor: selectedCommitDeployment.status === 'SUCCESS' ? '#dcfce7' : '#fee2e2',
                color: selectedCommitDeployment.status === 'SUCCESS' ? '#166534' : '#991b1b',
              }}
            >
              {selectedCommitDeployment.status}
            </Box>
          )}
        </DialogTitle>
        {selectedCommitDeployment && (
          <DialogContent sx={{ pt: 2.5, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
            {/* Metadades del Desplegament */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 1.5,
                bgcolor: '#f8fafc',
                p: 2,
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Producte / Aplicació
                </Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#1e293b' }}>
                  {selectedCommitDeployment.product_name}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Versió / Tag
                </Typography>
                <Typography sx={{ fontSize: 13.5, fontFamily: '"Roboto Mono", monospace', fontWeight: 600, color: '#1e293b' }}>
                  {selectedCommitDeployment.version}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Entorn
                </Typography>
                <Typography sx={{ fontSize: 13, color: '#1e293b' }}>
                  {selectedCommitDeployment.environment}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Desplegat per
                </Typography>
                <Typography sx={{ fontSize: 13, color: '#1e293b' }}>
                  {selectedCommitDeployment.deployed_by || '—'}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Commit SHA
                </Typography>
                <Typography sx={{ fontSize: 12.5, fontFamily: '"Roboto Mono", monospace', color: '#1e293b' }}>
                  {selectedCommitDeployment.commit_sha || '—'}
                </Typography>
              </Box>
              <Box>
                <Typography sx={{ fontSize: 11, color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>
                  Data &amp; Hora
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#1e293b' }}>
                  {new Date(selectedCommitDeployment.deployed_at).toLocaleString()}
                </Typography>
              </Box>
            </Box>

            {/* Comentari complet de Git */}
            <Box>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#475569', mb: 0.75 }}>
                Comentari del desplegament / missatge de commit:
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  p: 2,
                  bgcolor: '#0f172a',
                  color: '#f8fafc',
                  borderRadius: '8px',
                  fontSize: 12.5,
                  fontFamily: '"Roboto Mono", monospace',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid #334155',
                }}
              >
                {selectedCommitDeployment.commit_message || '(Sense missatge o comentari associat)'}
              </Box>
            </Box>
          </DialogContent>
        )}
        <DialogActions sx={{ p: '14px 24px', borderTop: '1px solid #e2e8f0', justifyContent: 'space-between' }}>
          {selectedCommitDeployment?.commit_message ? (
            <Button
              variant="outlined"
              size="small"
              onClick={() => {
                if (selectedCommitDeployment?.commit_message) {
                  navigator.clipboard.writeText(selectedCommitDeployment.commit_message);
                  setCommitCopiedSnackbar(true);
                }
              }}
              sx={{
                textTransform: 'none',
                fontSize: 12,
                borderColor: '#cbd5e1',
                color: '#475569',
                '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
              }}
            >
              Copiar comentari
            </Button>
          ) : <span />}
          <Button
            variant="contained"
            onClick={() => setSelectedCommitDeployment(null)}
            sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
          >
            Tancar
          </Button>
        </DialogActions>
      </Dialog>

      {/* SNACKBAR DE COMENTARI COPIAT */}
      <Snackbar
        open={commitCopiedSnackbar}
        autoHideDuration={3000}
        onClose={() => setCommitCopiedSnackbar(false)}
        message="Comentari copiat al porta-retalls!"
      />
    </Box>
  );
};
