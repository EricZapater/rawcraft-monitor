import React, { useState, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  Alert,
  IconButton,
  CircularProgress,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useUsersStore } from '../store';

export const LoginView: React.FC = () => {
  const navigate = useNavigate();
  const { login, authLoading, authError, authErrorStatus, clearAuthError } = useUsersStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);
    if (!email.trim() || password.length < 8) {
      setLocalError('Introdueix un correu electrònic vàlid i una contrasenya de mínim 8 caràcters.');
      return;
    }
    const ok = await login({ email: email.trim(), password });
    if (ok) {
      navigate('/', { replace: true });
    }
  };

  const handleInputChange = () => {
    if (localError) setLocalError(null);
    if (authError) clearAuthError();
  };

  const displayError = localError || authError;

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: '#0f172a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 3,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: '100%',
          maxWidth: 420,
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          p: '36px 32px',
          bgcolor: '#ffffff',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: '8px',
              bgcolor: '#1976d2',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: '"Roboto Mono", monospace',
              fontWeight: 700,
              fontSize: 18,
            }}
          >
            &gt;_
          </Box>
          <Box>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
              Rawcraft Monitor
            </Typography>
            <Typography sx={{ fontSize: 12, color: '#64748b' }}>
              Punt Central de Telemetria i Alertes
            </Typography>
          </Box>
        </Box>

        <Typography component="h1" sx={{ fontSize: 18, fontWeight: 600, mb: 0.75, color: '#1e293b' }}>
          Inicia sessió
        </Typography>
        <Typography sx={{ fontSize: 13, color: '#64748b', mb: 2.5 }}>
          Introdueix les teves credencials per accedir als servidors autoritzats.
        </Typography>

        <Box aria-live="polite" id={errorId}>
          {displayError && (
            <Alert
              severity="error"
              sx={{
                mb: 2.25,
                fontSize: 13,
                bgcolor: '#fde8e8',
                color: '#d32f2f',
                border: '1px solid #f8b4b4',
                borderLeft: '4px solid #d32f2f',
              }}
            >
              <strong>Error {authErrorStatus || 401}:</strong> {displayError}
            </Alert>
          )}
        </Box>

        <form method="post" action="/api/v1/auth/login" onSubmit={handleSubmit} noValidate>
          <Box sx={{ mb: 2 }}>
            <label
              htmlFor={emailId}
              style={{
                display: 'block',
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 6,
                color: '#1e293b',
              }}
            >
              Correu electrònic
            </label>
            <input
              id={emailId}
              name="email"
              type="email"
              required
              autoComplete="username"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                handleInputChange();
              }}
              aria-describedby={displayError ? errorId : undefined}
              placeholder="eric@rawcraft.cat"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 16,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
              <label
                htmlFor={passwordId}
                style={{
                  display: 'block',
                  fontSize: 13,
                  fontWeight: 500,
                  color: '#1e293b',
                }}
              >
                Contrasenya
              </label>
              <IconButton
                type="button"
                size="small"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Amaga contrasenya' : 'Mostra contrasenya'}
                sx={{ p: 0.5, color: '#64748b' }}
              >
                {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </Box>
            <input
              id={passwordId}
              name="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={8}
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                handleInputChange();
              }}
              aria-describedby={displayError ? errorId : undefined}
              placeholder="••••••••••••"
              style={{
                width: '100%',
                padding: '10px 14px',
                fontSize: 16,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </Box>

          <Button
            type="submit"
            variant="contained"
            fullWidth
            disabled={authLoading}
            sx={{
              mt: 1,
              py: 1.35,
              borderRadius: '8px',
              textTransform: 'none',
              fontSize: 14,
              fontWeight: 500,
              bgcolor: '#1976d2',
            }}
          >
            {authLoading ? <CircularProgress size={20} color="inherit" /> : 'Entrar al Panell'}
          </Button>
        </form>

        <Box
          sx={{
            mt: 2.5,
            pt: 2,
            borderTop: '1px solid #e2e8f0',
            fontSize: 12,
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          Accés restringit. Sense registre públic obert — contacta amb l&apos;administrador per donar d&apos;alta el teu usuari.
        </Box>
      </Paper>
    </Box>
  );
};
