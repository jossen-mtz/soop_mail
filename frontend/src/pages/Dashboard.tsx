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
  Shield,
  Activity,
  Database,
  Edit2,
  Terminal,
  Share2,
  Save,
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
  status: string;
}

const Dashboard: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mailUsers, setMailUsers] = useState<MailUser[]>([]);
  const [systemUsers, setSystemUsers] = useState<any[]>([]);
  const [aliases, setAliases] = useState<any[]>([]);
  const [forwardingRules, setForwardingRules] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [systemStatus, setSystemStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUser, setNewUser] = useState({ 
    email: '', 
    password: '', 
    password_confirm: '', 
    status: 'active',
    restart_soop_mail: true 
  });
  const [showAddAliasModal, setShowAddAliasModal] = useState(false);
  const [newAlias, setNewAlias] = useState({ email: '', destinations: '', is_dynamic: false });
  const [recipientSearch, setRecipientSearch] = useState('');
  const [showRecipientList, setShowRecipientList] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMailUser, setSelectedMailUser] = useState<MailUser | null>(null);
  const [editMailUserData, setEditMailUserData] = useState({
    password: '',
    password_confirm: '',
    status: 'active',
    restart_soop_mail: true
  });
  
  const activeTab = location.pathname === '/configuracion' ? 'settings' : 'users';
  
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
  
  const [showEditSystemUserModal, setShowEditSystemUserModal] = useState(false);
  const [editingSystemUser, setEditingSystemUser] = useState<any>(null);
  const [editSystemUserData, setEditSystemUserData] = useState({
    email: '',
    full_name: '',
    password: '',
    is_admin: false,
    is_active: true
  });

  const [profileForm, setProfileForm] = useState({
    email: user?.email || '',
    full_name: user?.full_name || ''
  });
  
  const [settingsTab, setSettingsTab] = useState<'profile' | 'server' | 'users' | 'logs' | 'mail-logs' | 'aliases' | 'forwarding' | 'auth-console'>('profile');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authConsoleLogs, setAuthConsoleLogs] = useState<string[]>([]);
  const [isStreamingAuth, setIsStreamingAuth] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'general' | 'auth'>('general');
  const [userAuthLogs, setUserAuthLogs] = useState<string[]>([]);
  const [mailLogs, setMailLogs] = useState<any>(null);

  const [deleteConfig, setDeleteConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const fetchMailLogs = async () => {
    try {
      const response = await api.get('/api/system/logs/mail');
      setMailLogs(response.data);
    } catch (error) {
      console.error('Error fetching mail logs:', error);
      showNotification('Error al cargar logs de correo', 'error');
    }
  };

  const fetchAuthLogs = async (email?: string) => {
    try {
      const url = email 
        ? `/api/system/logs/mail/auth?email=${email}&lines=50`
        : '/api/system/logs/mail/auth?lines=100';
      const response = await api.get(url);
      if (email) {
        setUserAuthLogs(response.data.logs);
      } else {
        setAuthConsoleLogs(response.data.logs);
      }
    } catch (error) {
      console.error('Error fetching auth logs:', error);
    }
  };

  useEffect(() => {
    let interval: any;
    if (settingsTab === 'auth-console' && isStreamingAuth) {
      fetchAuthLogs();
      interval = setInterval(fetchAuthLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [settingsTab, isStreamingAuth]);

  useEffect(() => {
    let interval: any;
    if (showViewModal && selectedMailUser && detailsTab === 'auth') {
      fetchAuthLogs(selectedMailUser.email);
      interval = setInterval(() => fetchAuthLogs(selectedMailUser.email), 5000);
    }
    return () => clearInterval(interval);
  }, [showViewModal, selectedMailUser, detailsTab]);

  const fetchMailAliases = async () => {
    try {
      const response = await api.get('/api/mail/aliases');
      setAliases(response.data);
    } catch (err) {
      console.error('Error fetching aliases:', err);
      showNotification('Error al cargar alias', 'error');
    }
  };

  const fetchForwardingRules = async () => {
    try {
      const response = await api.get('/api/mail/forwarding');
      setForwardingRules(response.data);
    } catch (err) {
      console.error('Error fetching forwarding rules:', err);
      showNotification('Error al cargar reglas de reenvío', 'error');
    }
  };

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

  const handlePurgeMailbox = async (email: string) => {
    setDeleteConfig({
      title: '¿Vaciar buzón de correo?',
      message: `Esta acción eliminará TODOS los correos de ${email}. Esta acción es irreversible y no se podrá recuperar la información.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          const response = await api.post(`/api/mail/users/${email}/purge`);
          showNotification(response.data.message, 'success');
          fetchMailUsers();
          setShowViewModal(false);
        } catch (err: any) {
          showNotification(err.response?.data?.detail || 'Error al vaciar buzón', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
  };

  const [showAddForwardingModal, setShowAddForwardingModal] = useState(false);
  const [newForwarding, setNewForwarding] = useState({ email: '', target: '' });

  const handleCreateForwardingRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post('/api/mail/forwarding', newForwarding);
      showNotification('Regla de reenvío creada', 'success');
      setShowAddForwardingModal(false);
      setNewForwarding({ email: '', target: '' });
      fetchForwardingRules();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al crear regla', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteForwardingRule = (email: string) => {
    setDeleteConfig({
      title: 'Eliminar Regla de Reenvío',
      message: `¿Estás seguro de eliminar el reenvío de ${email}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/mail/forwarding/${email}`);
          showNotification('Regla eliminada', 'success');
          fetchForwardingRules();
        } catch (err) {
          showNotification('Error al eliminar regla', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
  };

  const handleCreateAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        email: newAlias.email,
        destinations: newAlias.is_dynamic ? [] : newAlias.destinations.split(',').map(d => d.trim()).filter(d => d),
        is_dynamic: newAlias.is_dynamic
      };
      await api.post('/api/mail/aliases', payload);
      showNotification('Alias creado con éxito', 'success');
      setShowAddAliasModal(false);
      setNewAlias({ email: '', destinations: '', is_dynamic: false });
      fetchMailAliases();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al crear alias', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteAlias = async (email: string) => {
    setDeleteConfig({
      title: 'Eliminar Alias Virtual',
      message: `¿Estás seguro de eliminar el alias ${email}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/mail/aliases/${email}`);
          showNotification('Alias eliminado', 'success');
          fetchMailAliases();
        } catch (err) {
          showNotification('Error al eliminar alias', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
  };

  const [autoResponder, setAutoResponder] = useState<any>(null);

  const fetchAutoResponder = async (email: string) => {
    try {
      const response = await api.get(`/api/mail/users/${email}/auto-responder`);
      setAutoResponder(response.data);
    } catch (err) {
      console.error('Error fetching auto-responder', err);
    }
  };

  const handleToggleAutoResponder = async () => {
    if (!selectedMailUser || !autoResponder) return;
    try {
      const response = await api.put(`/api/mail/users/${selectedMailUser.email}/auto-responder`, {
        active: !autoResponder.active
      });
      setAutoResponder(response.data);
      showNotification(`Auto-respondedor ${!autoResponder.active ? 'activado' : 'desactivado'}`, 'success');
    } catch (err) {
      showNotification('Error al cambiar estado del auto-respondedor', 'error');
    }
  };

  const handleSaveAutoResponder = async () => {
    if (!selectedMailUser || !autoResponder) return;
    setActionLoading(true);
    try {
      const response = await api.put(`/api/mail/users/${selectedMailUser.email}/auto-responder`, {
        subject: autoResponder.subject,
        body: autoResponder.body
      });
      setAutoResponder(response.data);
      showNotification('Configuración guardada', 'success');
    } catch (err) {
      showNotification('Error al guardar configuración', 'error');
    } finally {
      setActionLoading(false);
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
    if (activeTab === 'settings') {
      if (settingsTab === 'logs') fetchAuditLogs();
      if (settingsTab === 'server') fetchSystemStatus();
      if (settingsTab === 'users' && user?.is_admin) fetchSystemUsers();
      if (settingsTab === 'mail-logs') fetchMailLogs();
      if (settingsTab === 'aliases') fetchMailAliases();
      if (settingsTab === 'forwarding') fetchForwardingRules();
    }
  }, [activeTab, settingsTab]);

  useEffect(() => {
    fetchMailUsers();
    if (user?.is_admin) {
      fetchSystemUsers();
      fetchAuditLogs();
    }
    fetchMailAliases();
    fetchForwardingRules();
    fetchSystemStatus();
    if (activeTab === 'settings') {
      document.title = 'Configuración | soop MAIL';
      setProfileForm({
        email: user?.email || '',
        full_name: user?.full_name || ''
      });
    } else {
      document.title = 'Usuarios | soop MAIL';
    }
  }, [activeTab, user]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleGeneratePassword = async (target: 'new' | 'edit' | 'profile' | 'system-new' | 'system-edit') => {
    try {
      const response = await api.get('/api/system/utils/generate-password');
      const pwd = response.data.password;
      
      if (target === 'new') {
        setNewUser(prev => ({ ...prev, password: pwd, password_confirm: pwd }));
      } else if (target === 'edit') {
        setEditMailUserData(prev => ({ ...prev, password: pwd, password_confirm: pwd }));
      } else if (target === 'profile') {
        setPasswordForm(prev => ({ ...prev, new_password: pwd, confirm_password: pwd }));
      } else if (target === 'system-new') {
        setNewSystemUser(prev => ({ ...prev, password: pwd }));
      } else if (target === 'system-edit') {
        setEditSystemUserData(prev => ({ ...prev, password: pwd }));
      }
      
      showNotification('Contraseña segura generada', 'success');
    } catch (err) {
      showNotification('Error al generar contraseña', 'error');
    }
  };

  const handleUpdateMailUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMailUser) return;
    setActionLoading(true);
    try {
      const payload: any = { 
        status: editMailUserData.status,
        restart_soop_mail: true
      };
      if (editMailUserData.password) {
        payload.password = editMailUserData.password;
        payload.password_confirm = editMailUserData.password_confirm;
      }
      
      await api.put(`/api/mail/users/${selectedMailUser.email}`, payload);
      showNotification('Usuario actualizado exitosamente', 'success');
      setShowEditModal(false);
      setEditMailUserData({ password: '', password_confirm: '', status: 'active', restart_soop_mail: true });
      fetchMailUsers();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al actualizar usuario', 'error');
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
        restart_soop_mail: true
      };

      await api.post('/api/mail/users', payload);
      showNotification('Usuario creado exitosamente', 'success');
      setShowAddModal(false);
      setNewUser({ email: '', password: '', password_confirm: '', status: 'active', restart_soop_mail: true });
      fetchMailUsers();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al crear usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteUser = (email: string) => {
    setDeleteConfig({
      title: 'Eliminar Usuario de Correo',
      message: `¿Estás seguro de eliminar el usuario ${email}? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/mail/users/${email}`);
          showNotification('Usuario eliminado', 'success');
          fetchMailUsers();
        } catch (err) {
          showNotification('Error al eliminar usuario', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
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

  const handleUpdateSystemUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSystemUser) return;
    setActionLoading(true);
    try {
      const payload: any = { ...editSystemUserData };
      if (!payload.password) delete payload.password;
      
      await api.put(`/api/system/users/${editingSystemUser.id}`, payload);
      showNotification('Usuario actualizado exitosamente', 'success');
      setShowEditSystemUserModal(false);
      fetchSystemUsers();
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al actualizar usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.put('/api/auth/me', profileForm);
      showNotification('Perfil actualizado exitosamente', 'success');
    } catch (err: any) {
      showNotification(err.response?.data?.detail || 'Error al actualizar perfil', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSystemUser = (id: number, username: string) => {
    if (id === user?.id) {
      showNotification('No puedes eliminar tu propia cuenta', 'error');
      return;
    }
    setDeleteConfig({
      title: 'Eliminar Acceso al Sistema',
      message: `¿Estás seguro de eliminar el acceso de ${username}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/system/users/${id}`);
          showNotification('Usuario eliminado', 'success');
          fetchSystemUsers();
        } catch (err) {
          showNotification('Error al eliminar usuario', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
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

  const filteredUsers = mailUsers.filter(u => {
    return u.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

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
                <div style={{ display: 'flex', gap: '1rem', flex: 1, flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative', width: '280px' }}>
                    <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input 
                      type="text" 
                      placeholder="Email..." 
                      className="input-control"
                      style={{ paddingLeft: '2.75rem', background: '#f8fafc' }}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
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
                      <th>ESTADO</th>
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
                          <span style={{ 
                            padding: '0.25rem 0.625rem', 
                            borderRadius: '2rem', 
                            fontSize: '0.75rem', 
                            fontWeight: '700',
                            textTransform: 'uppercase',
                            background: u.status === 'suspended' ? '#fef2f2' : u.status === 'read-only' ? '#fffbeb' : '#f0fdf4',
                            color: u.status === 'suspended' ? '#991b1b' : u.status === 'read-only' ? '#92400e' : '#166534',
                            border: `1px solid ${u.status === 'suspended' ? '#fee2e2' : u.status === 'read-only' ? '#fef3c7' : '#dcfce7'}`
                          }}>
                            {u.status === 'active' ? 'Activo' : u.status === 'suspended' ? 'Suspendido' : 'Solo Lectura'}
                          </span>
                        </td>
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
                              onClick={() => { 
                                setSelectedMailUser(u); 
                                setShowViewModal(true); 
                                fetchAutoResponder(u.email);
                              }}
                              className="btn btn-secondary" 
                              style={{ color: '#6366f1', padding: '0.5rem', border: 'none', background: 'transparent', boxShadow: 'none' }}
                              title="Ver detalles"
                            >
                              <Eye size={18} />
                            </button>
                            <button 
                              onClick={() => { 
                                setSelectedMailUser(u); 
                                setEditMailUserData({ 
                                  password: '', 
                                  password_confirm: '', 
                                  status: u.status || 'active', 
                                  restart_soop_mail: true 
                                }); 
                                setShowEditModal(true); 
                              }}
                              className="btn btn-secondary" 
                              style={{ color: '#f59e0b', padding: '0.5rem', border: 'none', background: 'transparent', boxShadow: 'none' }}
                              title="Editar usuario"
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
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Configuración</h1>
              <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Administra el sistema y revisa el estado del servidor.</p>
            </header>

            {/* Sub Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '2rem', overflowX: 'auto' }}>
              <button 
                onClick={() => setSettingsTab('profile')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'profile' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'profile' ? '#4f46e5' : '#64748b',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Mi Perfil
              </button>
              <button 
                onClick={() => setSettingsTab('server')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'server' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'server' ? '#4f46e5' : '#64748b',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Servidor
              </button>
              <button 
                onClick={() => setSettingsTab('aliases')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'aliases' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'aliases' ? '#4f46e5' : '#64748b',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Alias y Listas
              </button>
              <button 
                onClick={() => setSettingsTab('forwarding')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'forwarding' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'forwarding' ? '#4f46e5' : '#64748b',
                  fontWeight: '600',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                Reenvíos (BCC)
              </button>
              {user?.is_admin && (
                <>
                  <button 
                    onClick={() => setSettingsTab('users')}
                    style={{ 
                      padding: '1rem 1.5rem', 
                      borderBottom: settingsTab === 'users' ? '2px solid #4f46e5' : '2px solid transparent',
                      color: settingsTab === 'users' ? '#4f46e5' : '#64748b',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Accesos
                  </button>
                  <button 
                    onClick={() => setSettingsTab('logs')}
                    style={{ 
                      padding: '1rem 1.5rem', 
                      borderBottom: settingsTab === 'logs' ? '2px solid #4f46e5' : '2px solid transparent',
                      color: settingsTab === 'logs' ? '#4f46e5' : '#64748b',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Auditoría
                  </button>
                  <button 
                    onClick={() => setSettingsTab('mail-logs')}
                    style={{ 
                      padding: '1rem 1.5rem', 
                      borderBottom: settingsTab === 'mail-logs' ? '2px solid #4f46e5' : '2px solid transparent',
                      color: settingsTab === 'mail-logs' ? '#4f46e5' : '#64748b',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Logs Mail
                  </button>
                  <button 
                    onClick={() => setSettingsTab('auth-console')}
                    style={{ 
                      padding: '1rem 1.5rem', 
                      borderBottom: settingsTab === 'auth-console' ? '2px solid #4f46e5' : '2px solid transparent',
                      color: settingsTab === 'auth-console' ? '#4f46e5' : '#64748b',
                      fontWeight: '600',
                      fontSize: '0.875rem',
                      background: 'none',
                      borderTop: 'none',
                      borderLeft: 'none',
                      borderRight: 'none',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Consola Auth
                  </button>
                </>
              )}
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
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>Perfil de Usuario</h3>
                      <p style={{ color: '#64748b', fontSize: '0.875rem' }}>Administra tu información personal y configuración de acceso.</p>
                    </div>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2.5rem' }}>
                      <div style={{ borderRight: '1px solid #f1f5f9', paddingRight: '2.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Users size={18} style={{ color: '#4f46e5' }} />
                          Datos Personales
                        </h4>
                        <form onSubmit={handleUpdateProfile}>
                          <div className="input-group">
                            <label>Nombre Completo</label>
                            <input 
                              type="text" 
                              className="input-control" 
                              value={profileForm.full_name}
                              onChange={e => setProfileForm({...profileForm, full_name: e.target.value})}
                              required
                            />
                          </div>
                          <div className="input-group">
                            <label>Correo Electrónico</label>
                            <input 
                              type="email" 
                              className="input-control" 
                              value={profileForm.email}
                              onChange={e => setProfileForm({...profileForm, email: e.target.value})}
                              required
                            />
                          </div>
                          <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                            {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
                          </button>
                        </form>
                      </div>

                      <div>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Shield size={18} style={{ color: '#4f46e5' }} />
                          Cambiar Contraseña
                        </h4>
                        <form onSubmit={handleChangePassword}>
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
                          <div className="input-group">
                            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                              Nueva Contraseña
                              <button 
                                type="button" 
                                onClick={() => handleGeneratePassword('profile')}
                                style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                              >
                                Generar segura
                              </button>
                            </label>
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
                          <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                            {actionLoading ? 'Actualizar Contraseña' : 'Actualizar Contraseña'}
                          </button>
                        </form>
                      </div>
                    </div>
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
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                  <button 
                                    onClick={() => {
                                      setEditingSystemUser(u);
                                      setEditSystemUserData({
                                        email: u.email,
                                        full_name: u.full_name || '',
                                        password: '',
                                        is_admin: u.is_admin,
                                        is_active: u.is_active
                                      });
                                      setShowEditSystemUserModal(true);
                                    }}
                                    className="btn btn-secondary"
                                    style={{ color: '#f59e0b', border: 'none', background: 'transparent', boxShadow: 'none' }}
                                  >
                                    <Edit2 size={18} />
                                  </button>
                                  <button 
                                    onClick={() => handleDeleteSystemUser(u.id, u.username)}
                                    disabled={u.id === user?.id}
                                    className="btn btn-secondary"
                                    style={{ color: u.id === user?.id ? '#cbd5e1' : '#ef4444', border: 'none', background: 'transparent', boxShadow: 'none' }}
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

                {settingsTab === 'mail-logs' && (
                  <motion.div 
                    key="mail-logs"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '0', overflow: 'hidden', background: '#0f172a', border: '1px solid #1e293b' }}
                  >
                    <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Terminal size={18} style={{ color: '#818cf8' }} />
                        <div>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.125rem' }}>Logs del Servidor de Correo</h3>
                          <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>{mailLogs?.path || 'Visor de /var/log/mail.log'}</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={fetchMailLogs} className="btn" style={{ background: '#1e293b', color: '#f8fafc', border: 'none', padding: '0.5rem' }}>
                          <RefreshCcw size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ 
                      maxHeight: '600px', 
                      overflowY: 'auto', 
                      padding: '1.5rem', 
                      fontFamily: '"Fira Code", "Source Code Pro", monospace',
                      fontSize: '0.813rem',
                      lineHeight: '1.5',
                      color: '#cbd5e1'
                    }}>
                      {!mailLogs ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>Cargando logs...</div>
                      ) : mailLogs.logs.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No hay registros disponibles.</div>
                      ) : mailLogs.logs.map((line: string, idx: number) => (
                        <div key={idx} style={{ 
                          padding: '0.125rem 0', 
                          borderBottom: '1px solid #1e293b40',
                          display: 'flex',
                          gap: '1rem'
                        }}>
                          <span style={{ color: '#475569', userSelect: 'none', minWidth: '2rem', textAlign: 'right' }}>{idx + 1}</span>
                          <span style={{ 
                            color: line.includes('error') || line.includes('fatal') || line.includes('reject') ? '#f87171' : 
                                   line.includes('warning') ? '#fbbf24' : 
                                   line.includes('connect from') ? '#60a5fa' : '#cbd5e1' 
                          }}>
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {settingsTab === 'auth-console' && (
                  <motion.div 
                    key="auth-console"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '0', overflow: 'hidden', background: '#0f172a', border: '1px solid #1e293b' }}
                  >
                    <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Terminal size={18} style={{ color: '#10b981' }} />
                        <div>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#f8fafc', marginBottom: '0.125rem' }}>Consola de Autenticación</h3>
                          <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Monitoreo en tiempo real de inicios de sesión y accesos SMTP/IMAP.</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginRight: '1rem' }}>
                          <div style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            background: isStreamingAuth ? '#10b981' : '#64748b',
                            boxShadow: isStreamingAuth ? '0 0 8px #10b981' : 'none'
                          }}></div>
                          <span style={{ fontSize: '0.75rem', color: isStreamingAuth ? '#10b981' : '#94a3b8', fontWeight: '700' }}>
                            {isStreamingAuth ? 'LIVE' : 'DETENIDO'}
                          </span>
                        </div>
                        <button 
                          onClick={() => setIsStreamingAuth(!isStreamingAuth)} 
                          className="btn" 
                          style={{ 
                            background: isStreamingAuth ? '#ef4444' : '#10b981', 
                            color: '#fff', 
                            border: 'none', 
                            padding: '0.375rem 0.75rem', 
                            fontSize: '0.75rem',
                            fontWeight: '700'
                          }}
                        >
                          {isStreamingAuth ? 'Detener' : 'Iniciar'}
                        </button>
                        <button onClick={() => fetchAuthLogs()} className="btn" style={{ background: '#1e293b', color: '#f8fafc', border: 'none', padding: '0.5rem' }}>
                          <RefreshCcw size={16} />
                        </button>
                      </div>
                    </div>
                    <div style={{ 
                      maxHeight: '600px', 
                      overflowY: 'auto', 
                      padding: '1.5rem', 
                      fontFamily: '"Fira Code", "Source Code Pro", monospace',
                      fontSize: '0.813rem',
                      lineHeight: '1.5',
                      color: '#cbd5e1'
                    }}>
                      {authConsoleLogs.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>No hay registros disponibles.</div>
                      ) : authConsoleLogs.map((line, idx) => (
                        <div key={idx} style={{ 
                          padding: '0.125rem 0', 
                          borderBottom: '1px solid #1e293b40',
                          display: 'flex',
                          gap: '1rem'
                        }}>
                          <span style={{ color: '#475569', userSelect: 'none', minWidth: '2rem', textAlign: 'right' }}>{idx + 1}</span>
                          <span style={{ 
                            color: line.includes('password verification failed') || line.includes('authentication failed') ? '#f87171' : 
                                   line.includes('Login:') ? '#10b981' : '#cbd5e1' 
                          }}>
                            {line}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {settingsTab === 'forwarding' && (
                  <motion.div 
                    key="forwarding"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '2rem' }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Reglas de Reenvío (BCC)</h3>
                          <p style={{ fontSize: '0.813rem', color: '#64748b' }}>Copia oculta de correos salientes para supervisión.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddForwardingModal(true)}>
                          <Plus size={16} />
                          Nueva Regla
                        </button>
                      </div>
                      <div className="table-container">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Emisor</th>
                              <th>Copiar a</th>
                              <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forwardingRules.map((rule, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: '600' }}>{rule.email}</td>
                                <td>{rule.target}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button 
                                    className="btn-icon" 
                                    style={{ color: '#ef4444' }}
                                    onClick={() => handleDeleteForwardingRule(rule.email)}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {forwardingRules.length === 0 && (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                  No hay reglas de reenvío configuradas.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </motion.div>
                )}

                {settingsTab === 'aliases' && (
                  <motion.div 
                    key="aliases"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="card" 
                    style={{ padding: '2rem' }}
                  >
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Alias y Listas</h3>
                          <p style={{ fontSize: '0.813rem', color: '#64748b' }}>Direcciones virtuales y grupos de distribución.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddAliasModal(true)}>
                          <Plus size={16} />
                          Nuevo Alias
                        </button>
                      </div>

                      <div style={{ overflowX: 'auto', border: '1px solid #f1f5f9', borderRadius: '1rem' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>DIRECCIÓN VIRTUAL</th>
                              <th>DESTINATARIOS</th>
                              <th style={{ textAlign: 'right' }}>ACCIONES</th>
                            </tr>
                          </thead>
                          <tbody>
                            {aliases.length === 0 ? (
                              <tr><td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>No se han configurado alias.</td></tr>
                            ) : aliases.map((alias) => (
                              <tr key={alias.email}>
                                <td>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Share2 size={16} style={{ color: '#6366f1' }} />
                                    <span style={{ fontWeight: '700', color: '#1e293b' }}>{alias.email}</span>
                                  </div>
                                </td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {alias.destinations.map((dest: string) => (
                                      <span key={dest} className="badge badge-secondary" style={{ fontSize: '0.75rem' }}>{dest}</span>
                                    ))}
                                  </div>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button 
                                    onClick={() => handleDeleteAlias(alias.email)}
                                    className="btn btn-secondary"
                                    style={{ color: '#ef4444', border: 'none', background: 'transparent', boxShadow: 'none' }}
                                  >
                                    <Trash2 size={18} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Contraseña
                    <button 
                      type="button" 
                      onClick={() => handleGeneratePassword('new')}
                      style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Generar segura
                    </button>
                  </label>
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
                <div className="input-group" style={{ marginBottom: '1rem' }}>
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

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Estado de Cuenta</label>
                  <select 
                    className="input-control" 
                    value={newUser.status}
                    onChange={e => setNewUser({...newUser, status: e.target.value})}
                  >
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="read-only">Solo Lectura</option>
                  </select>
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
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Contraseña
                  <button 
                    type="button" 
                    onClick={() => handleGeneratePassword('system-new')}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Generar segura
                  </button>
                </label>
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
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <button 
                onClick={() => setDetailsTab('general')}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: detailsTab === 'general' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: detailsTab === 'general' ? '#4f46e5' : '#64748b',
                  fontWeight: '700',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer'
                }}
              >
                General
              </button>
              <button 
                onClick={() => setDetailsTab('auth')}
                style={{
                  padding: '0.75rem 1rem',
                  borderBottom: detailsTab === 'auth' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: detailsTab === 'auth' ? '#4f46e5' : '#64748b',
                  fontWeight: '700',
                  fontSize: '0.875rem',
                  background: 'none',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                  cursor: 'pointer'
                }}
              >
                Historial Autenticación
              </button>
            </div>

            {detailsTab === 'general' ? (
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
                  <div style={{ fontWeight: '800', padding: '0.75rem 1rem', background: '#fffbeb', borderRadius: '0.75rem', border: '1px solid #fef3c7', color: '#92400e' }}>
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

              <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '1.5rem', marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 style={{ fontSize: '0.875rem', fontWeight: '700', color: '#1e293b' }}>Auto-respondedor (Vacaciones)</h4>
                  <button 
                    onClick={() => handleToggleAutoResponder()}
                    className={`btn ${autoResponder?.active ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
                  >
                    {autoResponder?.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
                
                {autoResponder?.active && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: '#f8fafc', borderRadius: '1rem', border: '1px solid #e2e8f0' }}>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.7rem' }}>Asunto</label>
                      <input 
                        type="text" 
                        className="input-control" 
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.813rem' }}
                        value={autoResponder.subject || ''}
                        onChange={e => setAutoResponder({...autoResponder, subject: e.target.value})}
                      />
                    </div>
                    <div className="input-group" style={{ marginBottom: 0 }}>
                      <label style={{ fontSize: '0.7rem' }}>Mensaje</label>
                      <textarea 
                        className="input-control" 
                        style={{ padding: '0.5rem 0.75rem', fontSize: '0.813rem', minHeight: '80px' }}
                        value={autoResponder.body || ''}
                        onChange={e => setAutoResponder({...autoResponder, body: e.target.value})}
                      />
                    </div>
                    <button 
                      onClick={handleSaveAutoResponder}
                      className="btn btn-primary"
                      style={{ padding: '0.5rem', fontSize: '0.75rem', alignSelf: 'flex-end' }}
                      disabled={actionLoading}
                    >
                      <Save size={14} />
                      {actionLoading ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                  </div>
                )}
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
            ) : (
              <div style={{ 
                background: '#0f172a', 
                borderRadius: '0.75rem', 
                padding: '1rem', 
                minHeight: '300px', 
                maxHeight: '400px', 
                overflowY: 'auto',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.75rem'
              }}>
                {userAuthLogs.length > 0 ? (
                  userAuthLogs.map((log, index) => (
                    <div key={index} style={{ color: '#e2e8f0', marginBottom: '0.25rem', borderBottom: '1px solid #1e293b', paddingBottom: '0.25rem' }}>
                      <span style={{ color: '#94a3b8' }}>[{new Date().toLocaleTimeString()}]</span> {log}
                    </div>
                  ))
                ) : (
                  <div style={{ color: '#64748b', textAlign: 'center', marginTop: '2rem' }}>
                    No hay eventos de autenticación recientes.
                  </div>
                )}
              </div>
            )}
            
            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
              <button 
                onClick={() => handlePurgeMailbox(selectedMailUser.email)} 
                className="btn btn-secondary" 
                style={{ 
                  flex: 1, 
                  background: '#fff1f2', 
                  color: '#be123c', 
                  borderColor: '#fecdd3',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem'
                }}
              >
                <Trash2 size={16} />
                Vaciar Buzón
              </button>
              <button onClick={() => setShowViewModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cerrar</button>
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
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Editar Usuario</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>
              Cambiar la contraseña para <strong>{selectedMailUser.email}</strong>.
            </p>
            
            <form onSubmit={handleUpdateMailUser}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', alignItems: 'flex-end' }}>
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                    Nueva Contraseña
                    <button 
                      type="button" 
                      onClick={() => handleGeneratePassword('edit')}
                      style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Generar segura
                    </button>
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input 
                      type={showPassword ? "text" : "password"} 
                      className="input-control" 
                      placeholder="Dejar vacío para no cambiar"
                      value={editMailUserData.password}
                      onChange={e => setEditMailUserData({...editMailUserData, password: e.target.value})}
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
                <div className="input-group" style={{ marginBottom: '1rem' }}>
                  <label>Confirmar</label>
                  <input 
                    type={showPassword ? "text" : "password"} 
                    className="input-control" 
                    placeholder="Dejar vacío para no cambiar"
                    value={editMailUserData.password_confirm}
                    onChange={e => setEditMailUserData({...editMailUserData, password_confirm: e.target.value})}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="input-group" style={{ marginBottom: 0 }}>
                  <label>Estado de Cuenta</label>
                  <select 
                    className="input-control" 
                    value={editMailUserData.status}
                    onChange={e => setEditMailUserData({...editMailUserData, status: e.target.value})}
                  >
                    <option value="active">Activo</option>
                    <option value="suspended">Suspendido</option>
                    <option value="read-only">Solo Lectura</option>
                  </select>
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && deleteConfig && (
        <div style={{ 
          position: 'fixed', 
          inset: 0, 
          background: 'rgba(15, 23, 42, 0.4)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            className="card" 
            style={{ width: '100%', maxWidth: '400px', padding: '2rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', textAlign: 'center' }}
          >
            <div style={{ 
              background: '#fee2e2', 
              width: '64px', 
              height: '64px', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              margin: '0 auto 1.5rem',
              color: '#ef4444'
            }}>
              <Trash2 size={32} />
            </div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '0.75rem', color: '#1e293b' }}>{deleteConfig.title}</h2>
            <p style={{ color: '#64748b', fontSize: '0.938rem', marginBottom: '2rem', lineHeight: '1.5' }}>
              {deleteConfig.message}
            </p>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <button 
                type="button" 
                onClick={() => setShowDeleteConfirm(false)} 
                className="btn btn-secondary"
                style={{ width: '100%' }}
              >
                Cancelar
              </button>
              <button 
                type="button" 
                onClick={deleteConfig.onConfirm} 
                className="btn btn-primary"
                style={{ width: '100%', background: '#ef4444', borderColor: '#ef4444' }}
                disabled={actionLoading}
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit System User Modal */}
      {showEditSystemUserModal && editingSystemUser && (
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
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Editar Acceso</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Editando configuración para <strong>{editingSystemUser.username}</strong>.</p>
            
            <form onSubmit={handleUpdateSystemUser}>
              <div className="input-group">
                <label>Nombre Completo</label>
                <input 
                  type="text" 
                  className="input-control" 
                  value={editSystemUserData.full_name}
                  onChange={e => setEditSystemUserData({...editSystemUserData, full_name: e.target.value})}
                />
              </div>

              <div className="input-group">
                <label>Correo Electrónico</label>
                <input 
                  type="email" 
                  className="input-control" 
                  value={editSystemUserData.email}
                  onChange={e => setEditSystemUserData({...editSystemUserData, email: e.target.value})}
                  required
                />
              </div>

              <div className="input-group">
                <label style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Nueva Contraseña (dejar en blanco para no cambiar)
                  <button 
                    type="button" 
                    onClick={() => handleGeneratePassword('system-edit')}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Generar segura
                  </button>
                </label>
                <input 
                  type="password" 
                  className="input-control" 
                  placeholder="••••••••"
                  value={editSystemUserData.password}
                  onChange={e => setEditSystemUserData({...editSystemUserData, password: e.target.value})}
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={editSystemUserData.is_admin}
                    onChange={e => setEditSystemUserData({...editSystemUserData, is_admin: e.target.checked})}
                    disabled={editingSystemUser.id === user?.id}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Es Administrador</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={editSystemUserData.is_active}
                    onChange={e => setEditSystemUserData({...editSystemUserData, is_active: e.target.checked})}
                    disabled={editingSystemUser.id === user?.id}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Activo</span>
                </label>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowEditSystemUserModal(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                  {actionLoading ? 'Actualizando...' : 'Actualizar Usuario'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Alias Modal */}
      {showAddAliasModal && (
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
            style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', border: 'none' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nuevo Alias</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Dirección virtual que redirige correos.</p>
            
            <form onSubmit={handleCreateAlias}>
              <div className="input-group" style={{ position: 'relative' }}>
                <label>Email Virtual</label>
                <input 
                  type="email" 
                  className="input-control" 
                  placeholder="ventas@mmbtransporte.com"
                  value={newAlias.email}
                  onChange={e => setNewAlias({...newAlias, email: e.target.value})}
                  required
                  list="existing-aliases"
                />
                <datalist id="existing-aliases">
                  {aliases.map(a => (
                    <option key={a.email} value={a.email} />
                  ))}
                </datalist>
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  Sugerencia: Evita duplicar alias existentes.
                </p>
              </div>
              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ marginBottom: 0 }}>Destinatarios (separados por coma)</label>
                  <button 
                    type="button" 
                    onClick={() => setShowRecipientList(!showRecipientList)}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Users size={14} />
                    {showRecipientList ? 'Ocultar sugerencias' : 'Ver sugerencias'}
                  </button>
                </div>
                
                <textarea 
                  className="input-control" 
                  placeholder="real1@mmbtransporte.com, real2@gmail.com"
                  style={{ minHeight: '80px', padding: '0.75rem', fontSize: '0.875rem' }}
                  value={newAlias.destinations}
                  onChange={e => setNewAlias({...newAlias, destinations: e.target.value})}
                  required={!newAlias.is_dynamic}
                  disabled={newAlias.is_dynamic}
                />

                {showRecipientList && !newAlias.is_dynamic && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    background: '#f8fafc', 
                    borderRadius: '0.75rem', 
                    border: '1px solid #e2e8f0',
                    padding: '0.75rem'
                  }}>
                    <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
                      <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                      <input 
                        type="text" 
                        placeholder="Buscar destinatario..."
                        style={{ width: '100%', padding: '0.4rem 0.75rem 0.4rem 2.25rem', fontSize: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                        value={recipientSearch}
                        onChange={e => setRecipientSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: '120px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {mailUsers
                        .filter(u => u.email.toLowerCase().includes(recipientSearch.toLowerCase()))
                        .map(u => (
                          <button
                            key={u.email}
                            type="button"
                            onClick={() => {
                              const current = newAlias.destinations.trim();
                              const updated = current ? `${current}, ${u.email}` : u.email;
                              setNewAlias({...newAlias, destinations: updated});
                            }}
                            style={{ 
                              padding: '0.25rem 0.5rem', 
                              fontSize: '0.75rem', 
                              background: '#ffffff', 
                              border: '1px solid #e2e8f0', 
                              borderRadius: '0.4rem',
                              cursor: 'pointer',
                              color: '#475569',
                              transition: 'all 0.2s'
                            }}
                            onMouseOver={e => (e.currentTarget.style.borderColor = '#4f46e5')}
                            onMouseOut={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                          >
                            {u.email.split('@')[0]}
                          </button>
                        ))
                      }
                    </div>
                  </div>
                )}
                
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                  {newAlias.is_dynamic ? 'Al ser dinámica, incluirá automáticamente a todos los buzones activos.' : 'Selecciona buzones locales de la lista o escribe correos externos.'}
                </p>
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '2rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={newAlias.is_dynamic}
                    onChange={e => setNewAlias({...newAlias, is_dynamic: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Lista Dinámica (Todos)</span>
                </label>
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setShowAddAliasModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? 'Guardando...' : 'Crear Alias'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Forwarding Modal */}
      {showAddForwardingModal && (
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
            style={{ width: '100%', maxWidth: '480px', padding: '2.5rem', border: 'none' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nuevo Reenvío (BCC)</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Enviar copia oculta de correos salientes.</p>
            
            <form onSubmit={handleCreateForwardingRule}>
              <div className="input-group">
                <label>Buzón Emisor</label>
                <input 
                  type="email" 
                  className="input-control" 
                  placeholder="empleado@mmbtransporte.com"
                  value={newForwarding.email}
                  onChange={e => setNewForwarding({...newForwarding, email: e.target.value})}
                  required
                />
              </div>
              <div className="input-group">
                <label>Enviar copia a</label>
                <input 
                  type="email" 
                  className="input-control" 
                  placeholder="supervisor@mmbtransporte.com"
                  value={newForwarding.target}
                  onChange={e => setNewForwarding({...newForwarding, target: e.target.value})}
                  required
                />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setShowAddForwardingModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? 'Guardando...' : 'Crear Regla'}
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
