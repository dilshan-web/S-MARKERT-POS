/**
 * User Authentication, Role-Based Access Control & User Permissions Management
 */

const AuthManager = {
  currentUser: null,
  currentPendingAuth: null,

  async init() {
    const savedUser = sessionStorage.getItem('lankapos_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        let dbUser = null;
        try {
          if (u.id) dbUser = await db.users.get(u.id);
          if (!dbUser && u.username) dbUser = await db.users.where('username').equalsIgnoreCase(u.username).first();
        } catch (e) {}

        if (dbUser && dbUser.active !== 0) {
          this.currentUser = dbUser;
        } else if (u && u.username) {
          this.currentUser = u;
        } else {
          this.currentUser = null;
        }
      } catch (e) {
        this.currentUser = null;
      }
    }
    this.updateUI();
  },

  // Login with Username and Password / PIN
  async loginWithCredentials(username, password) {
    const rawU = (username || '').trim();
    const rawP = (password || '').trim();

    if (!rawU && !rawP) {
      return { 
        success: false, 
        message: 'කරුණාකර පරිශීලක නම සහ මුරපදය ඇතුළත් කරන්න (Please enter Username and Password)' 
      };
    }

    const u = rawU.toLowerCase();
    const p = rawP;

    // Built-in verified system accounts
    const defaultAccounts = [
      {
        id: 1,
        username: 'admin',
        passwords: ['admin123', '9999', 'admin'],
        pins: ['9999'],
        fullName: 'Super Admin (ප්‍රධාන පරිපාලක)',
        role: 'admin',
        pin: '9999',
        active: 1,
        permissions: {
          dashboard: true, pos: true, inventory: true, grn: true,
          customers: true, credit: true, suppliers: true, expenses: true,
          shifts: true, reports: true, settings: true, users: true,
          allowCreditEdit: true, allowCreditDelete: true, allowPriceEdit: true,
          allowDiscount: true, allowReturns: true, allowDelete: true,
          allowStockAdjustment: true
        }
      },
      {
        id: 2,
        username: 'manager',
        passwords: ['manager123', '4321', 'manager'],
        pins: ['4321'],
        fullName: 'Nuwan Perera (කළමනාකරු)',
        role: 'manager',
        pin: '4321',
        active: 1,
        permissions: {
          dashboard: true, pos: true, inventory: true, grn: true,
          customers: true, credit: true, suppliers: true, expenses: true,
          shifts: true, reports: true, settings: true, users: false,
          allowCreditEdit: true, allowCreditDelete: false, allowPriceEdit: true,
          allowDiscount: true, allowReturns: true, allowDelete: false,
          allowStockAdjustment: true
        }
      },
      {
        id: 3,
        username: 'cashier1',
        aliases: ['cashier', 'cashier1'],
        passwords: ['cashier123', '1234', 'cashier'],
        pins: ['1234'],
        fullName: 'Kasun Silva (කැෂියර් 1)',
        role: 'cashier',
        pin: '1234',
        active: 1,
        permissions: {
          dashboard: true, pos: true, inventory: false, grn: false,
          customers: true, credit: true, suppliers: false, expenses: false,
          shifts: true, reports: false, settings: false, users: false,
          allowCreditEdit: false, allowCreditDelete: false, allowPriceEdit: false,
          allowDiscount: false, allowReturns: false, allowDelete: false,
          allowStockAdjustment: false
        }
      },
      {
        id: 4,
        username: 'cashier2',
        passwords: ['cashier123', '5678'],
        pins: ['5678'],
        fullName: 'Dilini Fernando (කැෂියර් 2)',
        role: 'cashier',
        pin: '5678',
        active: 1,
        permissions: {
          dashboard: true, pos: true, inventory: false, grn: false,
          customers: true, credit: true, suppliers: false, expenses: false,
          shifts: true, reports: false, settings: false, users: false,
          allowCreditEdit: false, allowCreditDelete: false, allowPriceEdit: false,
          allowDiscount: false, allowReturns: false, allowDelete: false,
          allowStockAdjustment: false
        }
      }
    ];

    let user = null;

    // 1. Check live database with quick safety timeout
    try {
      if (typeof db !== 'undefined' && db && db.users) {
        const fetchPromise = db.users.toArray();
        const timeoutPromise = new Promise(resolve => setTimeout(() => resolve([]), 500));
        const allUsers = await Promise.race([fetchPromise, timeoutPromise]);

        if (Array.isArray(allUsers) && allUsers.length > 0) {
          user = allUsers.find(userRecord => {
            const dbUser = (userRecord.username || '').trim().toLowerCase();
            const dbPass = (userRecord.password || '').trim();
            const dbPin = (userRecord.pin || '').trim();
            const isActive = userRecord.active !== 0;

            if (!isActive) return false;

            // PIN-only login
            if (rawU && !rawP && dbPin && dbPin === rawU) return true;
            if (!rawU && rawP && dbPin && dbPin === rawP) return true;

            // Username & Password / PIN
            if (rawU && rawP && (dbUser === u || (u === 'cashier' && dbUser === 'cashier1'))) {
              if (dbPass && dbPass === p) return true;
              if (dbPin && dbPin === p) return true;
              if (!dbPass) {
                const defPass = userRecord.role === 'admin' ? 'admin123' : userRecord.role === 'manager' ? 'manager123' : 'cashier123';
                if (p === defPass) return true;
              }
            }
            return false;
          });
        }
      }
    } catch (err) {
      console.warn('[Auth] Database user query notice:', err);
    }

    // 2. If not found in DB or DB loading/offline, match against standard built-in accounts
    if (!user) {
      user = defaultAccounts.find(acc => {
        // PIN only
        if (rawU && !rawP && acc.pins && acc.pins.includes(rawU)) return true;
        if (!rawU && rawP && acc.pins && acc.pins.includes(rawP)) return true;

        // Username & Password
        if (rawU && rawP) {
          const isUserMatch = acc.username === u || (acc.aliases && acc.aliases.includes(u));
          if (isUserMatch) {
            return acc.passwords.includes(p) || (acc.pins && acc.pins.includes(p));
          }
        }
        return false;
      });
    }

    // 3. If valid user matched, perform login
    if (user) {
      this.currentUser = { ...user };
      sessionStorage.setItem('lankapos_user', JSON.stringify(this.currentUser));
      this.updateUI();

      // Ensure Lock Screen is cleanly hidden and App Shell is visible
      const lockScreen = document.getElementById('lockScreen');
      if (lockScreen) {
        lockScreen.classList.add('hidden');
        lockScreen.style.display = 'none';
      }
      const appShell = document.getElementById('appShell');
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.display = 'flex';
      }

      // Switch to landing tab immediately
      if (window.App && typeof window.App.switchTab === 'function') {
        const landingTab = this.hasPermission('dashboard') ? 'dashboard' : 'pos';
        window.App.switchTab(landingTab);
      }

      if (window.DashboardManager) {
        try { await DashboardManager.init(); } catch (e) {}
      }

      try {
        if (window.SoundManager && typeof SoundManager.playSuccessChime === 'function') {
          SoundManager.playSuccessChime();
        }
      } catch (e) {}

      return { success: true, user: this.currentUser };
    }

    // 4. Invalid credentials
    try {
      if (window.SoundManager && typeof SoundManager.playErrorBuzzer === 'function') {
        SoundManager.playErrorBuzzer();
      }
    } catch (e) {}

    return { 
      success: false, 
      message: 'වැරදි පරිශීලක නමක් හෝ මුරපදයක් ඇතුළත් කර ඇත! (Invalid Username or Password)' 
    };
  }
  logout() {
    this.currentUser = null;
    sessionStorage.removeItem('lankapos_user');
    if (window.DashboardManager) {
      DashboardManager.selectedStaffId = 'all';
    }
    this.updateUI();
  },

  isLoggedIn() {
    return !!this.currentUser;
  },

  isAdmin() {
    return this.currentUser && this.currentUser.role === 'admin';
  },

  isManager() {
    return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'manager');
  },

  isCashier() {
    return !!this.currentUser;
  },

  // Granular Permission Checker
  hasPermission(permKey) {
    if (!this.currentUser) {
      try {
        const savedUser = sessionStorage.getItem('lankapos_user');
        if (savedUser) this.currentUser = JSON.parse(savedUser);
      } catch (e) {}
    }
    if (!this.currentUser) return true; // Fail open if no active restriction
    if (this.currentUser.role === 'admin') return true;

    // Check user-specific permissions if configured
    if (this.currentUser.permissions && this.currentUser.permissions[permKey] !== undefined) {
      return !!this.currentUser.permissions[permKey];
    }

    // Default Fallbacks by role
    if (this.currentUser.role === 'manager') {
      const allowedForManager = ['dashboard', 'pos', 'inventory', 'grn', 'customers', 'credit', 'suppliers', 'expenses', 'shifts', 'reports', 'allowDiscount', 'settings'];
      return allowedForManager.includes(permKey);
    }

    if (this.currentUser.role === 'cashier') {
      const allowedForCashier = ['dashboard', 'pos', 'customers', 'credit', 'shifts'];
      return allowedForCashier.includes(permKey);
    }

    return true;
  },

  // ==========================================
  // ADMIN SECURITY PIN / PASSWORD AUTHORIZATION
  // ==========================================
  /**
   * Prompts for Admin authorization if the current user is not an Admin or lacks the specific permission
   * @param {Object} opts { actionName, actionDesc, requiredPerm, onAuthorized, onCancelled }
   */
  async requireAdminAuth({ actionName = 'Restricted Action', actionDesc = '', requiredPerm = null, onAuthorized, onCancelled }) {
    // 1. If currently logged in user is admin, allow immediately
    if (this.isAdmin()) {
      if (typeof onAuthorized === 'function') onAuthorized();
      return;
    }

    // 2. If user possesses the specific permission explicitly, allow immediately
    if (requiredPerm && this.hasPermission(requiredPerm)) {
      if (typeof onAuthorized === 'function') onAuthorized();
      return;
    }

    // 3. Otherwise, show Admin Authorization Modal
    this.currentPendingAuth = {
      actionName,
      actionDesc,
      requiredPerm,
      onAuthorized,
      onCancelled
    };

    const modal = document.getElementById('adminAuthModal');
    const actionText = document.getElementById('adminAuthActionText');
    const pinInput = document.getElementById('adminAuthPinInput');
    const errorMsg = document.getElementById('adminAuthErrorMessage');

    if (actionText) {
      actionText.textContent = actionDesc || actionName;
    }
    if (errorMsg) {
      errorMsg.textContent = '';
      errorMsg.classList.add('hidden');
    }
    if (pinInput) {
      pinInput.value = '';
    }

    if (modal) {
      modal.classList.remove('hidden');
      setTimeout(() => {
        if (pinInput) {
          pinInput.focus();
        }
      }, 50);
    }
  },

  async submitAdminAuth(event) {
    if (event) event.preventDefault();
    const pinInput = document.getElementById('adminAuthPinInput');
    const errorMsg = document.getElementById('adminAuthErrorMessage');
    const enteredPin = (pinInput?.value || '').trim();

    if (!enteredPin) {
      if (errorMsg) {
        errorMsg.textContent = 'කරුණාකර Admin PIN හෝ මුරපදය ඇතුළත් කරන්න (Please enter PIN)';
        errorMsg.classList.remove('hidden');
      }
      return;
    }

    try {
      // Validate against any active Admin user in DB
      let adminUsers = await db.users.where('role').equals('admin').toArray();
      let isValidAdmin = adminUsers.some(a => a.active !== 0 && (a.pin === enteredPin || a.password === enteredPin));

      // Global fallback Admin PINs
      if (!isValidAdmin && (enteredPin === '9999' || enteredPin === 'admin123')) {
        isValidAdmin = true;
      }

      if (isValidAdmin) {
        const modal = document.getElementById('adminAuthModal');
        if (modal) modal.classList.add('hidden');

        SoundManager.playSuccessChime();

        const pending = this.currentPendingAuth;
        this.currentPendingAuth = null;

        if (pending && typeof pending.onAuthorized === 'function') {
          pending.onAuthorized();
        }
        return;
      }
    } catch (err) {
      console.error('[AdminAuth] Error validating admin PIN:', err);
    }

    // Invalid PIN
    SoundManager.playErrorBuzzer();
    if (errorMsg) {
      errorMsg.textContent = '❌ වැරදි Admin PIN එකක් හෝ මුරපදයක්! (Invalid Admin PIN or Password)';
      errorMsg.classList.remove('hidden');
    }
    if (pinInput) {
      pinInput.value = '';
      pinInput.focus();
    }
  },

  cancelAdminAuth() {
    const modal = document.getElementById('adminAuthModal');
    if (modal) modal.classList.add('hidden');

    const pending = this.currentPendingAuth;
    this.currentPendingAuth = null;

    if (pending && typeof pending.onCancelled === 'function') {
      pending.onCancelled();
    }
  },

  updateUI() {
    const lockScreen = document.getElementById('lockScreen');
    const appShell = document.getElementById('appShell');
    const headerUserName = document.getElementById('headerUserName');
    const headerUserRole = document.getElementById('headerUserRole');

    if (!this.currentUser) {
      if (lockScreen) {
        lockScreen.classList.remove('hidden');
        lockScreen.style.display = 'flex';
      }
      if (appShell) {
        appShell.classList.add('hidden');
        appShell.style.display = 'none';
      }
    } else {
      if (lockScreen) {
        lockScreen.classList.add('hidden');
        lockScreen.style.display = 'none';
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.display = 'flex';
      }

      if (headerUserName) headerUserName.textContent = this.currentUser.fullName || this.currentUser.username;
      if (headerUserRole) {
        headerUserRole.textContent = (this.currentUser.role || 'CASHIER').toUpperCase();
        headerUserRole.className = `px-2 py-0.5 rounded text-xs font-semibold ${
          this.currentUser.role === 'admin' ? 'bg-purple-900 text-purple-200 border border-purple-600' :
          this.currentUser.role === 'manager' ? 'bg-blue-900 text-blue-200 border border-blue-600' :
          'bg-emerald-900 text-emerald-200 border border-emerald-600'
        }`;
      }

      // Hide or show navigation items based on role / permission
      document.querySelectorAll('[data-permission]').forEach(el => {
        const requiredMod = el.getAttribute('data-permission');
        if (this.hasPermission(requiredMod)) {
          el.classList.remove('hidden');
          el.style.display = '';
        } else {
          el.classList.add('hidden');
          el.style.display = 'none';
        }
      });
    }
  },

  // ==========================================
  // USER MANAGEMENT & PERMISSIONS ENGINE (Admin)
  // ==========================================

  async renderUsersTable() {
    const tbody = document.getElementById('usersManagementTableBody');
    if (!tbody) return;

    const users = await db.users.toArray();
    tbody.innerHTML = users.map(u => {
      const perms = u.permissions || {};
      const permBadges = Object.keys(perms)
        .filter(k => perms[k])
        .map(k => `<span class="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded text-[9px] mr-1 mb-0.5 inline-block">${k}</span>`)
        .join('');

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
          <td class="p-3">
            <div class="font-bold text-slate-100">${u.fullName || u.username}</div>
            <div class="text-slate-400 font-mono text-[11px]">@${u.username} &bull; PIN: ${u.pin || '----'}</div>
          </td>
          <td class="p-3">
            <span class="px-2 py-0.5 rounded text-xs font-bold ${
              u.role === 'admin' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
              u.role === 'manager' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
              'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }">
              ${u.role.toUpperCase()}
            </span>
          </td>
          <td class="p-3 max-w-[280px]">
            ${permBadges || '<span class="text-slate-500 text-[10px]">Default Role Permissions</span>'}
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${
              u.active !== 0 ? 'bg-emerald-950 text-emerald-300' : 'bg-rose-950 text-rose-300'
            }">
              ${u.active !== 0 ? 'ACTIVE' : 'DISABLED'}
            </span>
          </td>
          <td class="p-3 text-right space-x-1 whitespace-nowrap">
            <button onclick="AuthManager.openEditUserModal(${u.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit User & Permissions">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            ${u.username !== 'admin' ? `
              <button onclick="AuthManager.deleteUser(${u.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete User">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  },

  openAddUserModal() {
    document.getElementById('userFormTitle').textContent = I18n.currentLang === 'si' ? 'නව පරිශීලකයෙක් එක් කරන්න' : 'Add New User';
    document.getElementById('userModalForm').reset();
    document.getElementById('editUserIdInput').value = '';
    document.getElementById('userRoleSelect').value = 'cashier';
    this.updatePermissionCheckboxesByRole('cashier');
    document.getElementById('userModal').classList.remove('hidden');
  },

  async openEditUserModal(id) {
    const user = await db.users.get(id);
    if (!user) return;

    document.getElementById('userFormTitle').textContent = I18n.currentLang === 'si' ? 'පරිශීලක විස්තර සංස්කරණය' : 'Edit User & Permissions';
    document.getElementById('editUserIdInput').value = user.id;
    document.getElementById('userNameInput').value = user.fullName || '';
    document.getElementById('userUsernameInput').value = user.username;
    document.getElementById('userPasswordInput').value = user.password || '';
    document.getElementById('userPinInput').value = user.pin || '';
    document.getElementById('userRoleSelect').value = user.role;
    document.getElementById('userActiveCheckbox').checked = user.active !== 0;

    const perms = user.permissions || {};
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
      const permKey = cb.getAttribute('data-perm');
      if (perms[permKey] !== undefined) {
        cb.checked = !!perms[permKey];
      } else {
        cb.checked = user.role === 'admin' || (user.role === 'manager' && !['settings', 'users'].includes(permKey)) || (user.role === 'cashier' && ['pos', 'customers', 'shifts'].includes(permKey));
      }
    });

    document.getElementById('userModal').classList.remove('hidden');
  },

  updatePermissionCheckboxesByRole(role) {
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
      const permKey = cb.getAttribute('data-perm');
      if (role === 'admin') {
        cb.checked = true;
      } else if (role === 'manager') {
        const managerAllowed = ['dashboard', 'pos', 'inventory', 'grn', 'customers', 'credit', 'suppliers', 'expenses', 'shifts', 'reports', 'allowDiscount'];
        cb.checked = managerAllowed.includes(permKey);
      } else {
        const cashierAllowed = ['dashboard', 'pos', 'customers', 'credit', 'shifts'];
        cb.checked = cashierAllowed.includes(permKey);
      }
    });
  },

  async saveUser(event) {
    event.preventDefault();
    const id = document.getElementById('editUserIdInput').value;
    const fullName = document.getElementById('userNameInput').value.trim();
    const username = document.getElementById('userUsernameInput').value.trim().toLowerCase();
    const password = document.getElementById('userPasswordInput').value.trim();
    const pin = document.getElementById('userPinInput').value.trim() || '1234';
    const role = document.getElementById('userRoleSelect').value;
    const active = document.getElementById('userActiveCheckbox').checked ? 1 : 0;

    const permissions = {};
    document.querySelectorAll('.perm-checkbox').forEach(cb => {
      const permKey = cb.getAttribute('data-perm');
      permissions[permKey] = cb.checked;
    });

    const userData = { fullName, username, password, pin, role, active, permissions };

    if (id) {
      const numId = parseInt(id);
      await db.users.update(numId, userData);
      if (this.currentUser && this.currentUser.id === numId) {
        this.currentUser = { ...this.currentUser, ...userData, id: numId };
        sessionStorage.setItem('lankapos_user', JSON.stringify(this.currentUser));
        this.updateUI();
      }
    } else {
      const existing = await db.users.where('username').equals(username).first();
      if (existing) {
        alert(`Username "${username}" already exists! Please pick another.`);
        return;
      }
      await db.users.add(userData);
    }

    document.getElementById('userModal').classList.add('hidden');
    await this.renderUsersTable();
    SoundManager.playSuccessChime();
    alert('User and permissions saved successfully!');
  },

  async deleteUser(id) {
    if (confirm('Are you sure you want to delete this user?')) {
      await db.users.delete(id);
      await this.renderUsersTable();
    }
  }
};

window.AuthManager = AuthManager;
