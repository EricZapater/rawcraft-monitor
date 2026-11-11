import React, { useEffect, useState, useId } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Typography,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
} from '@mui/material';
import { useTelemetryStore } from '../store';
import type { HistoryRange, TelemetryHistoryPoint } from '../api';
import { useUsersStore } from '../../users/store';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dies' },
  { value: '30d', label: '30 dies' },
  { value: '365d', label: '365 dies' },
];

function buildSvgPolyline(values: number[], maxVal: number, width = 500, height = 140): string {
  if (values.length === 0) return `0,${height - 15} ${width},${height - 15}`;
  const safeMax = maxVal > 0 ? maxVal : 1;
  if (values.length === 1) {
    const y = Math.round(height - 12 - (Math.min(values[0], safeMax) / safeMax) * (height - 28));
    return `0,${y} ${width},${y}`;
  }
  return values
    .map((val, idx) => {
      const x = Math.round((idx / (values.length - 1)) * width);
      const clamped = Math.max(0, Math.min(val, safeMax));
      const y = Math.round(height - 12 - (clamped / safeMax) * (height - 28));
      return `${x},${y}`;
    })
    .join(' ');
}

export const ServerHistoryView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const {
    history,
    retention,
    loading,
    error,
    fetchHistory,
    fetchRetention,
    updateRetention,
    clearError,
  } = useTelemetryStore();

  const { currentUser } = useUsersStore();
  const isAdmin = currentUser?.role === 'ADMIN';

  const [range, setRange] = useState<HistoryRange>('24h');
  const [retentionModalOpen, setRetentionModalOpen] = useState(false);
  const [retentionDaysInput, setRetentionDaysInput] = useState(365);
  const [savingRetention, setSavingRetention] = useState(false);
  const retentionInputId = useId();

  useEffect(() => {
    void fetchRetention();
  }, [fetchRetention]);

  useEffect(() => {
    if (retention?.retention_days) {
      setRetentionDaysInput(retention.retention_days);
    }
  }, [retention?.retention_days]);

  useEffect(() => {
    if (!id) return;
    void fetchHistory(id, range);
  }, [id, range, fetchHistory]);

  const points: TelemetryHistoryPoint[] = history?.points ?? [];
  const latestPoint = points.length > 0 ? points[points.length - 1] : null;

  const load1mValues = points.map((p) => p.load_1m);
  const load5mValues = points.map((p) => p.load_5m);
  const maxLoad = Math.max(2.5, ...load1mValues, 1);

  const memValues = points.map((p) => p.memory_percent);
  const swapValues = points.map((p) => p.swap_percent);
  const diskValues = points.map((p) => p.disk_root_percent);

  const containerNames = React.useMemo(() => {
    const set = new Set<string>();
    for (const p of points) {
      if (p.containers_memory_mb) {
        Object.keys(p.containers_memory_mb).forEach((k) => set.add(k));
      }
    }
    return Array.from(set).slice(0, 3);
  }, [points]);

  const maxContainerMem = React.useMemo(() => {
    let m = 512;
    for (const p of points) {
      if (p.containers_memory_mb) {
        for (const v of Object.values(p.containers_memory_mb)) {
          if (v > m) m = v;
        }
      }
    }
    return m * 1.15;
  }, [points]);

  const pgConnSeries = points.map((p) => {
    const vals = p.postgres_connections_percent ? Object.values(p.postgres_connections_percent) : [];
    return vals.length > 0 ? vals[0] : 0;
  });

  const httpLatencySeries = points.map((p) => {
    const vals = p.http_latency_ms ? Object.values(p.http_latency_ms) : [];
    if (vals.length === 0) return 0;
    return vals.reduce((acc, v) => acc + v, 0) / vals.length;
  });

  const handleSaveRetention = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingRetention(true);
    try {
      await updateRetention(Math.max(7, Number(retentionDaysInput) || 365));
      setRetentionModalOpen(false);
    } catch {
      // Error handled in store
    } finally {
      setSavingRetention(false);
    }
  };

  return (
    <Box>
      {/* Barra superior */}
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
            to={id ? `/servers/${id}` : '/'}
            variant="outlined"
            size="small"
            sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b' }}
          >
            ← Detall del Servidor
          </Button>
          <Typography sx={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>
            Històric i Gràfiques Temporals: <code>{id}</code>
          </Typography>
        </Box>

        <Button
          variant="outlined"
          size="small"
          onClick={() => setRetentionModalOpen(true)}
          sx={{ textTransform: 'none', borderColor: '#e2e8f0', color: '#1e293b', bgcolor: '#ffffff' }}
        >
          Política de Retenció: <strong style={{ marginLeft: 4 }}>{retention?.retention_days ?? 365} dies</strong>
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={clearError}>
          {error}
        </Alert>
      )}

      {/* Toolbar de rang temporal */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 2.5,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
            Evolució Temporal de Mètriques (`HU-TEL-04`)
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            Mostres recollides periòdicament per `rawcraft-agent` (agregació automàtica per a rangs llargs).
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'inline-flex',
            bgcolor: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            overflow: 'hidden',
          }}
        >
          {RANGES.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setRange(r.value)}
              style={{
                background: range === r.value ? '#1976d2' : 'transparent',
                color: range === r.value ? '#ffffff' : '#1e293b',
                border: 'none',
                borderRight: '1px solid #e2e8f0',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </Box>
      </Box>

      {loading && points.length === 0 ? (
        <Box sx={{ py: 6, textAlign: 'center' }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2.5,
              mb: 2.5,
            }}
          >
            {/* Gràfica 1: System Load */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '18px 20px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  System Load (`1m`, `5m`, `15m`)
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#1976d2', fontFamily: '"Roboto Mono", monospace' }}>
                  Actual: {latestPoint ? latestPoint.load_1m.toFixed(2) : '0.00'} | Màx {range}:{' '}
                  {load1mValues.length > 0 ? Math.max(...load1mValues).toFixed(2) : '0.00'}
                </Typography>
              </Box>
              <svg
                viewBox="0 0 500 140"
                preserveAspectRatio="none"
                style={{
                  width: '100%',
                  height: 150,
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <line x1="0" y1="30" x2="500" y2="30" stroke="#fecaca" strokeDasharray="4 4" />
                <polyline
                  fill="none"
                  stroke="#93c5fd"
                  strokeWidth="1.75"
                  points={buildSvgPolyline(load5mValues, maxLoad)}
                />
                <polyline
                  fill="none"
                  stroke="#1976d2"
                  strokeWidth="2.5"
                  points={buildSvgPolyline(load1mValues, maxLoad)}
                />
              </svg>
            </Paper>

            {/* Gràfica 2: Memòria RAM, Swap i Disc */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '18px 20px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  Ús de Memòria RAM (%), Swap (%) i Disc `/` (%)
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: '#16a34a', fontFamily: '"Roboto Mono", monospace' }}>
                  RAM: {latestPoint ? Math.round(latestPoint.memory_percent) : 0}% | Swap:{' '}
                  {latestPoint ? Math.round(latestPoint.swap_percent) : 0}% | Disc:{' '}
                  {latestPoint ? Math.round(latestPoint.disk_root_percent) : 0}%
                </Typography>
              </Box>
              <svg
                viewBox="0 0 500 140"
                preserveAspectRatio="none"
                style={{
                  width: '100%',
                  height: 150,
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <polyline
                  fill="none"
                  stroke="#16a34a"
                  strokeWidth="2.5"
                  points={buildSvgPolyline(memValues, 100)}
                />
                <polyline
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2"
                  points={buildSvgPolyline(swapValues, 100)}
                />
                <polyline
                  fill="none"
                  stroke="#64748b"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                  points={buildSvgPolyline(diskValues, 100)}
                />
              </svg>
            </Paper>
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: 2.5,
            }}
          >
            {/* Gràfica 3: Consum RAM per Contenidor Docker */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '18px 20px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  Consum RAM per Contenidor Docker (MB)
                </Typography>
                <Typography sx={{ fontSize: 12, fontFamily: '"Roboto Mono", monospace', color: '#475569' }}>
                  {containerNames.length > 0
                    ? containerNames
                        .map((name) => {
                          const val = latestPoint?.containers_memory_mb?.[name];
                          return `${name} (${val !== undefined ? Math.round(val) : 0}MB)`;
                        })
                        .join(' • ')
                    : 'Sense sèries de contenidors'}
                </Typography>
              </Box>
              <svg
                viewBox="0 0 500 140"
                preserveAspectRatio="none"
                style={{
                  width: '100%',
                  height: 150,
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                {containerNames.map((name, idx) => {
                  const colors = ['#7c3aed', '#0284c7', '#16a34a'];
                  const series = points.map((p) => p.containers_memory_mb?.[name] ?? 0);
                  return (
                    <polyline
                      key={name}
                      fill="none"
                      stroke={colors[idx % colors.length]}
                      strokeWidth="2.2"
                      points={buildSvgPolyline(series, maxContainerMem)}
                    />
                  );
                })}
              </svg>
            </Paper>

            {/* Gràfica 4: PostgreSQL & Latència Endpoints HTTP */}
            <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '18px 20px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                  PostgreSQL (% Connexions) &amp; Latència HTTP (ms)
                </Typography>
                <Typography sx={{ fontSize: 12, fontFamily: '"Roboto Mono", monospace', color: '#475569' }}>
                  Conn: {pgConnSeries.length > 0 ? Math.round(pgConnSeries[pgConnSeries.length - 1]) : 0}% • HTTP:{' '}
                  {httpLatencySeries.length > 0 ? Math.round(httpLatencySeries[httpLatencySeries.length - 1]) : 0} ms
                </Typography>
              </Box>
              <svg
                viewBox="0 0 500 140"
                preserveAspectRatio="none"
                style={{
                  width: '100%',
                  height: 150,
                  background: '#f8fafc',
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <polyline
                  fill="none"
                  stroke="#0f766e"
                  strokeWidth="2.5"
                  points={buildSvgPolyline(pgConnSeries, 100)}
                />
                <polyline
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  points={buildSvgPolyline(httpLatencySeries, Math.max(100, ...httpLatencySeries))}
                />
              </svg>
            </Paper>
          </Box>
        </>
      )}

      {/* Modal Configuració Retenció (HU-TEL-05) */}
      <Dialog
        open={retentionModalOpen}
        onClose={() => setRetentionModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <form method="post" onSubmit={handleSaveRetention}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 16, borderBottom: '1px solid #e2e8f0' }}>
            Política de Retenció d&apos;Històric (`HU-TEL-05`)
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <label
              htmlFor={retentionInputId}
              style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
            >
              Dies de conservació d&apos;històric (`retention_days`)
            </label>
            <input
              id={retentionInputId}
              name="retention_days"
              type="number"
              min={7}
              disabled={!isAdmin}
              value={retentionDaysInput}
              onChange={(e) => setRetentionDaysInput(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '9px 12px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                marginBottom: 10,
                boxSizing: 'border-box',
              }}
            />
            <Typography sx={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
              Valor inicial per defecte: <strong>365 dies</strong>. Un procés diari al backend del Punt Central purga automàticament les mostres de telemetria i les alertes resoltes amb antiguitat superior a aquest valor.
            </Typography>
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <Button
              type="button"
              onClick={() => setRetentionModalOpen(false)}
              sx={{ textTransform: 'none', color: '#1e293b' }}
            >
              Tancar
            </Button>
            {isAdmin && (
              <Button
                type="submit"
                variant="contained"
                disabled={savingRetention}
                sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
              >
                {savingRetention ? 'Desant...' : 'Desar retenció'}
              </Button>
            )}
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};
