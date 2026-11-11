import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Checkbox,
  FormControlLabel,
  Alert,
  CircularProgress,
  IconButton,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useServersStore } from '../store';
import type {
  ServerMonitoringConfig,
  HttpEndpointCheckConfig,
  PostgresInstanceConfig,
} from '../api';
import { useUsersStore } from '../../users/store';

function createDefaultConfig(): ServerMonitoringConfig {
  return {
    check_interval_seconds: 15,
    report_interval_seconds: 300,
    central_unreachable_failures: 3,
    host: {
      enabled: true,
      collect_os_info: true,
      collect_reboot_required: true,
      collect_load: true,
      collect_disk: true,
      collect_memory: true,
      collect_swap: true,
      collect_processes: true,
      collect_users: true,
      collect_network_ip: true,
      network_interface: 'ens3',
      mount_points: ['/'],
      thresholds: {
        sustained_checks: 4,
        max_load_1m: 2.5,
        max_disk_percent: 85,
        max_memory_percent: 90,
        max_swap_percent: 60,
        max_processes: null,
        max_users_logged_in: null,
      },
    },
    docker: {
      enabled: true,
      socket_path: '/var/run/docker.sock',
      collect_container_stats: true,
      alert_on_container_down: true,
      required_containers: ['traefik', 'postgres-main'],
      ignore_containers: [],
      max_container_cpu_percent: 90,
      max_container_memory_percent: 90,
    },
    http_endpoints: [
      {
        name: 'Rawcraft API',
        url: 'http://127.0.0.1:8080/health',
        method: 'GET',
        expected_status_codes: [200, 202],
        timeout_seconds: 5,
      },
    ],
    postgres: {
      enabled: true,
      instances: [
        {
          name: 'postgres-main',
          host: '127.0.0.1',
          port: 5432,
          user: 'pg_monitor',
          password: '',
          dbname: 'postgres',
          sslmode: 'disable',
          max_connections_percent: 80,
          long_query_seconds: 60,
          max_long_running_queries: 1,
        },
      ],
    },
    smtp: {
      enabled: true,
      use_global_smtp: true,
      host: 'smtp.rawcraft.cat',
      port: 587,
      username: '',
      password: '',
      from_email: 'alerts@rawcraft.cat',
      to_emails: [],
    },
  };
}

