import React, { useEffect, useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import { useServersStore } from '../store';
import type { Server } from '../api';
import { useUsersStore } from '../../users/store';

export const ServersListView: React.FC = () => {
  const navigate = useNavigate();
  const {
    servers,
    loading,
    error,
    fetchServers,
    createServer,
    deleteServer,
    rotateApiKey,
    clearError,
  } = useServersStore();
  const { currentUser } = useUsersStore();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [checkInterval, setCheckInterval] = useState(15);
  const [reportInterval, setReportInterval] = useState(300);
  const [submitting, setSubmitting] = useState(false);

  const [generatedKeyModal, setGeneratedKeyModal] = useState<{
    serverId: string;
    serverName: string;
    apiKey: string;
    isNew: boolean;
  } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Server | null>(null);
  const [deleting, setDeleting] = useState(false);

  const nameId = useId();
  const descId = useId();
  const checkId = useId();
  const reportId = useId();

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  const handleOpenCreate = () => {
    clearError();
    setName('');
    setDescription('');
    setCheckInterval(15);
    setReportInterval(300);
    setCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      const res = await createServer({
        name: name.trim(),
        description: description.trim() || undefined,
        check_interval_seconds: Number(checkInterval) || 15,
        report_interval_seconds: Number(reportInterval) || 300,
      });
      setCreateOpen(false);
      setGeneratedKeyModal({
        serverId: res.server.id,
        serverName: res.server.name,
        apiKey: res.api_key,
        isNew: true,
      });
    } catch {
      // Error surfaced in store
    } finally {
      setSubmitting(false);
    }
  };

  const handleRotateKey = async (srv: Server) => {
    clearError();
    try {
      const res = await rotateApiKey(srv.id);
      setCopiedKey(false);
      setGeneratedKeyModal({
        serverId: srv.id,
        serverName: srv.name,
        apiKey: res.api_key,
        isNew: false,
      });
    } catch {
      // Error surfaced in store
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteServer(deleteTarget.id, true);
      setDeleteTarget(null);
    } catch {
      // Error surfaced in store
    } finally {
      setDeleting(false);
    }
  };

  const handleCopyKey = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(true);
    } catch {
      setCopiedKey(false);
    }
  };

  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: 22, fontWeight: 700, color: '#1e293b' }}>
            Inventari de Servidors Monitoritzats
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#64748b', mt: 0.5 }}>
            Dona d&apos;alta servidors, configura les 4 potetes de cada màquina i descarrega el seu `config.yaml` amb identificador únic.
          </Typography>
        </Box>
        {isAdmin && (
          <Button
            variant="contained"
            onClick={handleOpenCreate}
            sx={{
              bgcolor: '#1976d2',
              textTransform: 'none',
              fontWeight: 500,
              borderRadius: '8px',
              px: 2.25,
              py: 1.1,
            }}
          >
            + Registrar Nou Servidor
          </Button>
        )}
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      <Paper
        elevation={0}
        sx={{
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          overflow: 'hidden',
        }}
      >
        <Box
          tabIndex={0}
          role="region"
          aria-label="Taula d'inventari de servidors monitoritzats"
          sx={{ overflowX: 'auto', maxWidth: '100%' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', insetBlockStart: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Servidor &amp; UUID
                </th>
                <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Sistema Operatiu / IP
                </th>
                <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Intervals (Watchdog / Històric)
                </th>
                <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Potetes Actives
                </th>
                <th style={{ padding: '14px 18px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Accions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading && servers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </td>
                </tr>
              ) : servers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                    No hi ha cap servidor registrat o assignat.
                  </td>
                </tr>
              ) : (
                servers.map((srv) => {
                  const cfg = srv.config;
                  const httpCount = cfg?.http_endpoints?.length ?? 0;
                  const pgCount = cfg?.postgres?.instances?.length ?? 0;
                  const reqContainersCount = cfg?.docker?.required_containers?.length ?? 0;

                  return (
                    <tr key={srv.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '16px 18px' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                            {srv.name}
                            {srv.description ? ` (${srv.description})` : ''}
                          </Typography>
                          <Chip
                            label={srv.status}
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: 11,
                              fontWeight: 600,
                              bgcolor:
                                srv.status === 'ONLINE'
                                  ? '#dcfce7'
                                  : srv.status === 'CRITICAL'
                                    ? '#fee2e2'
                                    : '#f1f5f9',
                              color:
                                srv.status === 'ONLINE'
                                  ? '#166534'
                                  : srv.status === 'CRITICAL'
                                    ? '#991b1b'
                                    : '#475569',
                            }}
                          />
                        </Box>
                        <Typography
                          sx={{
                            fontFamily: '"Roboto Mono", monospace',
                            fontSize: 12,
                            color: '#64748b',
                            mt: 0.25,
                          }}
                        >
                          id: {srv.id}
                          {srv.api_key_preview ? ` • key: ${srv.api_key_preview}` : ''}
                        </Typography>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <Typography sx={{ fontSize: 14, color: '#1e293b' }}>
                          {srv.os_name || 'Pendent de primer report'}
                        </Typography>
                        <Typography
                          sx={{
                            fontFamily: '"Roboto Mono", monospace',
                            fontSize: 12,
                            color: '#64748b',
                          }}
                        >
                          {srv.config?.host?.network_interface
                            ? `${srv.config.host.network_interface}: `
                            : ''}
                          {srv.ipv4_address || '—'}
                        </Typography>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <Typography
                          sx={{
                            fontFamily: '"Roboto Mono", monospace',
                            fontSize: 12,
                            color: '#64748b',
                          }}
                        >
                          Check: {cfg?.check_interval_seconds ?? 15}s | Report:{' '}
                          {cfg?.report_interval_seconds ?? 300}s (
                          {Math.round((cfg?.report_interval_seconds ?? 300) / 60)}m)
                        </Typography>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6 }}>
                          {cfg?.host?.enabled !== false && (
                            <Box
                              component="span"
                              sx={{
                                bgcolor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                px: 1,
                                py: 0.25,
                                borderRadius: '4px',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              Host/SO
                            </Box>
                          )}
                          {cfg?.docker?.enabled !== false && (
                            <Box
                              component="span"
                              sx={{
                                bgcolor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                px: 1,
                                py: 0.25,
                                borderRadius: '4px',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              Docker ({reqContainersCount})
                            </Box>
                          )}
                          <Box
                            component="span"
                            sx={{
                              bgcolor: '#f1f5f9',
                              border: '1px solid #e2e8f0',
                              px: 1,
                              py: 0.25,
                              borderRadius: '4px',
                              fontSize: 11,
                              fontWeight: 500,
                            }}
                          >
                            HTTP ({httpCount})
                          </Box>
                          {cfg?.postgres?.enabled && (
                            <Box
                              component="span"
                              sx={{
                                bgcolor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                px: 1,
                                py: 0.25,
                                borderRadius: '4px',
                                fontSize: 11,
                                fontWeight: 500,
                              }}
                            >
                              Postgres ({pgCount})
                            </Box>
                          )}
                        </Box>
                      </td>
                      <td style={{ padding: '16px 18px' }}>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => navigate(`/servers/${srv.id}/config`)}
                            sx={{
                              textTransform: 'none',
                              borderColor: '#e2e8f0',
                              color: '#1e293b',
                              fontSize: 13,
                            }}
                          >
                            Configurar 4 Potetes &amp; YAML
                          </Button>
                          {isAdmin && (
                            <>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => handleRotateKey(srv)}
                                sx={{
                                  textTransform: 'none',
                                  borderColor: '#e2e8f0',
                                  color: '#1e293b',
                                  fontSize: 13,
                                }}
                              >
                                Rotar API Key
                              </Button>
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => setDeleteTarget(srv)}
                                sx={{
                                  textTransform: 'none',
                                  borderColor: '#e2e8f0',
                                  color: '#d32f2f',
                                  fontSize: 13,
                                }}
                              >
                                Baixa
                              </Button>
                            </>
                          )}
                        </Box>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </Box>
      </Paper>

      {/* Modal Registrar Nou Servidor */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <form method="post" onSubmit={handleCreateSubmit}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 17, borderBottom: '1px solid #e2e8f0' }}>
            Registrar Nou Servidor
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Box sx={{ mb: 2 }}>
              <label
                htmlFor={nameId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Nom identificador del servidor (`name`)
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                required
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="srv-eu-west-03"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: 14,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  boxSizing: 'border-box',
                }}
              />
            </Box>
            <Box sx={{ mb: 2 }}>
              <label
                htmlFor={descId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Descripció / Rol de la màquina
              </label>
              <input
                id={descId}
                name="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Tercer servidor d'aplicacions i rèplica"
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: 14,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  boxSizing: 'border-box',
                }}
              />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
              <Box>
                <label
                  htmlFor={checkId}
                  style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
                >
                  Bucle ràpid (`check_interval_seconds`)
                </label>
                <input
                  id={checkId}
                  name="check_interval_seconds"
                  type="number"
                  min={5}
                  value={checkInterval}
                  onChange={(e) => setCheckInterval(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 14,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                  }}
                />
              </Box>
              <Box>
                <label
                  htmlFor={reportId}
                  style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
                >
                  Bucle històric (`report_interval_seconds`)
                </label>
                <input
                  id={reportId}
                  name="report_interval_seconds"
                  type="number"
                  min={30}
                  value={reportInterval}
                  onChange={(e) => setReportInterval(Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    fontSize: 14,
                    border: '1px solid #e2e8f0',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                  }}
                />
              </Box>
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <Button
              type="button"
              onClick={() => setCreateOpen(false)}
              sx={{ textTransform: 'none', color: '#1e293b' }}
            >
              Cancel·lar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submitting}
              sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
            >
              {submitting ? 'Creant...' : 'Crear i passar a Configurar YAML'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Modal Nova API Key Generada (Alta o Rotació) */}
      <Dialog
        open={Boolean(generatedKeyModal)}
        onClose={() => setGeneratedKeyModal(null)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, borderBottom: '1px solid #e2e8f0' }}>
          Nova API Key Generada (`{generatedKeyModal?.serverName}`)
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Typography sx={{ fontSize: 13, color: '#64748b', mb: 1.5 }}>
            {generatedKeyModal?.isNew
              ? "S'ha generat l'API Key única d'autenticació per a l'agent d'aquest servidor. Quedarà incrustada automàticament quan descarreguis el config.yaml:"
              : "L'anterior api_key ha quedat invalidada. Descarrega de nou el config.yaml o actualitza el camp api_key a /etc/rawcraft-agent/config.yaml:"}
          </Typography>
          <Box
            sx={{
              bgcolor: '#0f172a',
              color: '#38bdf8',
              p: 1.5,
              borderRadius: '6px',
              fontFamily: '"Roboto Mono", monospace',
              fontSize: 12.5,
              wordBreak: 'break-all',
            }}
          >
            {generatedKeyModal?.apiKey}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button
            type="button"
            variant="outlined"
            onClick={() => generatedKeyModal && handleCopyKey(generatedKeyModal.apiKey)}
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
          >
            {copiedKey ? 'Copiada!' : 'Copiar API Key'}
          </Button>
          <Button
            type="button"
            variant="contained"
            onClick={() => {
              const targetId = generatedKeyModal?.serverId;
              setGeneratedKeyModal(null);
              if (targetId) {
                navigate(`/servers/${targetId}/config`);
              }
            }}
            sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
          >
            Entès, configurar i descarregar `config.yaml`
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Confirmació Baixa Servidor (`confirm=true`) */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, color: '#d32f2f', borderBottom: '1px solid #e2e8f0' }}>
          Confirmar baixa del servidor (Entitat Sensible)
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Typography sx={{ fontSize: 14, lineHeight: 1.55, color: '#1e293b' }}>
            Vols donar de baixa el servidor <strong>{deleteTarget?.name}</strong>? S&apos;aplicarà{' '}
            <em>soft-delete</em> (`confirm=true`), es desactivarà el seu <em>Heartbeat</em> i es conservarà l&apos;històric fins que venci la política de retenció.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
          <Button
            type="button"
            onClick={() => setDeleteTarget(null)}
            sx={{ textTransform: 'none', color: '#1e293b' }}
          >
            Cancel·lar
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={deleting}
            onClick={handleConfirmDelete}
            sx={{ textTransform: 'none' }}
          >
            {deleting ? 'Eliminant...' : 'Confirmar baixa (`confirm=true`)'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
