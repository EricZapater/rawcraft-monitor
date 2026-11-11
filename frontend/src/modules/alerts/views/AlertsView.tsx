import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  Alert as MuiAlert,
  CircularProgress,
} from '@mui/material';
import { useAlertsStore } from '../store';
import type { AlertStatus, AlertCategory, AlertSeverity, Alert } from '../api';
import { useServersStore } from '../../servers/store';

function formatDuration(firedAt: string, resolvedAt?: string | null): string {
  const start = new Date(firedAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const diffSec = Math.max(0, Math.floor((end - start) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ${mins % 60}m`;
  }
  return `${mins}m ${secs}s`;
}

export const AlertsView: React.FC = () => {
  const {
    items,
    activeFiringCount,
    loading,
    error,
    fetchAlerts,
    acknowledgeAlert,
    resolveAlert,
    clearError,
  } = useAlertsStore();
  const { servers, fetchServers } = useServersStore();

  const [viewMode, setViewMode] = useState<'table' | 'email'>('table');
  const [serverFilter, setServerFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<AlertStatus | ''>('');
  const [categoryFilter, setCategoryFilter] = useState<AlertCategory | ''>('');
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | ''>('');
  const [ackingId, setAckingId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  useEffect(() => {
    void fetchServers();
  }, [fetchServers]);

  useEffect(() => {
    void fetchAlerts({
      server_id: serverFilter || undefined,
      status: statusFilter || undefined,
      category: categoryFilter || undefined,
      severity: severityFilter || undefined,
      limit: 100,
    });
  }, [serverFilter, statusFilter, categoryFilter, severityFilter, fetchAlerts]);

  const handleAck = async (alertItem: Alert) => {
    setAckingId(alertItem.id);
    try {
      await acknowledgeAlert(alertItem.id);
    } catch {
      // Error surfaced via store
    } finally {
      setAckingId(null);
    }
  };

  const handleResolve = async (alertItem: Alert) => {
    setResolvingId(alertItem.id);
    try {
      await resolveAlert(alertItem.id);
    } catch {
      // Error surfaced via store
    } finally {
      setResolvingId(null);
    }
  };

  const sampleAlert: Alert | undefined = items[0];

  return (
    <Box>
      {/* Capçalera amb selector de vista (Taula vs. Format Correu SMTP) */}
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
            Panell d&apos;Alertes i Incidències (`HU-ALT-01`..`03`)
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b', mt: 0.25 }}>
            Incidències reportades pel bucle ràpid Watchdog dels agents i pel detector de Heartbeat.
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: activeFiringCount > 0 ? '#dc2626' : '#16a34a', mr: 1 }}>
            ● {activeFiringCount} Alertes Actives (`FIRING`)
          </Typography>
          <Button
            variant={viewMode === 'table' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setViewMode('table')}
            sx={{
              textTransform: 'none',
              bgcolor: viewMode === 'table' ? '#1976d2' : '#ffffff',
              color: viewMode === 'table' ? '#ffffff' : '#1e293b',
              borderColor: '#e2e8f0',
            }}
          >
            1. Llistat i Històric d&apos;Alertes (HU-ALT-03)
          </Button>
          <Button
            variant={viewMode === 'email' ? 'contained' : 'outlined'}
            size="small"
            onClick={() => setViewMode('email')}
            sx={{
              textTransform: 'none',
              bgcolor: viewMode === 'email' ? '#1976d2' : '#ffffff',
              color: viewMode === 'email' ? '#ffffff' : '#1e293b',
              borderColor: '#e2e8f0',
            }}
          >
            2. Format Correu SMTP (`FIRING` &amp; `RESOLVED`)
          </Button>
        </Box>
      </Box>

      {error && (
        <MuiAlert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </MuiAlert>
      )}

      {viewMode === 'table' ? (
        <>
          {/* Barra de filtres */}
          <Paper
            elevation={0}
            sx={{
              display: 'flex',
              gap: 1.5,
              mb: 2.5,
              p: '14px 18px',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              flexWrap: 'wrap',
            }}
          >
            <select
              aria-label="Filtra per servidor"
              value={serverFilter}
              onChange={(e) => setServerFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                background: '#ffffff',
              }}
            >
              <option value="">Tots els servidors autoritzats</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filtra per estat d'alerta"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AlertStatus | '')}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                background: '#ffffff',
              }}
            >
              <option value="">Estat: Tots (FIRING + RESOLVED)</option>
              <option value="FIRING">Només FIRING (Actives)</option>
              <option value="RESOLVED">Només RESOLVED (Històric)</option>
            </select>

            <select
              aria-label="Filtra per categoria"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as AlertCategory | '')}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                background: '#ffffff',
              }}
            >
              <option value="">Categoria: Totes (HOST, DOCKER, HTTP, POSTGRES, HEARTBEAT)</option>
              <option value="HOST">HOST</option>
              <option value="DOCKER">DOCKER</option>
              <option value="HTTP_ENDPOINT">HTTP_ENDPOINT</option>
              <option value="POSTGRES">POSTGRES</option>
              <option value="HEARTBEAT">HEARTBEAT</option>
            </select>

            <select
              aria-label="Filtra per severitat"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as AlertSeverity | '')}
              style={{
                padding: '8px 12px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: 13,
                background: '#ffffff',
              }}
            >
              <option value="">Severitat: Totes (WARNING + CRITICAL)</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="WARNING">WARNING</option>
            </select>
          </Paper>

          {/* Taula d'alertes */}
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
              aria-label="Taula d'alertes i incidències"
              sx={{ overflowX: 'auto', maxWidth: '100%' }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
                <thead style={{ position: 'sticky', insetBlockStart: 0, zIndex: 1 }}>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Estat
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Servidor
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Categoria &amp; Recurs
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Detall de la Incidència (Valor vs. Llindar)
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Inici (`fired_at`)
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Resolució / Durada
                    </th>
                    <th style={{ padding: '12px 16px', fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                      Acció
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && items.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 32, textAlign: 'center' }}>
                        <CircularProgress size={24} />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                        No hi ha cap alerta que coincideixi amb els filtres seleccionats.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => {
                      const isFiring = item.status === 'FIRING';
                      return (
                        <tr
                          key={item.id}
                          style={{
                            borderBottom: '1px solid #e2e8f0',
                            background: isFiring ? '#fff5f5' : '#ffffff',
                          }}
                        >
                          <td style={{ padding: '14px 16px' }}>
                            <Box
                              component="span"
                              sx={{
                                bgcolor: isFiring ? '#fee2e2' : '#dcfce7',
                                color: isFiring ? '#991b1b' : '#166534',
                                px: 1.25,
                                py: 0.5,
                                borderRadius: '12px',
                                fontWeight: 700,
                                fontSize: 11,
                              }}
                            >
                              {item.status}
                            </Box>
                          </td>
                          <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                            {item.server_name}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <Box
                              component="span"
                              sx={{
                                bgcolor: '#f1f5f9',
                                border: '1px solid #e2e8f0',
                                px: 1,
                                py: 0.25,
                                borderRadius: '4px',
                                fontSize: 11,
                                fontWeight: 600,
                              }}
                            >
                              {item.category}
                            </Box>
                            <Box
                              sx={{
                                fontFamily: '"Roboto Mono", monospace',
                                fontSize: 12,
                                mt: 0.5,
                                color: '#334155',
                              }}
                            >
                              {item.target_name}
                            </Box>
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                              {item.title}
                            </Typography>
                            <Typography sx={{ fontSize: 12.5, color: '#475569', mt: 0.25 }}>
                              {item.message}
                              {item.current_value ? ` (Valor: ${item.current_value}` : ''}
                              {item.threshold_value ? ` / Llindar: ${item.threshold_value})` : item.current_value ? ')' : ''}
                            </Typography>
                          </td>
                          <td style={{ padding: '14px 16px', fontFamily: '"Roboto Mono", monospace', fontSize: 12 }}>
                            {new Date(item.fired_at).toLocaleString('ca-ES')}
                          </td>
                          <td
                            style={{
                              padding: '14px 16px',
                              fontFamily: '"Roboto Mono", monospace',
                              fontSize: 12,
                              color: isFiring ? '#dc2626' : '#1e293b',
                            }}
                          >
                            {isFiring
                              ? `En curs (${formatDuration(item.fired_at)})`
                              : `${item.resolved_at ? new Date(item.resolved_at).toLocaleString('ca-ES') : ''} (${formatDuration(item.fired_at, item.resolved_at)})`}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            {isFiring ? (
                              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, alignItems: 'flex-start' }}>
                                {item.acknowledged ? (
                                  <Typography sx={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }}>
                                    ✓ Reconeguda{item.acknowledged_by ? ` (${item.acknowledged_by})` : ''}
                                  </Typography>
                                ) : (
                                  <Button
                                    variant="outlined"
                                    size="small"
                                    disabled={ackingId === item.id || resolvingId === item.id}
                                    onClick={() => void handleAck(item)}
                                    sx={{
                                      textTransform: 'none',
                                      borderColor: '#e2e8f0',
                                      color: '#1e293b',
                                      bgcolor: '#ffffff',
                                      fontSize: 11.5,
                                      py: 0.25,
                                    }}
                                  >
                                    {ackingId === item.id ? '...' : 'Reconèixer (ACK)'}
                                  </Button>
                                )}
                                <Button
                                  variant="outlined"
                                  size="small"
                                  disabled={resolvingId === item.id || ackingId === item.id}
                                  onClick={() => void handleResolve(item)}
                                  sx={{
                                    textTransform: 'none',
                                    borderColor: '#bbf7d0',
                                    color: '#166534',
                                    bgcolor: '#f0fdf4',
                                    fontSize: 11.5,
                                    py: 0.25,
                                    '&:hover': {
                                      bgcolor: '#dcfce7',
                                      borderColor: '#86efac',
                                    },
                                  }}
                                >
                                  {resolvingId === item.id ? 'Tancant...' : 'Marcar com a resolta'}
                                </Button>
                              </Box>
                            ) : (
                              <Typography sx={{ fontSize: 12, color: '#64748b' }}>
                                Resolta
                              </Typography>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </Box>
          </Paper>
        </>
      ) : (
        /* VISTA 2: PREVISUALITZACIÓ DEL CORREU SMTP ENVIAT PER L'AGENT */
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
            gap: 3,
          }}
        >
          <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 3 }}>
            <Box sx={{ mb: 1.5 }}>
              <Box
                component="span"
                sx={{
                  bgcolor: '#fee2e2',
                  color: '#991b1b',
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                CORREU D&apos;OBERTURA (FIRING)
              </Box>
            </Box>
            <Typography sx={{ fontSize: 13, color: '#64748b', mb: 1.75, lineHeight: 1.6 }}>
              <strong>Assumpte:</strong> [FIRING][{sampleAlert?.severity || 'CRITICAL'}]{' '}
              {sampleAlert?.server_name || 'srv-hetzner-02'} — {sampleAlert?.title || 'Docker `nasc-backend` caigut (exited 137)'}
              <br />
              <strong>Per a:</strong> eric@rawcraft.cat, marc@rawcraft.cat
            </Typography>
            <Box
              component="pre"
              sx={{
                bgcolor: '#0f172a',
                color: '#f8fafc',
                p: 2,
                borderRadius: '8px',
                fontFamily: '"Roboto Mono", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: 'auto',
                m: 0,
              }}
            >
              {`ALERTA OBERTA — RAWCRAFT MONITOR AGENT
========================================
Servidor:   ${sampleAlert?.server_name || 'srv-hetzner-02'}
Categoria:  ${sampleAlert?.category || 'DOCKER'}
Recurs:     ${sampleAlert?.target_name || 'nasc-backend'}
Detall:     ${sampleAlert?.message || 'exited (exit_code: 137 - OOMKilled)'}
Detectat:   ${sampleAlert?.fired_at || '2026-11-11 09:41:15 CET'}

Context del servidor en el moment de l'alerta:
  System load:  0.42          Processes: 142
  Usage of /:   41.2%         Memory:    62%
  Swap usage:   4%            SO:        Linux

No s'enviaran més correus per aquesta incidència
fins que la mètrica o servei torni a la normalitat.`}
            </Box>
          </Paper>

          <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: 3 }}>
            <Box sx={{ mb: 1.5 }}>
              <Box
                component="span"
                sx={{
                  bgcolor: '#dcfce7',
                  color: '#166534',
                  px: 1.25,
                  py: 0.5,
                  borderRadius: '12px',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                CORREU DE RECUPERACIÓ (RESOLVED)
              </Box>
            </Box>
            <Typography sx={{ fontSize: 13, color: '#64748b', mb: 1.75, lineHeight: 1.6 }}>
              <strong>Assumpte:</strong> [RESOLVED] {sampleAlert?.server_name || 'srv-hetzner-02'} —{' '}
              {sampleAlert?.target_name || 'nasc-backend'} recuperat
              <br />
              <strong>Per a:</strong> eric@rawcraft.cat, marc@rawcraft.cat
            </Typography>
            <Box
              component="pre"
              sx={{
                bgcolor: '#0f172a',
                color: '#f8fafc',
                p: 2,
                borderRadius: '8px',
                fontFamily: '"Roboto Mono", monospace',
                fontSize: 12,
                lineHeight: 1.6,
                overflowX: 'auto',
                m: 0,
              }}
            >
              {`INCIDÈNCIA RESOLTA — RAWCRAFT MONITOR AGENT
=============================================
Servidor:   ${sampleAlert?.server_name || 'srv-hetzner-02'}
Categoria:  ${sampleAlert?.category || 'DOCKER'}
Recurs:     ${sampleAlert?.target_name || 'nasc-backend'}
Estat nou:  OK / running (healthy)
Resolt a:   ${sampleAlert?.resolved_at || '2026-11-11 09:44:25 CET'}
Durada:     ${sampleAlert ? formatDuration(sampleAlert.fired_at, sampleAlert.resolved_at) : '3m 10s'}`}
            </Box>
          </Paper>
        </Box>
      )}
    </Box>
  );
};
