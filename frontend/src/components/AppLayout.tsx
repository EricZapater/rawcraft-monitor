import React, { useEffect, useState, useId } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  IconButton,
  Drawer,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import { useUsersStore } from '../modules/users/store';
import { useAlertsStore } from '../modules/alerts/store';

export const AppLayout: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, logout, changeOwnPassword, fetchCurrentUser } = useUsersStore();
  const { activeFiringCount, fetchAlerts } = useAlertsStore();

  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const currPwdId = useId();
  const newPwdId = useId();
  const confPwdId = useId();

  useEffect(() => {
    void fetchCurrentUser();
    void fetchAlerts({ limit: 20 });
  }, [fetchCurrentUser, fetchAlerts]);

  const isAdmin = currentUser?.role === 'ADMIN';

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleOpenPasswordModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdError(null);
    setPwdSuccess(null);
    setPwdModalOpen(true);
  };

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (newPassword.length < 8) {
      setPwdError('La nova contrasenya ha de tenir com a mínim 8 caràcters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError('La confirmació de la nova contrasenya no coincideix.');
      return;
    }

    setPwdSaving(true);
    try {
      await changeOwnPassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwdSuccess('Contrasenya actualitzada correctament.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      setPwdError(err instanceof Error ? err.message : "Error actualitzant la contrasenya.");
    } finally {
      setPwdSaving(false);
    }
  };

  const navItemStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 14px',
    borderRadius: 8,
    color: isActive ? '#1976d2' : '#64748b',
    backgroundColor: isActive ? '#e3f2fd' : 'transparent',
    textDecoration: 'none',
    fontSize: 14,
    fontWeight: isActive ? 600 : 500,
  });

  const renderNavLinks = (onItemClick?: () => void) => (
    <Box
      component="nav"
      aria-label="Navegació principal"
      sx={{ p: '16px 12px', display: 'flex', flexDirection: 'column', gap: 0.5, flex: 1 }}
    >
      <NavLink to="/" end style={navItemStyle} onClick={onItemClick}>
        <span>Dashboard Servidors</span>
      </NavLink>

      <NavLink to="/alerts" style={navItemStyle} onClick={onItemClick}>
        <span>Alertes</span>
        {activeFiringCount > 0 && (
          <Box
            component="span"
            sx={{
              bgcolor: '#fee2e2',
              color: '#991b1b',
              px: 1,
              py: 0.2,
              borderRadius: '12px',
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {activeFiringCount}
          </Box>
        )}
      </NavLink>

      <NavLink to="/servers" style={navItemStyle} onClick={onItemClick}>
        <span>Inventari &amp; YAML</span>
      </NavLink>

      {isAdmin && (
        <NavLink to="/users" style={navItemStyle} onClick={onItemClick}>
          <span>Usuaris i Permisos</span>
        </NavLink>
      )}
    </Box>
  );

  const brandHeader = (
    <Box
      sx={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        px: 2.5,
        gap: 1.25,
        borderBottom: '1px solid #e2e8f0',
        fontWeight: 700,
        fontSize: 16,
      }}
    >
      <Box
        sx={{
          width: 30,
          height: 30,
          borderRadius: '6px',
          bgcolor: '#1976d2',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '"Roboto Mono", monospace',
          fontSize: 14,
        }}
      >
        &gt;_
      </Box>
      <Box component="span">Rawcraft Monitor</Box>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: '#f1f5f9', color: '#1e293b' }}>
      {/* Menú Lateral per Desktop (Sidebar) */}
      <Box
        component="aside"
        sx={{
          width: 240,
          bgcolor: '#ffffff',
          borderRight: '1px solid #e2e8f0',
          display: { xs: 'none', md: 'flex' },
          flexDirection: 'column',
          flexShrink: 0,
        }}
      >
        {brandHeader}
        {renderNavLinks()}
      </Box>

      {/* Drawer per a Mòbil / Tablet */}
      <Drawer
        anchor="left"
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        sx={{ display: { xs: 'block', md: 'none' } }}
        PaperProps={{
          sx: { width: 260, bgcolor: '#ffffff' },
        }}
      >
        {brandHeader}
        {renderNavLinks(() => setMobileMenuOpen(false))}
      </Drawer>

      {/* Contenidor Principal */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Barra Superior (Topbar) */}
        <Box
          component="header"
          sx={{
            height: 64,
            bgcolor: '#ffffff',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            px: { xs: 2, sm: 3, md: 4 },
            gap: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <IconButton
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Obrir menú de navegació"
              sx={{ display: { xs: 'inline-flex', md: 'none' }, color: '#1e293b' }}
              size="small"
            >
              ☰
            </IconButton>

            <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1 }}>
              <Box
                sx={{
                  width: 26,
                  height: 26,
                  borderRadius: '6px',
                  bgcolor: '#1976d2',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: '"Roboto Mono", monospace',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                &gt;_
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>
                Rawcraft
              </Typography>
            </Box>

            <Typography sx={{ fontSize: 13, color: '#64748b', display: { xs: 'none', md: 'block' } }}>
              Punt Central de Telemetria, Generador `config.yaml` i Alertes
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: '#1e293b',
                display: { xs: 'none', sm: 'block' },
              }}
            >
              {currentUser?.name || currentUser?.email}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              onClick={handleOpenPasswordModal}
              sx={{
                textTransform: 'none',
                borderColor: '#e2e8f0',
                color: '#1e293b',
                fontSize: 12,
                px: { xs: 1, sm: 1.5 },
                minWidth: 'auto',
              }}
            >
              Contrasenya
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => void handleLogout()}
              sx={{
                textTransform: 'none',
                borderColor: '#e2e8f0',
                color: '#64748b',
                fontSize: 12,
                px: { xs: 1, sm: 1.5 },
                minWidth: 'auto',
              }}
            >
              Sortir
            </Button>
          </Box>
        </Box>

        {/* Contingut de la Ruta */}
        <Box
          component="main"
          sx={{
            p: { xs: 1.5, sm: 2.5, md: '28px 32px' },
            maxWidth: 1280,
            width: '100%',
          }}
        >
          <Outlet />
        </Box>
      </Box>

      {/* Modal de Canvi de Contrasenya Pròpia (HU-USR-04, fidel a mockups/user/login.html) */}
      <Dialog
        open={pwdModalOpen}
        onClose={() => setPwdModalOpen(false)}
        maxWidth="xs"
        fullWidth
      >
        <form method="post" onSubmit={handlePasswordSubmit}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 17, borderBottom: '1px solid #e2e8f0' }}>
            Canviar contrasenya pròpia (`HU-USR-04`)
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            <Typography sx={{ fontSize: 12.5, color: '#64748b', mb: 2 }}>
              {currentUser?.email} • Rol: {currentUser?.role} — Introdueix la contrasenya actual i defineix la nova (mínim 8 caràcters).
            </Typography>

            {pwdError && (
              <Alert severity="error" sx={{ mb: 2, fontSize: 13 }}>
                {pwdError}
              </Alert>
            )}
            {pwdSuccess && (
              <Alert severity="success" sx={{ mb: 2, fontSize: 13 }}>
                {pwdSuccess}
              </Alert>
            )}

            <Box sx={{ mb: 2 }}>
              <label
                htmlFor={currPwdId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Contrasenya actual
              </label>
              <input
                id={currPwdId}
                name="current_password"
                type="password"
                required
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
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
                htmlFor={newPwdId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Nova contrasenya
              </label>
              <input
                id={newPwdId}
                name="new_password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
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
                htmlFor={confPwdId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Confirma la nova contrasenya
              </label>
              <input
                id={confPwdId}
                name="confirm_password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <Button
              type="button"
              onClick={() => setPwdModalOpen(false)}
              sx={{ textTransform: 'none', color: '#1e293b' }}
            >
              Tancar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={pwdSaving}
              sx={{ textTransform: 'none', bgcolor: '#1976d2' }}
            >
              {pwdSaving ? 'Actualitzant...' : 'Actualitzar contrasenya'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
};