export const ServerConfigYamlView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentServer,
    yamlBundle,
    loading,
    error,
    fetchServerById,
    updateServer,
    fetchConfigYaml,
    clearError,
  } = useServersStore();

  const { users, fetchUsers, currentUser } = useUsersStore();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [activeTab, setActiveTab] = useState<'form' | 'yaml'>('form');
  const [serverName, setServerName] = useState('');
  const [serverDesc, setServerDesc] = useState('');
  const [config, setConfig] = useState<ServerMonitoringConfig>(createDefaultConfig);

  const [requiredContainersText, setRequiredContainersText] = useState('');
  const [ignoreContainersText, setIgnoreContainersText] = useState('');
  const [mountPointsText, setMountPointsText] = useState('/');
  const [toEmailsText, setToEmailsText] = useState('');

  const [newEndpointName, setNewEndpointName] = useState('');
  const [newEndpointUrl, setNewEndpointUrl] = useState('');
  const [newEndpointCodes, setNewEndpointCodes] = useState('200, 202');
  const [newEndpointTimeout, setNewEndpointTimeout] = useState(5);

  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [copiedYaml, setCopiedYaml] = useState(false);

  useEffect(() => {
    if (!id) return;
    void (async () => {
      const srv = await fetchServerById(id);
      if (srv) {
        setServerName(srv.name);
        setServerDesc(srv.description ?? '');
        const cfg = srv.config ?? createDefaultConfig();
        setConfig(cfg);
        setRequiredContainersText((cfg.docker?.required_containers ?? []).join(', '));
        setIgnoreContainersText((cfg.docker?.ignore_containers ?? []).join(', '));
        setMountPointsText((cfg.host?.mount_points ?? ['/']).join(', '));
        setToEmailsText((cfg.smtp?.to_emails ?? []).join(', '));
      }
      if (isAdmin) {
        void fetchUsers();
      }
    })();
  }, [id, fetchServerById, fetchUsers, isAdmin]);

  const buildCleanedConfig = (): ServerMonitoringConfig => {
    const reqList = requiredContainersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ignList = ignoreContainersText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mounts = mountPointsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const emails = toEmailsText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return {
      ...config,
      host: {
        ...config.host,
        mount_points: mounts.length > 0 ? mounts : ['/'],
      },
      docker: {
        ...config.docker,
        required_containers: reqList,
        ignore_containers: ignList,
      },
      smtp: {
        ...config.smtp,
        to_emails: emails,
      },
    };
  };

  const handleSave = async (andOpenYaml = false, andDownload = false) => {
    if (!id) return;
    setSaving(true);
    setSaveSuccess(null);
    clearError();
    try {
      const cleaned = buildCleanedConfig();
      await updateServer(id, {
        name: serverName.trim() || currentServer?.name || 'server',
        description: serverDesc.trim() || undefined,
        config: cleaned,
      });
      setConfig(cleaned);
      setSaveSuccess('Configuració de les 4 potetes desada correctament.');
      const bundle = await fetchConfigYaml(id);
      if (andOpenYaml) {
        setActiveTab('yaml');
      }
      if (andDownload && bundle) {
        triggerDownload(bundle.filename || `${serverName}-config.yaml`, bundle.config_yaml);
      }
    } catch {
      // Error surfaced in store
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchToYaml = async () => {
    setActiveTab('yaml');
    if (id) {
      try {
        await fetchConfigYaml(id);
      } catch {
        // Error surfaced in store
      }
    }
  };

  const triggerDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/yaml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleAddEndpoint = () => {
    if (!newEndpointName.trim() || !newEndpointUrl.trim()) return;
    const parsedCodes = newEndpointCodes
      .split(',')
      .map((c) => Number(c.trim()))
      .filter((n) => !Number.isNaN(n) && n >= 100 && n < 600);

    const nextEp: HttpEndpointCheckConfig = {
      name: newEndpointName.trim(),
      url: newEndpointUrl.trim(),
      method: 'GET',
      expected_status_codes: parsedCodes.length > 0 ? parsedCodes : [200, 202],
      timeout_seconds: Number(newEndpointTimeout) || 5,
    };
    setConfig((prev) => ({
      ...prev,
      http_endpoints: [...prev.http_endpoints, nextEp],
    }));
    setNewEndpointName('');
    setNewEndpointUrl('');
    setNewEndpointCodes('200, 202');
    setNewEndpointTimeout(5);
  };

  const handleRemoveEndpoint = (index: number) => {
    setConfig((prev) => ({
      ...prev,
      http_endpoints: prev.http_endpoints.filter((_, idx) => idx !== index),
    }));
  };

  const handleFillAuthorizedEmails = () => {
    if (!id) return;
    const authorizedEmails = users
      .filter(
        (u) =>
          u.is_active &&
          (u.role === 'ADMIN' || (u.server_ids && u.server_ids.includes(id)))
      )
      .map((u) => u.email);

    if (authorizedEmails.length > 0) {
      const merged = Array.from(
        new Set([
          ...toEmailsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          ...authorizedEmails,
        ])
      );
      setToEmailsText(merged.join(', '));
    } else if (currentUser?.email) {
      setToEmailsText(currentUser.email);
    }
  };

  const primaryPg: PostgresInstanceConfig = config.postgres.instances[0] ?? {
    name: 'postgres-main',
    host: '127.0.0.1',
    port: 5432,
    user: 'pg_monitor',
    password: '',
    dbname: 'postgres',
    sslmode: 'disable',
    max_connections_percent: 80,
    long_query_seconds: 60,
    max_long_running_queries: 1,
  };

  const updatePrimaryPg = (patch: Partial<PostgresInstanceConfig>) => {
    const updated: PostgresInstanceConfig = { ...primaryPg, ...patch };
    setConfig((prev) => ({
      ...prev,
      postgres: {
        ...prev.postgres,
        instances: [updated, ...prev.postgres.instances.slice(1)],
      },
    }));
  };

  if (loading && !currentServer) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Barra superior del servidor i pestanyes */}
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
            variant="outlined"
            size="small"
            onClick={() => navigate('/servers')}
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
          >
            ← Inventari
          </Button>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            Servidor: <strong style={{ color: '#1e293b' }}>{serverName || currentServer?.name}</strong>{' '}
            (`{id}`)
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant={activeTab === 'form' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setActiveTab('form')}
            sx={{
              textTransform: 'none',
              bgcolor: activeTab === 'form' ? '#1976d2' : '#ffffff',
              color: activeTab === 'form' ? '#ffffff' : '#1e293b',
              borderColor: '#e2e8f0',
            }}
          >
            1. Formulari de les 4 Potetes (HU-SRV-02)
          </Button>
          <Button
            variant={activeTab === 'yaml' ? 'contained' : 'outlined'}
            size="small"
            onClick={handleSwitchToYaml}
            sx={{
              textTransform: 'none',
              bgcolor: activeTab === 'yaml' ? '#1976d2' : '#ffffff',
              color: activeTab === 'yaml' ? '#ffffff' : '#1e293b',
              borderColor: '#e2e8f0',
            }}
          >
            2. Previsualització `config.yaml` &amp; `systemd`
          </Button>
          {isAdmin && (
            <Button
              variant="contained"
              size="small"
              disabled={saving}
              onClick={() => void handleSave(true, true)}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', fontWeight: 600 }}
            >
              {saving ? 'Desant...' : 'Desar i Descarregar `config.yaml`'}
            </Button>
          )}
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </Alert>
      )}
      {saveSuccess && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSaveSuccess(null)}>
          {saveSuccess}
        </Alert>
      )}

      {activeTab === 'form' ? (
        <Box>
          <Box sx={{ mb: 2.5 }}>
            <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700, color: '#1e293b' }}>
              Configuració de Mètriques, Llindars i Alertes (`{serverName}`)
            </Typography>
            <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5 }}>
              Activa quines mètriques vol recollir l&apos;agent d&apos;aquest servidor i defineix els llindars que dispararan alerta per correu.
            </Typography>
          </Box>

          {/* Paràmetres generals i intervals del servidor */}
          <Paper
            elevation={0}
            sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5, mb: 2.5 }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(4, 1fr)' },
                gap: 2,
              }}
            >
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Nom del servidor (`name`)
                </label>
                <input
                  type="text"
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Bucle ràpid Watchdog (`check_interval_seconds`)
                </label>
                <input
                  type="number"
                  value={config.check_interval_seconds}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      check_interval_seconds: Number(e.target.value) || 15,
                    }))
                  }
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Bucle lent Snapshot (`report_interval_seconds`)
                </label>
                <input
                  type="number"
                  value={config.report_interval_seconds}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      report_interval_seconds: Number(e.target.value) || 300,
                    }))
                  }
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Intents fallits Punt Central (`central_unreachable_failures`)
                </label>
                <input
                  type="number"
                  value={config.central_unreachable_failures}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      central_unreachable_failures: Number(e.target.value) || 3,
                    }))
                  }
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
            </Box>
          </Paper>

          {/* GRID POTETA 1 (HOST) & POTETA 2 (DOCKER) */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2.5,
              mb: 2.5,
            }}
          >
            {/* POTETA 1: HOST & SO */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pb: 1.5,
                  mb: 1.75,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  1. Poteta Maquinari &amp; Sistema Operatiu
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.enabled}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, enabled: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 13 }}>Activa</Typography>}
                />
              </Box>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 0.5,
                  mb: 1.75,
                }}
              >
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_os_info && config.host.collect_reboot_required}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: {
                            ...prev.host,
                            collect_os_info: e.target.checked,
                            collect_reboot_required: e.target.checked,
                          },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Versió SO + Kernel + `reboot_required`</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_load}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, collect_load: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>System Load (`1m`, `5m`, `15m`)</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_disk}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, collect_disk: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Ús de Disc (`/`)</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_memory}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, collect_memory: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Memòria RAM (`%` i MB)</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_swap}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, collect_swap: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Swap (`%` i MB)</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_processes && config.host.collect_users}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: {
                            ...prev.host,
                            collect_processes: e.target.checked,
                            collect_users: e.target.checked,
                          },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Processos i Usuaris connectats</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.host.collect_network_ip}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          host: { ...prev.host, collect_network_ip: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>IPv4 d&apos;interfície</Typography>}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar System Load (1m)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={config.host.thresholds.max_load_1m ?? 2.5}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: {
                          ...prev.host,
                          thresholds: {
                            ...prev.host.thresholds,
                            max_load_1m: Number(e.target.value),
                          },
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar Màxim Disc `/` (%)
                  </label>
                  <input
                    type="number"
                    value={config.host.thresholds.max_disk_percent ?? 85}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: {
                          ...prev.host,
                          thresholds: {
                            ...prev.host.thresholds,
                            max_disk_percent: Number(e.target.value),
                          },
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar Màxim RAM (%)
                  </label>
                  <input
                    type="number"
                    value={config.host.thresholds.max_memory_percent ?? 90}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: {
                          ...prev.host,
                          thresholds: {
                            ...prev.host.thresholds,
                            max_memory_percent: Number(e.target.value),
                          },
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar Màxim Swap (%)
                  </label>
                  <input
                    type="number"
                    value={config.host.thresholds.max_swap_percent ?? 60}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: {
                          ...prev.host,
                          thresholds: {
                            ...prev.host.thresholds,
                            max_swap_percent: Number(e.target.value),
                          },
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Interfície de xarxa
                  </label>
                  <input
                    type="text"
                    value={config.host.network_interface ?? 'ens3'}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: { ...prev.host, network_interface: e.target.value },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Comprovacions sostingudes (`sustained_checks`)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={config.host.thresholds.sustained_checks}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        host: {
                          ...prev.host,
                          thresholds: {
                            ...prev.host.thresholds,
                            sustained_checks: Number(e.target.value) || 4,
                          },
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>
            </Paper>

            {/* POTETA 2: DOCKER */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pb: 1.5,
                  mb: 1.75,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  2. Poteta Contenidors Docker (Estat + CPU + RAM)
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.docker.enabled}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          docker: { ...prev.docker, enabled: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 13 }}>Activa</Typography>}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5, mb: 1.75 }}>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.docker.collect_container_stats}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          docker: { ...prev.docker, collect_container_stats: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Recollir `% CPU` i `RAM` per contenidor</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.docker.alert_on_container_down}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          docker: { ...prev.docker, alert_on_container_down: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 12.5 }}>Alertar si un contenidor cau (`exited`/`unhealthy`)</Typography>}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar CPU per contenidor (%)
                  </label>
                  <input
                    type="number"
                    value={config.docker.max_container_cpu_percent ?? 90}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        docker: {
                          ...prev.docker,
                          max_container_cpu_percent: Number(e.target.value),
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar RAM per contenidor (%)
                  </label>
                  <input
                    type="number"
                    value={config.docker.max_container_memory_percent ?? 90}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...prev,
                        docker: {
                          ...prev.docker,
                          max_container_memory_percent: Number(e.target.value),
                        },
                      }))
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>

              <Box sx={{ mb: 1.5 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Contenidors obligatoris (`required_containers`, separats per comes)
                </label>
                <input
                  type="text"
                  value={requiredContainersText}
                  onChange={(e) => setRequiredContainersText(e.target.value)}
                  placeholder="traefik, postgres-main, nasc-backend, nasc-frontend"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>

              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Contenidors ignorats (`ignore_containers`, separats per comes)
                </label>
                <input
                  type="text"
                  value={ignoreContainersText}
                  onChange={(e) => setIgnoreContainersText(e.target.value)}
                  placeholder="db-backup-oneshot"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
            </Paper>
          </Box>

          {/* GRID POTETA 3 (HTTP ENDPOINTS) & POTETA 4 (POSTGRESQL) */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2.5,
              mb: 2.5,
            }}
          >
            {/* POTETA 3: ENDPOINTS HTTP */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pb: 1.5,
                  mb: 1.75,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  3. Poteta Endpoints HTTP (Esperant 200 / 202)
                </Typography>
              </Box>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 14 }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b' }}>Nom Servei</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b' }}>URL Interna / Local</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b' }}>Codis OK</th>
                    <th style={{ padding: '8px 10px', textAlign: 'left', color: '#64748b' }}>Timeout</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>Acció</th>
                  </tr>
                </thead>
                <tbody>
                  {config.http_endpoints.map((ep, idx) => (
                    <tr key={`${ep.name}-${idx}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>{ep.name}</td>
                      <td style={{ padding: '8px 10px', fontFamily: '"Roboto Mono", monospace' }}>{ep.url}</td>
                      <td style={{ padding: '8px 10px', fontFamily: '"Roboto Mono", monospace' }}>
                        {ep.expected_status_codes.join(', ')}
                      </td>
                      <td style={{ padding: '8px 10px', fontFamily: '"Roboto Mono", monospace' }}>
                        {ep.timeout_seconds}s
                      </td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleRemoveEndpoint(idx)}
                          aria-label={`Elimina endpoint ${ep.name}`}
                        >
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <Box
                sx={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1.4fr 0.8fr 0.6fr auto',
                  gap: 1,
                  alignItems: 'end',
                }}
              >
                <Box>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                    Servei
                  </label>
                  <input
                    type="text"
                    value={newEndpointName}
                    onChange={(e) => setNewEndpointName(e.target.value)}
                    placeholder="Nasc API"
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                    URL (`http://...`)
                  </label>
                  <input
                    type="url"
                    value={newEndpointUrl}
                    onChange={(e) => setNewEndpointUrl(e.target.value)}
                    placeholder="http://127.0.0.1:8081/health"
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                    Codis OK
                  </label>
                  <input
                    type="text"
                    value={newEndpointCodes}
                    onChange={(e) => setNewEndpointCodes(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                    Timeout (s)
                  </label>
                  <input
                    type="number"
                    value={newEndpointTimeout}
                    onChange={(e) => setNewEndpointTimeout(Number(e.target.value))}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Button
                  type="button"
                  variant="outlined"
                  size="small"
                  onClick={handleAddEndpoint}
                  sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b', height: 31 }}
                >
                  + Afegir
                </Button>
              </Box>
            </Paper>

            {/* POTETA 4: POSTGRESQL DINS DOCKER */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5 }}>
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  pb: 1.5,
                  mb: 1.75,
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  4. Poteta PostgreSQL (dins de Docker)
                </Typography>
                <FormControlLabel
                  control={
                    <Checkbox
                      size="small"
                      checked={config.postgres.enabled}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          postgres: { ...prev.postgres, enabled: e.target.checked },
                        }))
                      }
                    />
                  }
                  label={<Typography sx={{ fontSize: 13 }}>Activa</Typography>}
                />
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Nom Instància / Contenidor
                  </label>
                  <input
                    type="text"
                    value={primaryPg.name}
                    onChange={(e) => updatePrimaryPg({ name: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Host / IP Docker &amp; Port
                  </label>
                  <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1 }}>
                    <input
                      type="text"
                      value={primaryPg.host}
                      onChange={(e) => updatePrimaryPg({ host: e.target.value })}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                    />
                    <input
                      type="number"
                      value={primaryPg.port}
                      onChange={(e) => updatePrimaryPg({ port: Number(e.target.value) || 5432 })}
                      style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                    />
                  </Box>
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Usuari de monitorització (read-only)
                  </label>
                  <input
                    type="text"
                    value={primaryPg.user}
                    onChange={(e) => updatePrimaryPg({ user: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Base de dades (`dbname`)
                  </label>
                  <input
                    type="text"
                    value={primaryPg.dbname}
                    onChange={(e) => updatePrimaryPg({ dbname: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>

              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Llindar màxim connexions ocupades (%)
                  </label>
                  <input
                    type="number"
                    value={primaryPg.max_connections_percent}
                    onChange={(e) =>
                      updatePrimaryPg({ max_connections_percent: Number(e.target.value) || 80 })
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
                <Box>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                    Alerta consultes lentes (&gt; segons)
                  </label>
                  <input
                    type="number"
                    value={primaryPg.long_query_seconds}
                    onChange={(e) =>
                      updatePrimaryPg({ long_query_seconds: Number(e.target.value) || 60 })
                    }
                    style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                  />
                </Box>
              </Box>
            </Paper>
          </Box>

          {/* SECCIÓ 5: SMTP I DESTINATARIS DEL SERVIDOR */}
          <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 2.5 }}>
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pb: 1.5,
                mb: 1.75,
                borderBottom: '1px solid #e2e8f0',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                5. Destinataris d&apos;Alertes per Email i Configuració SMTP
              </Typography>
              <Button
                type="button"
                variant="outlined"
                size="small"
                onClick={handleFillAuthorizedEmails}
                sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b', fontSize: 12.5 }}
              >
                Omplir amb els emails dels usuaris autoritzats d&apos;aquest servidor
              </Button>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.3fr 1fr 0.7fr' }, gap: 1.5 }}>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Destinataris d&apos;alerta (`to_emails`, separats per comes)
                </label>
                <input
                  type="text"
                  value={toEmailsText}
                  onChange={(e) => setToEmailsText(e.target.value)}
                  placeholder="eric@rawcraft.cat, marc@rawcraft.cat"
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Servidor SMTP (`host`)
                </label>
                <input
                  type="text"
                  value={config.smtp.host ?? 'smtp.rawcraft.cat'}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      smtp: { ...prev.smtp, host: e.target.value },
                    }))
                  }
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
              <Box>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: '#64748b', marginBottom: 4 }}>
                  Port SMTP
                </label>
                <input
                  type="number"
                  value={config.smtp.port ?? 587}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      smtp: { ...prev.smtp, port: Number(e.target.value) || 587 },
                    }))
                  }
                  style={{ width: '100%', padding: '8px 10px', fontSize: 13, border: '1px solid #e2e8f0', borderRadius: 6 }}
                />
              </Box>
            </Box>
          </Paper>
        </Box>
      ) : (
        /* VISTA 2: PREVISUALITZACIÓ CONFIG.YAML I UNITAT SYSTEMD */
        <Box>
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
            <Box>
              <Typography component="h1" sx={{ fontSize: 21, fontWeight: 700, color: '#1e293b' }}>
                Fitxer `config.yaml` i Servei `systemd` fora de Docker
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.5 }}>
                Fitxer autogenerat per al servidor <strong>{serverName}</strong> (`HU-SRV-03`, `HU-INF-04`).
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', gap: 1.25 }}>
              <Button
                variant="outlined"
                onClick={async () => {
                  if (yamlBundle?.config_yaml) {
                    await navigator.clipboard.writeText(yamlBundle.config_yaml);
                    setCopiedYaml(true);
                  }
                }}
                sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
              >
                {copiedYaml ? 'Copiat!' : 'Copiar `config.yaml`'}
              </Button>
              <Button
                variant="contained"
                onClick={() => {
                  if (yamlBundle) {
                    triggerDownload(
                      yamlBundle.filename || `${serverName}-config.yaml`,
                      yamlBundle.config_yaml
                    );
                  }
                }}
                sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
              >
                Descarregar `{yamlBundle?.filename || `${serverName}-config.yaml`}`
              </Button>
            </Box>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2.5,
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                1. `/etc/rawcraft-agent/config.yaml`
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: '#0f172a',
                  color: '#e2e8f0',
                  p: 2.5,
                  borderRadius: '8px',
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  overflowX: 'auto',
                  m: 0,
                }}
              >
                {yamlBundle?.config_yaml || 'Carregant config.yaml...'}
              </Box>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                2. `/etc/systemd/system/rawcraft-agent.service` (Límit RAM 30MB)
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: '#0f172a',
                  color: '#e2e8f0',
                  p: 2.5,
                  borderRadius: '8px',
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  overflowX: 'auto',
                  m: 0,
                }}
              >
                {yamlBundle?.systemd_service ||
                  `[Unit]
Description=Rawcraft Monitor Lightweight Host Agent
After=network-online.target docker.service
Wants=network-online.target

[Service]
Type=simple
User=root
Environment="GOMEMLIMIT=20MiB"
ExecStart=/usr/local/bin/rawcraft-agent -config /etc/rawcraft-agent/config.yaml
Restart=always
RestartSec=5s
MemoryMax=30M
CPUQuota=5%

[Install]
WantedBy=multi-user.target`}
              </Box>

              <Typography sx={{ fontSize: 14, fontWeight: 700, mt: 2.25, mb: 1 }}>
                3. Comandes d&apos;instal·lació ràpida al servidor
              </Typography>
              <Box
                component="pre"
                sx={{
                  bgcolor: '#0f172a',
                  color: '#e2e8f0',
                  p: 2.5,
                  borderRadius: '8px',
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: 12.5,
                  lineHeight: 1.55,
                  overflowX: 'auto',
                  m: 0,
                }}
              >
                {yamlBundle?.install_commands ||
                  `sudo install -m 0755 rawcraft-agent /usr/local/bin/rawcraft-agent
sudo mkdir -p /etc/rawcraft-agent
sudo cp ${serverName}-config.yaml /etc/rawcraft-agent/config.yaml
sudo chmod 0600 /etc/rawcraft-agent/config.yaml
sudo systemctl daemon-reload
sudo systemctl enable --now rawcraft-agent`}
              </Box>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
};
