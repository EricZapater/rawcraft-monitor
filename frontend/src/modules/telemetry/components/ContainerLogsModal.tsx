import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TextField,
  InputAdornment,
  CircularProgress,
  Tooltip,
  FormControlLabel,
  Switch,
  Alert,
  Chip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import DownloadIcon from '@mui/icons-material/Download';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VerticalAlignBottomIcon from '@mui/icons-material/VerticalAlignBottom';
import SwapVertIcon from '@mui/icons-material/SwapVert';
import { telemetryApi, type ContainerLogEntry, type ContainerLogsQueryParams } from '../api';

interface ContainerLogsModalProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  serverName: string;
  initialContainerName?: string;
  availableContainers?: string[];
}

type TimeRangeKey = '15m' | '1h' | '6h' | '24h' | '7d' | '30d' | 'all';

export const ContainerLogsModal: React.FC<ContainerLogsModalProps> = ({
  open,
  onClose,
  serverId,
  serverName,
  initialContainerName,
  availableContainers = [],
}) => {
  const [containersList, setContainersList] = useState<string[]>(availableContainers);
  const [selectedContainer, setSelectedContainer] = useState<string>(initialContainerName || '');
  const [stream, setStream] = useState<'all' | 'stdout' | 'stderr'>('all');
  const [timeRange, setTimeRange] = useState<TimeRangeKey>('1h');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [limit, setLimit] = useState<number>(200);
  const [order, setOrder] = useState<'asc' | 'desc'>('asc');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [autoScroll, setAutoScroll] = useState<boolean>(true);

  const [logs, setLogs] = useState<ContainerLogEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  const terminalRef = useRef<HTMLDivElement | null>(null);

  // Carregar contenidors disponibles des del servidor
  useEffect(() => {
    if (!open || !serverId) return;

    let mounted = true;
    void telemetryApi
      .listLogContainers(serverId)
      .then((res) => {
        if (!mounted) return;
        const set = new Set([...availableContainers, ...(res.containers || [])]);
        const list = Array.from(set).filter(Boolean).sort();
        setContainersList(list);

        if (!selectedContainer && list.length > 0) {
          setSelectedContainer(initialContainerName && list.includes(initialContainerName) ? initialContainerName : list[0]);
        }
      })
      .catch(() => {
        // Fallback a availableContainers
        if (availableContainers.length > 0 && !selectedContainer) {
          setSelectedContainer(initialContainerName || availableContainers[0]);
        }
      });

    return () => {
      mounted = false;
    };
  }, [open, serverId, availableContainers, initialContainerName, selectedContainer]);

  // Actualitzar selectedContainer si canvia initialContainerName
  useEffect(() => {
    if (initialContainerName) {
      setSelectedContainer(initialContainerName);
    }
  }, [initialContainerName]);

  // Funció per carregar logs segons els filtres actius
  const fetchLogs = useCallback(
    async (isBackground = false) => {
      if (!serverId || !selectedContainer) return;

      if (!isBackground) setLoading(true);
      setError(null);

      const params: ContainerLogsQueryParams = {
        limit,
        stream: stream === 'all' ? undefined : stream,
        search: searchQuery.trim() || undefined,
        order,
      };

      if (timeRange !== 'all') {
        const now = new Date();
        let ms = 60 * 60 * 1000;
        if (timeRange === '15m') ms = 15 * 60 * 1000;
        if (timeRange === '1h') ms = 60 * 60 * 1000;
        if (timeRange === '6h') ms = 6 * 60 * 60 * 1000;
        if (timeRange === '24h') ms = 24 * 60 * 60 * 1000;
        if (timeRange === '7d') ms = 7 * 24 * 60 * 60 * 1000;
        if (timeRange === '30d') ms = 30 * 24 * 60 * 60 * 1000;
        params.since = new Date(now.getTime() - ms).toISOString();
      }

      try {
        const res = await telemetryApi.getContainerLogs(serverId, selectedContainer, params);
        setLogs(res.entries || []);
      } catch (err: unknown) {
        const e = err as { response?: { data?: { message?: string } }; message?: string };
        setError(e.response?.data?.message || e.message || 'Error carregant logs');
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [serverId, selectedContainer, stream, searchQuery, order, limit, timeRange]
  );

  // Executar càrrega quan canvien els filtres principals
  useEffect(() => {
    if (open && selectedContainer) {
      void fetchLogs(false);
    }
  }, [open, selectedContainer, stream, searchQuery, order, limit, timeRange, fetchLogs]);

  // Auto-refresc periòdic cada 5 segons
  useEffect(() => {
    if (!open || !autoRefresh || !selectedContainer) return;

    const interval = setInterval(() => {
      void fetchLogs(true);
    }, 5000);

    return () => clearInterval(interval);
  }, [open, autoRefresh, selectedContainer, fetchLogs]);

  // Auto-scroll al final del terminal si està habilitat
  useEffect(() => {
    if (autoScroll && terminalRef.current && order === 'asc') {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll, order]);

  // Descarregar logs com a fitxer .log
  const handleDownload = () => {
    if (logs.length === 0) return;

    const content = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.stream.toUpperCase()}] ${l.message}`
      )
      .join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${serverName}_${selectedContainer}_${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Copiar logs al porta-retalls
  const handleCopy = () => {
    if (logs.length === 0) return;
    const content = logs
      .map(
        (l) =>
          `[${new Date(l.timestamp).toISOString()}] [${l.stream.toUpperCase()}] ${l.message}`
      )
      .join('\n');
    void navigator.clipboard.writeText(content);
    setCopyFeedback('Copiat al porta-retalls!');
    setTimeout(() => setCopyFeedback(null), 2500);
  };

  // Format de timestamp visual per al terminal
  const formatTerminalTimestamp = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('ca-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
    } catch {
      return iso;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: '#0d1117',
          color: '#c9d1d9',
          borderRadius: '12px',
          border: '1px solid #30363d',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
        },
      }}
    >
      {/* Capçalera */}
      <DialogTitle
        sx={{
          p: '16px 20px',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          bgcolor: '#161b22',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: '#f0f6fc' }}>
              📜 Registres de Contenidor
            </Typography>
            <Chip
              label="Mini-Loki"
              size="small"
              sx={{
                bgcolor: '#238636',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: 11,
                height: 20,
              }}
            />
          </Box>
          <Typography sx={{ fontSize: 12, color: '#8b949e', mt: 0.25 }}>
            Servidor: <strong>{serverName}</strong> • Política de retenció: <strong>30 dies</strong>
          </Typography>
        </Box>
        <IconButton
          onClick={onClose}
          size="small"
          aria-label="Tancar"
          sx={{ color: '#8b949e', '&:hover': { color: '#f0f6fc', bgcolor: '#30363d' } }}
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      {/* Barra de Filtres i Controls */}
      <Box
        sx={{
          p: '12px 20px',
          bgcolor: '#161b22',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1.5,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'center', flex: 1 }}>
          {/* Selector de Contenidor */}
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel sx={{ color: '#8b949e', fontSize: 13 }}>Contenidor</InputLabel>
            <Select
              value={selectedContainer}
              label="Contenidor"
              onChange={(e) => setSelectedContainer(e.target.value)}
              sx={{
                bgcolor: '#0d1117',
                color: '#f0f6fc',
                fontFamily: '"Roboto Mono", monospace',
                fontSize: 13,
                fontWeight: 600,
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#30363d' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '.MuiSvgIcon-root': { color: '#8b949e' },
              }}
            >
              {containersList.map((c) => (
                <MenuItem key={c} value={c} sx={{ fontFamily: '"Roboto Mono", monospace', fontSize: 13 }}>
                  🐳 {c}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Selector de Stream */}
          <FormControl size="small" sx={{ minWidth: 110 }}>
            <InputLabel sx={{ color: '#8b949e', fontSize: 13 }}>Canal</InputLabel>
            <Select
              value={stream}
              label="Canal"
              onChange={(e) => setStream(e.target.value as 'all' | 'stdout' | 'stderr')}
              sx={{
                bgcolor: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#30363d' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '.MuiSvgIcon-root': { color: '#8b949e' },
              }}
            >
              <MenuItem value="all">Tots</MenuItem>
              <MenuItem value="stdout">stdout</MenuItem>
              <MenuItem value="stderr">stderr</MenuItem>
            </Select>
          </FormControl>

          {/* Selector d'Interval Temporal */}
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel sx={{ color: '#8b949e', fontSize: 13 }}>Període</InputLabel>
            <Select
              value={timeRange}
              label="Període"
              onChange={(e) => setTimeRange(e.target.value as TimeRangeKey)}
              sx={{
                bgcolor: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#30363d' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '.MuiSvgIcon-root': { color: '#8b949e' },
              }}
            >
              <MenuItem value="15m">Últims 15m</MenuItem>
              <MenuItem value="1h">Última 1h</MenuItem>
              <MenuItem value="6h">Últimes 6h</MenuItem>
              <MenuItem value="24h">Últimes 24h</MenuItem>
              <MenuItem value="7d">Últims 7d</MenuItem>
              <MenuItem value="30d">Últims 30d</MenuItem>
              <MenuItem value="all">Sense límit</MenuItem>
            </Select>
          </FormControl>

          {/* Cerca en text */}
          <TextField
            size="small"
            placeholder="Cercar per text o patró..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#8b949e', fontSize: 18 }} />
                </InputAdornment>
              ),
              sx: {
                bgcolor: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                minWidth: { xs: '100%', sm: 220 },
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#30363d' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
              },
            }}
          />

          {/* Límit de línies */}
          <FormControl size="small" sx={{ minWidth: 95 }}>
            <InputLabel sx={{ color: '#8b949e', fontSize: 13 }}>Línies</InputLabel>
            <Select
              value={limit}
              label="Línies"
              onChange={(e) => setLimit(Number(e.target.value))}
              sx={{
                bgcolor: '#0d1117',
                color: '#f0f6fc',
                fontSize: 13,
                '.MuiOutlinedInput-notchedOutline': { borderColor: '#30363d' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#58a6ff' },
                '.MuiSvgIcon-root': { color: '#8b949e' },
              }}
            >
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
              <MenuItem value={200}>200</MenuItem>
              <MenuItem value={500}>500</MenuItem>
              <MenuItem value={1000}>1000</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {/* Botons d'acció de la dreta */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title={order === 'asc' ? 'Ordre: cronològic (ascendent)' : 'Ordre: invers (nou primer)'}>
            <IconButton
              size="small"
              onClick={() => setOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              sx={{ color: '#8b949e', border: '1px solid #30363d', borderRadius: '6px' }}
            >
              <SwapVertIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Refrescar ara">
            <span>
              <IconButton
                size="small"
                onClick={() => void fetchLogs(false)}
                disabled={loading}
                sx={{ color: '#8b949e', border: '1px solid #30363d', borderRadius: '6px' }}
              >
                {loading ? <CircularProgress size={18} sx={{ color: '#58a6ff' }} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </span>
          </Tooltip>

          <Button
            size="small"
            variant="outlined"
            onClick={handleCopy}
            startIcon={<ContentCopyIcon fontSize="small" />}
            disabled={logs.length === 0}
            sx={{
              textTransform: 'none',
              borderColor: '#30363d',
              color: '#c9d1d9',
              fontSize: 12,
              '&:hover': { borderColor: '#58a6ff', bgcolor: '#21262d' },
            }}
          >
            {copyFeedback || 'Copiar'}
          </Button>

          <Button
            size="small"
            variant="outlined"
            onClick={handleDownload}
            startIcon={<DownloadIcon fontSize="small" />}
            disabled={logs.length === 0}
            sx={{
              textTransform: 'none',
              borderColor: '#30363d',
              color: '#58a6ff',
              fontSize: 12,
              fontWeight: 600,
              '&:hover': { borderColor: '#58a6ff', bgcolor: '#21262d' },
            }}
          >
            Descarregar (.log)
          </Button>
        </Box>
      </Box>

      {/* Barra d'estat de terminal */}
      <Box
        sx={{
          px: 2.5,
          py: 0.75,
          bgcolor: '#090d13',
          borderBottom: '1px solid #21262d',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12,
          color: '#8b949e',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <span>
            Mostrant <strong>{logs.length}</strong> registres
          </span>
          {searchQuery && (
            <Chip
              label={`Filtre: "${searchQuery}"`}
              size="small"
              onDelete={() => setSearchQuery('')}
              sx={{
                bgcolor: '#1f242c',
                color: '#58a6ff',
                height: 20,
                fontSize: 11,
                '.MuiChip-deleteIcon': { color: '#8b949e' },
              }}
            />
          )}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {order === 'asc' && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={autoScroll}
                  onChange={(e) => setAutoScroll(e.target.checked)}
                  sx={{ '& .MuiSwitch-thumb': { bgcolor: autoScroll ? '#58a6ff' : '#6e7681' } }}
                />
              }
              label={
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, fontSize: 12 }}>
                  <VerticalAlignBottomIcon sx={{ fontSize: 14 }} />
                  <span>Autoscroll</span>
                </Box>
              }
              sx={{ m: 0 }}
            />
          )}

          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                sx={{ '& .MuiSwitch-thumb': { bgcolor: autoRefresh ? '#238636' : '#6e7681' } }}
              />
            }
            label={<span style={{ fontSize: 12 }}>Auto-refresc (5s)</span>}
            sx={{ m: 0 }}
          />
        </Box>
      </Box>

      {/* Cos del Terminal de Logs */}
      <DialogContent
        ref={terminalRef}
        sx={{
          p: 2,
          bgcolor: '#0d1117',
          flex: 1,
          overflowY: 'auto',
          fontFamily: '"Roboto Mono", "Fira Code", monospace',
          fontSize: 12.5,
          lineHeight: 1.55,
        }}
      >
        {error && (
          <Alert severity="error" sx={{ mb: 2, bgcolor: '#1e1414', color: '#ff7b72', border: '1px solid #8e1515' }}>
            {error}
          </Alert>
        )}

        {loading && logs.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CircularProgress size={32} sx={{ color: '#58a6ff', mb: 2 }} />
            <Typography sx={{ color: '#8b949e', fontSize: 13 }}>Carregant línies de log...</Typography>
          </Box>
        ) : logs.length === 0 ? (
          <Box sx={{ py: 8, textAlign: 'center', color: '#8b949e' }}>
            <Typography sx={{ fontSize: 14, mb: 1 }}>
              Cap registre trobat per al contenidor <code>{selectedContainer}</code>.
            </Typography>
            <Typography sx={{ fontSize: 12 }}>
              Revisa el filtre temporal o assegura&apos;t que el contenidor ha generat sortida a stdout/stderr.
            </Typography>
          </Box>
        ) : (
          <Box component="div" sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {logs.map((log, index) => {
              const isStderr = log.stream === 'stderr';
              return (
                <Box
                  key={log.id || `${log.timestamp}-${index}`}
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.25,
                    px: 0.75,
                    py: '2px',
                    borderRadius: '4px',
                    '&:hover': { bgcolor: '#161b22' },
                  }}
                >
                  {/* Número de línia */}
                  <Typography
                    component="span"
                    sx={{
                      userSelect: 'none',
                      color: '#484f58',
                      fontSize: 11,
                      minWidth: 32,
                      textAlign: 'right',
                      pt: '1px',
                    }}
                  >
                    {index + 1}
                  </Typography>

                  {/* Timestamp */}
                  <Typography
                    component="span"
                    sx={{
                      userSelect: 'none',
                      color: '#7ee787',
                      fontSize: 11.5,
                      minWidth: 90,
                      pt: '1px',
                    }}
                  >
                    {formatTerminalTimestamp(log.timestamp)}
                  </Typography>

                  {/* Badge de Stream */}
                  <Typography
                    component="span"
                    sx={{
                      userSelect: 'none',
                      fontSize: 10,
                      fontWeight: 700,
                      minWidth: 46,
                      textAlign: 'center',
                      borderRadius: '3px',
                      px: 0.5,
                      py: 0.1,
                      bgcolor: isStderr ? 'rgba(248, 81, 73, 0.15)' : 'rgba(88, 166, 255, 0.15)',
                      color: isStderr ? '#ff7b72' : '#79c0ff',
                      border: `1px solid ${isStderr ? 'rgba(248, 81, 73, 0.4)' : 'rgba(88, 166, 255, 0.4)'}`,
                    }}
                  >
                    {log.stream}
                  </Typography>

                  {/* Missatge del log */}
                  <Typography
                    component="span"
                    sx={{
                      flex: 1,
                      color: isStderr ? '#ff7b72' : '#e6edf3',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      fontSize: 12.5,
                    }}
                  >
                    {log.message}
                  </Typography>
                </Box>
              );
            })}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
};
