import React, { useEffect, useState, useId, useMemo } from 'react';
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
import { serversApi, type Deployment } from '../../servers/api';
import type { HistoryRange, TelemetryHistoryPoint } from '../api';
import { useUsersStore } from '../../users/store';

const RANGES: { value: HistoryRange; label: string }[] = [
  { value: '6h', label: '6h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7 dies' },
  { value: '30d', label: '30 dies' },
  { value: '365d', label: '365 dies' },
];

interface ChartSeries {
  name: string;
  color: string;
  values: number[];
  strokeWidth?: number;
  strokeDasharray?: string;
}

interface MetricChartCardProps {
  title: string;
  points: TelemetryHistoryPoint[];
  range: HistoryRange;
  yMax: number;
  yUnit: string;
  series: ChartSeries[];
  deployments?: Deployment[];
  alertThreshold?: { value: number; label: string };
  currentSummary?: React.ReactNode;
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

function formatTickDate(date: Date, range: HistoryRange): string {
  if (range === '6h' || range === '24h') {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (range === '7d' || range === '30d') {
    return `${date.getDate()}/${date.getMonth() + 1} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

const MetricChartCard: React.FC<MetricChartCardProps> = ({
  title,
  points,
  range,
  yMax,
  yUnit,
  series,
  deployments = [],
  alertThreshold,
  currentSummary,
}) => {
  const width = 560;
  const height = 190;
  const margin = { top: 22, right: 20, bottom: 34, left: 45 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const safeYMax = yMax > 0 ? yMax : 1;

  // Càlcul de timestamps inici i final
  const { startTime, endTime, timeRangeValid } = useMemo(() => {
    if (points.length < 2) {
      return { startTime: 0, endTime: 0, timeRangeValid: false };
    }
    const st = new Date(points[0].timestamp).getTime();
    const et = new Date(points[points.length - 1].timestamp).getTime();
    return { startTime: st, endTime: et, timeRangeValid: et > st };
  }, [points]);

  // Desplegaments dins d'aquesta finestra temporal
  const activeDeployments = useMemo(() => {
    if (!timeRangeValid || deployments.length === 0) return [];
    return deployments
      .filter((d) => {
        const t = new Date(d.deployed_at).getTime();
        return t >= startTime && t <= endTime;
      })
      .map((d) => {
        const t = new Date(d.deployed_at).getTime();
        const pct = (t - startTime) / (endTime - startTime);
        return {
          ...d,
          pct: Math.max(0, Math.min(1, pct)),
          x: margin.left + Math.round(pct * plotWidth),
        };
      });
  }, [deployments, startTime, endTime, timeRangeValid, plotWidth, margin.left]);

  // Línies i etiquetes de l'Eix Y
  const yTicks = useMemo(() => {
    const fractions = [1.0, 0.66, 0.33, 0.0];
    return fractions.map((f) => {
      const val = safeYMax * f;
      const y = margin.top + Math.round((1 - f) * plotHeight);
      let label = `${Math.round(val)}`;
      if (yUnit === '%') {
        label = `${Math.round(val)}%`;
      } else if (yUnit === 'Load') {
        label = val.toFixed(1);
      } else if (yUnit === 'MB') {
        label = `${Math.round(val)}M`;
      } else if (yUnit === 'ms') {
        label = `${Math.round(val)}ms`;
      }
      return { val, y, label };
    });
  }, [safeYMax, plotHeight, margin.top, yUnit]);

  // Etiquetes de l'Eix X
  const xTicks = useMemo(() => {
    if (!timeRangeValid) return [];
    const ticksCount = 4;
    const ticks: { x: number; label: string; textAnchor: 'start' | 'middle' | 'end' }[] = [];
    for (let i = 0; i < ticksCount; i++) {
      const pct = i / (ticksCount - 1);
      const t = startTime + pct * (endTime - startTime);
      const x = margin.left + Math.round(pct * plotWidth);
      const d = new Date(t);
      const textAnchor = i === 0 ? 'start' : i === ticksCount - 1 ? 'end' : 'middle';
      ticks.push({
        x,
        label: formatTickDate(d, range),
        textAnchor,
      });
    }
    return ticks;
  }, [timeRangeValid, startTime, endTime, margin.left, plotWidth, range]);

  // Convertir sèries a polylines
  const polylinePoints = (values: number[]) => {
    if (values.length === 0) return '';
    if (values.length === 1) {
      const val = Math.max(0, Math.min(values[0], safeYMax));
      const y = margin.top + Math.round(plotHeight - (val / safeYMax) * plotHeight);
      return `${margin.left},${y} ${margin.left + plotWidth},${y}`;
    }
    return values
      .map((val, idx) => {
        const x = margin.left + Math.round((idx / (values.length - 1)) * plotWidth);
        const clamped = Math.max(0, Math.min(val, safeYMax));
        const y = margin.top + Math.round(plotHeight - (clamped / safeYMax) * plotHeight);
        return `${x},${y}`;
      })
      .join(' ');
  };

  // Posició de la línia de llindar
  const thresholdY = alertThreshold
    ? margin.top + Math.round(plotHeight - (Math.min(alertThreshold.value, safeYMax) / safeYMax) * plotHeight)
    : null;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
      {/* Capçalera de la gràfica */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
          {title}
        </Typography>
        {currentSummary && (
          <Typography sx={{ fontSize: 12.5, color: '#64748b', fontFamily: '"Roboto Mono", monospace' }}>
            {currentSummary}
          </Typography>
        )}
      </Box>

      {/* Llegenda */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 1.5, fontSize: 12 }}>
        {series.map((s) => (
          <Box key={s.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              sx={{
                width: 12,
                height: 3,
                bgcolor: s.color,
                borderRadius: '2px',
                borderStyle: s.strokeDasharray ? 'dashed' : 'solid',
              }}
            />
            <Typography sx={{ fontSize: 12, color: '#475569', fontWeight: 500 }}>
              {s.name}
            </Typography>
          </Box>
        ))}

        {alertThreshold && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 12, height: 2, borderBottom: '2px dashed #f87171' }} />
            <Typography sx={{ fontSize: 12, color: '#dc2626', fontWeight: 500 }}>
              {alertThreshold.label}
            </Typography>
          </Box>
        )}

        {activeDeployments.length > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#8b5cf6' }} />
            <Typography sx={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
              🚀 Desplegament ({activeDeployments.length})
            </Typography>
          </Box>
        )}
      </Box>

      {/* SVG Canvas amb Eixos i Sèries */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 'auto',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          display: 'block',
        }}
      >
        {/* Línies de fons i etiquetes de l'Eix Y */}
        {yTicks.map((t, idx) => (
          <g key={idx}>
            <line
              x1={margin.left}
              y1={t.y}
              x2={margin.left + plotWidth}
              y2={t.y}
              stroke="#e2e8f0"
              strokeDasharray={idx === yTicks.length - 1 ? 'none' : '3 3'}
              strokeWidth="1"
            />
            <text
              x={margin.left - 8}
              y={t.y + 3.5}
              textAnchor="end"
              fill="#64748b"
              fontSize="10"
              fontFamily='"Roboto Mono", monospace'
            >
              {t.label}
            </text>
          </g>
        ))}

        {/* Línia de Llindar d'Alerta */}
        {thresholdY !== null && (
          <line
            x1={margin.left}
            y1={thresholdY}
            x2={margin.left + plotWidth}
            y2={thresholdY}
            stroke="#fca5a5"
            strokeDasharray="4 4"
            strokeWidth="1.5"
          />
        )}

        {/* Marcador vertical de desplegaments (Deploy Timeline Markers) */}
        {activeDeployments.map((d) => (
          <g key={d.id}>
            <line
              x1={d.x}
              y1={margin.top}
              x2={d.x}
              y2={margin.top + plotHeight}
              stroke="#8b5cf6"
              strokeWidth="1.75"
              strokeDasharray="4 2"
            />
            <circle cx={d.x} cy={margin.top} r="4.5" fill="#8b5cf6" stroke="#ffffff" strokeWidth="1.5">
              <title>{`🚀 Desplegament: ${d.product_name} (${d.version}) - ${new Date(d.deployed_at).toLocaleTimeString()}`}</title>
            </circle>
          </g>
        ))}

        {/* Sèries Temporals */}
        {series.map((s) => (
          <polyline
            key={s.name}
            fill="none"
            stroke={s.color}
            strokeWidth={s.strokeWidth ?? 2}
            strokeDasharray={s.strokeDasharray}
            points={polylinePoints(s.values)}
          />
        ))}

        {/* Eix X: Línia base i etiquetes temporals */}
        <line
          x1={margin.left}
          y1={margin.top + plotHeight}
          x2={margin.left + plotWidth}
          y2={margin.top + plotHeight}
          stroke="#cbd5e1"
          strokeWidth="1"
        />

        {xTicks.map((xt, idx) => (
          <text
            key={idx}
            x={xt.x}
            y={margin.top + plotHeight + 18}
            textAnchor={xt.textAnchor}
            fill="#64748b"
            fontSize="10"
            fontFamily='"Roboto Mono", monospace'
          >
            {xt.label}
          </text>
        ))}
      </svg>
    </Paper>
  );
};

interface DeploymentsTimelineChartCardProps {
  points: TelemetryHistoryPoint[];
  range: HistoryRange;
  deployments: Deployment[];
}

const DeploymentsTimelineChartCard: React.FC<DeploymentsTimelineChartCardProps> = ({
  points,
  range,
  deployments,
}) => {
  const width = 560;
  const height = 190;
  const margin = { top: 24, right: 20, bottom: 34, left: 65 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;

  const { startTime, endTime } = useMemo(() => {
    if (points.length >= 2) {
      const st = new Date(points[0].timestamp).getTime();
      const et = new Date(points[points.length - 1].timestamp).getTime();
      if (et > st) return { startTime: st, endTime: et };
    }
    const now = Date.now();
    let ms = 24 * 3600 * 1000;
    if (range === '6h') ms = 6 * 3600 * 1000;
    else if (range === '7d') ms = 7 * 24 * 3600 * 1000;
    else if (range === '30d') ms = 30 * 24 * 3600 * 1000;
    else if (range === '365d') ms = 365 * 24 * 3600 * 1000;
    return { startTime: now - ms, endTime: now };
  }, [points, range]);

  const activeDeployments = useMemo(() => {
    return deployments
      .filter((d) => {
        const t = new Date(d.deployed_at).getTime();
        return t >= startTime && t <= endTime;
      })
      .map((d) => {
        const t = new Date(d.deployed_at).getTime();
        const pct = Math.max(0, Math.min(1, (t - startTime) / (endTime - startTime)));
        return {
          ...d,
          pct,
          x: margin.left + Math.round(pct * plotWidth),
        };
      });
  }, [deployments, startTime, endTime, plotWidth, margin.left]);

  const products = useMemo(() => {
    const list = Array.from(new Set(activeDeployments.map((d) => d.product_name))).filter(Boolean);
    return list.length > 0 ? list : ['Desplegaments'];
  }, [activeDeployments]);

  const xTicks = useMemo(() => {
    const ticksCount = 4;
    const ticks: { x: number; label: string; textAnchor: 'start' | 'middle' | 'end' }[] = [];
    for (let i = 0; i < ticksCount; i++) {
      const pct = i / (ticksCount - 1);
      const t = startTime + pct * (endTime - startTime);
      const x = margin.left + Math.round(pct * plotWidth);
      const d = new Date(t);
      const textAnchor = i === 0 ? 'start' : i === ticksCount - 1 ? 'end' : 'middle';
      ticks.push({
        x,
        label: formatTickDate(d, range),
        textAnchor,
      });
    }
    return ticks;
  }, [startTime, endTime, margin.left, plotWidth, range]);

  const successCount = activeDeployments.filter((d) => d.status === 'SUCCESS').length;
  const failCount = activeDeployments.filter((d) => d.status !== 'SUCCESS').length;

  return (
    <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: '10px', p: '16px 20px' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
          🚀 Desplegaments de Codi &amp; Versions ({range})
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: '#64748b', fontFamily: '"Roboto Mono", monospace' }}>
          {activeDeployments.length} desplegament(s) en aquest rang
        </Typography>
      </Box>

      {/* Llegenda */}
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 1.5, fontSize: 12 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#16a34a' }} />
          <Typography sx={{ fontSize: 12, color: '#166534', fontWeight: 600 }}>
            Exitós ({successCount})
          </Typography>
        </Box>
        {failCount > 0 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#dc2626' }} />
            <Typography sx={{ fontSize: 12, color: '#991b1b', fontWeight: 600 }}>
              Fallit ({failCount})
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ width: 12, height: 2, borderBottom: '2px dashed #8b5cf6' }} />
          <Typography sx={{ fontSize: 12, color: '#7c3aed', fontWeight: 500 }}>
            Correlació temporal
          </Typography>
        </Box>
      </Box>

      {/* SVG Canvas */}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{
          width: '100%',
          height: 'auto',
          background: '#f8fafc',
          borderRadius: 8,
          border: '1px solid #e2e8f0',
          display: 'block',
        }}
      >
        {/* Línies de carril per producte a l'Eix Y */}
        {products.map((prod, pIdx) => {
          const laneY = margin.top + Math.round(((pIdx + 0.5) / products.length) * plotHeight);
          return (
            <g key={prod}>
              <line
                x1={margin.left}
                y1={laneY}
                x2={margin.left + plotWidth}
                y2={laneY}
                stroke="#e2e8f0"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={margin.left - 8}
                y={laneY + 3.5}
                textAnchor="end"
                fill="#475569"
                fontSize="11"
                fontWeight="600"
                fontFamily='"Roboto Mono", monospace'
              >
                {prod.length > 10 ? `${prod.slice(0, 9)}…` : prod}
              </text>
            </g>
          );
        })}

        {/* Estat buit si no hi ha desplegaments en el rang */}
        {activeDeployments.length === 0 && (
          <text
            x={margin.left + plotWidth / 2}
            y={margin.top + plotHeight / 2 + 4}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="12"
            fontStyle="italic"
          >
            Cap desplegament registrat en les hores seleccionades ({range})
          </text>
        )}

        {/* Desplegaments plotejats a la seva coordenada temporal exacta */}
        {activeDeployments.map((d) => {
          const isSuccess = d.status === 'SUCCESS';
          const pIdx = Math.max(0, products.indexOf(d.product_name));
          const laneY = margin.top + Math.round(((pIdx + 0.5) / products.length) * plotHeight);
          const color = isSuccess ? '#16a34a' : '#dc2626';

          const tooltip = `🚀 Producte: ${d.product_name} (${d.environment})
🏷️ Versió: ${d.version || (d.commit_sha ? d.commit_sha.slice(0, 7) : '—')}
⚡ Estat: ${d.status}
👤 Desplegat per: ${d.deployed_by || 'CI/CD'}
🕒 Data i Hora: ${new Date(d.deployed_at).toLocaleString()} (${formatRelativeTime(d.deployed_at)})
📝 Commit: ${d.commit_message || 'Sense missatge'}`;

          return (
            <g key={d.id} style={{ cursor: 'pointer' }}>
              <title>{tooltip}</title>
              {/* Línia vertical guia */}
              <line
                x1={d.x}
                y1={margin.top}
                x2={d.x}
                y2={margin.top + plotHeight}
                stroke="#8b5cf6"
                strokeWidth="1.5"
                strokeDasharray="3 3"
                opacity="0.8"
              />
              {/* Etiqueta de versió */}
              <text
                x={d.x}
                y={Math.max(margin.top - 6, laneY - 12)}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={color}
                fontFamily='"Roboto Mono", monospace'
              >
                {d.version || (d.commit_sha ? d.commit_sha.slice(0, 6) : 'deploy')}
              </text>
              {/* Marcador rodó */}
              <circle
                cx={d.x}
                cy={laneY}
                r="7.5"
                fill={color}
                stroke="#ffffff"
                strokeWidth="2"
              />
              <circle
                cx={d.x}
                cy={laneY}
                r="3"
                fill="#ffffff"
              />
            </g>
          );
        })}

        {/* Eix X: Línia base i etiquetes temporals */}
        <line
          x1={margin.left}
          y1={margin.top + plotHeight}
          x2={margin.left + plotWidth}
          y2={margin.top + plotHeight}
          stroke="#cbd5e1"
          strokeWidth="1.5"
        />
        {xTicks.map((xt, idx) => (
          <g key={idx}>
            <line
              x1={xt.x}
              y1={margin.top + plotHeight}
              x2={xt.x}
              y2={margin.top + plotHeight + 5}
              stroke="#94a3b8"
              strokeWidth="1"
            />
            <text
              x={xt.x}
              y={margin.top + plotHeight + 18}
              textAnchor={xt.textAnchor}
              fill="#64748b"
              fontSize="10"
              fontFamily='"Roboto Mono", monospace'
            >
              {xt.label}
            </text>
          </g>
        ))}
      </svg>
    </Paper>
  );
};

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

  // Desplegaments per correlacionar amb les mètriques
  const [deployments, setDeployments] = useState<Deployment[]>([]);

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

    // Carregar desplegaments recents per a la correlació temporal
    void serversApi
      .listServerDeployments(id, { limit: 100 })
      .then((res) => {
        setDeployments(res.items || []);
      })
      .catch(() => {});
  }, [id, range, fetchHistory]);

  const points: TelemetryHistoryPoint[] = history?.points ?? [];
  const latestPoint = points.length > 0 ? points[points.length - 1] : null;

  const load1mValues = points.map((p) => p.load_1m);
  const load5mValues = points.map((p) => p.load_5m);
  const maxLoad = Math.max(3.0, ...load1mValues, ...load5mValues);

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
    return Array.from(set).slice(0, 4);
  }, [points]);

  const maxContainerMem = React.useMemo(() => {
    let m = 256;
    for (const p of points) {
      if (p.containers_memory_mb) {
        for (const v of Object.values(p.containers_memory_mb)) {
          if (v > m) m = v;
        }
      }
    }
    return Math.max(256, m * 1.15);
  }, [points]);

  const pgConnSeries = points.map((p) => {
    const vals = p.postgres_connections_percent ? Object.values(p.postgres_connections_percent) : [];
    return vals.length > 0 ? vals[0] : 0;
  });

  const pgSizeSeries = points.map((p) => {
    const vals = p.postgres_size_mb ? Object.values(p.postgres_size_mb) : [];
    return vals.reduce((acc, v) => acc + v, 0);
  });
  const maxPgSize = Math.max(100, ...pgSizeSeries);

  const httpLatencySeries = points.map((p) => {
    const vals = p.http_latency_ms ? Object.values(p.http_latency_ms) : [];
    if (vals.length === 0) return 0;
    return vals.reduce((acc, v) => acc + v, 0) / vals.length;
  });
  const maxHttpLatency = Math.max(200, ...httpLatencySeries);

  const handleSaveRetention = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingRetention(true);
    try {
      await updateRetention(Math.max(7, Number(retentionDaysInput) || 365));
      setRetentionModalOpen(false);
    } catch {
      // Error gestionat a l'store
    } finally {
      setSavingRetention(false);
    }
  };

  return (
    <Box>
      {/* Barra superior de navegació */}
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

      {/* Toolbar de selecció de rang temporal */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          flexDirection: { xs: 'column', sm: 'row' },
          mb: 2.5,
          gap: 2,
        }}
      >
        <Box>
          <Typography component="h1" sx={{ fontSize: 20, fontWeight: 700, color: '#1e293b' }}>
            Evolució Temporal de Mètriques
          </Typography>
          <Typography sx={{ fontSize: 13, color: '#64748b' }}>
            Correlació de consums amb desplegaments de codi (línies verticals 🚀).
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
                fontWeight: 600,
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
          {/* GRID DE GRÀFIQUES TEMPORALS AMB EIXOS I LLEGENDA */}
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' },
              gap: 2.5,
              mb: 2.5,
            }}
          >
            {/* Gràfica 1: System Load */}
            <MetricChartCard
              title="System Load (Load Average)"
              points={points}
              range={range}
              yMax={maxLoad}
              yUnit="Load"
              deployments={deployments}
              alertThreshold={{ value: 2.5, label: 'Alerta (>2.5)' }}
              currentSummary={`Actual: ${latestPoint ? latestPoint.load_1m.toFixed(2) : '0.00'} (1m)`}
              series={[
                { name: 'Load 1m', color: '#1976d2', values: load1mValues, strokeWidth: 2.5 },
                { name: 'Load 5m', color: '#93c5fd', values: load5mValues, strokeWidth: 1.75 },
              ]}
            />

            {/* Gràfica 2: Memòria RAM, Swap i Disc */}
            <MetricChartCard
              title="Memòria RAM, Swap i Disc / (%)"
              points={points}
              range={range}
              yMax={100}
              yUnit="%"
              deployments={deployments}
              alertThreshold={{ value: 85, label: 'Límit 85%' }}
              currentSummary={`RAM: ${latestPoint ? Math.round(latestPoint.memory_percent) : 0}% • Disc: ${latestPoint ? Math.round(latestPoint.disk_root_percent) : 0}%`}
              series={[
                { name: 'Memòria RAM (%)', color: '#16a34a', values: memValues, strokeWidth: 2.5 },
                { name: 'Swap (%)', color: '#d97706', values: swapValues, strokeWidth: 1.75 },
                { name: 'Disc / (%)', color: '#64748b', values: diskValues, strokeWidth: 1.5, strokeDasharray: '4 4' },
              ]}
            />

            {/* Gràfica 3: Consum RAM per Contenidor Docker */}
            <MetricChartCard
              title="Consum RAM per Contenidor Docker (MB)"
              points={points}
              range={range}
              yMax={maxContainerMem}
              yUnit="MB"
              deployments={deployments}
              currentSummary={
                containerNames.length > 0
                  ? containerNames
                      .map((name) => `${name}: ${Math.round(latestPoint?.containers_memory_mb?.[name] ?? 0)}M`)
                      .join(' • ')
                  : 'Cap sèrie'
              }
              series={containerNames.map((name, idx) => {
                const colors = ['#7c3aed', '#0284c7', '#16a34a', '#e11d48'];
                return {
                  name,
                  color: colors[idx % colors.length],
                  values: points.map((p) => p.containers_memory_mb?.[name] ?? 0),
                  strokeWidth: 2.2,
                };
              })}
            />

            {/* Gràfica 4: PostgreSQL (% Connexions & Mida MB) */}
            <MetricChartCard
              title="PostgreSQL (% Connexions & Mida MB)"
              points={points}
              range={range}
              yMax={Math.max(100, maxPgSize)}
              yUnit="MB"
              deployments={deployments}
              currentSummary={`Conn: ${pgConnSeries.length > 0 ? Math.round(pgConnSeries[pgConnSeries.length - 1]) : 0}% • Mida: ${pgSizeSeries.length > 0 ? Math.round(pgSizeSeries[pgSizeSeries.length - 1]) : 0}MB`}
              series={[
                { name: 'PostgreSQL Connexions (%)', color: '#0f766e', values: pgConnSeries, strokeWidth: 2.5 },
                { name: 'Mida Acumulada (MB)', color: '#0284c7', values: pgSizeSeries, strokeWidth: 2 },
              ]}
            />

            {/* Gràfica 5: Endpoints HTTP (Latència ms) */}
            <MetricChartCard
              title="Endpoints HTTP (Latència Mitjana ms)"
              points={points}
              range={range}
              yMax={maxHttpLatency}
              yUnit="ms"
              deployments={deployments}
              alertThreshold={{ value: 500, label: 'Límit 500ms' }}
              currentSummary={`Latència actual: ${httpLatencySeries.length > 0 ? Math.round(httpLatencySeries[httpLatencySeries.length - 1]) : 0}ms`}
              series={[
                { name: 'Latència Mitjana HTTP (ms)', color: '#2563eb', values: httpLatencySeries, strokeWidth: 2.5 },
              ]}
            />

            {/* Gràfica 6: Timeline de Desplegaments en el Rang (com un gràfic com els altres) */}
            <DeploymentsTimelineChartCard
              points={points}
              range={range}
              deployments={deployments}
            />
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
