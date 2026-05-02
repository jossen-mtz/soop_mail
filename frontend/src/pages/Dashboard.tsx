import React, { useEffect, useState } from 'react';
import { useLocation, NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import { 
  Users, 
  Mail, 
  Plus, 
  Trash2, 
  LogOut, 
  RefreshCcw, 
  Search,
  CheckCircle,
  AlertCircle,
  Settings,
  Eye,
  EyeOff,
  UserPlus,
  Server,
  Shield,
  Activity,
  Database,
  Edit2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MailUser {
  email: string;
  uid: string;
  gid: string;
  home: string;
  email_count: number;
  new_emails: number;
  storage_size: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mailUsers, setMailUsers] = useState<MailUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMailUser, setSelectedMailUser] = useState<MailUser | null>(null);
  const [editPassword, setEditPassword] = useState({ password: '', password_confirm: '' });
  
  const [newUser, setNewUser] = useState({
    email: '',
    password: '',
    password_confirm: '',
    restart_soop_mail: true
  });
  
  const activeTab = location.pathname === '/configuracion' ? 'settings' : 'users';
  
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [showAddSystemUserModal, setShowAddSystemUserModal] = useState(false);
  const [newSystemUser, setNewSystemUser] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    is_admin: false,
    is_active: true
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showSettingsPassword, setShowSettingsPassword] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const [settingsTab, setSettingsTab] = useState<'profile' | 'server' | 'users' | 'logs'>('profile');
  const [systemStatus, setSystemStatus] = useState<any>(null);

  const fetchMailUsers = async () => {
    try {
      const response = await api.get('/api/mail/users');
      setMailUsers(response.data);
    } catch (err) {
      showNotification('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/api/system/logs');
      setAuditLogs(response.data);
    } catch (err) {
      console.error('Error fetching logs', err);
    }
  };

  const fetchSystemUsers = async () => {
    try {
      const response = await api.get('/api/system/users');
      setSystemUsers(response.data);
    } catch (err) {
      console.error('Error fetching system users', err);
    }
  };

  const fetchSystemStatus = async () => {
    try {
      const response = await api.get('/api/system/status');
      setSystemStatus(response.data);
    } catch (err) {
      console.error('Error fetching system status', err);
    }
  };

  useEffect(() => {
    fetchMailUsers();
    if (activeTab === 'settings') {
      document.title = 'Configuración | soop MAIL';
      fetchAuditLogs();
      fetchSystemStatus();
      if (user?.is_admin) {
        fetchSystemUsers();
      }
    } else {
      document.title = 'Usuarios | soop MAIL';
    }
  }, [activeTab]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleUpdateMailUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMailUser) return;
    setActionLoading(true);
    try {
      await api.put(`/api/mail/users/${selectedMailUser.email}/password`, {
        ...editPassword,
        restart_soop_mail: true
      });
      showNotification('Contraseña actualizada exitosamente', 'success');
      setShowEditModal(false);
      setEditPassword({ password: '', password_confirm: '' });
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al actualizar contraseña', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      // Automatically append domain if only username is provided
      let email = newUser.email;
      if (email && !email.includes('@')) {
        email = `${email}@mmbtransporte.com`;
      }
      
      const payload = {
        ...newUser,
        email,
        restart_soop_mail: true // Always restart as requested
      };

      await api.post('/api/mail/users', payload);
      showNotification('Usuario creado exitosamente', 'success');
      setShowAddModal(false);
      setNewUser({ email: '', password: '', password_confirm: '', restart_soop_mail: true });
      fetchMailUsers();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al crear usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = async (email: string) => {
    if (!window.confirm(`¿Estás seguro de eliminar el usuario ${email}?`)) return;
    
    try {
      await api.delete(`/api/mail/users/${email}`);
      showNotification('Usuario eliminado', 'success');
      fetchMailUsers();
    } catch (err) {
      showNotification('Error al eliminar usuario', 'error');
    }
  };

  const handleCreateSystemUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/api/system/users', newSystemUser);
      showNotification('Usuario de acceso creado', 'success');
      setShowAddSystemUserModal(false);
      setNewSystemUser({
        username: '',
        email: '',
        full_name: '',
        password: '',
        is_admin: false,
        is_active: true
      });
      fetchSystemUsers();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al crear usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSystemUser = async (id: number, username: string) => {
    if (id === user?.id) {
      showNotification('No puedes eliminar tu propia cuenta', 'error');
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar el acceso de ${username}?`)) return;
    
    try {
      await api.delete(`/api/system/users/${id}`);
      showNotification('Usuario eliminado', 'success');
      fetchSystemUsers();
    } catch (err) {
      showNotification('Error al eliminar usuario', 'error');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/api/auth/change-password', passwordForm);
      showNotification('Contraseña actualizada exitosamente', 'success');
      setPasswordForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al actualizar contraseña', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredUsers = mailUsers.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalMailboxes = mailUsers.length;
  const totalEmails = mailUsers.reduce((acc, curr) => acc + (curr.email_count || 0), 0);
  const totalNewEmails = mailUsers.reduce((acc, curr) => acc + (curr.new_emails || 0), 0);

  return (
    <div className="dashboard-layout" style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f1f5f9' }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ 
        width: '280px', 
        background: '#ffffff', 
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.5rem',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem', padding: '0.5rem' }}>
          <div style={{ 
            background: '#4f46e5', 
            width: '42px',
            height: '42px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '0.75rem', 
            boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.4)' 
          }}>
            <Mail color="white" size={22} />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.025em' }}>soop MAIL</h2>
        </div>

        <nav style={{ flex: 1 }}>
          <NavLink 
            to="/usuarios"
            style={({ isActive }) => ({ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              padding: '0.75rem 1rem', 
              background: isActive ? '#f1f5f9' : 'transparent', 
              color: isActive ? '#4f46e5' : '#64748b',
              borderRadius: '0.75rem',
              marginBottom: '0.5rem',
              fontWeight: isActive ? '600' : '500',
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textDecoration: 'none'
            })}
          >
            <Users size={18} />
            <span>Usuarios</span>
          </NavLink>
          <NavLink 
            to="/configuracion"
            style={({ isActive }) => ({ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.75rem', 
              padding: '0.75rem 1rem', 
              background: isActive ? '#f1f5f9' : 'transparent', 
              color: isActive ? '#4f46e5' : '#64748b',
              borderRadius: '0.75rem',
              marginBottom: '0.5rem',
              fontWeight: isActive ? '600' : '500',
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.2s',
              textDecoration: 'none'
            })}
          >
            <Settings size={18} />
            <span>Configuración</span>
          </NavLink>
        </nav>

        <div style={{ marginTop: 'auto', paddingTop: '1.5rem', borderTop: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem', padding: '0.5rem' }}>
            <div style={{ 
              width: '40px', 
              height: '40px', 
              borderRadius: '12px', 
              background: '#eef2ff',
              color: '#4f46e5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '700',
              fontSize: '1rem'
            }}>
              {user?.username[0].toUpperCase()}
            </div>
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.full_name}</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{user?.is_admin ? 'Administrador' : 'Editor'}</div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', background: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' }}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: '2.5rem', overflowY: 'auto' }}>
        {activeTab === 'users' ? (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Buzones de Correo</h1>
                <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Gestión de cuentas y monitoreo de tráfico.</p>
              </div>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.875rem' }}>
                <Plus size={20} />
                Nuevo Usuario
              </button>
            </header>
            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
              <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', border: 'none', background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', color: '#ffffff' }}>
                <div style={{ background: 'rgba(255, 255, 255, 0.2)', width: '48px', height: '48px', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Users size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', opacity: 0.8, fontWeight: '500' }}>Total Buzones</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800' }}>{totalMailboxes}</div>
                </div>
              </div>
              
              <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ background: '#f0f9ff', width: '48px', height: '48px', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9' }}>
                  <Mail size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '500' }}>Total Correos</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#1e293b' }}>{totalEmails.toLocaleString()}</div>
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem', display: 'flex', alignItems: 'center', gap: '1.25rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ background: '#fff7ed', width: '48px', height: '48px', borderRadius: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                  <RefreshCcw size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '500' }}>Correos Nuevos</div>
                  <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f97316' }}>{totalNewEmails}</div>
                </div>
              </div>
            </div>

            {/* Search and Table */}
            <div className="card" style={{ padding: '0', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#ffffff' }}>
                <div style={{ position: 'relative', width: '320px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                  <input 
                    type="text" 
                    placeholder="Buscar por email..." 
                    className="input-control"
                    style={{ paddingLeft: '2.75rem', background: '#f8fafc' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <button onClick={fetchMailUsers} className="btn btn-secondary" style={{ padding: '0.625rem' }}>
                  <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>USUARIO / EMAIL</th>
                      <th>CORREOS</th>
                      <th style={{ textAlign: 'right' }}>ACCIONES</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>
                        <div className="animate-pulse">Cargando usuarios...</div>
                      </td></tr>
                    ) : filteredUsers.length === 0 ? (
                      <tr><td colSpan={4} style={{ padding: '4rem', textAlign: 'center', color: '#94a3b8' }}>No se encontraron usuarios.</td></tr>
                    ) : filteredUsers.map((u) => (
                      <tr key={u.email}>
                        <td style={{ fontWeight: '600', color: '#1e293b' }}>{u.email}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              background: '#f0f9ff', 
                              padding: '0.25rem 0.75rem', 
                              borderRadius: '2rem', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '0.375rem',
                              border: '1px solid #e0f2fe'
                            }}>
                              <Mail size={14} style={{ color: '#0ea5e9' }} />
                              <span style={{ fontWeight: '700', color: '#0369a1', fontSize: '0.813rem' }}>{u.email_count} total</span>
                            </div>
                            
                            {u.new_emails > 0 && (
                              <div style={{ 
                                background: '#fff7ed', 
                                padding: '0.25rem 0.75rem', 
                                borderRadius: '2rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.375rem',
                                border: '1px solid #ffedd5'
                              }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316' }}></span>
                                <span style={{ fontWeight: '700', color: '#9a3412', fontSize: '0.813rem' }}>{u.new_emails} nuevos</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.25rem' }}>
                            <button 
                              onClick={() => { setSelectedMailUser(u); setShowViewModal(true); }}
                              className="btn btn-secondary" 
                              style={{ color: '#6366f1', padding: '0.5rem', border: 'none', background: 'transparent', boxShadow: 'none' }}
                              title="Ver detalles"
                            >
                              <Eye size={18} />
                            </button>
                            <button 
                              onClick={() => { setSelectedMailUser(u); setEditPassword({ password: '', password_confirm: '' }); setShowEditModal(true); }}
                              className="btn btn-secondary" 
                              style={{ color: '#f59e0b', padding: '0.5rem', border: 'none', background: 'transparent', boxShadow: 'none' }}
                              title="Editar contraseña"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.email)} 
                              className="btn btn-secondary" 
                              style={{ color: '#ef4444', padding: '0.5rem', border: 'none', background: 'transparent', boxShadow: 'none' }}
                              title="Eliminar usuario"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Configuración</h1>
              <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Administra el sistema y revisa el estado del servidor.</p>
            </header>

            {/* Sub Tabs */}
            <div style={{ 
              display: 'flex', 
              gap: '0.5rem', 
              marginBottom: '2rem', 
              padding: '0.375rem', 
              background: '#ffffff', 
              borderRadius: '1rem',
              width: 'fit-content',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
            }}>
              <button 
                onClick={() => setSettingsTab('profile')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  border: 'none',
                  cursor: 'pointer',
                  background: settingsTab === 'profile' ? '#4f46e5' : 'transparent',
                  color: settingsTab === 'profile' ? '#ffffff' : '#64748b',
                }}
              >
                <Shield size={16} />
                Seguridad
              </button>
              <button 
                onClick={() => {
                  setSettingsTab('server');
                  fetchSystemStatus();
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  border: 'none',
                  cursor: 'pointer',
                  background: settingsTab === 'server' ? '#4f46e5' : 'transparent',
                  color: settingsTab === 'server' ? '#ffffff' : '#64748b',
                }}
              >
                <Server size={16} />
                Servidor
              </button>
              {user?.is_admin && (
                <button 
                  onClick={() => setSettingsTab('users')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.625rem 1.25rem',
                    borderRadius: '0.75rem',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    transition: 'all 0.2s',
                    border: 'none',
                    cursor: 'pointer',
                    background: settingsTab === 'users' ? '#4f46e5' : 'transparent',
                    color: settingsTab === 'users' ? '#ffffff' : '#64748b',
                  }}
                >
                  <UserPlus size={16} />
                  Accesos
                </button>
              )}
              <button 
                onClick={() => setSettingsTab('logs')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.625rem 1.25rem',
                  borderRadius: '0.75rem',
                  fontSize: '0.875rem',
                  fontWeight: '600',
                  transition: 'all 0.2s',
                  border: 'none',
                  cursor: 'pointer',
                  background: settingsTab === 'logs' ? '#4f46e5' : 'transparent',
                  color: settingsTab === 'logs' ? '#ffffff' : '#64748b',
                }}
              >
                <Activity size={16} />
                Auditoría
              </button>
            </div>

            <div style={{ width: '100%' }}>
              <AnimatePresence mode="wait">
                {settingsTab === 'profile' && (
                  <motion.div 
                    key="profile"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '2rem' }}
                  >
                    <div style={{ marginBottom: '2rem' }}>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>Seguridad de la Cuenta</h3>
                      <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Actualiza tu contraseña periódicamente para mantener tu cuenta segura.</p>
                    </div>
                    
                    <form onSubmit={handleChangePassword} style={{ maxWidth: '500px' }}>
                      <div className="input-group">
                        <label>Contraseña Actual</label>
                        <div style={{ position: 'relative' }}>
                          <input 
                            type={showSettingsPassword ? "text" : "password"} 
                            className="input-control" 
                            value={passwordForm.current_password}
                            onChange={e => setPasswordForm({...passwordForm, current_password: e.target.value})}
                            required
                          />
                          <button 
                            type="button"
                            onClick={() => setShowSettingsPassword(!showSettingsPassword)}
                            style={{ 
                              position: 'absolute', 
                              right: '0.75rem', 
                              top: '50%', 
                              transform: 'translateY(-50%)',
                              background: 'none',
                              border: 'none',
                              color: '#94a3b8',
                              cursor: 'pointer',
                              display: 'flex',
                              padding: '0.5rem'
                            }}
                          >
                            {showSettingsPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                        <div className="input-group">
                          <label>Nueva Contraseña</label>
                          <input 
                            type={showSettingsPassword ? "text" : "password"} 
                            className="input-control" 
                            value={passwordForm.new_password}
                            onChange={e => setPasswordForm({...passwordForm, new_password: e.target.value})}
                            required
                          />
                        </div>
                        <div className="input-group">
                          <label>Confirmar Nueva</label>
                          <input 
                            type={showSettingsPassword ? "text" : "password"} 
                            className="input-control" 
                            value={passwordForm.confirm_password}
                            onChange={e => setPasswordForm({...passwordForm, confirm_password: e.target.value})}
                            required
                          />
                        </div>
                      </div>
                      <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ marginTop: '1rem' }}>
                        {actionLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
                      </button>
                    </form>
                  </motion.div>
                )}

                {settingsTab === 'server' && (
                  <motion.div 
                    key="server"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    style={{ display: 'grid', gap: '1.5rem' }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              background: systemStatus?.service_active ? '#dcfce7' : '#fee2e2', 
                              color: systemStatus?.service_active ? '#16a34a' : '#dc2626', 
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '0.75rem' 
                            }}>
                              <Activity size={20} />
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Servicio soop-mail</div>
                              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                                {systemStatus?.service_active ? 'Activo' : 'Inactivo'}
                              </div>
                            </div>
                          </div>
                          <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            background: systemStatus?.service_active ? '#22c55e' : '#ef4444',
                            boxShadow: `0 0 10px ${systemStatus?.service_active ? '#22c55e' : '#ef4444'}80`
                          }}></div>
                        </div>
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#64748b' }}>Postfix (MTA):</span>
                            <span style={{ 
                              fontWeight: '700', 
                              color: systemStatus?.details?.postfix_active ? '#16a34a' : '#dc2626' 
                            }}>
                              {systemStatus?.details?.postfix_active ? 'En ejecución' : 'Detenido'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                            <span style={{ color: '#64748b' }}>Dovecot (IMAP):</span>
                            <span style={{ 
                              fontWeight: '700', 
                              color: systemStatus?.details?.dovecot_active ? '#16a34a' : '#dc2626' 
                            }}>
                              {systemStatus?.details?.dovecot_active ? 'En ejecución' : 'Detenido'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ 
                            background: '#e0f2fe', 
                            color: '#0284c7', 
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '0.75rem' 
                          }}>
                            <Database size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Partición de Correo</div>
                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                              {systemStatus?.details?.disk_used || 'N/A'} / {systemStatus?.details?.disk_total || 'N/A'}
                            </div>
                          </div>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: systemStatus?.details?.disk_used ? `${(parseFloat(systemStatus.details.disk_used) / parseFloat(systemStatus.details.disk_total)) * 100}%` : '0%', 
                            height: '100%', 
                            background: '#0284c7' 
                          }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem' }}>
                          <span style={{ color: '#64748b' }}>Libre:</span>
                          <span style={{ fontWeight: '600', color: '#1e293b' }}>{systemStatus?.details?.disk_free || 'N/A'}</span>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                          <div style={{ background: '#f5f3ff', color: '#7c3aed', padding: '0.5rem', borderRadius: '0.75rem' }}>
                            <Mail size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Almacenamiento Real</div>
                            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                              {systemStatus?.details?.total_emails || 0} Correos
                            </div>
                          </div>
                        </div>
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.813rem', marginBottom: '0.5rem' }}>
                            <span style={{ color: '#64748b' }}>Tamaño en Disco:</span>
                            <span style={{ fontWeight: '600', color: '#1e293b' }}>{systemStatus?.details?.mail_base_size || '0 B'}</span>
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8', fontStyle: 'italic' }}>
                            Peso total de todos los buzones.
                          </div>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ 
                              background: systemStatus?.details?.db_connected ? '#dcfce7' : '#fee2e2', 
                              color: systemStatus?.details?.db_connected ? '#16a34a' : '#dc2626', 
                              width: '36px',
                              height: '36px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '0.75rem' 
                            }}>
                              <Database size={20} />
                            </div>
                            <div>
                              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '500' }}>Base de Datos MySQL</div>
                              <div style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>
                                {systemStatus?.details?.db_connected ? 'Conectado' : 'Desconectado'}
                              </div>
                            </div>
                          </div>
                          <div style={{ 
                            width: '12px', 
                            height: '12px', 
                            borderRadius: '50%', 
                            background: systemStatus?.details?.db_connected ? '#22c55e' : '#ef4444',
                            boxShadow: `0 0 10px ${systemStatus?.details?.db_connected ? '#22c55e' : '#ef4444'}80`
                          }}></div>
                        </div>
                        <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1rem' }}>
                          <div style={{ fontSize: '0.813rem', color: systemStatus?.details?.db_connected ? '#166534' : '#dc2626', fontWeight: '600' }}>
                            {systemStatus?.details?.db_message}
                          </div>
                        </div>
                      </div>
                    </div>

                    {systemStatus?.details?.database_logs && (
                      <div className="card" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Activity size={18} style={{ color: '#4f46e5' }} />
                          Historial de Intentos de Conexión (MySQL)
                        </h4>
                        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                          <table style={{ fontSize: '0.813rem' }}>
                            <thead>
                              <tr style={{ textAlign: 'left' }}>
                                <th style={{ padding: '0.5rem' }}>Hora</th>
                                <th style={{ padding: '0.5rem' }}>Estrategia</th>
                                <th style={{ padding: '0.5rem' }}>Estado</th>
                                <th style={{ padding: '0.5rem' }}>Detalles</th>
                              </tr>
                            </thead>
                            <tbody>
                              {systemStatus.details.database_logs.map((log: any, idx: number) => (
                                <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                                  <td style={{ padding: '0.5rem' }}>{log.timestamp}</td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <span className={`badge ${log.strategy === 'Socket' ? 'badge-primary' : 'badge-secondary'}`}>
                                      {log.strategy}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.5rem' }}>
                                    <span style={{ color: log.success ? '#16a34a' : '#dc2626', fontWeight: '700' }}>
                                      {log.success ? 'ÉXITO' : 'FALLO'}
                                    </span>
                                  </td>
                                  <td style={{ padding: '0.5rem', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {log.error || 'Conexión establecida'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                      <div className="card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CheckCircle size={18} style={{ color: '#4f46e5' }} />
                          Verificación de Postfix
                        </h4>
                        <div style={{ 
                          background: systemStatus?.details?.postfix_config_ok ? '#f0fdf4' : '#fef2f2', 
                          border: `1px solid ${systemStatus?.details?.postfix_config_ok ? '#bbf7d0' : '#fecaca'}`,
                          padding: '1rem',
                          borderRadius: '0.75rem',
                          marginBottom: '1rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {systemStatus?.details?.postfix_config_ok ? (
                              <CheckCircle size={16} color="#16a34a" />
                            ) : (
                              <AlertCircle size={16} color="#dc2626" />
                            )}
                            <span style={{ fontWeight: '700', fontSize: '0.875rem', color: systemStatus?.details?.postfix_config_ok ? '#166534' : '#991b1b' }}>
                              {systemStatus?.details?.postfix_config_ok ? 'Configuración Correcta' : 'Error en Configuración'}
                            </span>
                          </div>
                          <code style={{ fontSize: '0.75rem', display: 'block', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: systemStatus?.details?.postfix_config_ok ? '#166534' : '#991b1b' }}>
                            {systemStatus?.details?.postfix_config_ok ? 'Postfix check passed without warnings.' : systemStatus?.details?.postfix_config_error}
                          </code>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <CheckCircle size={18} style={{ color: '#4f46e5' }} />
                          Verificación de Dovecot
                        </h4>
                        <div style={{ 
                          background: systemStatus?.details?.dovecot_config_ok ? '#f0fdf4' : '#fef2f2', 
                          border: `1px solid ${systemStatus?.details?.dovecot_config_ok ? '#bbf7d0' : '#fecaca'}`,
                          padding: '1rem',
                          borderRadius: '0.75rem',
                          marginBottom: '1rem'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            {systemStatus?.details?.dovecot_config_ok ? (
                              <CheckCircle size={16} color="#16a34a" />
                            ) : (
                              <AlertCircle size={16} color="#dc2626" />
                            )}
                            <span style={{ fontWeight: '700', fontSize: '0.875rem', color: systemStatus?.details?.dovecot_config_ok ? '#166534' : '#991b1b' }}>
                              {systemStatus?.details?.dovecot_config_ok ? 'Configuración Correcta' : 'Error en Configuración'}
                            </span>
                          </div>
                          <code style={{ fontSize: '0.75rem', display: 'block', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap', color: systemStatus?.details?.dovecot_config_ok ? '#166534' : '#991b1b' }}>
                            {systemStatus?.details?.dovecot_config_ok ? 'Dovecot config check passed.' : systemStatus?.details?.dovecot_config_error}
                          </code>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', gridColumn: 'span 2' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Activity size={18} style={{ color: '#4f46e5' }} />
                          Información Técnica
                        </h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Sistema Operativo</div>
                              <div style={{ fontWeight: '600', color: '#1e293b' }}>{systemStatus?.details?.os} {systemStatus?.details?.release}</div>
                            </div>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Versión de Kernel</div>
                              <div style={{ fontWeight: '600', color: '#1e293b', fontSize: '0.75rem' }}>{systemStatus?.details?.version}</div>
                            </div>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Uptime</div>
                              <div style={{ fontWeight: '600', color: '#1e293b' }}>{systemStatus?.details?.uptime || 'N/A'}</div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Python Version</div>
                              <div style={{ fontWeight: '600', color: '#1e293b' }}>{systemStatus?.details?.python_version}</div>
                            </div>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Ruta de Usuarios</div>
                              <code style={{ fontSize: '0.7rem', color: '#475569', background: '#f8fafc', padding: '2px 4px', borderRadius: '4px' }}>{systemStatus?.details?.users_file}</code>
                            </div>
                            <div style={{ fontSize: '0.813rem' }}>
                              <div style={{ color: '#64748b', marginBottom: '0.25rem' }}>Base de Correos</div>
                              <code style={{ fontSize: '0.7rem', color: '#475569', background: '#f8fafc', padding: '2px 4px', borderRadius: '4px' }}>{systemStatus?.details?.mail_base}</code>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}

                {settingsTab === 'users' && user?.is_admin && (
                  <motion.div 
                    key="users"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '2rem' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>Usuarios de Acceso</h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Gestiona las cuentas que tienen acceso a este panel de administración.</p>
                      </div>
                      <button onClick={() => setShowAddSystemUserModal(true)} className="btn btn-primary">
                        <UserPlus size={18} />
                        Agregar Acceso
                      </button>
                    </div>

                    <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: '1rem' }}>
                      <table>
                        <thead>
                          <tr>
                            <th>USUARIO</th>
                            <th>NOMBRE</th>
                            <th>ROL</th>
                            <th>ESTADO</th>
                            <th style={{ textAlign: 'right' }}>ACCIONES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {systemUsers.map((u) => (
                            <tr key={u.id}>
                              <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                  <span style={{ fontWeight: '700', color: '#1e293b' }}>{u.username}</span>
                                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{u.email}</span>
                                </div>
                              </td>
                              <td style={{ color: '#475569' }}>{u.full_name}</td>
                              <td>
                                {u.is_admin ? (
                                  <span className="badge badge-primary" style={{ background: '#eef2ff', color: '#4f46e5', border: '1px solid #e0e7ff' }}>Admin</span>
                                ) : (
                                  <span className="badge badge-secondary">Editor</span>
                                )}
                              </td>
                              <td>
                                {u.is_active ? (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: '#16a34a', fontWeight: '600', fontSize: '0.813rem' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a' }}></div>
                                    Activo
                                  </span>
                                ) : (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', color: '#94a3b8', fontWeight: '600', fontSize: '0.813rem' }}>
                                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#94a3b8' }}></div>
                                    Inactivo
                                  </span>
                                )}
                              </td>
                              <td style={{ textAlign: 'right' }}>
                                <button 
                                  onClick={() => handleDeleteSystemUser(u.id, u.username)}
                                  disabled={u.id === user?.id}
                                  className="btn btn-secondary"
                                  style={{ color: u.id === user?.id ? '#cbd5e1' : '#ef4444', border: 'none', background: 'transparent', boxShadow: 'none' }}
                                >
                                  <Trash2 size={18} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {settingsTab === 'logs' && (
                  <motion.div 
                    key="logs"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '0', overflow: 'hidden' }}
                  >
                    <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.25rem' }}>Logs de Auditoría</h3>
                        <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Registro histórico de acciones realizadas en el sistema.</p>
                      </div>
                      <button onClick={fetchAuditLogs} className="btn btn-secondary">
                        <RefreshCcw size={18} />
                      </button>
                    </div>
                    <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                      <table>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' }}>
                          <tr>
                            <th>FECHA</th>
                            <th>ACCIÓN</th>
                            <th>RECURSO</th>
                            <th>DETALLES</th>
                          </tr>
                        </thead>
                        <tbody>
                          {auditLogs.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', padding: '4rem', color: '#94a3b8' }}>No hay registros de auditoría.</td></tr>
                          ) : auditLogs.map((log) => (
                            <tr key={log.id}>
                              <td style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.75rem' }}>
                                {new Date(log.created_at).toLocaleString()}
                              </td>
                              <td>
                                <span className="badge badge-primary" style={{ fontSize: '0.7rem' }}>{log.action}</span>
                              </td>
                              <td style={{ fontSize: '0.813rem' }}>{log.resource_type || '-'} {log.resource_id}</td>
                              <td style={{ color: '#475569', fontSize: '0.813rem' }}>{log.details}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}
      </main>

      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            style={{ 
              position: 'fixed', 
              bottom: '2rem', 
              right: '2rem', 
              zIndex: 1000,
              background: notification.type === 'success' ? '#ffffff' : '#fef2f2',
              color: notification.type === 'success' ? '#16a34a' : '#dc2626',
              padding: '1rem 1.25rem',
              borderRadius: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: `1px solid ${notification.type === 'success' ? '#dcfce7' : '#fee2e2'}`
            }}
          >
            {notification.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
            <span style={{ fontWeight: '600', fontSize: '0.875rem' }}>{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add User Modal */}
      {showAddModal && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 100
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card" 
            style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nuevo Usuario</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Configura una nueva cuenta de correo electrónico.</p>
            
            <form onSubmit={handleCreateUser}>
              <div className="input-group">
                <label>Email del usuario</label>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    className="input-control" 
                    placeholder="usuario"
                    style={{ paddingRight: '140px' }}
                    value={newUser.email}
                    onChange={e => setNewUser({...newUser, email: e.target.value})}
                    required
                  />
                  <span style={{ 
                    position: 'absolute', 
                    right: '1rem', 
                    color: '#94a3b8', 
                    fontSize: '0.875rem', 
                    fontWeight: '600',
                    pointerEvents: 'none',
                    background: '#f8fafc',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '0.5rem',
                    border: '1px solid #e2e8f0'
                  }}>
                    @mmbtransporte.com
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="input-control" 
                      placeholder="••••••••"
                      value={newUser.password}
                      onChange={e => setNewUser({...newUser, password: e.target.value})}
                      required
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ 
                        position: 'absolute', 
                        right: '0.75rem', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '0.5rem'
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label>Confirmar</label>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="input-control" 
                    placeholder="••••••••"
                    value={newUser.password_confirm}
                    onChange={e => setNewUser({...newUser, password_confirm: e.target.value})}
                    required
                  />
                </div>
              </div>
              <div style={{ display: 'none' }}>
                <input 
                  type="checkbox" 
                  id="restart" 
                  checked={true}
                  readOnly
                />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Creando...' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add System User Modal */}
      {showAddSystemUserModal && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 100
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card" 
            style={{ width: '100%', maxWidth: '500px', padding: '2.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nuevo Usuario de Acceso</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Crea una nueva cuenta para administrar el sistema.</p>
            
            <form onSubmit={handleCreateSystemUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Nombre de Usuario</label>
                  <input 
                    type="text" 
                    className="input-control" 
                    placeholder="admin"
                    value={newSystemUser.username}
                    onChange={e => setNewSystemUser({...newSystemUser, username: e.target.value})}
                    required
                  />
                </div>
                <div className="input-group">
                  <label>Nombre Completo</label>
                  <input 
                    type="text" 
                    className="input-control" 
                    placeholder="Juan Pérez"
                    value={newSystemUser.full_name}
                    onChange={e => setNewSystemUser({...newSystemUser, full_name: e.target.value})}
                  />
                </div>
              </div>

              <div className="input-group">
                <label>Correo Electrónico</label>
                <input 
                  type="email" 
                  className="input-control" 
                  placeholder="juan@ejemplo.com"
                  value={newSystemUser.email}
                  onChange={e => setNewSystemUser({...newSystemUser, email: e.target.value})}
                  required
                />
              </div>

              <div className="input-group">
                <label>Contraseña</label>
                <input 
                  type="password" 
                  className="input-control" 
                  placeholder="••••••••"
                  value={newSystemUser.password}
                  onChange={e => setNewSystemUser({...newSystemUser, password: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={newSystemUser.is_admin}
                    onChange={e => setNewSystemUser({...newSystemUser, is_admin: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Es Administrador</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={newSystemUser.is_active}
                    onChange={e => setNewSystemUser({...newSystemUser, is_active: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Activo</span>
                </label>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowAddSystemUserModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Creando...' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      {/* View User Modal */}
      {showViewModal && selectedMailUser && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 100
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card" 
            style={{ width: '100%', maxWidth: '540px', padding: '2.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Detalles del Buzón</h2>
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Información técnica de la cuenta de correo.</p>
              </div>
              <div style={{ 
                background: '#f0f9ff', 
                padding: '0.5rem 1rem', 
                borderRadius: '2rem', 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                border: '1px solid #e0f2fe'
              }}>
                <Mail size={16} style={{ color: '#0ea5e9' }} />
                <span style={{ fontWeight: '800', color: '#0369a1' }}>{selectedMailUser.email_count} correos</span>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div className="input-group">
                <label>Dirección de Correo</label>
                <div style={{ fontWeight: '700', color: '#1e293b', fontSize: '1.125rem', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                  {selectedMailUser.email}
                </div>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Peso del Buzón</label>
                  <div style={{ fontWeight: '800', color: '#1e293b', padding: '0.75rem 1rem', background: '#fffbeb', borderRadius: '0.75rem', border: '1px solid #fef3c7', color: '#92400e' }}>
                    {selectedMailUser.storage_size}
                  </div>
                </div>
                <div className="input-group">
                  <label>Cuota de Disco</label>
                  <div style={{ fontWeight: '600', color: '#475569', padding: '0.75rem 1rem', background: '#f8fafc', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
                    Ilimitado
                  </div>
                </div>
              </div>

              <div className="input-group">
                <label>Ruta de Almacenamiento (Home)</label>
                <code style={{ 
                  display: 'block',
                  padding: '1rem', 
                  background: '#1e293b', 
                  color: '#e2e8f0', 
                  borderRadius: '0.75rem',
                  fontSize: '0.813rem',
                  wordBreak: 'break-all',
                  fontFamily: 'JetBrains Mono, monospace'
                }}>
                  {selectedMailUser.home}
                </code>
              </div>
            </div>
            
            <div style={{ display: 'flex', marginTop: '2.5rem' }}>
              <button onClick={() => setShowViewModal(false)} className="btn btn-secondary" style={{ width: '100%' }}>Cerrar</button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedMailUser && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 100
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card" 
            style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Editar Contraseña</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>
              Cambiar la contraseña para <strong>{selectedMailUser.email}</strong>.
            </p>
            
            <form onSubmit={handleUpdateMailUserPassword}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="input-group">
                  <label>Nueva Contraseña</label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="input-control" 
                      placeholder="••••••••"
                      value={editPassword.password}
                      onChange={e => setEditPassword({...editPassword, password: e.target.value})}
                      required
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      style={{ 
                        position: 'absolute', 
                        right: '0.75rem', 
                        top: '50%', 
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: '#94a3b8',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '0.5rem'
                      }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>
                <div className="input-group">
                  <label>Confirmar</label>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="input-control" 
                    placeholder="••••••••"
                    value={editPassword.password_confirm}
                    onChange={e => setEditPassword({...editPassword, password_confirm: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#64748b', padding: '1rem', background: '#f8fafc', borderRadius: '0.75rem', marginBottom: '2rem', display: 'flex', gap: '0.5rem' }}>
                <RefreshCcw size={14} />
                <span>Los servicios se reiniciarán automáticamente al actualizar.</span>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEditModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Actualizando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
