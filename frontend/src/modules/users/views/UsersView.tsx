import React, { useEffect, useState, useId } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  FormControlLabel,
  Checkbox,
  Switch,
  CircularProgress,
} from '@mui/material';
import { useUsersStore } from '../store';
import type { User, UserRole } from '../api';
import { useServersStore } from '../../servers/store';

export const UsersView: React.FC = () => {
  const {
    users,
    usersLoading,
    usersError,
    usersErrorStatus,
    currentUser,
    fetchUsers,
    createUser,
    updateUser,
    deleteUser,
    clearUsersError,
  } = useUsersStore();

  const { servers, fetchServers } = useServersStore();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('USER');
  const [isActive, setIsActive] = useState(true);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();
  const roleId = useId();

  useEffect(() => {
    void fetchUsers();
    void fetchServers();
  }, [fetchUsers, fetchServers]);

  const serverNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const s of servers) {
      map.set(s.id, s.name);
    }
    return map;
  }, [servers]);

  const handleOpenCreate = () => {
    clearUsersError();
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('USER');
    setIsActive(true);
    setSelectedServerIds([]);
    setModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    clearUsersError();
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setIsActive(u.is_active);
    setSelectedServerIds(u.server_ids ?? []);
    setModalOpen(true);
  };

  const handleToggleServer = (serverId: string) => {
    setSelectedServerIds((prev) =>
      prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]
    );
  };

  const handleSaveUser = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: name.trim(),
          email: email.trim(),
          ...(password.trim() ? { password } : {}),
          role,
          is_active: isActive,
          server_ids: role === 'ADMIN' ? [] : selectedServerIds,
        });
      } else {
        await createUser({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          is_active: isActive,
          server_ids: role === 'ADMIN' ? [] : selectedServerIds,
        });
      }
      setModalOpen(false);
    } catch {
      // Error is stored in usersStore (including 409 conflict)
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    try {
      await deleteUser(deleteTarget.id, true);
      setDeleteTarget(null);
    } catch {
      // Error surfaced via store
    } finally {
      setDeleteSubmitting(false);
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
            Usuaris i Permisos per Servidor
          </Typography>
          <Typography sx={{ fontSize: 14, color: '#64748b', mt: 0.5 }}>
            Gestiona quins usuaris tenen accés al Punt Central i quins servidors pot consultar cada operador (`HU-USR-02`, `HU-USR-03`).
          </Typography>
        </Box>
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
          + Nou Usuari
        </Button>
      </Box>

      {usersError && !modalOpen && (
        <Alert severity="error" sx={{ mb: 2.5 }} onClose={clearUsersError}>
          {usersError}
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
          aria-label="Taula d'usuaris i permisos per servidor"
          sx={{ overflowX: 'auto', maxWidth: '100%' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ position: 'sticky', insetBlockStart: 0, zIndex: 1 }}>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Usuari
                </th>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Rol
                </th>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Servidors Autoritzats
                </th>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Estat
                </th>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Data d&apos;alta
                </th>
                <th style={{ padding: '14px 20px', fontSize: 12, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                  Accions
                </th>
              </tr>
            </thead>
            <tbody>
              {usersLoading && users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center' }}>
                    <CircularProgress size={24} />
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                    No hi ha usuaris registrats.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '16px 20px' }}>
                      <Typography sx={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>
                        {u.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748b' }}>
                        {u.email}
                      </Typography>
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <Chip
                        label={u.role}
                        size="small"
                        sx={{
                          bgcolor: u.role === 'ADMIN' ? '#e0e7ff' : '#f1f5f9',
                          color: u.role === 'ADMIN' ? '#3730a3' : '#334155',
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      />
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      {u.role === 'ADMIN' ? (
                        <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                          Tots els servidors (Accés global)
                        </Typography>
                      ) : u.server_ids && u.server_ids.length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                          {u.server_ids.map((sid) => (
                            <Box
                              key={sid}
                              component="span"
                              sx={{
                                bgcolor: '#e3f2fd',
                                color: '#115293',
                                border: '1px solid #bbdefb',
                                px: 1,
                                py: 0.35,
                                borderRadius: '6px',
                                fontSize: 12,
                                fontFamily: '"Roboto Mono", monospace',
                              }}
                            >
                              {serverNameById.get(sid) || sid.slice(0, 8)}
                            </Box>
                          ))}
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: 13, color: '#94a3b8' }}>
                          Cap servidor assignat
                        </Typography>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <Chip
                        label={u.is_active ? 'Actiu' : 'Inactiu'}
                        size="small"
                        sx={{
                          bgcolor: u.is_active ? '#dcfce7' : '#fee2e2',
                          color: u.is_active ? '#166534' : '#991b1b',
                          fontWeight: 500,
                          fontSize: 12,
                        }}
                      />
                    </td>
                    <td style={{ padding: '16px 20px', fontSize: 13, color: '#475569' }}>
                      {new Date(u.created_at).toLocaleDateString('ca-ES')}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => handleOpenEdit(u)}
                          sx={{
                            textTransform: 'none',
                            borderColor: '#e2e8f0',
                            color: '#1e293b',
                            fontSize: 13,
                          }}
                        >
                          Editar / Servidors
                        </Button>
                        {currentUser?.id !== u.id && (
                          <Button
                            variant="outlined"
                            size="small"
                            onClick={() => setDeleteTarget(u)}
                            sx={{
                              textTransform: 'none',
                              borderColor: '#e2e8f0',
                              color: '#d32f2f',
                              fontSize: 13,
                            }}
                          >
                            Baixa
                          </Button>
                        )}
                      </Box>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      </Paper>

      {/* Modal Alta / Edició i Permisos per Servidor */}
      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <form method="post" onSubmit={handleSaveUser}>
          <DialogTitle sx={{ fontWeight: 700, fontSize: 17, borderBottom: '1px solid #e2e8f0' }}>
            {editingUser ? 'Editar Usuari i Accés a Servidors' : 'Configurar Nou Usuari i Accés a Servidors'}
          </DialogTitle>
          <DialogContent sx={{ pt: '20px !important' }}>
            {usersError && (
              <Alert
                severity="error"
                sx={{
                  mb: 2,
                  fontSize: 13,
                  bgcolor: '#fde8e8',
                  color: '#d32f2f',
                  borderLeft: '4px solid #d32f2f',
                }}
              >
                {usersErrorStatus === 409 ? (
                  <>
                    <strong>Error 409 Conflict:</strong> {usersError}
                  </>
                ) : (
                  usersError
                )}
              </Alert>
            )}

            <Box sx={{ mb: 2 }}>
              <label
                htmlFor={nameId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Nom complet
              </label>
              <input
                id={nameId}
                name="name"
                type="text"
                required
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marc Rovira"
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
                htmlFor={emailId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Correu electrònic (també usable per a alertes SMTP)
              </label>
              <input
                id={emailId}
                name="email"
                type="email"
                required
                autoComplete="email"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="marc@rawcraft.cat"
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
                htmlFor={passwordId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                {editingUser
                  ? 'Nova contrasenya (opcional, mínim 8 caràcters)'
                  : 'Contrasenya inicial (mínim 8 caràcters)'}
              </label>
              <input
                id={passwordId}
                name="password"
                type="password"
                required={!editingUser}
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
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
                htmlFor={roleId}
                style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}
              >
                Rol del sistema
              </label>
              <select
                id={roleId}
                name="role"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                style={{
                  width: '100%',
                  padding: '9px 12px',
                  fontSize: 14,
                  border: '1px solid #e2e8f0',
                  borderRadius: 8,
                  background: '#ffffff',
                }}
              >
                <option value="USER">USER — Només veu els servidors assignats</option>
                <option value="ADMIN">ADMIN — Accés complet a tots els servidors i configuració YAML</option>
              </select>
            </Box>

            <Box sx={{ mb: 2 }}>
              <FormControlLabel
                control={
                  <Switch
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={editingUser?.id === currentUser?.id}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                    Compte d&apos;usuari actiu (`is_active`)
                  </Typography>
                }
              />
            </Box>

            {role === 'USER' && (
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.75 }}>
                  Servidors autoritzats per a aquest usuari (`server_ids`)
                </Typography>
                <Box
                  sx={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    p: 1.5,
                    bgcolor: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.5,
                    maxHeight: 220,
                    overflowY: 'auto',
                  }}
                >
                  {servers.length === 0 ? (
                    <Typography sx={{ fontSize: 13, color: '#64748b' }}>
                      Encara no hi ha servidors registrats a l&apos;inventari.
                    </Typography>
                  ) : (
                    servers.map((srv) => (
                      <FormControlLabel
                        key={srv.id}
                        control={
                          <Checkbox
                            size="small"
                            checked={selectedServerIds.includes(srv.id)}
                            onChange={() => handleToggleServer(srv.id)}
                          />
                        }
                        label={
                          <Typography sx={{ fontSize: 13 }}>
                            <strong>{srv.name}</strong>{' '}
                            <Box component="span" sx={{ color: '#64748b' }}>
                              ({srv.ipv4_address || srv.description || srv.id.slice(0, 8)})
                            </Box>
                          </Typography>
                        }
                      />
                    ))
                  )}
                </Box>
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ px: 3, py: 1.75, bgcolor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
            <Button
              type="button"
              onClick={() => setModalOpen(false)}
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
              {submitting ? 'Desant...' : 'Desar usuari i permisos'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Modal Confirmació Baixa Sensible (`confirm=true`) */}
      <Dialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontWeight: 700, fontSize: 17, color: '#d32f2f', borderBottom: '1px solid #e2e8f0' }}>
          Confirmar baixa d&apos;usuari (Entitat Sensible)
        </DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <Typography sx={{ fontSize: 14, lineHeight: 1.55, color: '#1e293b' }}>
            Estàs a punt de donar de baixa l&apos;usuari{' '}
            <strong>{deleteTarget?.email}</strong>. S&apos;aplicarà <em>soft-delete</em> (`confirm=true`) i es revocarà immediatament el seu accés als servidors assignats.
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
            disabled={deleteSubmitting}
            onClick={handleConfirmDelete}
            sx={{ textTransform: 'none' }}
          >
            {deleteSubmitting ? 'Processant...' : 'Confirmar baixa (`confirm=true`)'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
