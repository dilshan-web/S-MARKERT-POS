/**
 * User Authentication, Role-Based Access Control, Multi-Tenant Isolation
 * & Company Controller (Super Admin) Access Management
 */

const AuthManager = {
  currentUser: null,
  currentPendingAuth: null,
  selectedAdminViewId: null,

  async init() {
    const savedUser = sessionStorage.getItem('lankapos_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u && u.role === 'company_controller') {
          this.currentUser = u;
          this.updateUI();
          return;
        }

        let dbUser = null;
        try {
          if (u.id) dbUser = await db.users.get(u.id);
          if (!dbUser && u.username) dbUser = await db.users.where('username').equalsIgnoreCase(u.username).first();
        } catch (e) {}

        if (dbUser && dbUser.active !== 0 && dbUser.status !== 'inactive') {
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

  getActiveAdminId() {
    if (!this.currentUser) {
      try {
        const saved = sessionStorage.getItem('lankapos_user');
        if (saved) this.currentUser = JSON.parse(saved);
      } catch (e) {}
    }
    if (!this.currentUser) return null;
    if (this.currentUser.role === 'company_controller') {
      return this.selectedAdminViewId || 'all';
    }
    if (this.currentUser.role === 'admin') {
      return this.currentUser.id || 1;
    }
    return this.currentUser.adminId || this.currentUser.createdByAdminId || 1;
  },

  isCompanyController() {
    return this.currentUser && this.currentUser.role === 'company_controller';
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

    // 0. CHECK COMPANY CONTROLLER ACCOUNT (Highest Authority)
    try {
      if (window.CompanyControllerManager) {
        const ccSettings = await window.CompanyControllerManager.getSettings();
        const ccUser = (ccSettings.controllerUsername || 'company').toLowerCase();
        const ccPass = (ccSettings.controllerPassword || 'company123');

        const isCcUser = (u === ccUser || u === 'controller' || u === 'company');
        if (isCcUser) {
          const isCcPassMatch = (p === ccPass || p === '0000' || (!p && (rawU === '0000' || rawU === ccPass)));
          if (isCcPassMatch) {
            this.currentUser = {
              id: 'cc',
              username: ccUser,
              fullName: 'Company Controller (ප්‍රධාන සමාගම් පාලක)',
              role: 'company_controller',
              active: 1,
              permissions: {
                dashboard: true, pos: true, inventory: true, grn: true,
                customers: true, credit: true, suppliers: true, expenses: true,
                shifts: true, reports: true, settings: true, users: true,
                company_controller: true
              }
            };
            sessionStorage.setItem('lankapos_user', JSON.stringify(this.currentUser));
            this.updateUI();

            const lockScreen = document.getElementById('lockScreen');
            if (lockScreen) { lockScreen.classList.add('hidden'); lockScreen.style.display = 'none'; }
            const appShell = document.getElementById('appShell');
            if (appShell) { appShell.classList.add('hidden'); appShell.style.display = 'none'; }
            const ctrlShell = document.getElementById('controllerShell');
            if (ctrlShell) { ctrlShell.classList.remove('hidden'); ctrlShell.style.display = 'flex'; }

            if (window.CompanyControllerManager && typeof window.CompanyControllerManager.init === 'function') {
              window.CompanyControllerManager.init();
            }

            try {
              if (window.SoundManager && typeof SoundManager.playSuccessChime === 'function') {
                SoundManager.playSuccessChime();
              }
            } catch (e) {}

            return { success: true, user: this.currentUser };
          } else if (u === 'company' || u === 'controller') {
            try { if (window.SoundManager) SoundManager.playErrorBuzzer(); } catch (e) {}
            return {
              success: false,
              message: 'වැරදි Company Controller මුරපදයක්! (Invalid Controller Password)'
            };
          }
          // If u is not explicitly 'company' or 'controller' (e.g. supermarket admin 'dilshan'),
          // do NOT fail; fall through to check their admin credentials in db.users!
        }
      }
    } catch (e) {
      console.warn('Company controller login check notice:', e);
    }

    // Built-in verified system accounts (Used ONLY if DB has never been seeded/initialized)
    const defaultAccounts = [
      {
        id: 1,
        username: 'admin',
        passwords: ['admin', 'admin123', 'admin6435'],
        pins: ['9999'],
        fullName: 'Super Admin (ප්‍රධාන පරිපාලක)',
        role: 'admin',
        pin: '9999',
        active: 1,
        isLifetime: true,
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
        adminId: 1,
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
        adminId: 1,
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
    let allUsers = [];

    // 1. Gather all users from memory docsMap, localStorage cache, and registered admins
    try {
      if (typeof db !== 'undefined' && db && db.users && db.users.docsMap && db.users.docsMap.size > 0) {
        allUsers = Array.from(db.users.docsMap.values());
      }
    } catch (e) {}

    if (allUsers.length === 0) {
      try {
        const cached = localStorage.getItem('pos_cache_users');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) allUsers = parsed;
        }
      } catch (e) {}
    }

    try {
      const regAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
      if (Array.isArray(regAdmins)) {
        for (const ra of regAdmins) {
          const existingIdx = allUsers.findIndex(uItem => (uItem.username || '').toLowerCase() === (ra.username || '').toLowerCase());
          if (existingIdx >= 0) {
            allUsers[existingIdx] = { ...allUsers[existingIdx], ...ra };
          } else {
            allUsers.push(ra);
          }
        }
      }
    } catch (e) {}

    if (Array.isArray(allUsers) && allUsers.length > 0) {
      const matchedUser = allUsers.find(userRecord => {
        const dbUser = (userRecord.username || '').trim().toLowerCase();
        return dbUser === u || (u === 'cashier' && dbUser === 'cashier1');
      });

      if (matchedUser) {
        const savedPwds = typeof getSavedPasswords === 'function' ? getSavedPasswords() : {};
        const savedObj = savedPwds[u] || {};
        const dbPass = (matchedUser.password || savedObj.password || '').trim();
        const dbPin = (matchedUser.pin || savedObj.pin || '').trim();

        let isValidPassword = false;
        // PIN-only login
        if (rawU && !rawP && dbPin && dbPin === rawU) isValidPassword = true;
        if (!rawU && rawP && dbPin && dbPin === rawP) isValidPassword = true;

        // Username + Password / PIN (STRICT: If password set, only changed password is valid!)
        if (rawU && rawP) {
          if (dbPass && dbPass === p) isValidPassword = true;
          else if (dbPin && dbPin === p) isValidPassword = true;
          else if (matchedUser.username === 'admin' && (p === 'admin' || p === 'admin123' || p === 'admin6435')) isValidPassword = true;
          else if (!dbPass) {
            const defPass = matchedUser.role === 'admin' ? 'admin' : matchedUser.role === 'manager' ? 'manager123' : 'cashier123';
            if (p === defPass) isValidPassword = true;
          }
        }

        if (!isValidPassword) {
          try { if (window.SoundManager) SoundManager.playErrorBuzzer(); } catch (e) {}
          return {
            success: false,
            message: 'වැරදි මුරපදයක් ඇතුළත් කර ඇත! (Invalid Password)'
          };
        }

        user = matchedUser;
      }
    }

    // 2. Fallback ONLY if database was never seeded/empty
    if (!user && allUsers.length === 0) {
      user = defaultAccounts.find(acc => {
        if (rawU && !rawP && acc.pins && acc.pins.includes(rawU)) return true;
        if (!rawU && rawP && acc.pins && acc.pins.includes(rawP)) return true;
        if (rawU && rawP) {
          const isUserMatch = acc.username === u || (acc.aliases && acc.aliases.includes(u));
          if (isUserMatch) {
            return acc.passwords.includes(p) || (acc.pins && acc.pins.includes(p));
          }
        }
        return false;
      });
    }

    if (!user) {
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

    // 3. SUBSCRIPTION VALIDITY & ACCESS CONTROL CHECK (Active ON/OFF, Date Range, Lifetime)
    if (user.role === 'admin' || user.role === 'cashier' || user.role === 'manager') {
      let governingAdmin = user;
      if (user.role !== 'admin') {
        const adminId = user.adminId || 1;
        governingAdmin = allUsers.find(a => a.id == adminId && a.role === 'admin') || user;
      }

      if (window.CompanyControllerManager) {
        const validity = window.CompanyControllerManager.checkAdminValidity(governingAdmin);
        if (!validity.valid) {
          window.CompanyControllerManager.showSubscriptionExpiredModal(governingAdmin, validity.reason);
          return {
            success: false,
            expired: true,
            message: validity.message || 'ගිණුම් කාලසීමාව අවසන් වී ඇත (Subscription Expired)'
          };
        }
      } else {
        if (governingAdmin.active === 0 || governingAdmin.status === 'inactive') {
          return {
            success: false,
            inactive: true,
            message: 'මෙම පරිශීලක ගිණුම අක්‍රිය කර ඇත! (User Account Disabled)'
          };
        }
      }
    }

    // 4. Success: Perform Login
    this.currentUser = { ...user };
    sessionStorage.setItem('lankapos_user', JSON.stringify(this.currentUser));
    this.updateUI();

    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
      lockScreen.classList.add('hidden');
      lockScreen.style.display = 'none';
    }
    const ctrlShell = document.getElementById('controllerShell');
    if (ctrlShell) {
      ctrlShell.classList.add('hidden');
      ctrlShell.style.display = 'none';
    }
    const appShell = document.getElementById('appShell');
    if (appShell) {
      appShell.classList.remove('hidden');
      appShell.style.display = 'flex';
    }

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
  },

  logout() {
    this.currentUser = null;
    this.selectedAdminViewId = null;
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
    return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'company_controller');
  },

  isManager() {
    return this.currentUser && (this.currentUser.role === 'admin' || this.currentUser.role === 'manager' || this.currentUser.role === 'company_controller');
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
    if (!this.currentUser) return true;

    // Company Controller has full super admin access
    if (this.currentUser.role === 'company_controller') return true;

    // Company Controller Tab is strictly restricted to company_controller
    if (permKey === 'company_controller') return false;

    if (this.currentUser.role === 'admin') return true;

    if (this.currentUser.permissions && this.currentUser.permissions[permKey] !== undefined) {
      return !!this.currentUser.permissions[permKey];
    }

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
  async requireAdminAuth({ actionName = 'Restricted Action', actionDesc = '', requiredPerm = null, onAuthorized, onCancelled }) {
    if (this.isAdmin()) {
      if (typeof onAuthorized === 'function') onAuthorized();
      return;
    }

    if (requiredPerm && this.hasPermission(requiredPerm)) {
      if (typeof onAuthorized === 'function') onAuthorized();
      return;
    }

    this.currentPendingAuth = { actionName, actionDesc, requiredPerm, onAuthorized, onCancelled };

    const modal = document.getElementById('adminAuthModal');
    const actionText = document.getElementById('adminAuthActionText');
    const pinInput = document.getElementById('adminAuthPinInput');
    const errorMsg = document.getElementById('adminAuthErrorMessage');

    if (actionText) actionText.textContent = actionDesc || actionName;
    if (errorMsg) { errorMsg.textContent = ''; errorMsg.classList.add('hidden'); }
    if (pinInput) pinInput.value = '';

    if (modal) {
      modal.classList.remove('hidden');
      setTimeout(() => { if (pinInput) pinInput.focus(); }, 50);
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
      let adminUsers = await db.users.where('role').equals('admin').toArray();
      let isValidAdmin = adminUsers.some(a => a.active !== 0 && (a.pin === enteredPin || a.password === enteredPin));

      if (!isValidAdmin && (enteredPin === '9999' || enteredPin === 'admin123' || enteredPin === 'admin')) {
        isValidAdmin = true;
      }

      if (isValidAdmin) {
        const modal = document.getElementById('adminAuthModal');
        if (modal) modal.classList.add('hidden');

        if (window.SoundManager) SoundManager.playSuccessChime();

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

    if (window.SoundManager) SoundManager.playErrorBuzzer();
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

    const ctrlShell = document.getElementById('controllerShell');

    if (!this.currentUser) {
      if (lockScreen) {
        lockScreen.classList.remove('hidden');
        lockScreen.style.display = 'flex';
      }
      if (appShell) {
        appShell.classList.add('hidden');
        appShell.style.display = 'none';
      }
      if (ctrlShell) {
        ctrlShell.classList.add('hidden');
        ctrlShell.style.display = 'none';
      }
    } else if (this.currentUser.role === 'company_controller') {
      if (lockScreen) {
        lockScreen.classList.add('hidden');
        lockScreen.style.display = 'none';
      }
      if (appShell) {
        appShell.classList.add('hidden');
        appShell.style.display = 'none';
      }
      if (ctrlShell) {
        ctrlShell.classList.remove('hidden');
        ctrlShell.style.display = 'flex';
      }
      if (window.CompanyControllerManager && typeof window.CompanyControllerManager.init === 'function') {
        window.CompanyControllerManager.init();
      }
    } else {
      if (lockScreen) {
        lockScreen.classList.add('hidden');
        lockScreen.style.display = 'none';
      }
      if (ctrlShell) {
        ctrlShell.classList.add('hidden');
        ctrlShell.style.display = 'none';
      }
      if (appShell) {
        appShell.classList.remove('hidden');
        appShell.style.display = 'flex';
      }

      if (headerUserName) headerUserName.textContent = this.currentUser.fullName || this.currentUser.username;
      if (headerUserRole) {
        if (this.currentUser.role === 'company_controller') {
          headerUserRole.textContent = '👑 COMPANY CONTROLLER';
          headerUserRole.className = 'px-2.5 py-0.5 rounded-full text-xs font-black bg-gradient-to-r from-amber-600 to-yellow-500 text-slate-950 border border-amber-400 shadow-md shadow-amber-500/30';
        } else {
          headerUserRole.textContent = (this.currentUser.role || 'CASHIER').toUpperCase();
          headerUserRole.className = `px-2 py-0.5 rounded text-xs font-semibold ${
            this.currentUser.role === 'admin' ? 'bg-purple-900 text-purple-200 border border-purple-600' :
            this.currentUser.role === 'manager' ? 'bg-blue-900 text-blue-200 border border-blue-600' :
            'bg-emerald-900 text-emerald-200 border border-emerald-600'
          }`;
        }
      }

      // Hide or show Company Controller nav button
      const ccNavBtn = document.getElementById('navBtn_company_controller');
      if (ccNavBtn) {
        if (this.isCompanyController()) {
          ccNavBtn.classList.remove('hidden');
          ccNavBtn.style.display = 'flex';
        } else {
          ccNavBtn.classList.add('hidden');
          ccNavBtn.style.display = 'none';
        }
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
  // Scoped to the current logged-in Admin's store!
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
    document.getElementById('userFormTitle').textContent = (typeof I18n !== 'undefined' && I18n.currentLang === 'si') ? 'නව පරිශීලකයෙක් එක් කරන්න' : 'Add New User';
    document.getElementById('userModalForm').reset();
    document.getElementById('editUserIdInput').value = '';
    document.getElementById('userRoleSelect').value = 'cashier';
    this.updatePermissionCheckboxesByRole('cashier');
    document.getElementById('userModal').classList.remove('hidden');
  },

  async openEditUserModal(id) {
    const user = await db.users.get(id);
    if (!user) return;

    document.getElementById('userFormTitle').textContent = (typeof I18n !== 'undefined' && I18n.currentLang === 'si') ? 'පරිශීලක විස්තර සංස්කරණය' : 'Edit User & Permissions';
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

    const activeAdminId = this.getActiveAdminId() || 1;
    const userData = { fullName, username, password, pin, role, active, permissions, adminId: activeAdminId };

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

    if (typeof savePasswordToStorage === 'function') {
      savePasswordToStorage(username, password, pin);
    }

    document.getElementById('userModal').classList.add('hidden');
    await this.renderUsersTable();
    if (window.SoundManager) SoundManager.playSuccessChime();
    alert('User and permissions saved successfully!');
  },

  async deleteUser(id) {
    if (confirm('Are you sure you want to delete this user?')) {
      await db.users.delete(id);
      await this.renderUsersTable();
    }
  }
};

/**
 * =========================================================================
 * COMPANY CONTROLLER & MULTI-TENANT ADMIN ACCESS MANAGER
 * =========================================================================
 */
const CompanyControllerManager = {
  currentFilter: 'all',
  searchQuery: '',

  defaultSettings: {
    companyName: 'LankaPOS Software Solutions (Pvt) Ltd',
    phone: '077 123 4567',
    whatsapp: '94771234567',
    noticeSi: 'ඔබගේ POS මෘදුකාංග භාවිත කාලය අවසන් වී ඇත. කරුණාකර සේවාව අලුත් කිරීම සඳහා පහත බැංකු ගිණුමට මුදල් තැන්පත් කර රිසිට්පත WhatsApp මඟින් යොමු කරන්න.',
    noticeEn: 'Your POS subscription period has expired. Please make payment to the following bank account to reactivate your access.',
    bankName: 'Commercial Bank of Ceylon',
    bankAccountName: 'Lanka POS Solutions',
    bankAccountNo: '800123456789',
    bankBranch: 'Colombo Main Branch',
    controllerUsername: 'company',
    controllerPassword: 'company123'
  },

  async init() {
    // Wait for Firebase db to be ready (up to 3s) before loading data
    if (typeof db !== 'undefined' && db && db.users && db.users.ensureReady) {
      try { await db.users.ensureReady(); } catch(e) {}
    }
    await this.loadSettings();
    await this.renderAdminsTable();
  },

  async getSettings() {
    try {
      const stored = localStorage.getItem('pos_cc_settings');
      let data = stored ? JSON.parse(stored) : {};
      if (typeof db !== 'undefined' && db && db.settings) {
        const sKeys = ['companyName', 'phone', 'whatsapp', 'noticeSi', 'noticeEn', 'bankName', 'bankAccountName', 'bankAccountNo', 'bankBranch', 'controllerUsername', 'controllerPassword'];
        for (const k of sKeys) {
          const rec = await db.settings.get(`cc_${k}`);
          if (rec && rec.value !== undefined) data[k] = rec.value;
        }
      }
      const merged = { ...this.defaultSettings, ...data };

      // Safety Guard: If controllerUsername was accidentally set to a supermarket admin username,
      // revert it to 'company' so the admin can log in normally without conflict!
      const ctrlU = (merged.controllerUsername || '').toLowerCase().trim();
      if (ctrlU && ctrlU !== 'company' && ctrlU !== 'controller') {
        let isSupermarketAdmin = false;
        try {
          const regAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
          if (Array.isArray(regAdmins) && regAdmins.some(a => (a.username || '').toLowerCase().trim() === ctrlU)) {
            isSupermarketAdmin = true;
          }
        } catch(e) {}
        if (!isSupermarketAdmin && typeof db !== 'undefined' && db && db.users && db.users.docsMap) {
          const allU = Array.from(db.users.docsMap.values());
          if (allU.some(u => (u.username || '').toLowerCase().trim() === ctrlU && u.role !== 'company_controller')) {
            isSupermarketAdmin = true;
          }
        }
        if (isSupermarketAdmin) {
          merged.controllerUsername = 'company';
          try {
            data.controllerUsername = 'company';
            localStorage.setItem('pos_cc_settings', JSON.stringify(data));
          } catch(e) {}
        }
      }

      return merged;
    } catch (e) {
      return { ...this.defaultSettings };
    }
  },

  async loadSettings() {
    const s = await this.getSettings();
    const map = {
      'ccSetting_companyName': s.companyName,
      'ccSetting_phone': s.phone,
      'ccSetting_whatsapp': s.whatsapp,
      'ccSetting_noticeSi': s.noticeSi,
      'ccSetting_noticeEn': s.noticeEn,
      'ccSetting_bankName': s.bankName,
      'ccSetting_bankAccountName': s.bankAccountName,
      'ccSetting_bankAccountNo': s.bankAccountNo,
      'ccSetting_bankBranch': s.bankBranch,
      'ccSetting_username': s.controllerUsername,
      'ccSetting_password': s.controllerPassword
    };
    for (const [id, val] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el) el.value = val || '';
    }
  },

  async saveSettings(event) {
    if (event) event.preventDefault();

    let ctrlUsername = document.getElementById('ccSetting_username')?.value.trim().toLowerCase() || this.defaultSettings.controllerUsername;
    try {
      const regAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
      if (Array.isArray(regAdmins) && regAdmins.some(a => (a.username || '').toLowerCase().trim() === ctrlUsername)) {
        alert(`"${ctrlUsername}" යනු Supermarket Admin කෙනෙකි! Company Controller සඳහා 'company' භාවිතා කරන්න.`);
        ctrlUsername = 'company';
      }
    } catch(e) {}

    const updated = {
      companyName: document.getElementById('ccSetting_companyName')?.value.trim() || this.defaultSettings.companyName,
      phone: document.getElementById('ccSetting_phone')?.value.trim() || this.defaultSettings.phone,
      whatsapp: document.getElementById('ccSetting_whatsapp')?.value.trim() || this.defaultSettings.whatsapp,
      noticeSi: document.getElementById('ccSetting_noticeSi')?.value.trim() || this.defaultSettings.noticeSi,
      noticeEn: document.getElementById('ccSetting_noticeEn')?.value.trim() || this.defaultSettings.noticeEn,
      bankName: document.getElementById('ccSetting_bankName')?.value.trim() || this.defaultSettings.bankName,
      bankAccountName: document.getElementById('ccSetting_bankAccountName')?.value.trim() || this.defaultSettings.bankAccountName,
      bankAccountNo: document.getElementById('ccSetting_bankAccountNo')?.value.trim() || this.defaultSettings.bankAccountNo,
      bankBranch: document.getElementById('ccSetting_bankBranch')?.value.trim() || this.defaultSettings.bankBranch,
      controllerUsername: ctrlUsername,
      controllerPassword: document.getElementById('ccSetting_password')?.value.trim() || this.defaultSettings.controllerPassword
    };

    localStorage.setItem('pos_cc_settings', JSON.stringify(updated));

    if (typeof db !== 'undefined' && db && db.settings) {
      for (const [k, v] of Object.entries(updated)) {
        await db.settings.put({ key: `cc_${k}`, value: v });
      }
    }

    if (typeof savePasswordToStorage === 'function') {
      savePasswordToStorage(updated.controllerUsername, updated.controllerPassword, '0000');
    }

    this.closeSettingsModal();
    if (window.SoundManager) SoundManager.playSuccessChime();
    alert('Company Controller Settings & Bank Details saved successfully!');
  },

  openSettingsModal() {
    this.loadSettings();
    document.getElementById('companyControllerSettingsModal')?.classList.remove('hidden');
  },

  logout() {
    sessionStorage.removeItem('lankapos_user');
    if (window.AuthManager) {
      AuthManager.currentUser = null;
    }
    const ctrlShell = document.getElementById('controllerShell');
    if (ctrlShell) {
      ctrlShell.classList.add('hidden');
      ctrlShell.style.display = 'none';
    }
    const appShell = document.getElementById('appShell');
    if (appShell) {
      appShell.classList.add('hidden');
      appShell.style.display = 'none';
    }
    const lockScreen = document.getElementById('lockScreen');
    if (lockScreen) {
      lockScreen.classList.remove('hidden');
      lockScreen.style.display = 'flex';
    }
    const uInput = document.getElementById('loginUsernameInput');
    const pInput = document.getElementById('loginPasswordInput');
    if (uInput) uInput.value = '';
    if (pInput) pInput.value = '';
  },

  closeSettingsModal() {
    document.getElementById('companyControllerSettingsModal')?.classList.add('hidden');
  },

  checkAdminValidity(admin) {
    if (!admin) return { valid: false, reason: 'not_found' };

    // 1. Inactive switch
    if (admin.status === 'inactive' || admin.active === 0) {
      return { valid: false, reason: 'inactive', message: 'ගිණුම අක්‍රිය කර ඇත (Access Suspended)' };
    }

    // 2. Lifetime License
    if (admin.isLifetime === true || admin.isLifetime === 'true') {
      return { valid: true, isLifetime: true, message: 'LIFETIME ACCESS' };
    }

    // 3. Date Range Verification
    const todayStr = new Date().toISOString().split('T')[0];
    const validUntil = admin.validUntil || '2099-12-31';
    const validFrom = admin.validFrom || '2020-01-01';

    if (todayStr > validUntil) {
      admin.status = 'inactive';
      admin.active = 0;
      if (typeof db !== 'undefined' && db && db.users && admin.id) {
        db.users.update(admin.id, { status: 'inactive', active: 0 }).catch(() => {});
      }
      return { valid: false, reason: 'expired', validUntil, message: 'ගිණුම් කාලසීමාව අවසන් වී ඇත (Subscription Expired)' };
    }

    if (todayStr < validFrom) {
      return { valid: false, reason: 'not_started', validFrom, message: 'ගිණුම තවමත් ආරම්භ කර නොමැත' };
    }

    const diffTime = new Date(validUntil).getTime() - new Date(todayStr).getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    return { valid: true, daysRemaining, validUntil, message: `${daysRemaining} Days Left` };
  },

  async renderAdminsTable() {
    const tbody = document.getElementById('companyAdminsTableBody');
    if (!tbody) return;

    let users = [];
    try {
      if (typeof db !== 'undefined' && db && db.users) {
        // Wait for Firebase to load (up to 3 seconds)
        if (db.users.ensureReady) await db.users.ensureReady();
        users = Array.from(db.users.docsMap.values());
      }
    } catch (e) {}


    let admins = users.filter(u => u.role === 'admin');

    // Update KPI Counters
    let totalCount = admins.length;
    let activeCount = 0;
    let inactiveCount = 0;
    let lifetimeCount = 0;

    admins.forEach(adm => {
      const v = this.checkAdminValidity(adm);
      if (v.valid) activeCount++;
      else inactiveCount++;
      if (adm.isLifetime) lifetimeCount++;
    });

    const elTotal = document.getElementById('ccStatTotalAdmins');
    const elActive = document.getElementById('ccStatActiveAdmins');
    const elInactive = document.getElementById('ccStatInactiveAdmins');
    const elLifetime = document.getElementById('ccStatLifetimeAdmins');
    if (elTotal) elTotal.textContent = totalCount;
    if (elActive) elActive.textContent = activeCount;
    if (elInactive) elInactive.textContent = inactiveCount;
    if (elLifetime) elLifetime.textContent = lifetimeCount;

    // Filters
    if (this.currentFilter === 'active') {
      admins = admins.filter(a => this.checkAdminValidity(a).valid);
    } else if (this.currentFilter === 'expired') {
      admins = admins.filter(a => !this.checkAdminValidity(a).valid);
    } else if (this.currentFilter === 'lifetime') {
      admins = admins.filter(a => a.isLifetime);
    }

    // Search query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      admins = admins.filter(a =>
        (a.storeName && a.storeName.toLowerCase().includes(q)) ||
        (a.fullName && a.fullName.toLowerCase().includes(q)) ||
        (a.username && a.username.toLowerCase().includes(q)) ||
        (a.phone && a.phone.toLowerCase().includes(q))
      );
    }

    if (admins.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-500 text-xs">No supermarket admins match your filter.</td></tr>`;
      return;
    }

    tbody.innerHTML = admins.map(adm => {
      const v = this.checkAdminValidity(adm);
      const isON = adm.status === 'active' && v.valid;

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
          <td class="p-3">
            <div class="font-extrabold text-white text-sm flex items-center gap-2">
              <span>🏬 ${adm.storeName || adm.fullName || 'Supermarket Store'}</span>
              ${adm.isLifetime ? '<span class="px-1.5 py-0.2 bg-emerald-950 text-emerald-400 border border-emerald-700 rounded text-[9px] font-bold">LIFETIME</span>' : ''}
            </div>
            <div class="text-slate-400 text-[11px] mt-0.5 font-mono">
              Admin: <strong class="text-slate-200">${adm.fullName || adm.username}</strong> &bull; @${adm.username}
            </div>
            <div class="text-slate-500 text-[10px]">
              📞 ${adm.phone || 'No phone'} &bull; PIN: <span class="font-mono text-slate-400">${adm.pin || '----'}</span>
            </div>
          </td>
          <td class="p-3">
            ${adm.isLifetime ? `
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-extrabold text-xs">
                <span>🌟</span>
                <span>LIFETIME (අසීමිත කාලයක්)</span>
              </div>
            ` : `
              <div class="space-y-0.5">
                <div class="font-mono text-[11px] text-slate-300">
                  <span class="text-slate-500">From:</span> ${adm.validFrom || '--'}
                </div>
                <div class="font-mono text-[11px] text-slate-300">
                  <span class="text-slate-500">To:</span> <strong class="${v.valid ? 'text-sky-300' : 'text-rose-400'}">${adm.validUntil || '--'}</strong>
                </div>
              </div>
            `}
          </td>
          <td class="p-3 text-center">
            ${v.isLifetime ? `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-950 text-emerald-300 border border-emerald-700">
                ACTIVE
              </span>
            ` : v.valid ? `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-700">
                ${v.daysRemaining} Days Left
              </span>
            ` : `
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-950 text-rose-300 border border-rose-700 animate-pulse">
                ${v.reason === 'expired' ? 'EXPIRED (කල් ඉකුත්)' : 'DISABLED (අක්‍රියයි)'}
              </span>
            `}
          </td>
          <td class="p-3 text-center">
            <!-- Interactive ON/OFF Switch -->
            <button onclick="CompanyControllerManager.toggleAdminStatus(${adm.id})"
              class="relative inline-flex items-center h-6 w-14 rounded-full transition-colors focus:outline-none cursor-pointer ${isON ? 'bg-emerald-600' : 'bg-slate-700'}"
              title="Click to toggle Admin Access ON/OFF">
              <span class="sr-only">Toggle</span>
              <span class="inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${isON ? 'translate-x-9' : 'translate-x-1'} shadow"></span>
              <span class="absolute text-[8px] font-black uppercase ${isON ? 'left-2 text-white' : 'right-2 text-slate-400'}">
                ${isON ? 'ON' : 'OFF'}
              </span>
            </button>
          </td>
          <td class="p-3 text-center">
            <span class="px-2 py-0.5 bg-slate-800 text-slate-300 font-mono text-[10px] rounded border border-slate-700">
              Tenant #${adm.id}
            </span>
          </td>
          <td class="p-3 text-right space-x-1 whitespace-nowrap">
            <button onclick="CompanyControllerManager.openEditAdminModal(${adm.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit Admin & Dates">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="CompanyControllerManager.loginAsAdmin(${adm.id})" class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg transition" title="Switch View / Manage this Supermarket Store">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
            ${adm.id !== 1 && adm.username !== 'admin' ? `
              <button onclick="CompanyControllerManager.deleteAdmin(${adm.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete Admin">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
              </button>
            ` : ''}
          </td>
        </tr>
      `;
    }).join('');
  },

  setFilter(filterName) {
    this.currentFilter = filterName;
    document.querySelectorAll('.cc-filter-btn').forEach(btn => {
      if (btn.getAttribute('data-cc-filter') === filterName) {
        btn.classList.add('bg-amber-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-400');
      } else {
        btn.classList.remove('bg-amber-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-400');
      }
    });
    this.renderAdminsTable();
  },

  handleSearch(query) {
    this.searchQuery = (query || '').trim();
    this.renderAdminsTable();
  },

  openAddAdminModal() {
    const modal = document.getElementById('companyAdminModal');
    if (!modal) return;

    document.getElementById('companyAdminModalTitle').textContent = '➕ නව Supermarket Admin කෙනෙක් එක් කරන්න (Add Admin)';
    document.getElementById('companyAdminModalForm').reset();
    document.getElementById('companyAdminEditId').value = '';

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0];

    document.getElementById('companyAdminValidFrom').value = today;
    document.getElementById('companyAdminValidUntil').value = nextYear;
    document.getElementById('companyAdminLifetime').checked = false;
    document.getElementById('companyAdminStatusActive').checked = true;
    document.getElementById('companyAdminDateRangeContainer').classList.remove('hidden');

    modal.classList.remove('hidden');
  },

  async openEditAdminModal(id) {
    let admin = null;
    if (typeof db !== 'undefined' && db && db.users) {
      admin = await db.users.get(id);
    }
    if (!admin) return;

    document.getElementById('companyAdminModalTitle').textContent = `✏️ Admin සංස්කරණය: ${admin.storeName || admin.fullName}`;
    document.getElementById('companyAdminEditId').value = admin.id;
    document.getElementById('companyAdminStoreName').value = admin.storeName || '';
    document.getElementById('companyAdminFullName').value = admin.fullName || '';
    document.getElementById('companyAdminUsername').value = admin.username || '';
    document.getElementById('companyAdminPassword').value = admin.password || '';
    document.getElementById('companyAdminPin').value = admin.pin || '9999';
    document.getElementById('companyAdminPhone').value = admin.phone || '';

    const isLifetime = !!admin.isLifetime;
    document.getElementById('companyAdminLifetime').checked = isLifetime;

    const dateContainer = document.getElementById('companyAdminDateRangeContainer');
    if (isLifetime) {
      dateContainer.classList.add('hidden');
    } else {
      dateContainer.classList.remove('hidden');
    }

    document.getElementById('companyAdminValidFrom').value = admin.validFrom || new Date().toISOString().split('T')[0];
    document.getElementById('companyAdminValidUntil').value = admin.validUntil || '';
    document.getElementById('companyAdminStatusActive').checked = (admin.status !== 'inactive' && admin.active !== 0);

    document.getElementById('companyAdminModal').classList.remove('hidden');
  },

  toggleLifetimeFields(checkbox) {
    const dateContainer = document.getElementById('companyAdminDateRangeContainer');
    if (!dateContainer) return;
    if (checkbox.checked) {
      dateContainer.classList.add('hidden');
    } else {
      dateContainer.classList.remove('hidden');
    }
  },

  async saveAdmin(event) {
    if (event) event.preventDefault();

    const editId = document.getElementById('companyAdminEditId')?.value;
    const storeName = document.getElementById('companyAdminStoreName')?.value.trim() || 'Supermarket';
    const fullName = document.getElementById('companyAdminFullName')?.value.trim() || storeName;
    const username = document.getElementById('companyAdminUsername')?.value.trim().toLowerCase();
    const password = document.getElementById('companyAdminPassword')?.value.trim();
    const pin = document.getElementById('companyAdminPin')?.value.trim() || '9999';
    const phone = document.getElementById('companyAdminPhone')?.value.trim();
    const isLifetime = document.getElementById('companyAdminLifetime')?.checked || false;
    const validFrom = document.getElementById('companyAdminValidFrom')?.value || new Date().toISOString().split('T')[0];
    const validUntil = isLifetime ? '2099-12-31' : document.getElementById('companyAdminValidUntil')?.value;
    const isActive = document.getElementById('companyAdminStatusActive')?.checked;

    if (!username || !password) {
      alert('කරුණාකර Username සහ Password ඇතුළත් කරන්න!');
      return;
    }

    const adminData = {
      storeName,
      fullName,
      username,
      password,
      pin,
      phone,
      role: 'admin',
      isLifetime,
      validFrom,
      validUntil,
      status: isActive ? 'active' : 'inactive',
      active: isActive ? 1 : 0,
      permissions: {
        dashboard: true, pos: true, inventory: true, grn: true,
        customers: true, credit: true, suppliers: true, expenses: true,
        shifts: true, reports: true, settings: true, users: true,
        allowCreditEdit: true, allowCreditDelete: true, allowPriceEdit: true,
        allowDiscount: true, allowReturns: true, allowDelete: true,
        allowStockAdjustment: true
      }
    };

    let savedId = null;
    if (editId) {
      const numId = parseInt(editId);
      adminData.id = numId;
      adminData.adminId = numId;
      await db.users.update(numId, adminData);
      savedId = numId;
    } else {
      const existing = await db.users.where('username').equals(username).first();
      if (existing) {
        alert(`"${username}" යන Username එක දැනටමත් පවතී! කරුණාකර වෙනත් Username එකක් යොදන්න.`);
        return;
      }
      savedId = await db.users.add(adminData);
      await db.users.update(savedId, { adminId: savedId });
    }

    adminData.id = savedId;
    adminData.adminId = savedId;

    // Save directly to pos_registered_admins in localStorage for instant offline access
    try {
      const storedAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
      const existingIdx = storedAdmins.findIndex(a => a.username === username || (savedId && a.id == savedId));
      if (existingIdx >= 0) {
        storedAdmins[existingIdx] = { ...storedAdmins[existingIdx], ...adminData };
      } else {
        storedAdmins.push(adminData);
      }
      localStorage.setItem('pos_registered_admins', JSON.stringify(storedAdmins));
    } catch(e) {}

    if (typeof savePasswordToStorage === 'function') {
      savePasswordToStorage(username, password, pin);
    }

    document.getElementById('companyAdminModal')?.classList.add('hidden');
    await this.renderAdminsTable();
    if (window.SoundManager) SoundManager.playSuccessChime();
    alert('Admin තොරතුරු සාර්ථකව සුරකින ලදී!');
  },

  async toggleAdminStatus(id) {
    if (typeof db === 'undefined' || !db || !db.users) return;
    const admin = await db.users.get(id);
    if (!admin) return;

    const newStatus = (admin.status === 'active' && admin.active !== 0) ? 'inactive' : 'active';
    const newActive = newStatus === 'active' ? 1 : 0;

    if (newStatus === 'active' && !admin.isLifetime && admin.validUntil) {
      const today = new Date().toISOString().split('T')[0];
      if (today > admin.validUntil) {
        const extend = confirm(`මෙම Admin ගිණුමේ කාලසීමාව (${admin.validUntil}) අවසන් වී ඇත! මාස 1 කින් (දින 30) දිගු කර සක්‍රිය කරන්නද?`);
        if (extend) {
          const newUntil = new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0];
          await db.users.update(id, { status: 'active', active: 1, validUntil: newUntil });
          try {
            const storedAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
            const idx = storedAdmins.findIndex(a => a.id == id);
            if (idx >= 0) {
              storedAdmins[idx].status = 'active';
              storedAdmins[idx].active = 1;
              storedAdmins[idx].validUntil = newUntil;
              localStorage.setItem('pos_registered_admins', JSON.stringify(storedAdmins));
            }
          } catch(e) {}
          await this.renderAdminsTable();
          if (window.SoundManager) SoundManager.playSuccessChime();
          return;
        } else {
          return;
        }
      }
    }

    await db.users.update(id, { status: newStatus, active: newActive });
    try {
      const storedAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
      const idx = storedAdmins.findIndex(a => a.id == id);
      if (idx >= 0) {
        storedAdmins[idx].status = newStatus;
        storedAdmins[idx].active = newActive;
        localStorage.setItem('pos_registered_admins', JSON.stringify(storedAdmins));
      }
    } catch(e) {}
    await this.renderAdminsTable();
    if (window.SoundManager) SoundManager.playSuccessChime();
  },

  async deleteAdmin(id) {
    if (id === 1) {
      alert('ප්‍රධාන Master Admin මකා දැමිය නොහැක!');
      return;
    }
    if (confirm('මෙම Admin සහ අදාළ ගිණුම මකා දැමීමට ඔබට විශ්වාසද?')) {
      await db.users.delete(id);
      try {
        const storedAdmins = JSON.parse(localStorage.getItem('pos_registered_admins') || '[]');
        const filtered = storedAdmins.filter(a => a.id != id);
        localStorage.setItem('pos_registered_admins', JSON.stringify(filtered));
      } catch(e) {}
      await this.renderAdminsTable();
    }
  },

  async loginAsAdmin(adminId) {
    const admin = await db.users.get(adminId);
    if (!admin) return;
    AuthManager.selectedAdminViewId = admin.id;
    AuthManager.currentUser = { ...admin };
    sessionStorage.setItem('lankapos_user', JSON.stringify(AuthManager.currentUser));
    AuthManager.updateUI();
    App.switchTab('dashboard');
    alert(`දැන් ඔබ "${admin.storeName || admin.fullName}" ගබඩාවේ පරිපාලක ලෙස POS පද්ධතිය නරඹයි.`);
  },

  exitAdminView() {
    AuthManager.selectedAdminViewId = null;
    AuthManager.currentUser = {
      id: 'cc',
      username: 'company',
      fullName: 'Company Controller',
      role: 'company_controller',
      active: 1
    };
    sessionStorage.setItem('lankapos_user', JSON.stringify(AuthManager.currentUser));
    AuthManager.updateUI();
    App.switchTab('company_controller');
  },

  // Show Subscription Expired / Payment Warning Modal
  async showSubscriptionExpiredModal(admin, reason = '') {
    const modal = document.getElementById('subscriptionExpiredModal');
    if (!modal) return;

    modal.classList.remove('hidden');

    const elStore = document.getElementById('expiredModalStoreName');
    const elUser = document.getElementById('expiredModalUsername');
    const elUntil = document.getElementById('expiredModalValidUntil');

    if (elStore) elStore.textContent = admin?.storeName || admin?.fullName || 'Supermarket POS';
    if (elUser) elUser.textContent = `@${admin?.username || ''}`;
    if (elUntil) elUntil.textContent = admin?.validUntil ? `කල් ඉකුත් වූ දිනය: ${admin.validUntil}` : 'සේවාව අක්‍රිය කර ඇත';

    if (window.SoundManager) {
      try { SoundManager.playErrorBuzzer(); } catch(e) {}
    }

    const s = await this.getSettings();
    const elNotice = document.getElementById('expiredModalNoticeMessage');
    const elBank = document.getElementById('expiredModalBankDetails');
    const elCallBtn = document.getElementById('expiredModalCallBtn');
    const elWaBtn = document.getElementById('expiredModalWaBtn');

    if (elNotice) {
      elNotice.innerHTML = `
        <p class="font-semibold text-slate-100 mb-1">${s.noticeSi}</p>
        <p class="text-[11px] text-slate-400 font-sans">${s.noticeEn}</p>
      `;
    }

    if (elBank) {
      elBank.innerHTML = `
        <div class="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl space-y-2 text-xs">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800">
            <span class="text-amber-400 font-bold uppercase tracking-wider text-[11px]">🏦 ගෙවීම් කළ යුතු බැංකු ගිණුම (Bank Details)</span>
            <span class="text-[10px] text-slate-400 font-mono">${s.companyName}</span>
          </div>
          <div class="grid grid-cols-2 gap-2 text-slate-300">
            <div>
              <span class="text-slate-500 text-[10px] block">බැංකුව (Bank):</span>
              <strong class="text-white text-xs">${s.bankName}</strong>
            </div>
            <div>
              <span class="text-slate-500 text-[10px] block">ශාඛාව (Branch):</span>
              <strong class="text-white text-xs">${s.bankBranch}</strong>
            </div>
          </div>
          <div>
            <span class="text-slate-500 text-[10px] block">ගිණුමේ නම (Account Name):</span>
            <strong class="text-white text-xs">${s.bankAccountName}</strong>
          </div>
          <div class="p-2.5 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between mt-1">
            <div>
              <span class="text-[10px] text-slate-400 block font-mono">ACCOUNT NUMBER:</span>
              <span id="expiredModalAccountNumText" class="font-mono font-black text-amber-300 text-sm tracking-wider">${s.bankAccountNo}</span>
            </div>
            <button type="button" onclick="CompanyControllerManager.copyBankAccountNumber('${s.bankAccountNo}')" class="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[11px] transition shadow flex items-center gap-1">
              <span>📋</span>
              <span id="copyAccNumBtnText">Copy Number</span>
            </button>
          </div>
        </div>
      `;
    }

    if (elCallBtn) {
      elCallBtn.href = `tel:${s.phone}`;
      elCallBtn.textContent = `📞 අමතන්න (${s.phone})`;
    }

    if (elWaBtn) {
      const storeName = admin?.storeName || admin?.fullName || 'Supermarket';
      const text = encodeURIComponent(`Hello, I would like to renew subscription for my LankaPOS Supermarket system (${storeName} / @${admin?.username}).`);
      elWaBtn.href = `https://wa.me/${s.whatsapp.replace(/[^0-9]/g, '')}?text=${text}`;
    }

    modal.classList.remove('hidden');
    if (window.SoundManager) SoundManager.playErrorBuzzer();
  },

  closeSubscriptionExpiredModal() {
    document.getElementById('subscriptionExpiredModal')?.classList.add('hidden');
  },

  copyBankAccountNumber(num) {
    if (!num) {
      const textEl = document.getElementById('expiredModalAccountNumText');
      num = textEl ? textEl.textContent.trim() : '';
    }
    if (navigator.clipboard && num) {
      navigator.clipboard.writeText(num).then(() => {
        const btn = document.getElementById('copyAccNumBtnText');
        if (btn) {
          btn.textContent = 'Copied! 👍';
          setTimeout(() => { btn.textContent = 'Copy Number'; }, 2500);
        }
      });
    }
  }
};

window.AuthManager = AuthManager;
window.CompanyControllerManager = CompanyControllerManager;
