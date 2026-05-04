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
  Shield,
  Activity,
  Database,
  Edit2,
  Terminal,
  Share2,
  Save,
  FileText,
  AlertTriangle,
  Menu,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  BarChart, 
  Bar, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Legend 
} from 'recharts';
import { subDays, format } from 'date-fns';

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
  const [aliases, setAliases] = useState<any[]>([]);
  const [bccRules, setBccRules] = useState<{sender: any[], recipient: any[]}>({ sender: [], recipient: [] });
  const [forwards, setForwards] = useState<any[]>([]);
  const [newForward, setNewForward] = useState({ source: '', destinations: '', keep_local: true, description: '' });
  const [showAddForwardModal, setShowAddForwardModal] = useState(false);
  const [bccMode, setBccMode] = useState<'sender' | 'recipient'>('sender');
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
  const [newForwarding, setNewForwarding] = useState({ email: '', target: '' });
  const [showAddForwardingModal, setShowAddForwardingModal] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [aliasSearch, setAliasSearch] = useState('');
  const [showRecipientList, setShowRecipientList] = useState(false);
  const [showAliasList, setShowAliasList] = useState(false);
  const [activeSuggestionField, setActiveSuggestionField] = useState<string | null>(null);
  
  const DEFAULT_DOMAIN = 'mmbtransporte.com';

  const ensureDomain = (val: string) => {
    if (!val) return '';
    if (val.includes('@')) return val;
    return `${val}@${DEFAULT_DOMAIN}`;
  };

  const formatError = (err: any) => {
    if (!err) return null;
    if (typeof err === 'string') return err;
    if (Array.isArray(err)) {
      return err.map(e => e.msg || JSON.stringify(e)).join(', ');
    }
    if (typeof err === 'object') {
      return err.msg || JSON.stringify(err);
    }
    return String(err);
  };
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMailUser, setSelectedMailUser] = useState<MailUser | null>(null);
  const [editMailUserData, setEditMailUserData] = useState({
    password: '',
    password_confirm: '',
    status: 'active',
    restart_soop_mail: true
  });
  
  const activeTab = location.pathname === '/configuracion' ? 'settings' : 
                   location.pathname === '/estadisticas' ? 'stats' : 'users';
  
  const [showPassword, setShowPassword] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  const [settingsTab, setSettingsTab] = useState<'profile' | 'stats' | 'server' | 'logs' | 'mail-logs' | 'routing' | 'auth-console'>('profile');
  const [isGroupMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [authConsoleLogs, setAuthConsoleLogs] = useState<string[]>([]);
  const [isStreamingAuth, setIsStreamingAuth] = useState(false);
  const [detailsTab, setDetailsTab] = useState<'general' | 'auth'>('general');
  const [userAuthLogs, setUserAuthLogs] = useState<string[]>([]);
  const [mailLogs, setMailLogs] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [profileForm, setProfileForm] = useState({
    email: user?.email || '',
    full_name: user?.full_name || ''
  });
  const [passwordForm, setPasswordForm] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [showSettingsPassword, setShowSettingsPassword] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [trafficStats, setTrafficStats] = useState<any>(null);
  const [trafficPeriod, setTrafficPeriod] = useState(30);

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

  const fetchAuditLogs = async () => {
    try {
      const response = await api.get('/api/system/audit-logs');
      setAuditLogs(response.data);
    } catch (error) {
      console.error('Error fetching audit logs:', error);
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

  const fetchBCCRules = async () => {
    try {
      const response = await api.get('/api/mail/bcc');
      setBccRules(response.data);
    } catch (err) {
      console.error('Error fetching BCC rules:', err);
      showNotification('Error al cargar reglas BCC', 'error');
    }
  };

  const fetchForwards = async () => {
    try {
      const response = await api.get('/api/mail/forwards');
      setForwards(response.data);
    } catch (err) {
      console.error('Error fetching forwards:', err);
      showNotification('Error al cargar reenvíos', 'error');
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

  const fetchTrafficStats = async (days = 30) => {
    try {
      const response = await api.get(`/api/mail/traffic?days=${days}`);
      setTrafficStats(response.data);
    } catch (err) {
      console.error('Error fetching traffic stats:', err);
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
          showNotification(formatError(err.response?.data?.detail) || 'Error al vaciar buzón', 'error');
        } finally {
          setActionLoading(false);
          setShowDeleteConfirm(false);
        }
      }
    });
    setShowDeleteConfirm(true);
  };


  const handleCreateBCCRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.post(`/api/mail/bcc/${bccMode}`, newForwarding);
      showNotification('Regla BCC creada', 'success');
      setShowAddForwardingModal(false);
      setNewForwarding({ email: '', target: '' });
      fetchBCCRules();
    } catch (err: any) {
      showNotification(formatError(err.response?.data?.detail) || 'Error al crear regla', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteBCCRule = (email: string, mode: 'sender' | 'recipient') => {
    setDeleteConfig({
      title: 'Eliminar Regla BCC',
      message: `¿Estás seguro de eliminar la copia (BCC) de ${email}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/mail/bcc/${mode}/${email}`);
          showNotification('Regla eliminada', 'success');
          fetchBCCRules();
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

  const handleCreateForward = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        source: newForward.source,
        destinations: newForward.destinations.split(',').map(d => d.trim()).filter(d => d),
        keep_local: newForward.keep_local,
        description: newForward.description
      };
      await api.post('/api/mail/forwards', payload);
      showNotification('Reenvío creado con éxito', 'success');
      setShowAddForwardModal(false);
      setNewForward({ source: '', destinations: '', keep_local: true, description: '' });
      fetchForwards();
    } catch (err: any) {
      showNotification(formatError(err.response?.data?.detail) || 'Error al crear reenvío', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteForward = (email: string) => {
    setDeleteConfig({
      title: 'Eliminar Reenvío',
      message: `¿Estás seguro de eliminar el reenvío de ${email}?`,
      onConfirm: async () => {
        setActionLoading(true);
        try {
          await api.delete(`/api/mail/forwards/${email}`);
          showNotification('Reenvío eliminado', 'success');
          fetchForwards();
        } catch (err) {
          showNotification('Error al eliminar reenvío', 'error');
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
      showNotification(formatError(err.response?.data?.detail) || 'Error al crear alias', 'error');
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

  const fetchSystemStatus = async () => {
    try {
      const response = await api.get('/api/system/status');
      setSystemStatus(response.data);
    } catch (err) {
      console.error('Error fetching system status', err);
    }
  };

  useEffect(() => {
    if (activeTab === 'users') {
      fetchMailUsers();
    } else if (activeTab === 'settings') {
      fetchSystemStatus();
      if (settingsTab === 'routing') {
        fetchMailAliases();
        fetchBCCRules();
        fetchForwards();
      } else if (settingsTab === 'logs') {
        fetchAuditLogs();
      } else if (settingsTab === 'mail-logs') {
        fetchMailLogs();
      } else if (settingsTab === 'server') {
        fetchTrafficStats(trafficPeriod);
      }
    } else if (activeTab === 'stats') {
      fetchTrafficStats(trafficPeriod);
    }
  }, [activeTab, settingsTab, trafficPeriod]);

  useEffect(() => {
    fetchMailUsers();
    fetchMailAliases();
    fetchForwards();
    fetchSystemStatus();
    if (activeTab === 'settings') {
      document.title = 'Configuración | sarsoop labs';
      setProfileForm({
        email: user?.email || '',
        full_name: user?.full_name || ''
      });
      fetchAuditLogs();
    } else {
      document.title = 'Usuarios | sarsoop labs';
    }
  }, [activeTab, user]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api.put('/api/auth/me', profileForm);
      showNotification('Perfil actualizado exitosamente', 'success');
    } catch (err: any) {
      showNotification(formatError(err.response?.data?.detail) || 'Error al actualizar perfil', 'error');
    } finally {
      setActionLoading(false);
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
      showNotification(formatError(err.response?.data?.detail) || 'Error al actualizar contraseña', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleGeneratePassword = async (target: 'new' | 'edit' | 'profile') => {
    try {
      const response = await api.get('/api/system/utils/generate-password');
      const pwd = response.data.password;
      
      if (target === 'new') {
        setNewUser(prev => ({ ...prev, password: pwd, password_confirm: pwd }));
      } else if (target === 'edit') {
        setEditMailUserData(prev => ({ ...prev, password: pwd, password_confirm: pwd }));
      } else if (target === 'profile') {
        setPasswordForm(prev => ({ ...prev, new_password: pwd, confirm_password: pwd }));
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
      showNotification(formatError(err.response?.data?.detail) || 'Error al actualizar usuario', 'error');
    } finally {
      setActionLoading(false);
    }
  };


  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
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
      showNotification(formatError(err.response?.data?.detail) || 'Error al crear usuario', 'error');
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

  const filteredUsers = mailUsers.filter(u => {
    return u.email.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const totalMailboxes = mailUsers.length;
  const totalEmails = mailUsers.reduce((acc, curr) => acc + (curr.email_count || 0), 0);
  const totalNewEmails = mailUsers.reduce((acc, curr) => acc + (curr.new_emails || 0), 0);

  return (
    <div className="dashboard-layout">
      {/* Top Bar for Mobile */}
      <div 
        className="mobile-top-bar"
        style={{
          alignItems: 'center',
          gap: '1rem',
          padding: '1rem',
          background: 'white',
          borderBottom: '1px solid #e2e8f0',
          position: 'sticky',
          top: 0,
          zIndex: 800,
          width: '100%'
        }}
      >
        <button 
          className="hamburger-btn"
          onClick={() => setIsSidebarOpen(true)}
          style={{
            background: 'white',
            border: '1px solid #e2e8f0',
            padding: '0.5rem',
            borderRadius: '0.75rem',
            color: '#4f46e5',
            cursor: 'pointer',
            boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Menu size={20} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ 
            width: '32px', 
            height: '32px', 
            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '0.5rem'
          }}>
            <Mail color="white" size={16} />
          </div>
          <span style={{ fontWeight: '800', color: '#1e293b', fontSize: '1rem' }}>Soop Mails</span>
        </div>
      </div>

      {/* Overlay for mobile */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="sidebar-overlay"
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(15, 23, 42, 0.4)',
              backdropFilter: 'blur(4px)',
              zIndex: 900
            }}
          />
        )}
      </AnimatePresence>

      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2.5rem', padding: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
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
            <h2 className="sidebar-logo-text" style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', letterSpacing: '-0.025em' }}>Soop Mails</h2>
          </div>
          <button 
            className="mobile-close-btn"
            onClick={() => setIsSidebarOpen(false)}
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <X size={24} />
          </button>
        </div>

        <nav style={{ flex: 1 }}>
          <NavLink 
            to="/usuarios"
            onClick={() => setIsSidebarOpen(false)}
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
            to="/estadisticas"
            onClick={() => setIsSidebarOpen(false)}
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
            <Activity size={18} />
            <span>Estadísticas</span>
          </NavLink>
          <NavLink 
            to="/configuracion"
            onClick={() => setIsSidebarOpen(false)}
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
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Administrador</div>
            </div>
          </div>
          <button onClick={logout} className="btn btn-secondary" style={{ width: '100%', justifyContent: 'flex-start', background: '#fef2f2', color: '#dc2626', borderColor: '#fee2e2' }}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>

        <main className="main-content">
        {activeTab === 'users' ? (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div>
                  <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Buzones de Correo</h1>
                  <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Gestión de cuentas y monitoreo de tráfico.</p>
                </div>
              </div>
              <button onClick={() => setShowAddModal(true)} className="btn btn-primary" style={{ padding: '0.75rem 1.5rem', borderRadius: '0.875rem' }}>
                <Plus size={20} />
                Nuevo Usuario
              </button>
            </header>
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

              <div className="table-container">
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
        ) : activeTab === 'stats' ? (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem' }}>
              <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Estadísticas de Tráfico</h1>
              <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Análisis detallado de correos enviados y recibidos por día.</p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
              <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#eef2ff', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                    <Share2 size={20} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>TOTAL ENVIADOS</div>
                </div>
                <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.total_sent.toLocaleString() || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Promedio diario: <span style={{ fontWeight: '700', color: '#4f46e5' }}>{trafficStats?.summary.avg_sent.toFixed(1) || 0}</span>
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#ecfdf5', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                    <Mail size={20} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>TOTAL RECIBIDOS</div>
                </div>
                <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.total_received.toLocaleString() || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Promedio diario: <span style={{ fontWeight: '700', color: '#10b981' }}>{trafficStats?.summary.avg_received.toFixed(1) || 0}</span>
                </div>
              </div>

              <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <div style={{ background: '#fff7ed', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                    <Activity size={20} />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>PICO DE TRÁFICO</div>
                </div>
                <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.peak_day_total.toLocaleString() || 0}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                  Máximo correos en un día
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: '2rem', marginBottom: '2.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1e293b' }}>Histórico de Tráfico</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[7, 14, 30, 90].map(days => (
                    <button
                      key={days}
                      onClick={() => setTrafficPeriod(days)}
                      style={{
                        padding: '0.4rem 0.875rem',
                        fontSize: '0.75rem',
                        borderRadius: '0.5rem',
                        background: trafficPeriod === days ? '#4f46e5' : '#f1f5f9',
                        color: trafficPeriod === days ? '#ffffff' : '#64748b',
                        border: 'none',
                        fontWeight: '600',
                        cursor: 'pointer'
                      }}
                    >
                      {days}d
                    </button>
                  ))}
                </div>
              </div>

              {trafficStats ? (
                <div style={{ height: '400px', width: '100%' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trafficStats.history}>
                      <defs>
                        <linearGradient id="colorSent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorReceived" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="date" 
                        tick={{ fontSize: 12, fill: '#94a3b8' }} 
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(str) => format(new Date(str), 'dd MMM')}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#94a3b8' }} 
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          background: '#ffffff', 
                          border: 'none', 
                          borderRadius: '0.75rem', 
                          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                        }}
                        labelFormatter={(label) => format(new Date(label), 'EEEE, dd MMMM yyyy')}
                      />
                      <Legend verticalAlign="top" height={40} iconType="circle" />
                      <Area 
                        type="monotone" 
                        dataKey="sent_count" 
                        name="Enviados"
                        stroke="#4f46e5" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorSent)" 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="received_count" 
                        name="Recibidos"
                        stroke="#10b981" 
                        strokeWidth={3}
                        fillOpacity={1} 
                        fill="url(#colorReceived)" 
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
                  Cargando datos...
                </div>
              )}
            </div>

            <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Detalle Diario</h3>
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Enviados</th>
                      <th>Recibidos</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trafficStats?.history.slice().reverse().map((day: any) => (
                      <tr key={day.date}>
                        <td style={{ fontWeight: '600' }}>{format(new Date(day.date), 'dd/MM/yyyy')}</td>
                        <td style={{ color: '#4f46e5', fontWeight: '700' }}>{day.sent_count}</td>
                        <td style={{ color: '#10b981', fontWeight: '700' }}>{day.received_count}</td>
                        <td style={{ fontWeight: '800' }}>{day.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ width: '100%' }}>
            <header style={{ marginBottom: '2.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div>
                <h1 style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>Configuración</h1>
                <p style={{ color: '#64748b', fontSize: '0.938rem' }}>Administra el sistema y revisa el estado del servidor.</p>
              </div>
            </header>

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
                onClick={() => setSettingsTab('stats')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'stats' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'stats' ? '#4f46e5' : '#64748b',
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
                Estadísticas
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
                onClick={() => setSettingsTab('routing')}
                style={{ 
                  padding: '1rem 1.5rem', 
                  borderBottom: settingsTab === 'routing' ? '2px solid #4f46e5' : '2px solid transparent',
                  color: settingsTab === 'routing' ? '#4f46e5' : '#64748b',
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
                Redirecciones y Copias
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
                    
                    <div className="grid-2-cols" style={{ display: 'grid', gap: '2.5rem' }}>
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
                {settingsTab === 'stats' && (
                  <motion.div 
                    key="stats-tab"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    style={{ display: 'grid', gap: '2rem' }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
                      <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <div style={{ background: '#eef2ff', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}>
                            <Share2 size={20} />
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>TOTAL ENVIADOS</div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.total_sent.toLocaleString() || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                          Promedio diario: <span style={{ fontWeight: '700', color: '#4f46e5' }}>{trafficStats?.summary.avg_sent.toFixed(1) || 0}</span>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <div style={{ background: '#ecfdf5', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981' }}>
                            <Mail size={20} />
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>TOTAL RECIBIDOS</div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.total_received.toLocaleString() || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                          Promedio diario: <span style={{ fontWeight: '700', color: '#10b981' }}>{trafficStats?.summary.avg_received.toFixed(1) || 0}</span>
                        </div>
                      </div>

                      <div className="card" style={{ padding: '1.5rem', border: 'none', background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                          <div style={{ background: '#fff7ed', width: '40px', height: '40px', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f97316' }}>
                            <Activity size={20} />
                          </div>
                          <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: '600' }}>PICO DE TRÁFICO</div>
                        </div>
                        <div style={{ fontSize: '1.875rem', fontWeight: '800', color: '#1e293b' }}>{trafficStats?.summary.peak_day_total.toLocaleString() || 0}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.5rem' }}>
                          Máximo en un día
                        </div>
                      </div>
                    </div>

                    <div className="card" style={{ padding: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1.125rem', fontWeight: '700', color: '#1e293b' }}>Actividad de Correo</h3>
                          <p style={{ color: '#64748b', fontSize: '0.813rem' }}>Histórico de los últimos {trafficPeriod} días</p>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          {[7, 30, 90].map(d => (
                            <button 
                              key={d} 
                              onClick={() => setTrafficPeriod(d)} 
                              style={{ 
                                padding: '0.4rem 0.875rem', 
                                fontSize: '0.75rem', 
                                borderRadius: '0.5rem', 
                                background: trafficPeriod === d ? '#4f46e5' : '#f1f5f9', 
                                color: trafficPeriod === d ? '#fff' : '#64748b', 
                                border: 'none',
                                fontWeight: '600',
                                cursor: 'pointer'
                              }}
                            >
                              {d}d
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {trafficStats ? (
                        <div style={{ height: '350px', width: '100%' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={trafficStats.history}>
                              <defs>
                                <linearGradient id="colorSentTab" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                </linearGradient>
                                <linearGradient id="colorReceivedTab" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis 
                                dataKey="date" 
                                tick={{ fontSize: 12, fill: '#94a3b8' }} 
                                axisLine={false}
                                tickLine={false}
                                tickFormatter={(str) => format(new Date(str), 'dd MMM')}
                              />
                              <YAxis 
                                tick={{ fontSize: 12, fill: '#94a3b8' }} 
                                axisLine={false}
                                tickLine={false}
                              />
                              <Tooltip 
                                contentStyle={{ 
                                  background: '#ffffff', 
                                  border: 'none', 
                                  borderRadius: '0.75rem', 
                                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                                }}
                                labelFormatter={(label) => format(new Date(label), 'EEEE, dd MMMM yyyy')}
                              />
                              <Area 
                                type="monotone" 
                                dataKey="sent_count" 
                                name="Enviados"
                                stroke="#4f46e5" 
                                strokeWidth={3}
                                fillOpacity={1} 
                                fill="url(#colorSentTab)" 
                              />
                              <Area 
                                type="monotone" 
                                dataKey="received_count" 
                                name="Recibidos"
                                stroke="#10b981" 
                                strokeWidth={3}
                                fillOpacity={1} 
                                fill="url(#colorReceivedTab)" 
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div style={{ height: '350px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div className="animate-spin" style={{ width: '30px', height: '30px', border: '3px solid #f3f3f3', borderTop: '3px solid #4f46e5', borderRadius: '50%' }}></div>
                        </div>
                      )}
                    </div>

                    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #f1f5f9' }}>
                        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Registro Diario</h3>
                      </div>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Enviados</th>
                              <th>Recibidos</th>
                              <th>Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {trafficStats?.history.slice().reverse().map((day: any) => (
                              <tr key={day.date}>
                                <td style={{ fontWeight: '600' }}>{format(new Date(day.date), 'dd/MM/yyyy')}</td>
                                <td style={{ color: '#4f46e5', fontWeight: '700' }}>{day.sent_count}</td>
                                <td style={{ color: '#10b981', fontWeight: '700' }}>{day.received_count}</td>
                                <td style={{ fontWeight: '800' }}>{day.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
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
                    {systemStatus?.details?.storage_alerts?.length > 0 && (
                      <div style={{ 
                        padding: '1rem', 
                        background: '#fff7ed', 
                        borderLeft: '4px solid #f97316', 
                        borderRadius: '0.5rem',
                        marginBottom: '0.5rem'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <AlertTriangle size={18} style={{ color: '#f97316' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: '700', color: '#9a3412' }}>Alertas de Almacenamiento</h4>
                        </div>
                        <ul style={{ margin: 0, paddingLeft: '1.5rem', fontSize: '0.813rem', color: '#7c2d12' }}>
                          {systemStatus.details.storage_alerts.map((alert: string, i: number) => (
                            <li key={i}>{alert}</li>
                          ))}
                        </ul>
                      </div>
                    )}
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

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem' }}>
                      {/* Postfix Configuration Details */}
                      <div className="card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Shield size={18} style={{ color: '#6366f1' }} />
                          Configuración Postfix (MTA)
                        </h4>
                        <div style={{ display: 'grid', gap: '0.75rem' }}>
                          {[
                            { label: 'Sender BCC Maps', value: systemStatus?.details?.sender_bcc_config },
                            { label: 'Recipient BCC Maps', value: systemStatus?.details?.recipient_bcc_config },
                            { label: 'Virtual Alias Maps', value: systemStatus?.details?.virtual_alias_config },
                            { label: 'Virtual Mailbox Maps', value: systemStatus?.details?.virtual_mailbox_config }
                          ].map((item, idx) => (
                            <div key={idx} style={{ padding: '0.75rem', background: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #f1f5f9' }}>
                              <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: '600', textTransform: 'uppercase', marginBottom: '0.25rem' }}>{item.label}</div>
                              <div style={{ fontSize: '0.813rem', color: '#1e293b', fontFamily: 'monospace', wordBreak: 'break-all' }}>{item.value || 'No configurado'}</div>
                            </div>
                          ))}
                          {systemStatus?.details?.postfix_config_error && (
                            <div style={{ padding: '0.75rem', background: '#fff1f2', borderRadius: '0.5rem', border: '1px solid #ffe4e6', color: '#e11d48', fontSize: '0.75rem' }}>
                              <strong>Error de Postfix:</strong> {systemStatus.details.postfix_config_error}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* File Permissions & Diagnostics */}
                      <div className="card" style={{ padding: '1.5rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <FileText size={18} style={{ color: '#0ea5e9' }} />
                          Permisos de Archivos y Diagnóstico
                        </h4>
                        <div style={{ display: 'grid', gap: '0.5rem' }}>
                          {systemStatus?.details?.file_diagnostics && Object.entries(systemStatus.details.file_diagnostics).map(([key, data]: [string, any]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem', borderBottom: '1px solid #f1f5f9' }}>
                              <span style={{ fontSize: '0.813rem', color: '#475569', fontWeight: '500' }}>{key}</span>
                              <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  padding: '0.125rem 0.5rem', 
                                  borderRadius: '1rem', 
                                  background: data.exists ? '#dcfce7' : '#fee2e2',
                                  color: data.exists ? '#166534' : '#991b1b',
                                  fontWeight: '600'
                                }}>
                                  {data.exists ? 'Existe' : 'No encontrado'}
                                </span>
                                <span style={{ 
                                  fontSize: '0.7rem', 
                                  padding: '0.125rem 0.5rem', 
                                  borderRadius: '1rem', 
                                  background: data.writable ? '#dcfce7' : '#fee2e2',
                                  color: data.writable ? '#166534' : '#991b1b',
                                  fontWeight: '600'
                                }}>
                                  {data.writable ? 'Escritura OK' : 'Solo Lectura'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Email Traffic Notification */}
                    <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                      <p>Las estadísticas detalladas ahora están disponibles en la pestaña dedicada <strong>Estadísticas</strong> en el menú lateral.</p>
                      <NavLink to="/estadisticas" className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-flex' }}>
                        Ir a Estadísticas
                      </NavLink>
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
                          <p style={{ color: '#94a3b8', fontSize: '0.75rem' }}>Visor de registros del sistema de correo</p>
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

                {settingsTab === 'routing' && (
                  <motion.div 
                    key="routing"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    style={{ display: 'grid', gap: '2rem' }}
                  >
                    {/* Reenvíos Section */}
                    <div className="card" style={{ padding: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Reenvíos</h3>
                          <p style={{ fontSize: '0.813rem', color: '#64748b' }}>Redirección de correos entrantes a destinos externos.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddForwardModal(true)}>
                          <Plus size={16} />
                          Nuevo Reenvío
                        </button>
                      </div>
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Dirección Origen</th>
                              <th>Destinos</th>
                              <th>Copia Local</th>
                              <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {forwards.map((f, idx) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: '600' }}>{f.source}</td>
                                <td>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                                    {f.destinations.map((d: string) => (
                                      <span key={d} className="badge badge-secondary">{d}</span>
                                    ))}
                                  </div>
                                </td>
                                <td>
                                  <span className={`badge ${f.keep_local ? 'badge-success' : 'badge-warning'}`}>
                                    {f.keep_local ? 'Sí' : 'No'}
                                  </span>
                                </td>
                                <td style={{ textAlign: 'right' }}>
                                  <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => handleDeleteForward(f.source)}>
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {forwards.length === 0 && (
                              <tr>
                                <td colSpan={4} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                  No hay reenvíos configurados.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Copias (BCC) Section */}
                    <div className="card" style={{ padding: '2rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                        <div>
                          <h3 style={{ fontSize: '1rem', fontWeight: '700', color: '#1e293b' }}>Copias (BCC)</h3>
                          <p style={{ fontSize: '0.813rem', color: '#64748b' }}>Copia oculta automática de correos <b>enviados y recibidos</b>.</p>
                        </div>
                        <button className="btn btn-primary" onClick={() => setShowAddForwardingModal(true)}>
                          <Plus size={16} />
                          Nueva Copia BCC
                        </button>
                      </div>

                      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button 
                          className={`btn ${bccMode === 'sender' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setBccMode('sender')}
                          style={{ flex: 1 }}
                        >
                          Salientes (Sender)
                        </button>
                        <button 
                          className={`btn ${bccMode === 'recipient' ? 'btn-primary' : 'btn-secondary'}`}
                          onClick={() => setBccMode('recipient')}
                          style={{ flex: 1 }}
                        >
                          Entrantes (Recipient)
                        </button>
                      </div>

                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>{bccMode === 'sender' ? 'Emisor' : 'Receptor'}</th>
                              <th>Copiar a</th>
                              <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bccRules[bccMode].map((rule: any, idx: number) => (
                              <tr key={idx}>
                                <td style={{ fontWeight: '600' }}>{rule.email}</td>
                                <td>{rule.target}</td>
                                <td style={{ textAlign: 'right' }}>
                                  <button className="btn-icon" style={{ color: '#ef4444' }} onClick={() => handleDeleteBCCRule(rule.email, bccMode)}>
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {bccRules[bccMode].length === 0 && (
                              <tr>
                                <td colSpan={3} style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                                  No hay reglas BCC ({bccMode === 'sender' ? 'salientes' : 'entrantes'}) configuradas.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Alias y Listas Section */}
                    <div className="card" style={{ padding: '2rem' }}>
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

                      <div className="table-container">
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
                                  <button onClick={() => handleDeleteAlias(alias.email)} className="btn-icon" style={{ color: '#ef4444' }}>
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
                          ) : auditLogs.map((log: any) => (
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

      {showAddModal && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="modal-content"
            style={{ maxWidth: '480px', padding: '2rem' }}
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
                <label>{isGroupMode ? 'Dirección del Grupo' : 'Dirección del Alias'}</label>
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
                className="btn btn-danger"
                style={{ width: '100%' }}
                disabled={actionLoading}
              >
                {actionLoading ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </motion.div>
        </div>
      )}


      {/* Add Alias Modal */}
      {showAddAliasModal && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="modal-content"
            style={{ maxWidth: '600px', padding: '2rem' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <div style={{ 
                background: isGroupMode ? 'rgba(79, 70, 229, 0.1)' : 'rgba(99, 102, 241, 0.1)', 
                padding: '0.75rem', 
                borderRadius: '0.75rem', 
                color: isGroupMode ? '#4f46e5' : '#6366f1' 
              }}>
                {isGroupMode ? <Users size={24} /> : <Share2 size={24} />}
              </div>
              <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b' }}>
                  {isGroupMode ? 'Nuevo Grupo de Distribución' : 'Nuevo Alias de Correo'}
                </h2>
                <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
                  {isGroupMode ? 'Crea una dirección que envíe correos a varios miembros.' : 'Crea una dirección virtual que redirija a otro buzón.'}
                </p>
              </div>
            </div>
            
            <form onSubmit={handleCreateAlias}>
              <div className="input-group" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ marginBottom: 0 }}>{isGroupMode ? 'Dirección del Grupo' : 'Dirección del Alias'}</label>
                  <button 
                    type="button" 
                    onClick={() => setShowAliasList(!showAliasList)}
                    style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    <Mail size={14} />
                    {showAliasList ? 'Ocultar actuales' : 'Ver actuales'}
                  </button>
                </div>
                
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder={`ejemplo@${DEFAULT_DOMAIN}`}
                  value={newAlias.email}
                  onChange={e => {
                    const val = e.target.value;
                    setNewAlias({...newAlias, email: val});
                    setActiveSuggestionField('alias-email');
                  }}
                  onBlur={() => {
                    setNewAlias({...newAlias, email: ensureDomain(newAlias.email)});
                    setTimeout(() => setActiveSuggestionField(null), 200);
                  }}
                  onFocus={() => setActiveSuggestionField('alias-email')}
                  required
                />

                {activeSuggestionField === 'alias-email' && (
                  <div className="card" style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000, 
                    marginTop: '0.25rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}>
                    {aliases
                      .filter(a => a.email.toLowerCase().includes(newAlias.email.toLowerCase()) || newAlias.email === '')
                      .map(a => (
                        <div 
                          key={a.email}
                          onClick={() => setNewAlias({...newAlias, email: a.email})}
                          style={{ 
                            padding: '0.75rem', 
                            cursor: 'pointer', 
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Mail size={14} style={{ color: '#64748b' }} />
                          {a.email}
                        </div>
                      ))
                    }
                    {aliases.filter(a => a.email.toLowerCase().includes(newAlias.email.toLowerCase())).length === 0 && (
                      <div style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#94a3b8', textAlign: 'center' }}>
                        Sin coincidencias
                      </div>
                    )}
                  </div>
                )}

                {showAliasList && (
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
                        placeholder="Buscar alias existente..."
                        style={{ width: '100%', padding: '0.4rem 0.75rem 0.4rem 2.25rem', fontSize: '0.75rem', borderRadius: '0.5rem', border: '1px solid #e2e8f0' }}
                        value={aliasSearch}
                        onChange={e => setAliasSearch(e.target.value)}
                      />
                    </div>
                    <div style={{ maxHeight: '100px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {aliases
                        .filter(a => a.email.toLowerCase().includes(aliasSearch.toLowerCase()))
                        .map(a => (
                          <span
                            key={a.email}
                            style={{ 
                              padding: '0.2rem 0.5rem', 
                              fontSize: '0.7rem', 
                              background: '#e2e8f0', 
                              borderRadius: '0.4rem',
                              color: '#475569'
                            }}
                          >
                            {a.email}
                          </span>
                        ))
                      }
                      {aliases.filter(a => a.email.toLowerCase().includes(aliasSearch.toLowerCase())).length === 0 && (
                        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>No hay alias que coincidan</span>
                      )}
                    </div>
                  </div>
                )}
                
                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.5rem' }}>
                  Sugerencia: Evita duplicar alias existentes.
                </p>
              </div>
              <div className="input-group" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <label style={{ marginBottom: 0 }}>{isGroupMode ? 'Miembros del Grupo' : 'Destinatarios (separados por coma)'}</label>
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

      {/* Add BCC Rule Modal */}
      {showAddForwardingModal && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="modal-content"
            style={{ maxWidth: '480px', padding: '2rem' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nueva Copia BCC</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Enviar copia oculta automática de correos (enviados o recibidos).</p>
            
            <form onSubmit={handleCreateBCCRule}>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button 
                  type="button"
                  className={`btn ${bccMode === 'sender' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setBccMode('sender')}
                  style={{ flex: 1 }}
                >
                  Saliente
                </button>
                <button 
                  type="button"
                  className={`btn ${bccMode === 'recipient' ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setBccMode('recipient')}
                  style={{ flex: 1 }}
                >
                  Entrante
                </button>
              </div>

              <div className="input-group" style={{ position: 'relative' }}>
                <label>{bccMode === 'sender' ? 'Buzón Emisor' : 'Buzón Receptor'}</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder={`usuario@${DEFAULT_DOMAIN}`}
                  value={newForwarding.email}
                  onChange={e => {
                    setNewForwarding({...newForwarding, email: e.target.value});
                    setActiveSuggestionField('bcc-email');
                  }}
                  onBlur={() => {
                    setNewForwarding({...newForwarding, email: ensureDomain(newForwarding.email)});
                    setTimeout(() => setActiveSuggestionField(null), 200);
                  }}
                  onFocus={() => setActiveSuggestionField('bcc-email')}
                  required
                />
                {activeSuggestionField === 'bcc-email' && (
                  <div className="card" style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000, 
                    marginTop: '0.25rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}>
                    {mailUsers
                      .filter(u => u.email.toLowerCase().includes(newForwarding.email.toLowerCase()) || newForwarding.email === '')
                      .map(u => (
                        <div 
                          key={u.email}
                          onClick={() => setNewForwarding({...newForwarding, email: u.email})}
                          style={{ 
                            padding: '0.75rem', 
                            cursor: 'pointer', 
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Users size={14} style={{ color: '#64748b' }} />
                          {u.email}
                        </div>
                      ))
                    }
                  </div>
                )}
              </div>
              <div className="input-group">
                <label>Enviar copia a</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder={`supervisor@${DEFAULT_DOMAIN}`}
                  value={newForwarding.target}
                  onChange={e => setNewForwarding({...newForwarding, target: e.target.value})}
                  onBlur={() => setNewForwarding({...newForwarding, target: ensureDomain(newForwarding.target)})}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setShowAddForwardingModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? 'Guardando...' : 'Crear Regla BCC'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Add Forward Modal (Virtual) */}
      {showAddForwardModal && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="modal-content"
            style={{ maxWidth: '600px', padding: '2rem' }}
          >
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', marginBottom: '0.5rem', color: '#1e293b' }}>Nuevo Reenvío</h2>
            <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: '2rem' }}>Redirigir correos entrantes a otros destinos.</p>
            
            <form onSubmit={handleCreateForward}>
              <div className="input-group" style={{ position: 'relative' }}>
                <label>Dirección Origen</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder={`ventas@${DEFAULT_DOMAIN}`}
                  value={newForward.source}
                  onChange={e => {
                    setNewForward({...newForward, source: e.target.value});
                    setActiveSuggestionField('forward-source');
                  }}
                  onBlur={() => {
                    setNewForward({...newForward, source: ensureDomain(newForward.source)});
                    setTimeout(() => setActiveSuggestionField(null), 200);
                  }}
                  onFocus={() => setActiveSuggestionField('forward-source')}
                  required
                />
                
                {activeSuggestionField === 'forward-source' && (
                  <div className="card" style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    zIndex: 1000, 
                    marginTop: '0.25rem',
                    maxHeight: '200px',
                    overflowY: 'auto',
                    padding: '0.5rem',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'
                  }}>
                    {mailUsers
                      .filter(u => u.email.toLowerCase().includes(newForward.source.toLowerCase()) || newForward.source === '')
                      .map(u => (
                        <div 
                          key={u.email}
                          onClick={() => setNewForward({...newForward, source: u.email})}
                          style={{ 
                            padding: '0.75rem', 
                            cursor: 'pointer', 
                            borderRadius: '0.5rem',
                            fontSize: '0.875rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            transition: 'background 0.2s'
                          }}
                          onMouseOver={e => (e.currentTarget.style.background = '#f1f5f9')}
                          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <Users size={14} style={{ color: '#64748b' }} />
                          {u.email}
                        </div>
                      ))
                    }
                    {mailUsers.filter(u => u.email.toLowerCase().includes(newForward.source.toLowerCase())).length === 0 && (
                      <div style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#94a3b8', textAlign: 'center' }}>
                        Sin coincidencias
                      </div>
                    )}
                  </div>
                )}

                <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                  Puede ser un buzón existente o una dirección virtual nueva.
                </p>
              </div>

              <div className="input-group">
                <label>Destinos (separados por coma)</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder="otro@gmail.com, socio@empresa.com"
                  value={newForward.destinations}
                  onChange={e => setNewForward({...newForward, destinations: e.target.value})}
                  required
                />
              </div>

              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginBottom: 0 }}>
                  <input 
                    type="checkbox" 
                    checked={newForward.keep_local}
                    onChange={e => setNewForward({...newForward, keep_local: e.target.checked})}
                    style={{ width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '0.875rem', color: '#475569' }}>Mantener copia local</span>
                </label>
              </div>

              <div className="input-group">
                <label>Descripción (opcional)</label>
                <input 
                  type="text" 
                  className="input-control" 
                  placeholder="Ej: Reenvío para soporte externo"
                  value={newForward.description}
                  onChange={e => setNewForward({...newForward, description: e.target.value})}
                />
              </div>
              
              <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                <button type="button" onClick={() => setShowAddForwardModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={actionLoading} style={{ flex: 1 }}>
                  {actionLoading ? 'Guardando...' : 'Crear Reenvío'}
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
