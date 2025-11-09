// Cargar usuarios al iniciar
document.addEventListener('DOMContentLoaded', function() {
    loadUsers();
});

// Cargar lista de usuarios
async function loadUsers() {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Cargando usuarios...</td></tr>';

    try {
        const response = await fetch('/api/users');
        const data = await response.json();

        if (data.success) {
            if (data.users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="empty">No hay usuarios configurados</td></tr>';
            } else {
                tbody.innerHTML = data.users.map(user => `
                    <tr>
                        <td><strong>${escapeHtml(user.email)}</strong></td>
                        <td>${escapeHtml(user.uid)}</td>
                        <td>${escapeHtml(user.gid)}</td>
                        <td><code>${escapeHtml(user.home || 'N/A')}</code></td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" onclick="openEditModal('${escapeHtml(user.email)}')">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="openDeleteModal('${escapeHtml(user.email)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        } else {
            showMessage('error', 'Error al cargar usuarios: ' + data.error);
            tbody.innerHTML = '<tr><td colspan="5" class="empty">Error al cargar usuarios</td></tr>';
        }
    } catch (error) {
        showMessage('error', 'Error al cargar usuarios: ' + error.message);
        tbody.innerHTML = '<tr><td colspan="5" class="empty">Error al cargar usuarios</td></tr>';
    }
}

// Abrir modal crear usuario
function openCreateModal() {
    document.getElementById('createUserForm').reset();
    document.getElementById('createModal').classList.add('show');
}

// Cerrar modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('show');
}

// Enviar formulario crear usuario
document.getElementById('createUserForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('createEmail').value;
    const password = document.getElementById('createPassword').value;
    const passwordConfirm = document.getElementById('createPasswordConfirm').value;
    const restartSoopMail = document.getElementById('createRestart').checked;

    if (password !== passwordConfirm) {
        showMessage('error', 'Las contraseñas no coinciden');
        return;
    }

    try {
        const response = await fetch('/api/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: email,
                password: password,
                password_confirm: passwordConfirm,
                restart_soop_mail: restartSoopMail
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
            closeModal('createModal');
            loadUsers();
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al crear usuario: ' + error.message);
    }
});

// Abrir modal editar usuario
function openEditModal(email) {
    document.getElementById('editEmail').value = email;
    document.getElementById('editEmailDisplay').value = email;
    document.getElementById('editUserForm').reset();
    document.getElementById('editEmailDisplay').value = email;
    document.getElementById('editModal').classList.add('show');
}

// Enviar formulario editar usuario
document.getElementById('editUserForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('editEmail').value;
    const password = document.getElementById('editPassword').value;
    const passwordConfirm = document.getElementById('editPasswordConfirm').value;
    const restartSoopMail = document.getElementById('editRestart').checked;

    if (password !== passwordConfirm) {
        showMessage('error', 'Las contraseñas no coinciden');
        return;
    }

    try {
        const response = await fetch(`/api/users/${encodeURIComponent(email)}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                password: password,
                password_confirm: passwordConfirm,
                restart_soop_mail: restartSoopMail
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
            closeModal('editModal');
            loadUsers();
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al actualizar usuario: ' + error.message);
    }
});

// Abrir modal eliminar usuario
function openDeleteModal(email) {
    document.getElementById('deleteEmail').value = email;
    document.getElementById('deleteEmailDisplay').textContent = email;
    document.getElementById('deleteModal').classList.add('show');
}

// Confirmar eliminación
async function confirmDelete() {
    const email = document.getElementById('deleteEmail').value;
    const deleteMailDir = document.getElementById('deleteMailDir').checked;
    const restartSoopMail = document.getElementById('deleteRestart').checked;

    try {
        const response = await fetch(`/api/users/${encodeURIComponent(email)}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                delete_mail_dir: deleteMailDir,
                restart_soop_mail: restartSoopMail
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
            closeModal('deleteModal');
            loadUsers();
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al eliminar usuario: ' + error.message);
    }
}

// Reiniciar soop MAIL
async function restartSoopMail() {
    if (!confirm('¿Está seguro que desea reiniciar el servicio soop MAIL?')) {
        return;
    }

    try {
        const response = await fetch('/api/restart', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al reiniciar soop MAIL: ' + error.message);
    }
}

// Mostrar mensaje
function showMessage(type, message) {
    const container = document.getElementById('messageContainer');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messageDiv.innerHTML = `
        <i class="fas ${getIcon(type)}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    
    container.appendChild(messageDiv);

    // Eliminar mensaje después de 5 segundos
    setTimeout(() => {
        messageDiv.style.animation = 'slideInRight 0.3s reverse';
        setTimeout(() => {
            container.removeChild(messageDiv);
        }, 300);
    }, 5000);
}

// Obtener icono según tipo de mensaje
function getIcon(type) {
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle',
        warning: 'fa-exclamation-triangle'
    };
    return icons[type] || 'fa-info-circle';
}

// Escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Cerrar modal al hacer clic fuera
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.classList.remove('show');
        }
    });
}

// ==================== GESTIÓN DE USUARIOS ADMINISTRADORES ====================

