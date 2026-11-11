import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  Snackbar,
} from '@mui/material';
import { serversApi } from '../api';

interface CopyApiKeyDialogProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  serverName?: string;
}

export const CopyApiKeyDialog: React.FC<CopyApiKeyDialogProps> = ({
  open,
  onClose,
  serverId,
  serverName,
}) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbarOpen, setSnackbarOpen] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    setLoading(true);
    setError(null);
    try {
      const apiKey = await serversApi.revealServerApiKey(serverId, password);
      await navigator.clipboard.writeText(apiKey);
      setSnackbarOpen(true);
      setPassword('');
      onClose();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      if (axiosErr?.response?.data?.message) {
        setError(axiosErr.response.data.message);
      } else {
        setError('Contrasenya incorrecta o error en obtenir la clau.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setPassword('');
    setError(null);
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
        <form onSubmit={handleSubmit}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 16, borderBottom: '1px solid #e2e8f0' }}>
            🔒 Copiar API Key ({serverName || 'Servidor'})
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography sx={{ fontSize: 13, color: '#64748b' }}>
              Per seguretat, introdueix la teva contrasenya d&apos;usuari per copiar l&apos;API Key al teu porta-retalls (la clau no es farà visible en pantalla).
            </Typography>

            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              label="La teva contrasenya d'usuari"
              type="password"
              size="small"
              fullWidth
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.5, borderTop: '1px solid #e2e8f0' }}>
            <Button onClick={handleClose} disabled={loading} sx={{ textTransform: 'none', color: '#64748b' }}>
              Cancel·lar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading || !password}
              sx={{ textTransform: 'none', bgcolor: '#1976d2', gap: 1 }}
            >
              {loading && <CircularProgress size={16} color="inherit" />}
              Copiar al porta-retalls
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <Snackbar
        open={snackbarOpen}
        autoHideDuration={3000}
        onClose={() => setSnackbarOpen(false)}
        message="✅ API Key copiada correctament al porta-retalls!"
      />
    </>
  );
};