// Cargar usuarios administradores
async function loadAdminUsers() {
    const section = document.getElementById('adminUsersSection');
    const tbody = document.getElementById('adminUsersTableBody');
    
    if (!section || !tbody) return;
    
    section.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Cargando usuarios administradores...</td></tr>';

    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();

        if (data.success) {
            if (data.users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="empty">No hay usuarios administradores</td></tr>';
            } else {
                tbody.innerHTML = data.users.map(user => `
                    <tr>
                        <td><strong>${escapeHtml(user.username)}</strong></td>
                        <td>${escapeHtml(user.email)}</td>
                        <td>${escapeHtml(user.full_name || 'N/A')}</td>
                        <td>
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; background: ${user.is_active ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}; color: ${user.is_active ? '#34d399' : '#f87171'}; border: 1px solid ${user.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'};">
                                ${user.is_active ? 'Activo' : 'Inactivo'}
                            </span>
                        </td>
                        <td>
                            <span style="padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; background: ${user.is_admin ? 'rgba(16, 185, 129, 0.2)' : 'rgba(71, 85, 105, 0.2)'}; color: ${user.is_admin ? '#34d399' : '#94a3b8'}; border: 1px solid ${user.is_admin ? 'rgba(16, 185, 129, 0.3)' : 'rgba(71, 85, 105, 0.3)'};">
                                ${user.is_admin ? 'Admin' : 'Usuario'}
                            </span>
                        </td>
                        <td>${user.last_login ? new Date(user.last_login).toLocaleString() : 'Nunca'}</td>
                        <td>
                            <div class="action-buttons">
                                <button class="btn btn-success btn-sm" onclick="openEditAdminModal(${user.id})">
                                    <i class="fas fa-edit"></i> Editar
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="openDeleteAdminModal(${user.id}, '${escapeHtml(user.username)}')">
                                    <i class="fas fa-trash"></i> Eliminar
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('');
            }
        } else {
            showMessage('error', 'Error al cargar usuarios administradores: ' + data.error);
            tbody.innerHTML = '<tr><td colspan="7" class="empty">Error al cargar usuarios</td></tr>';
        }
    } catch (error) {
        showMessage('error', 'Error al cargar usuarios administradores: ' + error.message);
        tbody.innerHTML = '<tr><td colspan="7" class="empty">Error al cargar usuarios</td></tr>';
    }
}

// Abrir modal crear usuario administrador
function openCreateAdminModal() {
    document.getElementById('createAdminUserForm').reset();
    document.getElementById('createAdminModal').classList.add('show');
}

// Enviar formulario crear usuario administrador
document.getElementById('createAdminUserForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const username = document.getElementById('createAdminUsername').value;
    const email = document.getElementById('createAdminEmail').value;
    const password = document.getElementById('createAdminPassword').value;
    const passwordConfirm = document.getElementById('createAdminPasswordConfirm').value;
    const fullName = document.getElementById('createAdminFullName').value;
    const isAdmin = document.getElementById('createAdminIsAdmin').checked;
    const isActive = document.getElementById('createAdminIsActive').checked;

    if (password !== passwordConfirm) {
        showMessage('error', 'Las contraseñas no coinciden');
        return;
    }

    try {
        const response = await fetch('/api/admin/users', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                email: email,
                password: password,
                password_confirm: passwordConfirm,
                full_name: fullName,
                is_admin: isAdmin,
                is_active: isActive
            })
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
            closeModal('createAdminModal');
            loadAdminUsers();
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al crear usuario: ' + error.message);
    }
});

// Abrir modal editar usuario administrador
async function openEditAdminModal(userId) {
    try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();

        if (data.success) {
            const user = data.users.find(u => u.id === userId);
            if (user) {
                document.getElementById('editAdminUserId').value = user.id;
                document.getElementById('editAdminUsername').value = user.username;
                document.getElementById('editAdminEmail').value = user.email;
                document.getElementById('editAdminFullName').value = user.full_name || '';
                document.getElementById('editAdminIsAdmin').checked = user.is_admin;
                document.getElementById('editAdminIsActive').checked = user.is_active;
                document.getElementById('editAdminPassword').value = '';
                document.getElementById('editAdminPasswordConfirm').value = '';
                document.getElementById('editAdminModal').classList.add('show');
            }
        }
    } catch (error) {
        showMessage('error', 'Error al cargar usuario: ' + error.message);
    }
}

// Enviar formulario editar usuario administrador
document.getElementById('editAdminUserForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();

    const userId = document.getElementById('editAdminUserId').value;
    const username = document.getElementById('editAdminUsername').value;
    const email = document.getElementById('editAdminEmail').value;
    const fullName = document.getElementById('editAdminFullName').value;
    const password = document.getElementById('editAdminPassword').value;
    const passwordConfirm = document.getElementById('editAdminPasswordConfirm').value;
    const isAdmin = document.getElementById('editAdminIsAdmin').checked;
    const isActive = document.getElementById('editAdminIsActive').checked;

    const data = {
        username: username,
        email: email,
        full_name: fullName,
        is_admin: isAdmin,
        is_active: isActive
    };

    if (password) {
        if (password !== passwordConfirm) {
            showMessage('error', 'Las contraseñas no coinciden');
            return;
        }
        data.password = password;
        data.password_confirm = passwordConfirm;
    }

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            showMessage('success', result.message);
            closeModal('editAdminModal');
            loadAdminUsers();
        } else {
            showMessage('error', 'Error: ' + result.error);
        }
    } catch (error) {
        showMessage('error', 'Error al actualizar usuario: ' + error.message);
    }
});

// Abrir modal eliminar usuario administrador
function openDeleteAdminModal(userId, username) {
    document.getElementById('deleteAdminUserId').value = userId;
    document.getElementById('deleteAdminUsernameDisplay').textContent = username;
    document.getElementById('deleteAdminModal').classList.add('show');
}

// Confirmar eliminación de usuario administrador
async function confirmDeleteAdmin() {
    const userId = document.getElementById('deleteAdminUserId').value;

    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();

        if (data.success) {
            showMessage('success', data.message);
            closeModal('deleteAdminModal');
            loadAdminUsers();
        } else {
            showMessage('error', 'Error: ' + data.error);
        }
    } catch (error) {
        showMessage('error', 'Error al eliminar usuario: ' + error.message);
    }
}

