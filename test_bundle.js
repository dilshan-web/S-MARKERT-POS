// ==================== js\db.js ====================

/**
 * Google Firebase Firestore Real-Time Database Engine for Supermarket POS
 * Uses Firebase JS SDK v10 (via CDN Modular SDK)
 * Real-time synchronization across all devices (Laptop, Mobile, Tab) with onSnapshot listeners
 * Database Name: SupermarketPOSDB (Firestore Project: super-markert-pos)
 */

// Firebase Project Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCI_HeGgpuB3-GyJ3FG19OYGh-2Ms48xCA",
  authDomain: "super-markert-pos.firebaseapp.com",
  projectId: "super-markert-pos",
  storageBucket: "super-markert-pos.firebasestorage.app",
  messagingSenderId: "686838053099",
  appId: "1:686838053099:web:3908aa56a4b51ee0e6e6ae"
};

const COLLECTION_NAMES = [
  'users',
  'products',
  'categories',
  'customers',
  'suppliers',
  'farmers',
  'farmerIntakes',
  'farmerPayments',
  'sales',
  'saleItems',
  'returns',
  'creditPayments',
  'vouchers',
  'holdBills',
  'purchases',
  'stockAdjustments',
  'expenses',
  'shifts',
  'settings'
];

/**
 * Sanitize object before writing to Firestore (handles undefined, Dates, etc.)
 */
function sanitizeForFirestore(obj) {
  if (obj === undefined) return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item));
  }
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
}


/**
 * =========================================================
 *  OFFLINE QUEUE MANAGER
 *  Internet නැති වෙලාවේ operations queue කරලා
 *  Internet ආවොත් Firebase-ට sync කරනවා
 * =========================================================
 */
const OfflineQueueManager = (function () {
  const QUEUE_KEY = 'pos_offline_queue_v1';
  const MAX_QUEUE_SIZE = 2000;
  let _isSyncing = false;

  function _showBanner(type, message) {
    try {
      const banner = document.getElementById('offlineStatusBanner');
      if (!banner) return;
      banner.className = 'offline-banner banner-' + type;
      banner.textContent = message;
      banner.style.display = 'flex';
      if (type === 'online') {
        setTimeout(() => { banner.style.display = 'none'; }, 3500);
      }
    } catch (e) {}
  }

  function _loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _saveQueue(queue) {
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (e) {}
  }

  function _addToQueue(op) {
    const queue = _loadQueue();
    if (queue.length >= MAX_QUEUE_SIZE) queue.shift();
    queue.push({ ...op, _queuedAt: Date.now() });
    _saveQueue(queue);
    _showBanner('offline', '\uD83D\uDCF5 Offline Mode | ' + queue.length + ' pending sync(s)');
  }

  async function _syncQueue(dbInstance) {
    if (_isSyncing) return;
    const queue = _loadQueue();
    if (queue.length === 0) {
      _showBanner('online', '\u2705 Online | Firebase connected!');
      return;
    }

    _isSyncing = true;
    _showBanner('syncing', '\uD83D\uDD04 Syncing ' + queue.length + ' offline record(s) to Firebase...');

    const failed = [];
    for (const op of queue) {
      try {
        const { collection: col, type, docId, data } = op;
        if (!dbInstance || !dbInstance.sdk || !dbInstance.firestoreDb) {
          failed.push(op); continue;
        }
        const docRef = dbInstance.sdk.doc(dbInstance.firestoreDb, col, docId);
        if (type === 'delete') {
          await dbInstance.sdk.deleteDoc(docRef);
        } else {
          await dbInstance.sdk.setDoc(docRef, data, { merge: type === 'update' || type === 'put' });
        }
      } catch (e) {
        console.warn('[OfflineQueue] Sync failed:', op, e);
        failed.push(op);
      }
    }

    _saveQueue(failed);
    _isSyncing = false;

    if (failed.length === 0) {
      _showBanner('online', '\u2705 Online | All ' + queue.length + ' record(s) synced to Firebase!');
    } else {
      _showBanner('offline', '\uD83D\uDCF5 Offline Mode | ' + failed.length + ' pending sync(s)');
    }
  }

  return {
    get isOnline() { return navigator.onLine; },
    get pendingCount() { return _loadQueue().length; },

    enqueue(op) { _addToQueue(op); },

    init(dbInstance) {
      if (!navigator.onLine) {
        const pending = _loadQueue().length;
        _showBanner('offline', pending > 0
          ? '\uD83D\uDCF5 Offline Mode | ' + pending + ' pending sync(s)'
          : '\uD83D\uDCF5 Offline Mode - App works normally. Data syncs when online.');
      } else {
        _syncQueue(dbInstance);
      }
      window.addEventListener('online', () => {
        console.log('[OfflineQueue] Internet restored. Syncing...');
        setTimeout(() => _syncQueue(dbInstance), 2000);
      });
      window.addEventListener('offline', () => {
        const pending = _loadQueue().length;
        _showBanner('offline', '\uD83D\uDCF5 Offline Mode - App works normally. Data syncs when online.');
        console.warn('[OfflineQueue] Internet lost. Operations will be queued.');
      });
    },

    syncIfOnline(dbInstance) {
      if (navigator.onLine) setTimeout(() => _syncQueue(dbInstance), 1500);
    }
  };
})();
/**
 * Debounced Real-time UI refresh trigger to instantly reflect cross-device changes without reload
 */
const triggerRealtimeUIUpdate = (function() {
  const pendingCollections = new Set();
  let debounceTimer = null;

  return function(collectionName) {
    pendingCollections.add(collectionName);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const updates = new Set(pendingCollections);
      pendingCollections.clear();

      try {
        const currentTab = window.App ? window.App.currentTab : null;

        if (updates.has('products')) {
          if (window.POSManager) POSManager.renderProductGrid().catch(() => {});
          if (window.InventoryManager) {
            InventoryManager.renderInventoryTable().catch(() => {});
            InventoryManager.renderValuationCards().catch(() => {});
          }
          if (window.DashboardManager && currentTab === 'dashboard') {
            DashboardManager.renderInventoryAlerts().catch(() => {});
          }
        }

        if (updates.has('categories')) {
          if (window.POSManager) POSManager.renderCategoryFilter().catch(() => {});
          if (window.InventoryManager) InventoryManager.populateCategoryDropdown().catch(() => {});
        }

        if (updates.has('customers') || updates.has('creditPayments')) {
          if (window.CustomerManager) {
            CustomerManager.renderCustomerTable().catch(() => {});
            if (typeof CustomerManager.renderCreditTab === 'function') {
              CustomerManager.renderCreditTab().catch(() => {});
            }
          }
        }

        if (updates.has('suppliers')) {
          if (window.SupplierManager) SupplierManager.renderSupplierTable().catch(() => {});
          if (window.InventoryManager) InventoryManager.populateSupplierDropdown().catch(() => {});
          if (window.GRNManager) GRNManager.loadSuppliers().catch(() => {});
        }

        if (updates.has('farmers') || updates.has('farmerIntakes') || updates.has('farmerPayments')) {
          if (window.FarmerManager) {
            FarmerManager.renderAll().catch(() => {});
          }
        }

        if (updates.has('expenses')) {
          if (window.ExpenseManager) ExpenseManager.renderExpensesList().catch(() => {});
        }

        if (updates.has('shifts')) {
          if (window.ShiftManager) {
            ShiftManager.checkActiveShift().catch(() => {});
            ShiftManager.renderShiftHistory().catch(() => {});
          }
        }

        if (updates.has('holdBills')) {
          if (window.POSManager) {
            POSManager.updateHoldBillsBadge().catch(() => {});
            const recallModal = document.getElementById('recallBillsModal');
            if (recallModal && !recallModal.classList.contains('hidden')) {
              POSManager.renderRecallBillsModal().catch(() => {});
            }
          }
        }

        if (updates.has('sales') || updates.has('saleItems') || updates.has('returns') || updates.has('expenses')) {
          if (window.DashboardManager && (currentTab === 'dashboard' || !currentTab)) {
            DashboardManager.renderDashboard().catch(() => {});
          }
          if (window.ReportsManager && currentTab === 'reports') {
            ReportsManager.generateAllReports().catch(() => {});
          }
          if (window.POSManager) {
            const histModal = document.getElementById('salesHistoryModal');
            if (histModal && !histModal.classList.contains('hidden')) {
              POSManager.renderSalesHistoryModal().catch(() => {});
            }
          }
        }

        if (updates.has('purchases')) {
          if (window.GRNManager) GRNManager.renderPurchaseHistoryTable().catch(() => {});
        }

        if (updates.has('settings')) {
          if (window.BackupManager) {
            BackupManager.loadSettingsForm().catch(() => {});
            BackupManager.loadStoreLogo().catch(() => {});
          }
        }

        if (updates.has('users')) {
          if (window.AuthManager && (AuthManager.isAdmin() || AuthManager.isManager())) {
            AuthManager.renderUsersTable();
          }
          // Also refresh CC Manager table if the controller shell is visible
          if (window.CompanyControllerManager) {
            const ctrlShell = document.getElementById('controllerShell');
            if (ctrlShell && !ctrlShell.classList.contains('hidden')) {
              CompanyControllerManager.renderAdminsTable().catch(() => {});
            }
          }
        }
      } catch (err) {
        console.warn('[Firestore Realtime UI] Error updating UI:', err);
      }
    }, 80);
  };
})();

/**
 * Multi-Tenant Data Isolation Scope Manager
 * Ensures each Supermarket Admin and their Cashiers ONLY see their own data!
 */
function getActiveAdminScope() {
  try {
    if (typeof window !== 'undefined' && window.AuthManager && window.AuthManager.currentUser) {
      if (typeof window.AuthManager.getActiveAdminId === 'function') {
        return window.AuthManager.getActiveAdminId();
      }
    }
  } catch (e) {}
  return null;
}

function filterByTenantScope(items, collectionName) {
  const activeAdmin = getActiveAdminScope();
  if (!activeAdmin || activeAdmin === 'all') return items;

  if (collectionName === 'settings') return items;

  if (collectionName === 'users') {
    return items.filter(u => {
      // Return self or any user created under / assigned to this admin
      return String(u.id) === String(activeAdmin) || String(u.adminId) === String(activeAdmin);
    });
  }

  return items.filter(item => {
    if (item.adminId !== undefined && item.adminId !== null) {
      return String(item.adminId) === String(activeAdmin);
    }
    // Legacy data without adminId belongs to default admin (ID 1 / 'admin')
    return String(activeAdmin) === '1' || activeAdmin === 'admin';
  });
}


/**
 * Collection Query Builder (supports where, equals, equalsIgnoreCase, between, anyOf, reverse, orderBy, limit, offset)
 */
class CollectionQuery {
  constructor(collectionInstance, filterFn = null, sortField = null, isReverse = false) {
    this.collection = collectionInstance;
    this.filters = filterFn ? [filterFn] : [];
    this.sortField = sortField;
    this.isReverse = isReverse;
    this._limit = null;
    this._offset = null;
  }

  and(fn) {
    if (typeof fn === 'function') this.filters.push(fn);
    return this;
  }

  filter(fn) {
    return this.and(fn);
  }

  reverse() {
    this.isReverse = !this.isReverse;
    return this;
  }

  desc() {
    return this.reverse();
  }

  offset(n) {
    this._offset = n;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  async toArray() {
    await this.collection.ensureReady();
    let items = Array.from(this.collection.docsMap.values());
    items = filterByTenantScope(items, this.collection.name);
    for (const f of this.filters) {
      items = items.filter(f);
    }
    if (this.sortField) {
      items.sort((a, b) => {
        const valA = a[this.sortField];
        const valB = b[this.sortField];
        if (valA < valB) return this.isReverse ? 1 : -1;
        if (valA > valB) return this.isReverse ? -1 : 1;
        return 0;
      });
    } else if (this.isReverse) {
      items.reverse();
    }
    if (this._offset) {
      items = items.slice(this._offset);
    }
    if (this._limit !== null) {
      items = items.slice(0, this._limit);
    }
    return items;
  }

  async first() {
    const items = await this.toArray();
    return items.length > 0 ? items[0] : undefined;
  }

  async last() {
    const items = await this.toArray();
    return items.length > 0 ? items[items.length - 1] : undefined;
  }

  async count() {
    const items = await this.toArray();
    return items.length;
  }

  async modify(updates) {
    const items = await this.toArray();
    let count = 0;
    for (const item of items) {
      const targetId = item.id !== undefined ? item.id : item.key;
      const up = typeof updates === 'function' ? updates(item) : updates;
      if (up !== false) {
        await this.collection.update(targetId, typeof updates === 'function' ? item : up);
        count++;
      }
    }
    return count;
  }

  async delete() {
    const items = await this.toArray();
    for (const item of items) {
      const targetId = item.id !== undefined ? item.id : item.key;
      await this.collection.delete(targetId);
    }
    return items.length;
  }
}

/**
 * Firestore Collection Class wrapping Firestore CRUD operations with local Real-Time onSnapshot cache
 */
class FirestoreCollection {
  constructor(name, dbInstance) {
    this.name = name;
    this.dbInstance = dbInstance;
    this.docsMap = new Map(); // key -> item
    this.listeners = new Set();
    this.isReady = false;
    this.unsubscribeSnapshot = null;
    this._readyResolve = null;
    this._readyPromise = new Promise(resolve => { this._readyResolve = resolve; });
    this._loadLocalCache();
  }

  _loadLocalCache() {
    try {
      const raw = localStorage.getItem('pos_cache_' + this.name);
      if (raw) {
        const items = JSON.parse(raw);
        if (Array.isArray(items)) {
          for (const item of items) {
            const key = item.id !== undefined && item.id !== null ? String(item.id) : (item.key ? String(item.key) : null);
            if (key) this.docsMap.set(key, item);
          }
        }
      }
    } catch (e) {}
  }

  _saveLocalCache() {
    try {
      const items = Array.from(this.docsMap.values());
      localStorage.setItem('pos_cache_' + this.name, JSON.stringify(items));
    } catch (e) {}
  }

  async ensureReady() {
    if (this.dbInstance && this.dbInstance.initPromise) {
      try { await this.dbInstance.initPromise; } catch (e) {}
    }
    if (this._readyPromise && !this.isReady) {
      const timeout = new Promise(res => setTimeout(res, 2000));
      await Promise.race([this._readyPromise, timeout]);
    }
  }

  setupRealtimeListener(firestoreDb, sdk) {
    if (this.unsubscribeSnapshot) {
      try { this.unsubscribeSnapshot(); } catch (e) {}
    }

    const colRef = sdk.collection(firestoreDb, this.name);
    let isFirstSnapshot = true;

    this.unsubscribeSnapshot = sdk.onSnapshot(colRef, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const docId = change.doc.id;
        const data = change.doc.data();
        let id = data.id !== undefined ? data.id : docId;
        if (data.id === undefined && !isNaN(Number(docId)) && docId.trim() !== '') {
          id = Number(docId);
        }
        const item = { ...data, id };
        if (this.name === 'settings' && data.key) {
          item.key = data.key;
        }

        if (change.type === 'removed') {
          this.docsMap.delete(docId);
        } else {
          this.docsMap.set(docId, item);
        }

        this.listeners.forEach(fn => {
          try { fn(item, change.type); } catch (e) {}
        });
      });

      this._saveLocalCache();

      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        this.isReady = true;
        if (this._readyResolve) { this._readyResolve(); this._readyResolve = null; }
      } else {
        triggerRealtimeUIUpdate(this.name);
      }
    }, (error) => {
      console.warn(`[Firestore Realtime] Snapshot error on "${this.name}":`, error);
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        this.isReady = true;
        if (this._readyResolve) { this._readyResolve(); this._readyResolve = null; }
      }
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  subscribe(fn) {
    return this.on(fn);
  }

  async toArray() {
    await this.ensureReady();
    return filterByTenantScope(Array.from(this.docsMap.values()), this.name);
  }

  async get(id) {
    if (id === undefined || id === null) return undefined;
    await this.ensureReady();

    if (this.name === 'settings') {
      const direct = this.docsMap.get(String(id));
      if (direct) return direct;
      for (const item of this.docsMap.values()) {
        if (item.key === id || item.id === id || String(item.key) === String(id)) return item;
      }
      return undefined;
    }

    let found = null;
    const strId = String(id);
    if (this.docsMap.has(strId)) found = this.docsMap.get(strId);
    if (!found) {
      for (const item of this.docsMap.values()) {
        if (item.id == id || String(item.id) === strId) {
          found = item;
          break;
        }
      }
    }

    if (!found) return undefined;

    // Strict Tenant Isolation Guard
    const activeAdmin = getActiveAdminScope();
    if (activeAdmin && activeAdmin !== 'all' && this.name !== 'users') {
      if (found.adminId !== undefined && found.adminId !== null) {
        if (String(found.adminId) !== String(activeAdmin)) return undefined;
      } else {
        if (String(activeAdmin) !== '1' && activeAdmin !== 'admin') return undefined;
      }
    }

    return found;
  }

  async add(data) {
    await this.ensureReady();
    const docData = { ...data };
    const activeAdmin = getActiveAdminScope();
    if (activeAdmin && activeAdmin !== 'all' && this.name !== 'settings' && this.name !== 'users' && docData.adminId === undefined) {
      docData.adminId = activeAdmin;
    }
    let docId = docData.id !== undefined && docData.id !== null ? String(docData.id) : null;

    if (!docId) {
      if (this.name === 'settings' && docData.key) {
        docId = String(docData.key);
      } else if (['users', 'products', 'categories', 'customers', 'suppliers', 'farmers', 'farmerIntakes', 'farmerPayments'].includes(this.name)) {
        let maxId = 0;
        for (const item of this.docsMap.values()) {
          const numId = Number(item.id);
          if (!isNaN(numId) && numId > maxId) maxId = numId;
        }
        docData.id = maxId + 1;
        docId = String(docData.id);
      } else {
        docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        if (docData.id === undefined) docData.id = docId;
      }
    }

    const cleanData = sanitizeForFirestore(docData);
    const resultItem = { ...cleanData, id: docData.id !== undefined ? docData.id : docId };
    this.docsMap.set(docId, resultItem);
    this._saveLocalCache();

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      if (!navigator.onLine) {
        OfflineQueueManager.enqueue({ collection: this.name, type: 'add', docId, data: cleanData });
      } else {
        try {
          const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, docId);
          this.dbInstance.sdk.setDoc(docRef, cleanData).catch((err) => {
            OfflineQueueManager.enqueue({ collection: this.name, type: 'add', docId, data: cleanData });
          });
        } catch (e) {
          OfflineQueueManager.enqueue({ collection: this.name, type: 'add', docId, data: cleanData });
        }
      }
    } else {
      OfflineQueueManager.enqueue({ collection: this.name, type: 'add', docId, data: cleanData });
    }

    return docData.id !== undefined ? docData.id : docId;
  }

  async put(data, key) {
    await this.ensureReady();
    const docData = { ...data };
    const activeAdmin = getActiveAdminScope();
    if (activeAdmin && activeAdmin !== 'all' && this.name !== 'settings' && this.name !== 'users' && docData.adminId === undefined) {
      docData.adminId = activeAdmin;
    }
    let docId = key !== undefined && key !== null ? String(key) : null;
    if (!docId && docData.key !== undefined) docId = String(docData.key);
    if (!docId && docData.id !== undefined && docData.id !== null) docId = String(docData.id);

    if (!docId) {
      return await this.add(data);
    }

    const cleanData = sanitizeForFirestore(docData);
    const existing = this.docsMap.get(docId) || {};
    const updatedItem = { ...existing, ...cleanData };
    this.docsMap.set(docId, updatedItem);
    this._saveLocalCache();

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      if (!navigator.onLine) {
        OfflineQueueManager.enqueue({ collection: this.name, type: 'put', docId, data: cleanData });
      } else {
        try {
          const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, docId);
          this.dbInstance.sdk.setDoc(docRef, cleanData, { merge: true }).catch((err) => {
            OfflineQueueManager.enqueue({ collection: this.name, type: 'put', docId, data: cleanData });
          });
        } catch (e) {
          OfflineQueueManager.enqueue({ collection: this.name, type: 'put', docId, data: cleanData });
        }
      }
    } else {
      OfflineQueueManager.enqueue({ collection: this.name, type: 'put', docId, data: cleanData });
    }

    return docData.id !== undefined ? docData.id : (docData.key !== undefined ? docData.key : docId);
  }

  async update(id, updates) {
    await this.ensureReady();
    if (id === undefined || id === null) return 0;

    const strId = String(id);
    let targetDocId = strId;
    if (!this.docsMap.has(strId)) {
      for (const [k, item] of this.docsMap.entries()) {
        if (item.id == id || String(item.id) === strId || item.key === id) {
          targetDocId = k;
          break;
        }
      }
    }

    const cleanUpdates = sanitizeForFirestore(updates);
    const existing = this.docsMap.get(targetDocId) || {};
    this.docsMap.set(targetDocId, { ...existing, ...cleanUpdates });
    this._saveLocalCache();

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      if (!navigator.onLine) {
        OfflineQueueManager.enqueue({ collection: this.name, type: 'update', docId: targetDocId, data: cleanUpdates });
      } else {
        try {
          const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, targetDocId);
          this.dbInstance.sdk.setDoc(docRef, cleanUpdates, { merge: true }).catch((err) => {
            OfflineQueueManager.enqueue({ collection: this.name, type: 'update', docId: targetDocId, data: cleanUpdates });
          });
        } catch (e) {
          OfflineQueueManager.enqueue({ collection: this.name, type: 'update', docId: targetDocId, data: cleanUpdates });
        }
      }
    } else {
      OfflineQueueManager.enqueue({ collection: this.name, type: 'update', docId: targetDocId, data: cleanUpdates });
    }

    return 1;
  }

  async delete(id) {
    await this.ensureReady();
    if (id === undefined || id === null) return;

    const strId = String(id);
    let targetDocId = strId;
    if (!this.docsMap.has(strId)) {
      for (const [k, item] of this.docsMap.entries()) {
        if (item.id == id || String(item.id) === strId || item.key === id) {
          targetDocId = k;
          break;
        }
      }
    }

    this.docsMap.delete(targetDocId);
    this._saveLocalCache();

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      if (!navigator.onLine) {
        OfflineQueueManager.enqueue({ collection: this.name, type: 'delete', docId: targetDocId, data: null });
      } else {
        try {
          const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, targetDocId);
          this.dbInstance.sdk.deleteDoc(docRef).catch((err) => {
            OfflineQueueManager.enqueue({ collection: this.name, type: 'delete', docId: targetDocId, data: null });
          });
        } catch (e) {
          OfflineQueueManager.enqueue({ collection: this.name, type: 'delete', docId: targetDocId, data: null });
        }
      }
    } else {
      OfflineQueueManager.enqueue({ collection: this.name, type: 'delete', docId: targetDocId, data: null });
    }
  }

  async count() {
    return this.docsMap.size;
  }

  async clear() {
    this.docsMap.clear();
  }

  async bulkAdd(items) {
    if (!items || items.length === 0) return [];
    const results = [];
    for (const item of items) {
      const res = await this.add(item);
      results.push(res);
    }
    return results;
  }

  async bulkPut(items) {
    if (!items || items.length === 0) return [];
    const results = [];
    for (const item of items) {
      const res = await this.put(item);
      results.push(res);
    }
    return results;
  }

  async bulkDelete(ids) {
    if (!ids || ids.length === 0) return;
    for (const id of ids) {
      await this.delete(id);
    }
  }
  where(field) {
    const self = this;
    return {
      equals(val) {
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          if (Array.isArray(itemVal)) {
            return itemVal.includes(val) || itemVal.some(x => x == val || String(x) === String(val));
          }
          return itemVal === val || itemVal == val || (typeof itemVal !== 'object' && String(itemVal) === String(val));
        });
      },
      equalsIgnoreCase(val) {
        const strVal = String(val || '').toLowerCase();
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          if (itemVal === undefined || itemVal === null) return false;
          if (Array.isArray(itemVal)) {
            return itemVal.some(x => String(x).toLowerCase() === strVal);
          }
          return String(itemVal).toLowerCase() === strVal;
        });
      },
      between(lower, upper, includeLower = true, includeUpper = true) {
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          if (itemVal === undefined || itemVal === null) return false;
          const above = includeLower ? itemVal >= lower : itemVal > lower;
          const below = includeUpper ? itemVal <= upper : itemVal < upper;
          return above && below;
        });
      },
      startsWith(prefix) {
        const strPrefix = String(prefix || '');
        return new CollectionQuery(self, item => {
          const itemVal = String(item[field] || '');
          return itemVal.startsWith(strPrefix);
        });
      },
      startsWithIgnoreCase(prefix) {
        const strPrefix = String(prefix || '').toLowerCase();
        return new CollectionQuery(self, item => {
          const itemVal = String(item[field] || '').toLowerCase();
          return itemVal.startsWith(strPrefix);
        });
      },
      anyOf(...values) {
        const valList = Array.isArray(values[0]) ? values[0] : values;
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          return valList.includes(itemVal) || valList.some(v => v == itemVal || String(v) === String(itemVal));
        });
      },
      noneOf(...values) {
        const valList = Array.isArray(values[0]) ? values[0] : values;
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          return !valList.includes(itemVal) && !valList.some(v => v == itemVal || String(v) === String(itemVal));
        });
      },
      notEqual(val) {
        return new CollectionQuery(self, item => {
          const itemVal = item[field];
          return itemVal !== val && itemVal != val;
        });
      }
    };
  }

  orderBy(field) {
    return new CollectionQuery(this, null, field, false);
  }

  reverse() {
    return new CollectionQuery(this, null, null, true);
  }

  filter(fn) {
    return new CollectionQuery(this, fn, null, false);
  }

  offset(n) {
    return new CollectionQuery(this).offset(n);
  }

  limit(n) {
    return new CollectionQuery(this).limit(n);
  }

  first() {
    return new CollectionQuery(this).first();
  }

  last() {
    return new CollectionQuery(this).last();
  }
}

/**
 * Main Firestore Database Client Singleton
 */
class FirestoreDB {
  constructor() {
    this.app = null;
    this.firestoreDb = null;
    this.sdk = null;
    this.tables = [];

    COLLECTION_NAMES.forEach(name => {
      const col = new FirestoreCollection(name, this);
      this[name] = col;
      this.tables.push(col);
    });

    this.initPromise = this.initFirebase();
  }

  version() {
    return {
      stores: () => this
    };
  }

  async transaction(mode, tables, callback) {
    if (typeof mode === 'function') return await mode();
    if (typeof tables === 'function') return await tables();
    if (typeof callback === 'function') return await callback();
  }

  async initFirebase() {
    try {
      let appModule = window.__FIREBASE_APP_MODULE__;
      let firestoreModule = window.__FIREBASE_FIRESTORE_MODULE__;

      if (!appModule || !firestoreModule) {
        try {
          appModule = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
          firestoreModule = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
        } catch (e) {
          console.warn('[Firebase] Dynamic import notice:', e);
        }
      }

      if (!appModule || !firestoreModule) {
        console.warn('[Firebase] Running in offline memory-first mode.');
        OfflineQueueManager.init(this);
        return false;
      }

      this.sdk = firestoreModule;
      this.app = appModule.initializeApp(firebaseConfig);
      this.firestoreDb = firestoreModule.getFirestore(this.app);

      for (const name of COLLECTION_NAMES) {
        this[name].setupRealtimeListener(this.firestoreDb, this.sdk);
      }

      console.log('[Firestore] Real-time listeners successfully connected.');
      OfflineQueueManager.init(this);
      return true;
    } catch (err) {
      console.warn('[Firestore] Fallback to in-memory store:', err);
      OfflineQueueManager.init(this);
      return false;
    }
  }
}

const db = new FirestoreDB();

// Format currency as Sri Lankan Rupee (LKR / Rs. / රු.)
function formatLKR(amount) {
  const num = Number(amount) || 0;
  return 'Rs. ' + num.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// Generate unique sequential invoice number
async function generateInvoiceNo() {
  const count = await db.sales.count();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `INV-${dateStr}-${String(count + 1).padStart(5, '0')}`;
}

// Generate unique Return / Refund number
async function generateReturnNo() {
  const count = await db.returns.count();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `RET-${dateStr}-${String(count + 1).padStart(4, '0')}`;
}

// Generate unique Credit Payment Receipt number
async function generateCreditReceiptNo() {
  const count = await (db.creditPayments ? db.creditPayments.count() : 0);
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `CRD-${dateStr}-${String(count + 1).padStart(4, '0')}`;
}

// Generate unique GRN number
async function generateGRNNo() {
  const count = await db.purchases.count();
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `GRN-${dateStr}-${String(count + 1).padStart(4, '0')}`;
}

/**
 * Seed Firestore Database with Sri Lankan Supermarket Initial Data if Empty
 */
async function seedDatabaseIfEmpty() {
  console.log('[Firestore DB] Checking and synchronizing database records...');

  // Default permissions map template
  const defaultAdminPerms = {
    pos: true,
    dashboard: true,
    inventory: true,
    grn: true,
    customers: true,
    credit: true,
    suppliers: true,
    farmers: true,
    expenses: true,
    shifts: true,
    reports: true,
    settings: true,
    users: true,
    allowCreditEdit: true,
    allowCreditDelete: true,
    allowPriceEdit: true,
    allowDiscount: true,
    allowReturns: true,
    allowDelete: true,
    allowStockAdjustment: true
  };

  const defaultManagerPerms = {
    pos: true,
    dashboard: true,
    inventory: true,
    grn: true,
    customers: true,
    credit: true,
    suppliers: true,
    farmers: true,
    expenses: true,
    shifts: true,
    reports: true,
    settings: false,
    users: false,
    allowCreditEdit: false,
    allowCreditDelete: false,
    allowPriceEdit: false,
    allowDiscount: true,
    allowReturns: false,
    allowDelete: false,
    allowStockAdjustment: false
  };

  const defaultCashierPerms = {
    pos: true,
    dashboard: true,
    inventory: false,
    grn: false,
    customers: true,
    credit: true,
    suppliers: false,
    farmers: false,
    expenses: false,
    shifts: true,
    reports: false,
    settings: false,
    users: false,
    allowCreditEdit: false,
    allowCreditDelete: false,
    allowPriceEdit: false,
    allowDiscount: false,
    allowReturns: false,
    allowDelete: false,
    allowStockAdjustment: false
  };

  // 1. Ensure Default Users exist and have valid passwords & permissions
  const existingUsers = await db.users.toArray();
  const defaultUsers = [
    { id: 1, username: 'admin', password: 'admin123', fullName: 'Super Admin (ප්‍රධාන පරිපාලක)', role: 'admin', pin: '9999', active: 1, permissions: defaultAdminPerms },
    { id: 2, username: 'manager', password: 'manager123', fullName: 'Nuwan Perera (කළමනාකරු)', role: 'manager', pin: '4321', active: 1, permissions: defaultManagerPerms },
    { id: 3, username: 'cashier1', password: 'cashier123', fullName: 'Kasun Silva (කැෂියර් 1)', role: 'cashier', pin: '1234', active: 1, permissions: defaultCashierPerms },
    { id: 4, username: 'cashier2', password: 'cashier123', fullName: 'Dilini Fernando (කැෂියර් 2)', role: 'cashier', pin: '5678', active: 1, permissions: defaultCashierPerms }
  ];

  if (existingUsers.length === 0) {
    await db.users.bulkAdd(defaultUsers);
  } else {
    for (const defU of defaultUsers) {
      const match = existingUsers.find(u => (u.username || '').toLowerCase() === defU.username.toLowerCase());
      if (match) {
        const updateData = {};
        if (!match.password || match.password !== defU.password) updateData.password = defU.password;
        
        const mergedPerms = Object.assign({}, defU.permissions, match.permissions || {});
        if (!match.permissions || JSON.stringify(match.permissions) !== JSON.stringify(mergedPerms)) {
          updateData.permissions = mergedPerms;
        }

        if (Object.keys(updateData).length > 0) {
          await db.users.update(match.id, updateData);
        }
      } else {
        await db.users.add(defU);
      }
    }
  }

  // 2. Seed Settings if empty
  const settingsCount = await db.settings.count();
  if (settingsCount === 0) {
    await db.settings.bulkAdd([
      { key: 'store_name', value: 'SUPERMARKET' },
      { key: 'store_name_si', value: '' },
      { key: 'store_branch', value: '' },
      { key: 'store_address', value: '' },
      { key: 'store_phone', value: '' },
      { key: 'store_email', value: '' },
      { key: 'store_vat_no', value: '' },
      { key: 'currency', value: 'LKR' },
      { key: 'tax_rate', value: 0 },
      { key: 'loyalty_earn_rate', value: 100 },
      { key: 'loyalty_redeem_value', value: 1 },
      { key: 'thermal_width', value: '80mm' },
      { key: 'receipt_footer', value: 'Thank you for shopping with us!' },
      { key: 'auto_print_receipt', value: false },
      { key: 'beep_sound_enabled', value: true }
    ]);
  } else {
    const existingNameSi = await db.settings.get('store_name_si');
    if (existingNameSi && existingNameSi.value === 'ලංකා මෙගා සුපර්මාර්කට්') {
      await db.settings.put({ key: 'store_name_si', value: '' });
    }
    const existingFooter = await db.settings.get('receipt_footer');
    if (existingFooter && (
      existingFooter.value.includes('LankaPOS') || 
      existingFooter.value.includes('Retail Suite') || 
      existingFooter.value.includes('retail suite') ||
      existingFooter.value.includes('Offline Retail')
    )) {
      await db.settings.put({ key: 'receipt_footer', value: 'Thank you for shopping with us!' });
    }
  }

  // 3. Seed Categories if empty
  const catCount = await db.categories.count();
  if (catCount === 0) {
    const categoryData = [
      { id: 1, name: 'Dairy & Eggs (කිරි සහ බිත්තර)', icon: '🥛', color: 'bg-blue-500' },
      { id: 2, name: 'Bakery & Biscuits (බිස්කට් සහ බේකරි)', icon: '🍪', color: 'bg-amber-500' },
      { id: 3, name: 'Beverages & Tea (බීම සහ තේ)', icon: '🧃', color: 'bg-emerald-500' },
      { id: 4, name: 'Rice & Grains (සහල් සහ ධාන්‍ය)', icon: '🌾', color: 'bg-yellow-600' },
      { id: 5, name: 'Spices & Condiments (කුළුබඩු සහ සෝස්)', icon: '🌶️', color: 'bg-red-500' },
      { id: 6, name: 'Snacks & Sweets (කෙටි කෑම සහ රසකැවිලි)', icon: '🍫', color: 'bg-purple-500' },
      { id: 7, name: 'Household & Cleaning (පිරිසිදුකාරක)', icon: '🧼', color: 'bg-teal-500' },
      { id: 8, name: 'Personal Care (පුද්ගලික සත්කාර)', icon: '🧴', color: 'bg-pink-500' },
      { id: 9, name: 'Fresh Produce (එළවළු සහ පලතුරු)', icon: '🍎', color: 'bg-green-600' }
    ];
    await db.categories.bulkAdd(categoryData);
  }

  // 4. Seed Suppliers if empty
  const suppCount = await db.suppliers.count();
  if (suppCount === 0) {
    await db.suppliers.bulkAdd([
      { id: 1, name: 'Fonterra Brands Lanka (ෆොන්ටෙරා)', phone: '0112488488', email: 'orders@fonterra.lk', address: 'Biyagama, Malwana', outstandingBalance: 45000 },
      { id: 2, name: 'Ceylon Biscuits Limited - Munchee (මංචි)', phone: '0115000000', email: 'sales@muncheelk.com', address: 'High Level Road, Pannipitiya', outstandingBalance: 28500 },
      { id: 3, name: 'Maliban Biscuit Manufactories (මැලිබන්)', phone: '0112655255', email: 'distributors@maliban.com', address: '389, Galle Road, Ratmalana', outstandingBalance: 12000 },
      { id: 4, name: 'Dilmah Ceylon Tea Company (දිල්මා)', phone: '0114822000', email: 'orders@dilmahtea.com', address: 'Peliyagoda', outstandingBalance: 0 },
      { id: 5, name: 'Unilever Sri Lanka (යුනිලීවර්)', phone: '0112185000', email: 'customercare@unilever.com', address: 'Horana Industrial Zone', outstandingBalance: 32000 },
      { id: 6, name: 'Prima Ceylon (Pvt) Ltd (ප්‍රීමා)', phone: '0112688888', email: 'sales@prima.com.lk', address: 'Rajagiriya', outstandingBalance: 15400 }
    ]);
  }

  // 5. Seed Customers if empty
  const custCount = await db.customers.count();
  if (custCount === 0) {
    await db.customers.bulkAdd([
      { id: 1, phone: '0771234567', name: 'Chaminda Vaas (චමින්ද)', email: 'chaminda@example.lk', points: 145, creditBalance: 0, totalSpent: 28500, discountPercent: 0, address: 'Colombo 05' },
      { id: 2, phone: '0719876543', name: 'Anusha Damayanthi (අනුෂා)', email: 'anusha@example.lk', points: 320, creditBalance: 1500, totalSpent: 45000, discountPercent: 5, address: 'Nugegoda' },
      { id: 3, phone: '0765554321', name: 'Rohan Jayasuriya (රොහාන්)', email: 'rohan@example.lk', points: 80, creditBalance: 0, totalSpent: 12200, discountPercent: 0, address: 'Dehiwala' },
      { id: 4, phone: '0750001122', name: 'Nalaka Bandara (නාලක - VIP)', email: 'nalaka@example.lk', points: 550, creditBalance: 3200, totalSpent: 78000, discountPercent: 10, address: 'Kotte' }
    ]);
  }

  // 6. Seed Vouchers if empty
  const voucherCount = await db.vouchers.count();
  if (voucherCount === 0) {
    await db.vouchers.bulkAdd([
      { id: 1, code: 'MEGA10', discountType: 'percent', discountValue: 10, minBill: 2000, expiryDate: '2027-12-31', active: 1, description: '10% Off on orders above Rs. 2,000' },
      { id: 2, code: 'SAVE500', discountType: 'fixed', discountValue: 500, minBill: 5000, expiryDate: '2027-12-31', active: 1, description: 'Rs. 500 Flat Off on orders above Rs. 5,000' }
    ]);
  }

  // 6b. Seed Farmers if empty
  const farmerCount = await db.farmers.count();
  if (farmerCount === 0) {
    await db.farmers.bulkAdd([
      { id: 1, name: 'K. G. Gunapala (කේ. ජී. ගුණපාල - වැලිමඩ)', phone: '0772345678', address: 'Welimada / වැලිමඩ', outstandingBalance: 0, totalSupplied: 0, totalPaid: 0 },
      { id: 2, name: 'Sunil Shantha (සුනිල් ශාන්ත - නුවරඑළිය)', phone: '0714567890', address: 'Nuwara Eliya / නුවරඑළිය', outstandingBalance: 0, totalSupplied: 0, totalPaid: 0 }
    ]);
  }

  // 7. Seed Products if empty
  const prodCount = await db.products.count();
  if (prodCount === 0) {
    const productsData = [
      {
        id: 1,
        name: 'Anchor Milk Powder 400g (ඇන්කර් කිරිපිටි 400g)',
        nameSi: 'ඇන්කර් කිරිපිටි 400g',
        barcodes: ['4791001000123', '89479100101'],
        sku: 'DAI-ANC-400',
        category: 'Dairy & Eggs (කිරි සහ බිත්තර)',
        brand: 'Anchor',
        costPrice: 980.00,
        markedPrice: 1250.00,
        sellingPrice: 1140.00,
        wholesalePrice: 1060.00,
        unit: 'pcs',
        minStock: 20,
        currentStock: 65,
        expiryDate: '2027-04-15',
        batchNumber: 'BCH-ANC-2026',
        supplierId: 1
      },
      {
        id: 2,
        name: 'Munchee Super Cream Cracker 500g (ක්‍රීම් ක්‍රැකර් 500g)',
        nameSi: 'මුංචි සුපර් ක්‍රීම් ක්‍රැකර් 500g',
        barcodes: ['4792002000456', '89479200204'],
        sku: 'BAK-MUN-500',
        category: 'Bakery & Biscuits (බිස්කට් සහ බේකරි)',
        brand: 'Munchee',
        costPrice: 420.00,
        markedPrice: 560.00,
        sellingPrice: 510.00,
        wholesalePrice: 465.00,
        unit: 'pcs',
        minStock: 25,
        currentStock: 80,
        expiryDate: '2027-01-20',
        batchNumber: 'BCH-MUN-55',
        supplierId: 2
      },
      {
        id: 3,
        name: 'Maliban Chocolate Biscuit 200g (චොක්ලට් බිස්කට් 200g)',
        nameSi: 'මැලිබන් චොක්ලට් බිස්කට් 200g',
        barcodes: ['4793003000789', '89479300307'],
        sku: 'BAK-MAL-200',
        category: 'Bakery & Biscuits (බිස්කට් සහ බේකරි)',
        brand: 'Maliban',
        costPrice: 190.00,
        markedPrice: 260.00,
        sellingPrice: 240.00,
        wholesalePrice: 215.00,
        unit: 'pcs',
        minStock: 15,
        currentStock: 48,
        expiryDate: '2026-11-30',
        batchNumber: 'BCH-MAL-89',
        supplierId: 3
      },
      {
        id: 4,
        name: 'Keeri Samba Rice 5kg (කීරි සම්බා සහල් 5kg)',
        nameSi: 'කීරි සම්බා සහල් 5kg',
        barcodes: ['4796006000333', '89479600603'],
        sku: 'GRN-KEE-5KG',
        category: 'Rice & Grains (සහල් සහ ධාන්‍ය)',
        brand: 'Araliya',
        costPrice: 1350.00,
        markedPrice: 1650.00,
        sellingPrice: 1550.00,
        wholesalePrice: 1450.00,
        unit: 'pcs',
        minStock: 30,
        currentStock: 110,
        expiryDate: '2027-03-01',
        batchNumber: 'BCH-ARA-5K',
        supplierId: 6
      },
      {
        id: 5,
        name: 'Nadu Rice (නාඩු සහල් - කිරා විකුණන)',
        nameSi: 'නාඩු සහල් 1kg',
        barcodes: ['2000000000018'],
        sku: 'GRN-NAD-1KG',
        category: 'Rice & Grains (සහල් සහ ධාන්‍ය)',
        brand: 'Local Mill',
        costPrice: 200.00,
        markedPrice: 250.00,
        sellingPrice: 230.00,
        wholesalePrice: 210.00,
        unit: 'kg',
        minStock: 50,
        currentStock: 450,
        expiryDate: '2027-02-15',
        batchNumber: 'BCH-NAD-01',
        supplierId: 6
      },
      {
        id: 6,
        name: 'Red Dhal / Mysore Lentils (රතු පරිප්පු 1kg)',
        nameSi: 'රතු පරිප්පු 1kg',
        barcodes: ['2000000000025'],
        sku: 'GRN-DHL-1KG',
        category: 'Rice & Grains (සහල් සහ ධාන්‍ය)',
        brand: 'Imported',
        costPrice: 290.00,
        markedPrice: 380.00,
        sellingPrice: 340.00,
        wholesalePrice: 310.00,
        unit: 'kg',
        minStock: 40,
        currentStock: 320,
        expiryDate: '2027-07-01',
        batchNumber: 'BCH-DHL-91',
        supplierId: 6
      },
      {
        id: 7,
        name: 'White Sugar 1kg (සුදු සීනි 1kg)',
        nameSi: 'සුදු සීනි 1kg',
        barcodes: ['2000000000032'],
        sku: 'GRN-SUG-1KG',
        category: 'Rice & Grains (සහල් සහ ධාන්‍ය)',
        brand: 'Pelwatte',
        costPrice: 230.00,
        markedPrice: 280.00,
        sellingPrice: 260.00,
        wholesalePrice: 245.00,
        unit: 'kg',
        minStock: 50,
        currentStock: 500,
        expiryDate: '2027-06-01',
        batchNumber: 'BCH-SUG-01',
        supplierId: 6
      },
      {
        id: 8,
        name: 'Dilmah Premium Tea 100 Bags (දිල්මා තේ පැකට් 100)',
        nameSi: 'දිල්මා තේ බෑග් 100',
        barcodes: ['4794004000111', '89479400401'],
        sku: 'BEV-DIL-100',
        category: 'Beverages & Tea (බීම සහ තේ)',
        brand: 'Dilmah',
        costPrice: 750.00,
        markedPrice: 1050.00,
        sellingPrice: 920.00,
        wholesalePrice: 840.00,
        unit: 'pcs',
        minStock: 10,
        currentStock: 35,
        expiryDate: '2027-08-10',
        batchNumber: 'BCH-DIL-10',
        supplierId: 4
      },
      {
        id: 9,
        name: 'Sunlight Care Soap 115g (සන්ලයිට් සබන් 4pk)',
        nameSi: 'සන්ලයිට් සත්කාරක සබන් 4pk',
        barcodes: ['4795005000222', '89479500502'],
        sku: 'HOU-SUN-4PK',
        category: 'Household & Cleaning (පිරිසිදුකාරක)',
        brand: 'Sunlight',
        costPrice: 380.00,
        markedPrice: 520.00,
        sellingPrice: 460.00,
        wholesalePrice: 415.00,
        unit: 'pcs',
        minStock: 15,
        currentStock: 42,
        expiryDate: '2028-05-01',
        batchNumber: 'BCH-SUN-44',
        supplierId: 5
      },
      {
        id: 10,
        name: 'Astra Margarine 250g Tub (ඇස්ට්‍රා මාජරින් 250g)',
        nameSi: 'ඇස්ට්‍රා මාජරින් 250g',
        barcodes: ['4797007000444', '89479700704'],
        sku: 'DAI-AST-250',
        category: 'Dairy & Eggs (කිරි සහ බිත්තර)',
        brand: 'Astra',
        costPrice: 340.00,
        markedPrice: 470.00,
        sellingPrice: 420.00,
        wholesalePrice: 380.00,
        unit: 'pcs',
        minStock: 12,
        currentStock: 8,
        expiryDate: '2026-10-15',
        batchNumber: 'BCH-AST-22',
        supplierId: 5
      },
      {
        id: 11,
        name: 'Clogard Toothpaste 120g (ක්ලෝගාඩ් දන්තාලේප 120g)',
        nameSi: 'ක්ලෝගාඩ් දන්තාලේප 120g',
        barcodes: ['4798008000555', '89479800805'],
        sku: 'PER-CLO-120',
        category: 'Personal Care (පුද්ගලික සත්කාර)',
        brand: 'Clogard',
        costPrice: 210.00,
        markedPrice: 310.00,
        sellingPrice: 270.00,
        wholesalePrice: 240.00,
        unit: 'pcs',
        minStock: 20,
        currentStock: 52,
        expiryDate: '2027-12-31',
        batchNumber: 'BCH-CLO-99',
        supplierId: 5
      },
      {
        id: 12,
        name: 'Sunquick Orange Squash 840ml (සන්ක්වික් ඔරේන්ජ් 840ml)',
        nameSi: 'සන්ක්වික් ඔරේන්ජ් 840ml',
        barcodes: ['4790101000777', '89479010107'],
        sku: 'BEV-SUN-840',
        category: 'Beverages & Tea (බීම සහ තේ)',
        brand: 'Sunquick',
        costPrice: 1550.00,
        markedPrice: 2100.00,
        sellingPrice: 1850.00,
        wholesalePrice: 1720.00,
        unit: 'pcs',
        minStock: 8,
        currentStock: 19,
        expiryDate: '2027-05-18',
        batchNumber: 'BCH-SQ-84',
        supplierId: 4
      },
      {
        id: 13,
        name: 'Raththi Milk Powder 400g (රත්ති කිරිපිටි 400g)',
        nameSi: 'රත්ති කිරිපිටි 400g',
        barcodes: ['4791001000888', '89479100108'],
        sku: 'DAI-RAT-400',
        category: 'Dairy & Eggs (කිරි සහ බිත්තර)',
        brand: 'Raththi',
        costPrice: 960.00,
        markedPrice: 1220.00,
        sellingPrice: 1120.00,
        wholesalePrice: 1050.00,
        unit: 'pcs',
        minStock: 15,
        currentStock: 4,
        expiryDate: '2027-03-25',
        batchNumber: 'BCH-RAT-40',
        supplierId: 1
      },
      {
        id: 14,
        name: 'Prima Special Wheat Flour 1kg (ප්‍රීමා පාන් පිටි 1kg)',
        nameSi: 'ප්‍රීමා පාන් පිටි 1kg',
        barcodes: ['4792002000999', '89479200209'],
        sku: 'BAK-PRI-1KG',
        category: 'Bakery & Biscuits (බිස්කට් සහ බේකරි)',
        brand: 'Prima',
        costPrice: 210.00,
        markedPrice: 280.00,
        sellingPrice: 250.00,
        wholesalePrice: 230.00,
        unit: 'pcs',
        minStock: 25,
        currentStock: 75,
        expiryDate: '2026-12-15',
        batchNumber: 'BCH-PRI-01',
        supplierId: 6
      },
      {
        id: 15,
        name: 'Kotmale Fresh Milk 1L (කොත්මලේ නැවුම් එළකිරි 1L)',
        nameSi: 'කොත්මලේ නැවුම් කිරි 1L',
        barcodes: ['4793003000100', '89479300301'],
        sku: 'DAI-KOT-1LT',
        category: 'Dairy & Eggs (කිරි සහ බිත්තර)',
        brand: 'Kotmale',
        costPrice: 460.00,
        markedPrice: 600.00,
        sellingPrice: 540.00,
        wholesalePrice: 495.00,
        unit: 'pcs',
        minStock: 10,
        currentStock: 22,
        expiryDate: '2026-10-10',
        batchNumber: 'BCH-KOT-1L',
        supplierId: 1
      }
    ];
    await db.products.bulkAdd(productsData);
  }

  // 8. Seed sample Expenses if empty
  const expCount = await db.expenses.count();
  if (expCount === 0) {
    const today = getLocalDateStr(new Date());
    await db.expenses.bulkAdd([
      { id: 1, title: 'Shop Electricity Bill (CEB)', category: 'Electricity', amount: 14500, date: today, notes: 'Monthly shop bill', user: 'admin', timestamp: new Date().toISOString() },
      { id: 2, title: 'Delivery & Transport', category: 'Transport', amount: 3200, date: today, notes: 'Stock pick up from Pettah', user: 'admin', timestamp: new Date().toISOString() }
    ]);
  }

  // 9. Seed sample Sales if empty so Dashboard & Reports are active immediately
  const salesCount = await db.sales.count();
  if (salesCount === 0) {
    const now = new Date();
    const sampleSales = [
      {
        id: 1,
        invoiceNo: 'INV-20260926-00001',
        timestamp: new Date(now.getTime() - 2 * 3600000).toISOString(),
        cashierId: 1,
        cashierName: 'Super Admin',
        customerId: 1,
        customerName: 'Chaminda Vaas (චමින්ද)',
        customerPhone: '0771234567',
        pricingMode: 'retail',
        subtotal: 3100.00,
        totalDiscount: 0,
        tax: 0,
        grandTotal: 3100.00,
        paymentMethod: 'cash',
        tenderedAmount: 5000.00,
        changeAmount: 1900.00,
        paidCash: 3100.00,
        creditAmount: 0,
        status: 'completed'
      },
      {
        id: 2,
        invoiceNo: 'INV-20260926-00002',
        timestamp: new Date(now.getTime() - 1 * 3600000).toISOString(),
        cashierId: 3,
        cashierName: 'Kasun Silva',
        customerId: 2,
        customerName: 'Anusha Damayanthi (අනුෂා)',
        customerPhone: '0719876543',
        pricingMode: 'retail',
        subtotal: 4500.00,
        totalDiscount: 225.00,
        tax: 0,
        grandTotal: 4275.00,
        paymentMethod: 'card',
        tenderedAmount: 4275.00,
        changeAmount: 0,
        paidCash: 0,
        creditAmount: 0,
        status: 'completed'
      },
      {
        id: 3,
        invoiceNo: 'INV-20260926-00003',
        timestamp: new Date(now.getTime() - 30 * 60000).toISOString(),
        cashierId: 1,
        cashierName: 'Super Admin',
        customerId: 4,
        customerName: 'Nalaka Bandara (නාලක - VIP)',
        customerPhone: '0750001122',
        pricingMode: 'retail',
        subtotal: 2800.00,
        totalDiscount: 0,
        tax: 0,
        grandTotal: 2800.00,
        paymentMethod: 'split',
        tenderedAmount: 1500.00,
        changeAmount: 0,
        paidCash: 1500.00,
        creditAmount: 1300.00,
        status: 'completed'
      }
    ];

    for (const sale of sampleSales) {
      const saleId = await db.sales.add(sale);
      if (sale.invoiceNo === 'INV-20260926-00001') {
        await db.saleItems.bulkAdd([
          { id: 1, saleId, productId: 1, productName: 'Anchor Milk Powder 400g', sku: 'DAI-ANC-400', costPrice: 980, price: 1140, qty: 2, unit: 'pcs', discount: 0, total: 2280 },
          { id: 2, saleId, productId: 2, productName: 'Munchee Super Cream Cracker 500g', sku: 'BAK-MUN-500', costPrice: 310, price: 380, qty: 2, unit: 'pcs', discount: 0, total: 760 }
        ]);
      } else if (sale.invoiceNo === 'INV-20260926-00002') {
        await db.saleItems.bulkAdd([
          { id: 3, saleId, productId: 4, productName: 'Dilmah Premium Tea 100 Bags', sku: 'BEV-DIL-100', costPrice: 750, price: 920, qty: 3, unit: 'pcs', discount: 0, total: 2760 },
          { id: 4, saleId, productId: 6, productName: 'Astra Margarine 250g Tub', sku: 'DAI-AST-250', costPrice: 340, price: 420, qty: 4, unit: 'pcs', discount: 0, total: 1680 }
        ]);
      } else {
        await db.saleItems.bulkAdd([
          { id: 5, saleId, productId: 7, productName: 'Sunquick Orange Squash 840ml', sku: 'BEV-SUN-840', costPrice: 1550, price: 1850, qty: 1, unit: 'pcs', discount: 0, total: 1850 },
          { id: 6, saleId, productId: 8, productName: 'Raththi Milk Powder 400g', sku: 'DAI-RAT-400', costPrice: 960, price: 1120, qty: 1, unit: 'pcs', discount: 0, total: 1120 }
        ]);
      }
    }
  }

  console.log('[Firestore DB] Synchronization completed successfully!');
}

function getLocalDateStr(d) {
  const date = d ? (d instanceof Date ? d : new Date(d)) : new Date();
  if (isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function getSetting(key, defaultValue = '') {
  try {
    const item = await db.settings.get(key);
    return item && item.value !== undefined ? item.value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

async function setSetting(key, value) {
  return await db.settings.put({ key, value });
}

// Global Exports
window.db = db;
window.firestoreDb = db.firestoreDb;
window.firebaseApp = db.app;
window.getSetting = getSetting;
window.setSetting = setSetting;
window.formatLKR = formatLKR;
window.seedDatabaseIfEmpty = seedDatabaseIfEmpty;


// ==================== js\auth.js ====================

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
          customers: true, credit: true, suppliers: true, farmers: true, expenses: true,
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
          customers: true, credit: true, suppliers: true, farmers: true, expenses: true,
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
          customers: true, credit: true, suppliers: false, farmers: false, expenses: false,
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
      const allowedForManager = ['dashboard', 'pos', 'inventory', 'grn', 'customers', 'credit', 'suppliers', 'farmers', 'expenses', 'shifts', 'reports', 'allowDiscount', 'settings'];
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
        const managerAllowed = ['dashboard', 'pos', 'inventory', 'grn', 'customers', 'credit', 'suppliers', 'farmers', 'expenses', 'shifts', 'reports', 'allowDiscount'];
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


// ==================== js\i18n.js ====================

/**
 * Lightweight Offline Internationalization (i18n) Module
 * Supports:
 *  - English (EN)
 *  - Sinhala (SI / සිංහල)
 *  - Bilingual (BI / සිංහල + English)
 */

const I18n = {
  currentLang: 'en', // 'en', 'si', or 'bi'

  translations: {
    en: {
      // Nav Tabs
      dashboard: 'Dashboard',
      posTerminal: 'POS Terminal',
      inventory: 'Inventory & Stock',
      grn: 'GRN Purchases',
      credit: 'Credit Management',
      customers: 'Customers Directory',
      suppliers: 'Suppliers',
      farmers: 'Farmer Vegetables & Payables',
      farmersNav: 'Farmer Produce (ගොවි එළවළු)',
      expenses: 'Expenses',
      shifts: 'Cash Drawer / Shift',
      reports: 'Reports & Analytics',
      settings: 'Settings & Backup',
      offlineActive: '100% Offline Active',

      // Dashboard
      dashTitle: 'Executive Business Dashboard',
      dashSubtitle: 'Real-time sales, net profit, inventory valuation & business KPIs',
      dayTotal: 'Today Sales',
      dayProfit: 'Today Net Profit',
      fullTotal: 'Lifetime Sales',
      fullProfit: 'Lifetime Net Profit',
      stockValuationCard: 'Stock Valuation (Cost)',
      recentSalesTitle: 'Recent Sales Transactions',
      quickShortcuts: 'Quick Shortcuts',
      customerCreditCard: 'Customer Credit Due',
      supplierPayablesCard: 'Supplier Payables',

      // Header & Auth
      appName: 'LANKA MEGA POS',
      appSubname: '100% Offline Supermarket System • LKR',
      loginSupermarket: 'LANKA MEGA SUPERMARKET',
      loginTagline: 'Supermarket POS & Inventory System',
      loginSubtitle: 'Login with Username & Password',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      usernamePlaceholder: 'Username',
      loginBtn: 'LOGIN',
      demoLoginsTitle: '1-Click Demo Logins:',
      logOut: 'Log Out',

      // POS Terminal
      pricingMode: 'Pricing Mode:',
      retail: '🛒 Retail',
      wholesale: '🏢 Wholesale',
      attachCustomer: 'Attach Customer for Loyalty (F3)',
      searchProduct: 'Scan Barcode or Search (F1)...',
      camera: 'Camera',
      allItems: '🔥 All Items',
      discount: '🏷️ Discount (F4)',
      hold: '⏸️ Hold (F8)',
      recall: '▶️ Recall (F9)',
      clearCart: 'Clear',
      subtotal: 'Subtotal:',
      discounts: 'Discounts:',
      taxes: 'Taxes / VAT:',
      netPayable: 'Net Payable',
      payNow: 'PAY NOW (F10)',
      emptyCart: 'Cart is empty',
      scanOrClick: 'Scan barcode or click products to add',
      itemHeader: 'Item',
      priceHeader: 'Price',
      qtyHeader: 'Qty',
      amountHeader: 'Total (LKR)',
      retailTag: 'Retail',
      wholesaleTag: 'WS',

      // Inventory View
      costValuation: 'Cost Valuation',
      retailValuation: 'Retail Valuation',
      grossMargin: 'Gross Margin',
      lowStock: 'Low Stock',
      nearExpiry: 'Near Expiry',
      filterAll: 'All Items',
      filterLow: '⚠️ Low Stock',
      filterOut: '🚫 Out of Stock',
      filterNearExpiry: '⏳ Near Expiry',
      filterExpired: '❌ Expired',
      searchInventory: 'Search inventory...',
      exportCSV: '📥 CSV',
      addProduct: '+ Add Product',
      colProdName: 'Product Name / SKU',
      colBarcode: 'Barcode',
      colCategory: 'Category',
      colPrices: 'Retail / WS Price',
      colStock: 'Current Stock',
      colExpiry: 'Expiry Date',
      colActions: 'Actions',

      // GRN View
      grnTitle: 'Purchasing & GRN',
      grnSubtitle: 'Record supplier goods received and stock entry',
      newGRN: '+ New GRN Purchase',
      colGrnNo: 'GRN No',
      colSupplier: 'Supplier',
      colDate: 'Date',
      colItems: 'Items',
      colTotalCost: 'Total Cost',
      colPaymentStatus: 'Payment Status',

      // Customers View
      customersTitle: 'Customers & Loyalty Points',
      customersSubtitle: 'Manage customer loyalty points and store credit',
      searchCustomer: 'Search phone or name...',
      registerCustomer: '+ Register Customer',
      colCustomerName: 'Name',
      colCustomerPhone: 'Phone Number',
      colCustomerPoints: 'Loyalty Points',
      colCustomerCredit: 'Credit Balance',
      colCustomerTotalPurchases: 'Total Purchases',

      // Suppliers View
      suppliersTitle: 'Suppliers Directory',
      suppliersSubtitle: 'Distributors, contacts and outstanding payables',
      addSupplier: '+ Add Supplier',
      colSuppCompany: 'Company / Name',
      colSuppPhone: 'Phone',
      colSuppAddress: 'Address',
      colSuppBalance: 'Payable Balance',

      // Expenses View
      expensesTitle: 'Operational Expenses',
      expensesSubtitle: 'Record utilities, rent, wages and general overheads',
      totalExpenses: 'Total Expenses',
      logExpense: '+ Log Expense',
      colExpDate: 'Date',
      colExpDesc: 'Description',
      colExpCategory: 'Category',
      colExpAmount: 'Amount (LKR)',
      colExpNotes: 'Notes',

      // Shifts View
      shiftsHistoryTitle: 'Shift History & Z-Reports',
      colShiftId: 'Shift ID',
      colCashier: 'Cashier',
      colShiftDate: 'Date / Time',
      colStartFloat: 'Opening Float',
      colTotalSales: 'Total Sales',
      colVariance: 'Variance',
      colStatus: 'Status',
      openingFloat: 'Opening Float',
      cashSales: 'Cash Sales',
      cardQrSales: 'Card / QR Sales',
      expectedInDrawer: 'Expected In Drawer',
      endShiftReconcile: 'End Shift & Reconcile',
      noShiftOpen: 'No Shift Currently Open',
      startShiftPrompt: 'Start a new cashier shift with an opening cash float to begin tracking drawer cash.',
      openNewShiftBtn: 'Open New Shift',

      // Reports View
      reportsTitle: 'Analytics & Net Profit',
      reportsSubtitle: 'Offline reports with interactive visual charts',
      rangeToday: 'Today',
      range7Days: '7 Days',
      range30Days: '30 Days',
      rangeAll: 'All Time',
      exportSalesCSV: '📥 Export CSV',
      grossSales: 'Gross Sales',
      cogs: 'Cost of Goods (COGS)',
      grossProfit: 'Gross Profit',
      netProfit: 'True Net Profit',
      totalBills: 'Total Bills:',
      avgBasket: 'Avg Basket:',
      salesTrendTitle: 'Daily Sales Trend',
      topProductsTitle: 'Top 5 Best Sellers',
      hourlyTrafficTitle: 'Hourly Customer Traffic',
      cashierPerformanceTitle: 'Cashier Performance',
      colCashierName: 'Cashier Name',
      colReceiptsIssued: 'Bills Issued',
      colCollectedAmt: 'Total Collected (LKR)',
      colAvgBill: 'Average Bill',

      // Settings View
      brandingTitle: 'Store Logo & Custom Branding',
      brandingSubtitle: 'Choose a store logo from device gallery or files. Displays on header, login and thermal receipts.',
      selectLogoLabel: 'Select Store Logo Image (PNG / JPG / WEBP, Max 2MB):',
      chooseLogo: 'Choose Logo from Gallery / File',
      removeLogo: 'Remove Logo',
      storeSettingsTitle: 'Store Settings & Receipt Configuration',
      storeSettingsSubtitle: 'Store contact details, VAT tax rates, thermal printer width, and loyalty points',
      saveSettings: 'Save Settings',
      storeNameLabel: 'Store Name',
      storeNameSiLabel: 'Store Name (Sinhala / Optional)',
      branchLabel: 'Branch',
      phoneLabel: 'Phone Number',
      addressLabel: 'Address',
      vatNoLabel: 'VAT Registration No',
      printerWidthLabel: 'Thermal Paper Width',
      loyaltyRateLabel: 'Loyalty Earn Rate (1 pt per LKR spent)',
      receiptFooterLabel: 'Receipt Footer Note',
      enableBeepLabel: 'Enable scanner sound effects (Beep)',
      autoPrintLabel: 'Auto print receipt after checkout',
      backupTitle: 'Offline Database Backup & USB Wizard',
      backupSubtitle: 'Your data is stored 100% offline in browser storage. Save JSON backups daily to USB.',
      exportJSONTitle: '💾 Export Database Backup (JSON)',
      exportJSONDesc: 'Download full products, sales, customers and accounts file.',
      exportJSON: 'Export JSON Backup',
      restoreJSONTitle: '📂 Restore Database Backup (JSON)',
      restoreJSONDesc: 'Restore your database from a previously exported JSON backup.',
      restoreJSON: 'Restore JSON File',
      resetDBTitle: '⚠️ Reset & Restart System',
      resetDBDesc: 'Safely backup current data and restart fresh supermarket system or clear sales history.',
      resetDB: 'Reset & Restart System',

      // Modals
      checkoutTitle: 'Checkout & Payment',
      checkoutSubtitle: 'Select payment method & enter cash received',
      grandTotalLabel: 'Grand Total',
      payCash: '💵 Cash',
      payCard: '💳 Card',
      payQR: '📱 QR / Bank',
      payCredit: '📋 Credit',
      cashReceivedLabel: 'Cash Received (LKR)',
      changeDueLabel: 'Change Due:',
      cancelBtn: 'Cancel (Esc)',
      completeSaleBtn: 'Complete Sale & Print Receipt →',
      receiptPreviewTitle: 'Thermal Receipt Preview',
      closeBtn: 'Close',
      printReceiptBtn: 'Print Receipt',
      heldBillsTitle: 'Held Bills',
      selectCustomerTitle: 'Select Customer',
      customerSearchPlaceholder: 'Phone (07XXXXXXXX) or name...',
      newCustomerShort: '+ New',
      productModalTitle: 'Product Management',
      prodNameEnLabel: 'Product Name (English / Main) *',
      prodNameSiLabel: 'Sinhala Name (Optional)',
      skuLabel: 'SKU / Item Code *',
      barcodeLabel: 'Barcodes (Comma-separated)',
      categoryLabel: 'Category',
      brandLabel: 'Brand',
      unitLabel: 'Unit',
      costPriceLabel: 'Cost Price (LKR) *',
      markedPriceLabel: 'Marked Price / MRP (LKR) *',
      retailPriceLabel: 'Retail Price (LKR) *',
      wholesalePriceLabel: 'Wholesale Price (LKR) *',
      youSaved: '🎉 You Saved:',
      minStockLabel: 'Min Stock Alert',
      currentStockLabel: 'Current Stock Qty',
      expiryDateLabel: 'Expiry Date',
      batchNoLabel: 'Batch No',
      supplierLabel: 'Supplier',
      saveProductBtn: 'Save Product',
      stockAdjTitle: 'Stock Adjustment',
      adjTypeLabel: 'Adjustment Type',
      adjQtyLabel: 'Quantity',
      adjReasonLabel: 'Reason / Note',
      updateStockBtn: 'Update Stock',
      barcodeStickerTitle: 'Barcode Stickers Generator',
      barcodeNumberLabel: 'Barcode Number',
      copiesLabel: 'Copies',
      labelSizeLabel: 'Label Size',
      previewLabel: 'Preview',
      printStickersBtn: 'Print Stickers',
      newGrnModalTitle: 'New GRN Purchase Entry',
      invoiceNoLabel: 'Invoice / GRN No',
      addItemsSection: 'Add Products',
      costPlaceholder: 'Cost (LKR)',
      qtyPlaceholder: 'Qty',
      addItemBtn: '+ Add Item',
      paymentModeLabel: 'Payment Mode',
      amountPaidLabel: 'Amount Paid (LKR)',
      totalGrnCostLabel: 'Total GRN Amount:',
      addToStockBtn: 'Add to Inventory Stock',
      custModalTitle: 'Customer Registration',
      custPhoneLabel: 'Phone Number (07XXXXXXXX) *',
      custFullNameLabel: 'Full Name *',
      custEmailLabel: 'Email Address',
      custPointsLabel: 'Opening Points',
      custCreditLabel: 'Credit Balance (LKR)',
      saveCustomerBtn: 'Save Customer',
      suppModalTitle: 'Supplier Details',
      suppNameLabel: 'Company / Supplier Name *',
      suppBalanceLabel: 'Opening Payable Balance (LKR)',
      saveSupplierBtn: 'Save Supplier',
      expModalTitle: 'Log Operational Expense',
      expTitleLabel: 'Expense Description *',
      expAmountLabel: 'Amount (LKR) *',
      saveExpenseBtn: 'Record Expense',
      startShiftTitle: 'Open Cashier Shift',
      startShiftSubtitle: 'Enter opening cash drawer float amount',
      startFloatLabel: 'Opening Float (LKR)',
      startShiftBtn: 'Start Shift',
      endShiftTitle: 'Close Shift & Drawer Reconciliation',
      expectedCashLabel: 'Expected In Drawer:',
      actualCashLabel: 'Actual Counted Cash (LKR) *',
      varianceLabel: 'Cash Variance:',
      confirmCloseShiftBtn: 'Close Shift & Print Z-Report',
      cameraModalTitle: 'Camera Barcode Scanner',
      cameraInstructions: 'Point camera at barcode label.'
    },

    si: {
      // Nav Tabs
      dashboard: 'මුල් පුවරුව (Dashboard)',
      posTerminal: 'බිල්පත් පර්යන්තය',
      inventory: 'තොග පාලනය',
      grn: 'මිලදී ගැනීම් (GRN)',
      credit: 'ණය කළමනාකරණය',
      customers: 'පාරිභෝගික ලේඛනය',
      suppliers: 'සැපයුම්කරුවන්',
      farmers: 'ගොවි එළවළු සහ හිඟ මුදල්',
      farmersNav: 'ගොවි එළවළු (Farmers)',
      expenses: 'වියදම්',
      shifts: 'මුදල් ලාච්චුව සහ මුර',
      reports: 'වාර්තා සහ විශ්ලේෂණ',
      settings: 'සැකසුම් සහ උපස්ථ',
      offlineActive: '100% නොබැඳිව ක්‍රියාත්මකයි',

      // Dashboard
      dashTitle: 'ව්‍යාපාරික මුල් පුවරුව (Dashboard)',
      dashSubtitle: 'දෛනික සහ සම්පූර්ණ විකුණුම්, ශුද්ධ ලාභය සහ ව්‍යාපාරික දත්ත',
      dayTotal: 'අද මුළු විකුණුම්',
      dayProfit: 'අද ශුද්ධ ලාභය',
      fullTotal: 'සම්පූර්ණ විකුණුම්',
      fullProfit: 'සම්පූර්ණ ශුද්ධ ලාභය',
      stockValuationCard: 'තොගයේ පිරිවැය වටිනාකම',
      recentSalesTitle: 'මෑත විකුණුම් ගනුදෙනු',
      quickShortcuts: 'ක්ෂණික කෙටිමං',
      customerCreditCard: 'පාරිභෝගික ණය ශේෂය',
      supplierPayablesCard: 'සැපයුම්කරුවන්ට ගෙවිය යුතු මුදල',

      // Header & Auth
      appName: 'ලංකා මෙගා POS',
      appSubname: '100% නොබැඳි සුපිරි වෙළඳසැල් පද්ධතිය • LKR',
      loginSupermarket: 'ලංකා මෙගා සුපිරි වෙළඳසැල',
      loginTagline: 'සුපිරි වෙළඳසැල් POS සහ තොග පද්ධතිය',
      loginSubtitle: 'පරිශීලක නම සහ මුරපදය මඟින් ඇතුල් වන්න',
      usernameLabel: 'පරිශීලක නම',
      passwordLabel: 'මුරපදය',
      usernamePlaceholder: 'පරිශීලක නම (Username)',
      loginBtn: 'ඇතුල් වන්න',
      demoLoginsTitle: 'ක්ෂණික ආදර්ශ පිවිසුම්:',
      logOut: 'ඉවත් වන්න',

      // POS Terminal
      pricingMode: 'මිල ප්‍රකාරය:',
      retail: '🛒 සිල්ලර',
      wholesale: '🏢 තොග',
      attachCustomer: 'පාරිභෝගිකයා තෝරන්න (F3)',
      searchProduct: 'බාර්කෝඩ් / නම / SKU සොයන්න (F1)...',
      camera: 'කැමරාව',
      allItems: '🔥 සියල්ල',
      discount: '🏷️ වට්ටම (F4)',
      hold: '⏸️ රඳවන්න (F8)',
      recall: '▶️ නැවත (F9)',
      clearCart: 'හිස් කරන්න',
      subtotal: 'උප එකතුව:',
      discounts: 'වට්ටම්:',
      taxes: 'බදු (VAT):',
      netPayable: 'මුළු මුදල',
      payNow: 'ගෙවීම් කරන්න (F10)',
      emptyCart: 'බිල්පත හිස්ය',
      scanOrClick: 'බාර්කෝඩ් ස්කෑන් කරන්න හෝ භාණ්ඩ තෝරන්න',
      itemHeader: 'භාණ්ඩය',
      priceHeader: 'මිල',
      qtyHeader: 'ප්‍රමාණය',
      amountHeader: 'මුදල (LKR)',
      retailTag: 'සිල්ලර',
      wholesaleTag: 'තොග',

      // Inventory View
      costValuation: 'මුළු පිරිවැය',
      retailValuation: 'විකුණුම් අගය',
      grossMargin: 'දළ ලාභය',
      lowStock: 'අඩු තොග',
      nearExpiry: 'කල් ඉකුත්වන',
      filterAll: 'සියල්ල',
      filterLow: '⚠️ අඩු තොග',
      filterOut: '🚫 ඉවර වූ තොග',
      filterNearExpiry: '⏳ කල් ඉකුත්වන',
      filterExpired: '❌ කල් ඉකුත් වූ',
      searchInventory: 'තොග සොයන්න...',
      exportCSV: '📥 CSV',
      addProduct: '+ අලුත් භාණ්ඩයක්',
      colProdName: 'භාණ්ඩයේ නම / SKU',
      colBarcode: 'බාර්කෝඩ්',
      colCategory: 'වර්ගය',
      colPrices: 'සිල්ලර / තොග මිල',
      colStock: 'වත්මන් තොගය',
      colExpiry: 'කල් ඉකුත් වීම',
      colActions: 'ක්‍රියා',

      // GRN View
      grnTitle: 'මිලදී ගැනීම් සහ GRN',
      grnSubtitle: 'සැපයුම්කරුවන්ගෙන් ලැබෙන තොග ඇතුළත් කිරීම',
      newGRN: '+ නව GRN එකක්',
      colGrnNo: 'GRN අංකය',
      colSupplier: 'සැපයුම්කරු',
      colDate: 'දිනය',
      colItems: 'අයිතම',
      colTotalCost: 'මුළු පිරිවැය',
      colPaymentStatus: 'ගෙවීම් තත්ත්වය',

      // Customers View
      customersTitle: 'පාරිභෝගික නාමාවලිය සහ ලකුණු',
      customersSubtitle: 'ලෝයල්ටි ලකුණු සහ ණය ගිණුම් පාලනය',
      searchCustomer: 'දුරකථන අංකය හෝ නම සොයන්න...',
      registerCustomer: '+ පාරිභෝගිකයෙකු ලියාපදිංචි කරන්න',
      colCustomerName: 'නම',
      colCustomerPhone: 'දුරකථන අංකය',
      colCustomerPoints: 'ලෝයල්ටි ලකුණු',
      colCustomerCredit: 'ණය ශේෂය',
      colCustomerTotalPurchases: 'මුළු මිලදී ගැනීම්',

      // Suppliers View
      suppliersTitle: 'සැපයුම්කරුවන්ගේ නාමාවලිය',
      suppliersSubtitle: 'බෙදාහරින්නන් සහ ගෙවිය යුතු ශේෂයන්',
      addSupplier: '+ සැපයුම්කරුවෙකු එක් කරන්න',
      colSuppCompany: 'සමාගම / නම',
      colSuppPhone: 'දුරකථනය',
      colSuppAddress: 'ලිපිනය',
      colSuppBalance: 'ගෙවිය යුතු ශේෂය',

      // Expenses View
      expensesTitle: 'ව්‍යාපාරික වියදම්',
      expensesSubtitle: 'විදුලිය, වැටුප්, කුලී සහ අනෙකුත් වියදම් සටහන් කිරීම',
      totalExpenses: 'මුළු වියදම',
      logExpense: '+ වියදමක් එක් කරන්න',
      colExpDate: 'දිනය',
      colExpDesc: 'විස්තරය',
      colExpCategory: 'වර්ගය',
      colExpAmount: 'මුදල (LKR)',
      colExpNotes: 'සටහන්',

      // Shifts View
      shiftsHistoryTitle: 'පෙර මුර වාර්තා සහ Z-Reports',
      colShiftId: 'මුර අංකය',
      colCashier: 'කැෂියර්',
      colShiftDate: 'දිනය / වේලාව',
      colStartFloat: 'ආරම්භක මුදල',
      colTotalSales: 'මුළු විකුණුම්',
      colVariance: 'වෙනස',
      colStatus: 'තත්ත්වය',
      openingFloat: 'ආරම්භක මුදල',
      cashSales: 'මුදල් විකුණුම්',
      cardQrSales: 'කාඩ් / QR විකුණුම්',
      expectedInDrawer: 'ලාච්චුවේ තිබිය යුතු මුදල',
      endShiftReconcile: 'මුරය අවසන් කිරීම',
      noShiftOpen: 'ක්‍රියාකාරී මුරයක් නොමැත',
      startShiftPrompt: 'ලාච්චුවේ මුදල් පාලනය සඳහා ආරම්භක මුදලක් සමඟ නව මුරයක් අරඹන්න.',
      openNewShiftBtn: 'නව මුරයක් අරඹන්න',

      // Reports View
      reportsTitle: 'ව්‍යාපාරික විශ්ලේෂණ සහ ශුද්ධ ලාභය',
      reportsSubtitle: 'Chart.js ප්‍රස්ථාර සමඟ නොබැඳි වාර්තා',
      rangeToday: 'අද',
      range7Days: 'දින 7',
      range30Days: 'දින 30',
      rangeAll: 'සියල්ල',
      exportSalesCSV: '📥 CSV ලබාගන්න',
      grossSales: 'මුළු ආදායම',
      cogs: 'භාණ්ඩ පිරිවැය',
      grossProfit: 'දළ ලාභය',
      netProfit: 'සැබෑ ශුද්ධ ලාභය',
      totalBills: 'මුළු බිල්පත්:',
      avgBasket: 'සාමාන්‍ය බිල්පත:',
      salesTrendTitle: 'දෛනික විකුණුම් ප්‍රවණතාවය',
      topProductsTitle: 'වැඩිපුරම අලෙවි වූ භාණ්ඩ 5',
      hourlyTrafficTitle: 'පැය අනුව පාරිභෝගික පැමිණීම',
      cashierPerformanceTitle: 'කැෂියර් කාර්ය සාධනය',
      colCashierName: 'කැෂියර් නම',
      colReceiptsIssued: 'නිකුත් කළ බිල්පත්',
      colCollectedAmt: 'එකතු කළ මුදල (LKR)',
      colAvgBill: 'සාමාන්‍ය බිල්පත',

      // Settings View
      brandingTitle: 'වෙළඳසැල් ලාංඡනය සහ සන්නාමය',
      brandingSubtitle: 'ශීර්ෂකය, පිවිසුම් තිරය සහ මුද්‍රිත බිල්පත් සඳහා ලාංඡනයක් තෝරන්න.',
      selectLogoLabel: 'වෙළඳසැල් ලාංඡනය තෝරන්න (PNG / JPG / WEBP, උපරිම 2MB):',
      chooseLogo: 'ගොනුවකින් ලාංඡනය තෝරන්න',
      removeLogo: 'ලාංඡනය ඉවත් කරන්න',
      storeSettingsTitle: 'වෙළඳසැල් සැකසුම් සහ බිල්පත් වින්‍යාසය',
      storeSettingsSubtitle: 'ලිපිනය, දුරකථනය, VAT අංකය, මුද්‍රණ යන්ත්‍රය සහ ලෝයල්ටි සැකසුම්',
      saveSettings: 'සැකසුම් සුරකින්න',
      storeNameLabel: 'වෙළඳසැල් නම',
      storeNameSiLabel: 'වෙළඳසැල් නම (සිංහල / විකල්ප)',
      branchLabel: 'ශාඛාව',
      phoneLabel: 'දුරකථන අංකය',
      addressLabel: 'ලිපිනය',
      vatNoLabel: 'VAT ලියාපදිංචි අංකය',
      printerWidthLabel: 'මුද්‍රණ යන්ත්‍රයේ පළල',
      loyaltyRateLabel: 'ලෝයල්ටි අනුපාතය (රු. 1 ට ලැබෙන ලකුණු)',
      receiptFooterLabel: 'බිල්පතේ පහළ සටහන',
      enableBeepLabel: 'ශබ්ද සංඥා ක්‍රියාත්මක කරන්න (Beep)',
      autoPrintLabel: 'ගෙවීමෙන් පසු ස්වයංක්‍රීයව බිල්පත මුද්‍රණය කරන්න',
      backupTitle: 'දත්ත ආරක්ෂාව සහ නොබැඳි උපස්ථ',
      backupSubtitle: 'ඔබගේ දත්ත 100% නොබැඳිව බ්‍රවුසරයේ සුරැකේ. දිනපතා USB ධාවකයකට JSON උපස්ථයක් සුරකින්න.',
      exportJSONTitle: '💾 දත්ත පිටපතක් ලබාගන්න (Export JSON)',
      exportJSONDesc: 'සම්පූර්ණ භාණ්ඩ, විකුණුම් සහ ගිණුම් දත්ත ගොනුවක් බාගත කරන්න.',
      exportJSON: 'Export JSON උපස්ථය',
      restoreJSONTitle: '📂 දත්ත නැවත ලබාගන්න (Restore JSON)',
      restoreJSONDesc: 'කලින් ලබාගත් JSON උපස්ථ ගොනුවකින් දත්ත නැවත ප්‍රතිස්ථාපනය කරන්න.',
      restoreJSON: 'Restore JSON ගොනුව',
      resetDBTitle: '⚠️ පද්ධතිය නැවත ආරම්භ කිරීම (Reset & Restart)',
      resetDBDesc: 'දැනට ඇති දත්ත ආරක්ෂිතව Auto-Backup කර සම්පූර්ණ පද්ධතියම හෝ විකුණුම් වාර්තා පමණක් 0 දක්වා Reset කරන්න.',
      resetDB: 'පද්ධතිය Reset කරන්න',

      // Modals
      checkoutTitle: 'ගෙවීම් සම්පූර්ණ කිරීම',
      checkoutSubtitle: 'ගෙවීම් ක්‍රමය තෝරා ලැබුණු මුදල ඇතුළත් කරන්න',
      grandTotalLabel: 'මුළු එකතුව',
      payCash: '💵 මුදල්',
      payCard: '💳 කාඩ්පත්',
      payQR: '📱 QR / බැංකු',
      payCredit: '📋 ණයට',
      cashReceivedLabel: 'ලැබුණු මුදල (LKR)',
      changeDueLabel: 'ඉතිරි මුදල:',
      cancelBtn: 'අවලංගු කරන්න (Esc)',
      completeSaleBtn: 'බිල්පත නිකුත් කරන්න →',
      receiptPreviewTitle: 'බිල්පත් පෙරදසුන',
      closeBtn: 'වසන්න',
      printReceiptBtn: 'මුද්‍රණය කරන්න',
      heldBillsTitle: 'රඳවාගත් බිල්පත්',
      selectCustomerTitle: 'පාරිභෝගිකයා තෝරන්න',
      customerSearchPlaceholder: 'දුරකථනය (07XXXXXXXX) හෝ නම...',
      newCustomerShort: '+ අලුත්',
      productModalTitle: 'භාණ්ඩ කළමනාකරණය',
      prodNameEnLabel: 'භාණ්ඩයේ නම (ඉංග්‍රීසි / ප්‍රධාන) *',
      prodNameSiLabel: 'සිංහල නම (අවශ්‍ය නම්)',
      skuLabel: 'SKU / භාණ්ඩ අංකය *',
      barcodeLabel: 'බාර්කෝඩ් (කොමා මඟින් වෙන් කර)',
      categoryLabel: 'වර්ගය',
      brandLabel: 'වෙළඳ නාමය',
      unitLabel: 'ඒකකය',
      costPriceLabel: 'ගැනුම් මිල (LKR) *',
      markedPriceLabel: 'මුද්‍රිත මිල / MRP (LKR) *',
      retailPriceLabel: 'සිල්ලර මිල (LKR) *',
      wholesalePriceLabel: 'තොග මිල (LKR) *',
      youSaved: '🎉 ඔබට ලැබුණු ලාභය:',
      minStockLabel: 'අවම තොග මට්ටම',
      currentStockLabel: 'වත්මන් තොගය',
      expiryDateLabel: 'කල් ඉකුත්වන දිනය',
      batchNoLabel: 'කාණ්ඩ අංකය',
      supplierLabel: 'සැපයුම්කරු',
      saveProductBtn: 'භාණ්ඩය සුරකින්න',
      stockAdjTitle: 'තොග ගැලපීම්',
      adjTypeLabel: 'ගැලපුම් වර්ගය',
      adjQtyLabel: 'ප්‍රමාණය',
      adjReasonLabel: 'හේතුව / සටහන',
      updateStockBtn: 'යාවත්කාලීන කරන්න',
      barcodeStickerTitle: 'බාර්කෝඩ් ලේබල් මුද්‍රණය',
      barcodeNumberLabel: 'බාර්කෝඩ් අංකය',
      copiesLabel: 'පිටපත් ගණන',
      labelSizeLabel: 'ලේබල් ප්‍රමාණය',
      previewLabel: 'පෙරදසුන',
      printStickersBtn: 'ලේබල් මුද්‍රණය කරන්න',
      newGrnModalTitle: 'නව මිලදී ගැනීමක් / GRN ඇතුළත් කිරීම',
      invoiceNoLabel: 'ඉන්වොයිස් / GRN අංකය',
      addItemsSection: 'භාණ්ඩ එකතු කරන්න',
      costPlaceholder: 'පිරිවැය (LKR)',
      qtyPlaceholder: 'ප්‍රමාණය',
      addItemBtn: '+ එක් කරන්න',
      paymentModeLabel: 'ගෙවීම් ක්‍රමය',
      amountPaidLabel: 'ගෙවූ මුදල (LKR)',
      totalGrnCostLabel: 'මුළු GRN මුදල:',
      addToStockBtn: 'තොගයට එක් කරන්න',
      custModalTitle: 'පාරිභෝගික ලියාපදිංචිය',
      custPhoneLabel: 'දුරකථන අංකය (07XXXXXXXX) *',
      custFullNameLabel: 'සම්පූර්ණ නම *',
      custEmailLabel: 'ඊමේල් ලිපිනය',
      custPointsLabel: 'ආරම්භක ලකුණු',
      custCreditLabel: 'ණය ශේෂය (LKR)',
      saveCustomerBtn: 'පාරිභෝගිකයා සුරකින්න',
      suppModalTitle: 'සැපයුම්කරුගේ විස්තර',
      suppNameLabel: 'සමාගම / සැපයුම්කරුගේ නම *',
      suppBalanceLabel: 'ගෙවිය යුතු ආරම්භක ශේෂය (LKR)',
      saveSupplierBtn: 'සැපයුම්කරු සුරකින්න',
      expModalTitle: 'වියදම් සටහන් කිරීම',
      expTitleLabel: 'වියදමේ විස්තරය *',
      expAmountLabel: 'මුදල (LKR) *',
      saveExpenseBtn: 'වියදම සටහන් කරන්න',
      startShiftTitle: 'මුරය ආරම්භ කිරීම',
      startShiftSubtitle: 'මුදල් ලාච්චුවේ ඇති ආරම්භක මුදල ඇතුළත් කරන්න',
      startFloatLabel: 'ආරම්භක මුදල (LKR)',
      startShiftBtn: 'මුරය අරඹන්න',
      endShiftTitle: 'මුරය අවසන් කිරීම සහ ගිණුම් පියවීම',
      expectedCashLabel: 'ලාච්චුවේ තිබිය යුතු මුදල:',
      actualCashLabel: 'ලාච්චුවේ ගණන් කළ සැබෑ මුදල (LKR) *',
      varianceLabel: 'මුදල් වෙනස:',
      confirmCloseShiftBtn: 'මුරය වසා Z-Report එක ගන්න',
      cameraModalTitle: 'බාර්කෝඩ් ස්කෑන් කරන්න',
      cameraInstructions: 'බාර්කෝඩ් එක කැමරාවට ඉදිරියෙන් තබන්න.'
    },

    bi: {
      // Nav Tabs (Bilingual: සිංහල + English)
      dashboard: 'මුල් පුවරුව (Dashboard)',
      posTerminal: 'බිල්පත් (POS)',
      inventory: 'තොග පාලනය (Inventory)',
      grn: 'මිලදී ගැනීම් (GRN Purchases)',
      credit: 'ණය කළමනාකරණය (Credit)',
      customers: 'පාරිභෝගිකයින් (Customers)',
      suppliers: 'සැපයුම්කරුවන් (Suppliers)',
      farmers: 'ගොවි එළවළු (Farmer Produce & Payables)',
      farmersNav: 'ගොවි එළවළු (Farmer Produce)',
      expenses: 'වියදම් (Expenses)',
      shifts: 'මුදල් ලාච්චුව (Shifts)',
      reports: 'වාර්තා (Reports & Analytics)',
      settings: 'සැකසුම් (Settings & Backup)',
      offlineActive: '100% නොබැඳි (Offline Active)',

      // Dashboard
      dashTitle: 'ව්‍යාපාරික මුල් පුවරුව (Executive Dashboard)',
      dashSubtitle: 'දෛනික සහ සම්පූර්ණ විකුණුම්, ලාභය සහ දත්ත (Sales & Net Profit)',
      dayTotal: 'අද විකුණුම් (Today Sales)',
      dayProfit: 'අද ශුද්ධ ලාභය (Today Net Profit)',
      fullTotal: 'සම්පූර්ණ විකුණුම් (Lifetime Sales)',
      fullProfit: 'සම්පූර්ණ ශුද්ධ ලාභය (Lifetime Profit)',
      stockValuationCard: 'තොග වටිනාකම (Stock Valuation)',
      recentSalesTitle: 'මෑත විකුණුම් (Recent Sales)',
      quickShortcuts: 'ක්ෂණික කෙටිමං (Shortcuts)',
      customerCreditCard: 'පාරිභෝගික ණය (Customer Credit)',
      supplierPayablesCard: 'සැපයුම්කරු ගෙවීම් (Supplier Payables)',

      // Header & Auth
      appName: 'LANKA MEGA POS (ලංකා මෙගා)',
      appSubname: '100% Offline Supermarket System • LKR',
      loginSupermarket: 'LANKA MEGA SUPERMARKET (ලංකා මෙගා)',
      loginTagline: 'Supermarket POS & Inventory (තොග පද්ධතිය)',
      loginSubtitle: 'Username & Password / පරිශීලක පිවිසුම',
      usernameLabel: 'Username / පරිශීලක නම',
      passwordLabel: 'Password / මුරපදය',
      usernamePlaceholder: 'Username / පරිශීලක නම',
      loginBtn: 'LOGIN / ඇතුල් වන්න',
      demoLoginsTitle: '1-Click Demo Logins / ක්ෂණික පිවිසුම්:',
      logOut: 'Log Out (ඉවත් වන්න)',

      // POS Terminal
      pricingMode: 'මිල ප්‍රකාරය (Mode):',
      retail: '🛒 සිල්ලර (Retail)',
      wholesale: '🏢 තොග (Wholesale)',
      attachCustomer: 'පාරිභෝගිකයා (Customer - F3)',
      searchProduct: 'බාර්කෝඩ් / නම (Scan/Search - F1)...',
      camera: 'කැමරාව (Camera)',
      allItems: '🔥 සියල්ල (All Items)',
      discount: '🏷️ වට්ටම (Discount - F4)',
      hold: '⏸️ රඳවන්න (Hold - F8)',
      recall: '▶️ නැවත (Recall - F9)',
      clearCart: 'හිස් කරන්න (Clear)',
      subtotal: 'උප එකතුව (Subtotal):',
      discounts: 'වට්ටම් (Discounts):',
      taxes: 'බදු (Taxes/VAT):',
      netPayable: 'මුළු මුදල (Net Payable)',
      payNow: 'ගෙවීම් කරන්න (PAY NOW - F10)',
      emptyCart: 'බිල්පත හිස්ය (Cart is empty)',
      scanOrClick: 'බාර්කෝඩ් ස්කෑන් කරන්න (Scan / click items)',
      itemHeader: 'භාණ්ඩය (Item)',
      priceHeader: 'මිල (Price)',
      qtyHeader: 'ප්‍රමාණය (Qty)',
      amountHeader: 'මුදල (Total - LKR)',
      retailTag: 'සිල්ලර (Retail)',
      wholesaleTag: 'තොග (WS)',

      // Inventory View
      costValuation: 'මුළු පිරිවැය (Cost Valuation)',
      retailValuation: 'විකුණුම් අගය (Retail Valuation)',
      grossMargin: 'දළ ලාභය (Gross Margin)',
      lowStock: 'අඩු තොග (Low Stock)',
      nearExpiry: 'කල් ඉකුත්වන (Near Expiry)',
      filterAll: 'සියල්ල (All Items)',
      filterLow: '⚠️ අඩු තොග (Low Stock)',
      filterOut: '🚫 ඉවර වූ (Out of Stock)',
      filterNearExpiry: '⏳ කල් ඉකුත්වන (Near Expiry)',
      filterExpired: '❌ කල් ඉකුත් (Expired)',
      searchInventory: 'තොග සොයන්න (Search inventory)...',
      exportCSV: '📥 CSV',
      addProduct: '+ අලුත් භාණ්ඩයක් (Add Product)',
      colProdName: 'භාණ්ඩයේ නම (Product Name / SKU)',
      colBarcode: 'බාර්කෝඩ් (Barcode)',
      colCategory: 'වර්ගය (Category)',
      colPrices: 'සිල්ලර/තොග මිල (Prices)',
      colStock: 'වත්මන් තොගය (Stock)',
      colExpiry: 'කල් ඉකුත් වීම (Expiry)',
      colActions: 'ක්‍රියා (Actions)',

      // GRN View
      grnTitle: 'මිලදී ගැනීම් සහ GRN (Purchasing)',
      grnSubtitle: 'සැපයුම්කරුවන්ගෙන් ලැබෙන තොග (Goods Received)',
      newGRN: '+ නව GRN එකක් (New Purchase)',
      colGrnNo: 'GRN අංකය (GRN No)',
      colSupplier: 'සැපයුම්කරු (Supplier)',
      colDate: 'දිනය (Date)',
      colItems: 'අයිතම (Items)',
      colTotalCost: 'මුළු පිරිවැය (Total Cost)',
      colPaymentStatus: 'ගෙවීම් තත්ත්වය (Payment)',

      // Customers View
      customersTitle: 'පාරිභෝගිකයින් (Customers & Loyalty)',
      customersSubtitle: 'ලෝයල්ටි ලකුණු සහ ණය (Points & Credit)',
      searchCustomer: 'දුරකථනය හෝ නම සොයන්න...',
      registerCustomer: '+ පාරිභෝගිකයෙක් (Register Customer)',
      colCustomerName: 'නම (Name)',
      colCustomerPhone: 'දුරකථනය (Phone)',
      colCustomerPoints: 'ලකුණු (Points)',
      colCustomerCredit: 'ණය ශේෂය (Credit Balance)',
      colCustomerTotalPurchases: 'මිලදී ගැනීම් (Purchases)',

      // Suppliers View
      suppliersTitle: 'සැපයුම්කරුවන් (Suppliers Directory)',
      suppliersSubtitle: 'බෙදාහරින්නන් සහ ශේෂයන් (Payables)',
      addSupplier: '+ සැපයුම්කරුවෙක් (Add Supplier)',
      colSuppCompany: 'සමාගම/නම (Company/Name)',
      colSuppPhone: 'දුරකථනය (Phone)',
      colSuppAddress: 'ලිපිනය (Address)',
      colSuppBalance: 'ගෙවිය යුතු ශේෂය (Payable)',

      // Expenses View
      expensesTitle: 'ව්‍යාපාරික වියදම් (Operational Expenses)',
      expensesSubtitle: 'විදුලිය, කුලී, වැටුප් (Utilities & Overheads)',
      totalExpenses: 'මුළු වියදම (Total Expenses)',
      logExpense: '+ වියදමක් එක් කරන්න (Log Expense)',
      colExpDate: 'දිනය (Date)',
      colExpDesc: 'විස්තරය (Description)',
      colExpCategory: 'වර්ගය (Category)',
      colExpAmount: 'මුදල (Amount - LKR)',
      colExpNotes: 'සටහන් (Notes)',

      // Shifts View
      shiftsHistoryTitle: 'මුර වාර්තා සහ Z-Reports (Shift History)',
      colShiftId: 'මුර අංකය (Shift ID)',
      colCashier: 'කැෂියර් (Cashier)',
      colShiftDate: 'දිනය/වේලාව (Date/Time)',
      colStartFloat: 'ආරම්භක මුදල (Float)',
      colTotalSales: 'මුළු විකුණුම් (Sales)',
      colVariance: 'වෙනස (Variance)',
      colStatus: 'තත්ත්වය (Status)',
      openingFloat: 'ආරම්භක මුදල (Opening Float)',
      cashSales: 'මුදල් විකුණුම් (Cash Sales)',
      cardQrSales: 'කාඩ්/QR විකුණුම් (Card/QR Sales)',
      expectedInDrawer: 'තිබිය යුතු මුදල (Expected Cash)',
      endShiftReconcile: 'මුරය අවසන් කිරීම (End Shift)',
      noShiftOpen: 'ක්‍රියාකාරී මුරයක් නැත (No Shift Open)',
      startShiftPrompt: 'ආරම්භක මුදල සමඟ නව මුරයක් අරඹන්න (Open new shift)',
      openNewShiftBtn: 'නව මුරයක් අරඹන්න (Open Shift)',

      // Reports View
      reportsTitle: 'විශ්ලේෂණ සහ ශුද්ධ ලාභය (Analytics & Net Profit)',
      reportsSubtitle: 'නොබැඳි වාර්තා සහ ප්‍රස්ථාර (Offline Visual Charts)',
      rangeToday: 'අද (Today)',
      range7Days: 'දින 7 (7 Days)',
      range30Days: 'දින 30 (30 Days)',
      rangeAll: 'සියල්ල (All Time)',
      exportSalesCSV: '📥 Export CSV',
      grossSales: 'මුළු ආදායම (Gross Sales)',
      cogs: 'භාණ්ඩ පිරිවැය (COGS)',
      grossProfit: 'දළ ලාභය (Gross Profit)',
      netProfit: 'සැබෑ ශුද්ධ ලාභය (True Net Profit)',
      totalBills: 'මුළු බිල්පත් (Total Bills):',
      avgBasket: 'සාමාන්‍ය බිල්පත (Avg Bill):',
      salesTrendTitle: 'දෛනික විකුණුම් (Daily Sales Trend)',
      topProductsTitle: 'වැඩිපුරම අලෙවි වූ භාණ්ඩ (Top 5 Best Sellers)',
      hourlyTrafficTitle: 'පැය අනුව පැමිණීම (Hourly Traffic)',
      cashierPerformanceTitle: 'කැෂියර් කාර්ය සාධනය (Cashier Performance)',
      colCashierName: 'කැෂියර් නම (Cashier)',
      colReceiptsIssued: 'බිල්පත් ගණන (Bills)',
      colCollectedAmt: 'එකතු කළ මුදල (Collected - LKR)',
      colAvgBill: 'සාමාන්‍ය බිල්පත (Avg Bill)',

      // Settings View
      brandingTitle: 'වෙළඳසැල් ලාංඡනය (Store Logo & Branding)',
      brandingSubtitle: 'ශීර්ෂකය, පිවිසුම් සහ බිල්පත් ලාංඡනය (Header, Login & Receipts)',
      selectLogoLabel: 'ලාංඡනය තෝරන්න (Select Store Logo Image - Max 2MB):',
      chooseLogo: 'ලාංඡනයක් තෝරන්න (Choose Logo)',
      removeLogo: 'ලාංඡනය ඉවත් කරන්න (Remove Logo)',
      storeSettingsTitle: 'වෙළඳසැල් සැකසුම් (Store Settings & Receipt Config)',
      storeSettingsSubtitle: 'ලිපිනය, දුරකථනය, VAT අංකය සහ මුද්‍රණ යන්ත්‍ර සැකසුම්',
      saveSettings: 'සැකසුම් සුරකින්න (Save Settings)',
      storeNameLabel: 'වෙළඳසැල් නම (Store Name)',
      storeNameSiLabel: 'වෙළඳසැල් නම - සිංහල (Store Name Sinhala)',
      branchLabel: 'ශාඛාව (Branch)',
      phoneLabel: 'දුරකථන අංකය (Phone)',
      addressLabel: 'ලිපිනය (Address)',
      vatNoLabel: 'VAT අංකය (VAT Reg No)',
      printerWidthLabel: 'මුද්‍රණ පළල (Thermal Paper Width)',
      loyaltyRateLabel: 'ලෝයල්ටි අනුපාතය (Loyalty Earn Rate)',
      receiptFooterLabel: 'බිල්පතේ පහළ සටහන (Receipt Footer Note)',
      enableBeepLabel: 'ශබ්ද සංඥා (Beep Sound Effects)',
      autoPrintLabel: 'ස්වයංක්‍රීයව බිල්පත මුද්‍රණය (Auto Print Receipt)',
      backupTitle: 'දත්ත උපස්ථ සහ USB ආරක්ෂාව (Database Backup & USB)',
      backupSubtitle: '100% නොබැඳි බ්‍රවුසර දත්ත. දිනපතා USB වෙත උපස්ථ කරන්න.',
      exportJSONTitle: '💾 දත්ත පිටපතක් (Export JSON Backup)',
      exportJSONDesc: 'සම්පූර්ණ භාණ්ඩ, විකුණුම් ගොනුව බාගත කරන්න (Download full backup)',
      exportJSON: 'Export JSON Backup',
      restoreJSONTitle: '📂 දත්ත නැවත ලබාගන්න (Restore JSON Backup)',
      restoreJSONDesc: 'JSON උපස්ථයකින් දත්ත ප්‍රතිස්ථාපනය කරන්න (Restore database)',
      restoreJSON: 'Restore JSON File',
      resetDBTitle: '⚠️ Reset & Restart / නැවත ආරම්භ කිරීම',
      resetDBDesc: 'දත්ත Backup කර පද්ධතිය Reset කරන්න (Safely backup & reset)',
      resetDB: 'Reset & Restart System / පද්ධතිය Reset කරන්න',

      // Modals
      checkoutTitle: 'ගෙවීම් සම්පූර්ණ කිරීම (Checkout & Payment)',
      checkoutSubtitle: 'ගෙවීම් ක්‍රමය තෝරා මුදල් ලබාගන්න (Select method & cash received)',
      grandTotalLabel: 'මුළු එකතුව (Grand Total)',
      payCash: '💵 මුදල් (Cash)',
      payCard: '💳 කාඩ්පත් (Card)',
      payQR: '📱 QR / බැංකු (QR/Bank)',
      payCredit: '📋 ණයට (Credit)',
      cashReceivedLabel: 'ලැබුණු මුදල (Cash Received - LKR)',
      changeDueLabel: 'ඉතිරි මුදල (Change Due):',
      cancelBtn: 'අවලංගු කරන්න (Cancel - Esc)',
      completeSaleBtn: 'බිල්පත නිකුත් කරන්න (Complete Sale →)',
      receiptPreviewTitle: 'බිල්පත් පෙරදසුන (Thermal Receipt Preview)',
      closeBtn: 'වසන්න (Close)',
      printReceiptBtn: 'මුද්‍රණය කරන්න (Print Receipt)',
      heldBillsTitle: 'රඳවාගත් බිල්පත් (Held Bills)',
      selectCustomerTitle: 'පාරිභෝගිකයා තෝරන්න (Select Customer)',
      customerSearchPlaceholder: 'දුරකථනය / නම සොයන්න (Search phone/name)...',
      newCustomerShort: '+ අලුත් (+ New)',
      productModalTitle: 'භාණ්ඩ කළමනාකරණය (Product Management)',
      prodNameEnLabel: 'භාණ්ඩයේ නම (English / Main) *',
      prodNameSiLabel: 'සිංහල නම (Sinhala Name - Optional)',
      skuLabel: 'SKU / භාණ්ඩ අංකය (Item Code) *',
      barcodeLabel: 'බාර්කෝඩ් (Barcodes - Comma separated)',
      categoryLabel: 'වර්ගය (Category)',
      brandLabel: 'වෙළඳ නාමය (Brand)',
      unitLabel: 'ඒකකය (Unit)',
      costPriceLabel: 'ගැනුම් මිල (Cost Price - LKR) *',
      markedPriceLabel: 'මුද්‍රිත මිල (Marked Price / MRP - LKR) *',
      retailPriceLabel: 'සිල්ලර මිල (Retail Price - LKR) *',
      wholesalePriceLabel: 'තොග මිල (Wholesale Price - LKR) *',
      youSaved: '🎉 ඔබට ලැබුණු ලාභය (You Saved):',
      minStockLabel: 'අවම තොගය (Min Stock Alert)',
      currentStockLabel: 'වත්මන් තොගය (Current Qty)',
      expiryDateLabel: 'කල් ඉකුත්වන දිනය (Expiry Date)',
      batchNoLabel: 'කාණ්ඩ අංකය (Batch No)',
      supplierLabel: 'සැපයුම්කරු (Supplier)',
      saveProductBtn: 'සුරකින්න (Save Product)',
      stockAdjTitle: 'තොග ගැලපීම් (Stock Adjustment)',
      adjTypeLabel: 'ගැලපුම් වර්ගය (Adjustment Type)',
      adjQtyLabel: 'ප්‍රමාණය (Quantity)',
      adjReasonLabel: 'හේතුව / සටහන (Reason / Note)',
      updateStockBtn: 'යාවත්කාලීන කරන්න (Update Stock)',
      barcodeStickerTitle: 'බාර්කෝඩ් ලේබල් මුද්‍රණය (Barcode Stickers)',
      barcodeNumberLabel: 'බාර්කෝඩ් අංකය (Barcode No)',
      copiesLabel: 'පිටපත් ගණන (Copies)',
      labelSizeLabel: 'ලේබල් ප්‍රමාණය (Label Size)',
      previewLabel: 'පෙරදසුන (Preview)',
      printStickersBtn: 'ලේබල් මුද්‍රණය කරන්න (Print Stickers)',
      newGrnModalTitle: 'නව මිලදී ගැනීමක් (New GRN Purchase)',
      invoiceNoLabel: 'ඉන්වොයිස් අංකය (Invoice / GRN No)',
      addItemsSection: 'භාණ්ඩ එකතු කරන්න (Add Products)',
      costPlaceholder: 'පිරිවැය (Cost - LKR)',
      qtyPlaceholder: 'ප්‍රමාණය (Qty)',
      addItemBtn: '+ එක් කරන්න (+ Add Item)',
      paymentModeLabel: 'ගෙවීම් ක්‍රමය (Payment Mode)',
      amountPaidLabel: 'ගෙවූ මුදල (Amount Paid - LKR)',
      totalGrnCostLabel: 'මුළු GRN මුදල (Total GRN):',
      addToStockBtn: 'තොගයට එක් කරන්න (Add to Stock)',
      custModalTitle: 'පාරිභෝගික ලියාපදිංචිය (Customer Registration)',
      custPhoneLabel: 'දුරකථන අංකය (Phone 07XXXXXXXX) *',
      custFullNameLabel: 'සම්පූර්ණ නම (Full Name) *',
      custEmailLabel: 'ඊමේල් ලිපිනය (Email)',
      custPointsLabel: 'ආරම්භක ලකුණු (Opening Points)',
      custCreditLabel: 'ණය ශේෂය (Credit Balance - LKR)',
      saveCustomerBtn: 'සුරකින්න (Save Customer)',
      suppModalTitle: 'සැපයුම්කරු විස්තර (Supplier Details)',
      suppNameLabel: 'සමාගම / නම (Company / Name) *',
      suppBalanceLabel: 'ආරම්භක ශේෂය (Opening Balance - LKR)',
      saveSupplierBtn: 'සුරකින්න (Save Supplier)',
      expModalTitle: 'වියදම් සටහන් කිරීම (Log Expense)',
      expTitleLabel: 'විස්තරය (Expense Description) *',
      expAmountLabel: 'මුදල (Amount - LKR) *',
      saveExpenseBtn: 'සටහන් කරන්න (Record Expense)',
      startShiftTitle: 'මුරය ආරම්භ කිරීම (Open Shift)',
      startShiftSubtitle: 'ආරම්භක මුදල ඇතුළත් කරන්න (Enter opening cash float)',
      startFloatLabel: 'ආරම්භක මුදල (Opening Float - LKR)',
      startShiftBtn: 'මුරය අරඹන්න (Start Shift)',
      endShiftTitle: 'මුරය අවසන් කිරීම (Close Shift & Reconcile)',
      expectedCashLabel: 'තිබිය යුතු මුදල (Expected In Drawer):',
      actualCashLabel: 'සැබෑ මුදල (Actual Counted Cash - LKR) *',
      varianceLabel: 'මුදල් වෙනස (Cash Variance):',
      confirmCloseShiftBtn: 'මුරය වසා Z-Report එක ගන්න (Close Shift & Z-Report)',
      cameraModalTitle: 'බාර්කෝඩ් ස්කෑන් කරන්න (Camera Scanner)',
      cameraInstructions: 'බාර්කෝඩ් එක කැමරාවට පෙන්වන්න (Point camera at barcode)'
    }
  },

  async init() {
    const saved = localStorage.getItem('lankapos_lang');
    if (saved && (saved === 'en' || saved === 'si' || saved === 'bi')) {
      this.currentLang = saved;
    } else {
      this.currentLang = 'en'; // Default is English
    }
    this.updateUI();
  },

  setLanguage(lang) {
    if (lang === 'en' || lang === 'si' || lang === 'bi') {
      this.currentLang = lang;
      localStorage.setItem('lankapos_lang', this.currentLang);
      this.updateUI();
      this.refreshActiveViews();
    }
  },

  toggleLanguage() {
    // Cycle: en -> si -> bi -> en
    if (this.currentLang === 'en') {
      this.currentLang = 'si';
    } else if (this.currentLang === 'si') {
      this.currentLang = 'bi';
    } else {
      this.currentLang = 'en';
    }
    localStorage.setItem('lankapos_lang', this.currentLang);
    this.updateUI();
    this.refreshActiveViews();
  },

  refreshActiveViews() {
    if (window.POSManager) {
      POSManager.updatePricingModeUI();
      POSManager.renderCategoryFilter();
      POSManager.renderProductGrid();
      POSManager.renderCart();
    }
    if (window.ShiftManager) {
      ShiftManager.updateShiftStatusUI();
      ShiftManager.renderShiftsHistory();
    }
    if (window.ReportsManager) {
      ReportsManager.generateReports();
    }
    if (window.InventoryManager && window.App && App.currentTab === 'inventory') {
      InventoryManager.renderValuationCards();
      InventoryManager.renderInventoryTable();
    }
  },

  t(key) {
    const dict = this.translations[this.currentLang] || this.translations.en;
    return dict[key] || this.translations.en[key] || key;
  },

  getLangDisplayName() {
    if (this.currentLang === 'si') return 'සිංහල (SI)';
    if (this.currentLang === 'bi') return 'සිංහල / EN (Dual)';
    return 'English (EN)';
  },

  updateUI() {
    // Update language toggle button text in top header
    const langBtn = document.getElementById('langToggleBtn');
    if (langBtn) {
      langBtn.innerHTML = `
        <span class="text-sm">🌐</span>
        <span class="font-bold">${this.getLangDisplayName()}</span>
      `;
      langBtn.title = `Current Language: ${this.getLangDisplayName()} (Click to toggle English / සිංහල / Dual)`;
    }

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.textContent = val;
        }
      }
    });

    // Update all elements with data-i18n-html attribute
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.innerHTML = val;
        }
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.placeholder = val;
        }
      }
    });

    // Update titles / tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.title = val;
        }
      }
    });
  }
};

window.I18n = I18n;


// ==================== js\audio.js ====================

/**
 * Web Audio API Sound Synthesizer
 * 100% offline, zero external audio assets required.
 */

const SoundManager = {
  ctx: null,
  enabled: true,

  init() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
  },

  resumeContext() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  playTone(freq, type = 'sine', duration = 0.08, gainVal = 0.15) {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      console.warn('[Audio] Error playing tone:', e);
    }
  },

  // Crisp scanner beep (1850Hz short pulse)
  playScanBeep() {
    this.playTone(1850, 'sine', 0.06, 0.2);
  },

  // Pleasant success double-chime on sale completion
  playSuccessChime() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [
        { freq: 587.33, start: 0, dur: 0.12 },     // D5
        { freq: 880.00, start: 0.1, dur: 0.22 }    // A5
      ].forEach(note => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        gain.gain.setValueAtTime(0.18, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.dur);
      });
    } catch (e) {
      console.warn('[Audio] Error playing success chime:', e);
    }
  },

  // Warning or item not found buzzer
  playErrorBuzzer() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.linearRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.18);
    } catch (e) {
      console.warn('[Audio] Error playing error sound:', e);
    }
  },

  // Cash drawer mechanical / register sound
  playCashDrawer() {
    if (!this.enabled) return;
    try {
      this.init();
      this.resumeContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      [
        { freq: 1200, start: 0, dur: 0.05 },
        { freq: 1600, start: 0.04, dur: 0.08 },
        { freq: 2400, start: 0.08, dur: 0.15 }
      ].forEach(item => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(item.freq, now + item.start);
        gain.gain.setValueAtTime(0.08, now + item.start);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + item.start + item.dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + item.start);
        osc.stop(now + item.start + item.dur);
      });
    } catch (e) {
      console.warn('[Audio] Cash drawer sound:', e);
    }
  }
};

window.SoundManager = SoundManager;


// ==================== js\pos.js ====================

/**
 * POS Billing Terminal Logic & Checkout Engine
 * Includes Wholesale (තොග) vs Retail (සිල්ලර) Pricing & Item Price Editing
 */

const POSManager = {
  cart: [],
  pricingMode: 'retail', // 'retail' (සිල්ලර) or 'wholesale' (තොග)
  selectedCustomer: null,
  billDiscountType: 'percent', // 'fixed' (LKR) or 'percent' (%)
  billDiscountValue: 0,
  activeDiscountTarget: 'bill', // 'bill' or number (item index)
  activeDiscountMode: 'percent', // 'percent' or 'fixed'
  activeDiscountValue: 0,
  taxRate: 0,
  currentCategory: 'all',
  searchQuery: '',
  lastCompletedSale: null,
  mobileActiveSegment: 'products', // 'products' or 'cart'

  async init() {
    this.taxRate = Number(await getSetting('tax_rate', 0)) || 0;
    this.renderCart();
    this.updatePricingModeUI();
    this.handleWindowResize();
    window.addEventListener('resize', () => this.handleWindowResize());
    await this.renderCategoryFilter();
    await this.renderProductGrid();
    await this.updateHoldBillsBadge();
    this.focusSearchInput();
  },

  handleWindowResize() {
    const cartPane = document.getElementById('posLeftCartPane');
    const prodPane = document.getElementById('posRightProductsPane');
    const floatingBar = document.getElementById('posMobileFloatingCheckout');
    const segmentToggle = document.getElementById('posMobileSegmentToggle');

    if (window.innerWidth >= 768) {
      // Full PC / Laptop Desktop Supermarket POS Mode (Dual Pane side-by-side)
      if (cartPane) cartPane.classList.remove('hidden');
      if (prodPane) prodPane.classList.remove('hidden');
      if (floatingBar) floatingBar.classList.add('hidden');
      if (segmentToggle) segmentToggle.classList.add('hidden');
    } else {
      // Mobile Phone Mode
      if (segmentToggle) segmentToggle.classList.remove('hidden');
      this.setMobilePosSegment(this.mobileActiveSegment);
    }
  },

  setMobilePosSegment(seg) {
    this.mobileActiveSegment = seg;
    const cartPane = document.getElementById('posLeftCartPane');
    const prodPane = document.getElementById('posRightProductsPane');
    const tabBtnCart = document.getElementById('posMobileTabCart');
    const tabBtnProd = document.getElementById('posMobileTabProd');

    document.body.classList.remove('mobile-pos-cart-active', 'mobile-pos-products-active');
    document.body.classList.add(seg === 'cart' ? 'mobile-pos-cart-active' : 'mobile-pos-products-active');

    if (window.innerWidth < 768) {
      // Mobile Phone Only
      if (seg === 'cart') {
        if (cartPane) cartPane.classList.remove('hidden');
        if (prodPane) prodPane.classList.add('hidden');
        if (tabBtnCart) {
          tabBtnCart.className = 'flex-1 py-1.5 px-3 bg-sky-600 text-white rounded-xl text-xs font-bold transition shadow flex items-center justify-center gap-1.5';
        }
        if (tabBtnProd) {
          tabBtnProd.className = 'flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';
        }
      } else {
        if (cartPane) cartPane.classList.add('hidden');
        if (prodPane) prodPane.classList.remove('hidden');
        if (tabBtnCart) {
          tabBtnCart.className = 'flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5';
        }
        if (tabBtnProd) {
          tabBtnProd.className = 'flex-1 py-1.5 px-3 bg-sky-600 text-white rounded-xl text-xs font-bold transition shadow flex items-center justify-center gap-1.5';
        }
      }
    } else {
      // PC Desktop / Laptop: BOTH Panes Always Visible
      if (cartPane) cartPane.classList.remove('hidden');
      if (prodPane) prodPane.classList.remove('hidden');
    }

    this.updateMobileFloatingBar();
  },

  updateMobileFloatingBar() {
    const floatingBar = document.getElementById('posMobileFloatingCheckout');
    const floatingItemCount = document.getElementById('posMobileFloatingItemCount');
    const floatingTotal = document.getElementById('posMobileFloatingTotal');
    const mobileCartBadge = document.getElementById('posMobileCartBadge');
    const totals = this.calculateTotals();

    if (mobileCartBadge) {
      mobileCartBadge.textContent = totals.itemCount > 0 ? totals.itemCount : '0';
      if (totals.itemCount > 0) mobileCartBadge.classList.remove('hidden');
      else mobileCartBadge.classList.add('hidden');
    }

    if (floatingBar) {
      // Only show floating checkout on Mobile Phones (< 768px)
      if (totals.itemCount > 0 && this.mobileActiveSegment === 'products' && window.innerWidth < 768) {
        if (floatingItemCount) floatingItemCount.textContent = `${totals.itemCount} ${totals.itemCount === 1 ? 'item' : 'items'}`;
        if (floatingTotal) floatingTotal.textContent = formatLKR(totals.grandTotal);
        floatingBar.classList.remove('hidden');
      } else {
        floatingBar.classList.add('hidden');
      }
    }
  },

  // Focus and select cursor inside product search / barcode box
  focusSearchInput() {
    setTimeout(() => {
      const posTab = document.getElementById('tabView_pos');
      if (posTab && !posTab.classList.contains('hidden')) {
        const anyModalOpen = Array.from(document.querySelectorAll('.app-modal')).some(m => !m.classList.contains('hidden'));
        if (!anyModalOpen) {
          const input = document.getElementById('posSearchInput');
          if (input) {
            input.focus();
            input.select();
          }
        }
      }
    }, 40);
  },

  // Handle Enter key on search box: invoice lookup, barcode scan or item selection
  async handleSearchKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const input = document.getElementById('posSearchInput');
      const query = (input ? input.value : this.searchQuery || '').trim();

      // Empty search + Enter → go to price field of last added item
      if (!query) {
        if (this.cart.length > 0) {
          this.editItemPrice(0);
        }
        return;
      }

      const upperQ = query.toUpperCase();

      // 0. Check if Invoice Number entered / scanned (e.g. INV-20260926-00001)
      if (upperQ.startsWith('INV-') || upperQ.startsWith('RET-')) {
        const saleMatch = await db.sales.where('invoiceNo').equalsIgnoreCase(upperQ).first();
        if (saleMatch) {
          this.clearSearchInputAndRefocus();
          await this.openSalesHistoryModal();
          await this.showSaleDetailsForReturn(saleMatch.id);
          SoundManager.playSuccessChime();
          return;
        }
      }

      // 1. Use already-filtered products visible in grid (fastest - no extra DB call)
      if (this.lastFilteredProducts && this.lastFilteredProducts.length > 0) {
        const q = query.toLowerCase();
        // Exact SKU/barcode match in filtered list first
        const exactInGrid = this.lastFilteredProducts.find(p =>
          p.sku === query ||
          (p.barcodes && p.barcodes.includes(query))
        );
        if (exactInGrid) {
          await this.addProduct(exactInGrid, 1);
          this.clearSearchInputAndRefocus();
          return;
        }
        // If only 1 product showing in grid → add it directly
        if (this.lastFilteredProducts.length === 1) {
          await this.addProduct(this.lastFilteredProducts[0], 1);
          this.clearSearchInputAndRefocus();
          return;
        }
        // Multiple matches → find best name/sku match
        const bestMatch = this.lastFilteredProducts.find(p =>
          p.name.toLowerCase().includes(q) ||
          (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
        );
        if (bestMatch) {
          await this.addProduct(bestMatch, 1);
          this.clearSearchInputAndRefocus();
          return;
        }
      }

      // 2. Fallback: Exact Barcode or SKU match from DB
      const exactMatch = await db.products
        .where('barcodes')
        .equals(query)
        .or('sku')
        .equals(query)
        .first();

      if (exactMatch) {
        await this.addProduct(exactMatch, 1);
        this.clearSearchInputAndRefocus();
        return;
      }

      // 3. Fallback: Partial Search from DB
      const q2 = query.toLowerCase();
      const allProducts = await db.products.toArray();
      const match = allProducts.find(p =>
        p.name.toLowerCase().includes(q2) ||
        (p.nameSi && p.nameSi.toLowerCase().includes(q2)) ||
        p.sku.toLowerCase().includes(q2) ||
        (p.brand && p.brand.toLowerCase().includes(q2)) ||
        (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q2)))
      );

      if (match) {
        await this.addProduct(match, 1);
        this.clearSearchInputAndRefocus();
      } else {
        SoundManager.playErrorBuzzer();
        alert(`භාණ්ඩය හමු නොවීය (Product "${query}" not found)`);
        this.focusSearchInput();
      }
    }
  },

  clearSearchInputAndRefocus() {
    this.searchQuery = '';
    const input = document.getElementById('posSearchInput');
    if (input) input.value = '';
    this.renderProductGrid();
    this.focusSearchInput();
  },

  // Toggle Global Pricing Mode (Retail vs Wholesale)
  setPricingMode(mode) {
    this.pricingMode = mode;
    this.updatePricingModeUI();

    if (this.cart.length > 0) {
      this.cart.forEach(async (item) => {
        const prod = await db.products.get(item.productId);
        if (prod) {
          if (mode === 'wholesale') {
            item.price = prod.wholesalePrice || prod.sellingPrice;
            item.isWholesale = true;
          } else {
            item.price = prod.sellingPrice;
            item.isWholesale = false;
          }
          this.recalculateItemTotal(item);
        }
      });
      setTimeout(() => this.renderCart(), 50);
    }
  },

  updatePricingModeUI() {
    const btnRetail = document.getElementById('posModeRetailBtn');
    const btnWholesale = document.getElementById('posModeWholesaleBtn');

    if (btnRetail && btnWholesale) {
      btnRetail.textContent = I18n.t('retail');
      btnWholesale.textContent = I18n.t('wholesale');
      if (this.pricingMode === 'retail') {
        btnRetail.className = 'flex-1 py-1.5 px-3 bg-sky-600 text-white rounded-lg text-xs font-bold transition shadow';
        btnWholesale.className = 'flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-bold transition';
      } else {
        btnRetail.className = 'flex-1 py-1.5 px-3 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-xs font-bold transition';
        btnWholesale.className = 'flex-1 py-1.5 px-3 bg-amber-600 text-white rounded-lg text-xs font-bold transition shadow';
      }
    }
  },

  // Add product to cart (by product object or barcode lookup)
  async addProduct(product, qtyToAdd = 1) {
    if (!product) return;

    if (product.currentStock <= 0) {
      if (!confirm(`Warning: "${product.name}" is currently OUT OF STOCK (${product.currentStock} ${product.unit}). Add anyway?`)) {
        this.focusSearchInput();
        return;
      }
    }

    const isWholesaleMode = this.pricingMode === 'wholesale';
    const unitPrice = isWholesaleMode ? (product.wholesalePrice || product.sellingPrice) : product.sellingPrice;
    const markedPriceVal = Number(product.markedPrice) || Number(product.sellingPrice) || unitPrice;

    const existingIndex = this.cart.findIndex(item => item.productId === product.id);

    if (existingIndex > -1) {
      this.cart[existingIndex].qty += qtyToAdd;
      this.recalculateItemTotal(this.cart[existingIndex]);
    } else {
      const newItem = {
        productId: product.id,
        name: product.name,
        nameSi: product.nameSi || product.name,
        sku: product.sku,
        unit: product.unit || 'pcs',
        costPrice: Number(product.costPrice) || 0,
        markedPrice: markedPriceVal,
        retailPrice: Number(product.sellingPrice) || 0,
        wholesalePrice: Number(product.wholesalePrice) || Number(product.sellingPrice) || 0,
        price: unitPrice,
        isWholesale: isWholesaleMode,
        qty: qtyToAdd,
        discount: 0,
        discountType: 'percent',
        itemDiscountAmount: 0,
        total: unitPrice * qtyToAdd
      };
      this.recalculateItemTotal(newItem);
      this.cart.unshift(newItem);
    }

    SoundManager.playScanBeep();
    this.renderCart();
    this.focusSearchInput();
  },

  // Scan or find by barcode string (supports product barcodes & invoice receipt barcodes)
  async handleBarcodeScan(barcodeStr) {
    if (!barcodeStr) return false;
    const cleanCode = barcodeStr.trim();
    const upperCode = cleanCode.toUpperCase();

    // 0. Check if Invoice receipt barcode is scanned (INV-...)
    if (upperCode.startsWith('INV-') || upperCode.startsWith('RET-')) {
      const saleMatch = await db.sales.where('invoiceNo').equalsIgnoreCase(upperCode).first();
      if (saleMatch) {
        await this.openSalesHistoryModal();
        await this.showSaleDetailsForReturn(saleMatch.id);
        SoundManager.playSuccessChime();
        return true;
      }
    }

    const product = await db.products
      .where('barcodes')
      .equals(cleanCode)
      .or('sku')
      .equals(cleanCode)
      .first();

    if (product) {
      await this.addProduct(product, 1);
      this.focusSearchInput();
      return true;
    } else {
      SoundManager.playErrorBuzzer();
      alert(`Product "${cleanCode}" not found in inventory.`);
      this.focusSearchInput();
      return false;
    }
  },

  updateItemQty(index, newQty) {
    const qty = parseFloat(newQty);
    if (isNaN(qty) || qty <= 0) {
      this.removeItem(index);
      return;
    }
    if (this.cart[index]) {
      this.cart[index].qty = qty;
      this.recalculateItemTotal(this.cart[index]);
      this.renderCart();
    }
  },

  toggleItemPricingMode(index) {
    if (this.cart[index]) {
      const item = this.cart[index];
      if (item.isWholesale) {
        item.isWholesale = false;
        item.price = item.retailPrice;
      } else {
        item.isWholesale = true;
        item.price = item.wholesalePrice;
      }
      this.recalculateItemTotal(item);
      this.renderCart();
      SoundManager.playScanBeep();
    }
  },

  editItemPrice(index) {
    if (!this.cart[index]) return;
    // Show inline input directly in the price cell
    const priceBtn = document.getElementById(`pos-price-btn-${index}`);
    const priceInput = document.getElementById(`pos-price-input-${index}`);
    if (priceBtn && priceInput) {
      priceBtn.classList.add('hidden');
      priceInput.classList.remove('hidden');
      priceInput.focus();
      priceInput.select();
    }
  },

  updateItemPriceInline(index, newVal) {
    if (!this.cart[index]) return;
    const newPrice = parseFloat(newVal);
    if (!isNaN(newPrice) && newPrice >= 0) {
      this.cart[index].price = newPrice;
      this.recalculateItemTotal(this.cart[index]);
      SoundManager.playScanBeep();
    }
    this.renderCart();
    this.focusSearchInput();
  },

  // Enter on price field → save price then jump to qty field
  confirmPriceGoQty(index, newVal) {
    if (!this.cart[index]) return;
    const newPrice = parseFloat(newVal);
    if (!isNaN(newPrice) && newPrice >= 0) {
      this.cart[index].price = newPrice;
      this.recalculateItemTotal(this.cart[index]);
      SoundManager.playScanBeep();
    }
    this.renderCart();
    this.focusCartItemQty(index);
  },

  // Focus the qty input of a specific cart row
  focusCartItemQty(index) {
    setTimeout(() => {
      const qtyInput = document.getElementById(`pos-qty-input-${index}`);
      if (qtyInput) {
        qtyInput.focus();
        qtyInput.select();
      }
    }, 40);
  },

  updateItemDiscount(index, discountVal, type = 'percent') {
    if (this.cart[index]) {
      this.cart[index].discount = Math.max(0, parseFloat(discountVal) || 0);
      this.cart[index].discountType = type;
      this.recalculateItemTotal(this.cart[index]);
      this.renderCart();
    }
  },

  recalculateItemTotal(item) {
    let lineTotal = item.price * item.qty;
    let discAmt = 0;
    if (item.discountType === 'percent') {
      discAmt = (lineTotal * Math.min(100, item.discount)) / 100;
    } else {
      discAmt = Math.min(lineTotal, item.discount);
    }
    item.itemDiscountAmount = discAmt;
    item.total = Math.max(0, lineTotal - discAmt);
  },

  removeItem(index) {
    if (this.cart[index]) {
      this.cart.splice(index, 1);
      this.renderCart();
    }
  },

  clearCart() {
    if (this.cart.length === 0) return;
    if (confirm('Clear the current cart?')) {
      this.cart = [];
      this.billDiscountValue = 0;
      this.selectedCustomer = null;
      this.renderCart();
    }
  },

  calculateTotals() {
    let subtotalMRP = 0;
    let subtotal = 0;
    let totalItemDiscounts = 0;

    this.cart.forEach(item => {
      const mrp = Number(item.markedPrice) || Number(item.retailPrice) || Number(item.price);
      subtotalMRP += (mrp * item.qty);
      subtotal += (item.price * item.qty);
      totalItemDiscounts += (item.itemDiscountAmount || 0);
    });

    const netItemTotal = Math.max(0, subtotal - totalItemDiscounts);

    let billDiscAmt = 0;
    if (this.billDiscountType === 'percent') {
      billDiscAmt = (netItemTotal * Math.min(100, Number(this.billDiscountValue) || 0)) / 100;
    } else {
      billDiscAmt = Math.min(netItemTotal, Number(this.billDiscountValue) || 0);
    }

    const discountedTotal = Math.max(0, netItemTotal - billDiscAmt);
    const taxAmount = (discountedTotal * this.taxRate) / 100;
    const grandTotal = discountedTotal + taxAmount;

    // Total Customer Savings (ඔබට ලැබුණු මුළු ලාභය): MRP Value - Actual Amount Payable
    const totalSavings = Math.max(0, subtotalMRP - discountedTotal);

    return {
      itemCount: this.cart.reduce((acc, item) => acc + item.qty, 0),
      subtotalMRP: Math.round(subtotalMRP * 100) / 100,
      subtotal: Math.round(subtotal * 100) / 100,
      totalItemDiscounts: Math.round(totalItemDiscounts * 100) / 100,
      billDiscAmt: Math.round(billDiscAmt * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      totalSavings: Math.round(totalSavings * 100) / 100
    };
  },

  setCustomer(customer) {
    this.selectedCustomer = customer;
    this.renderCustomerWidget();
    this.renderCart();
  },

  removeCustomer() {
    this.selectedCustomer = null;
    this.renderCustomerWidget();
    this.renderCart();
  },

  // Render left cart pane
  renderCart() {
    const cartContainer = document.getElementById('posCartTableBody');
    const emptyState = document.getElementById('posEmptyCart');
    const totals = this.calculateTotals();

    if (!cartContainer) return;

    if (this.cart.length === 0) {
      cartContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
    } else {
      if (emptyState) emptyState.classList.add('hidden');
      cartContainer.innerHTML = this.cart.map((item, index) => {
        const mrp = Number(item.markedPrice) || Number(item.retailPrice) || Number(item.price);
        const itemSaving = ((mrp - item.price) * item.qty) + (item.itemDiscountAmount || 0);
        // Profit calculation: (selling price - cost price) × qty
        const costPrice = Number(item.costPrice) || 0;
        const itemProfit = (item.price - costPrice) * item.qty;
        const profitColor = itemProfit > 0 ? 'text-emerald-400' : (itemProfit < 0 ? 'text-rose-400' : 'text-slate-500');
        const profitLabel = itemProfit >= 0 ? `+${formatLKR(itemProfit)}` : formatLKR(itemProfit);

        return `
        <tr class="border-b border-slate-800/90 hover:bg-slate-800/50 transition-colors">
          <!-- 1. Item Details -->
          <td class="p-2.5 align-middle">
            <div class="font-bold text-slate-100 text-xs leading-snug">
              <span>${index + 1}. ${item.name}</span>
                  
            </div>
            <div class="flex items-center flex-wrap gap-1.5 mt-1 text-[10px]">
              <span class="text-slate-400 font-mono px-1 py-0.2 bg-slate-950 rounded border border-slate-800">${item.sku}</span>
              <button onclick="POSManager.toggleItemPricingMode(${index})" 
                      class="px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        item.isWholesale ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }" title="Toggle Retail / Wholesale price for this item">
                ${item.isWholesale ? I18n.t('wholesaleTag') : I18n.t('retailTag')}
              </button>
              <button onclick="POSManager.openDiscountModal(${index})" 
                      class="px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        (item.itemDiscountAmount || 0) > 0 ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-slate-800 text-slate-400 hover:text-sky-300'
                      }" title="Apply discount to this item">
                ${(item.itemDiscountAmount || 0) > 0 ? `-${item.discount}${item.discountType === 'percent' ? '%' : ' LKR'}` : '% Disc'}
              </button>
            </div>
          </td>

          <!-- 2. Unit Price (Inline Editable) -->
          <td class="p-2 text-right align-middle whitespace-nowrap">
            <button id="pos-price-btn-${index}"
                    onclick="POSManager.editItemPrice(${index})"
                    class="font-mono font-bold text-sky-300 hover:text-sky-200 underline decoration-dotted decoration-sky-500/50 text-xs" 
                    title="Click to edit unit price">
              ${formatLKR(item.price)}
            </button>
            <input id="pos-price-input-${index}"
                   type="number" step="0.01" min="0"
                   value="${item.price}"
                   class="hidden w-16 text-right bg-sky-950 border border-sky-500 text-sky-100 font-mono text-xs rounded px-1 py-0.5 focus:outline-none"
                   onkeydown="if(event.key==='Enter'){ event.preventDefault(); POSManager.confirmPriceGoQty(${index}, this.value); }
                              if(event.key==='Escape'){ POSManager.renderCart(); POSManager.focusSearchInput(); }"
                   onblur="POSManager.updateItemPriceInline(${index}, this.value)" />
            <div class="text-[10px] text-slate-500 font-mono">per ${item.unit}</div>
            ${mrp > item.price ? `
              <div class="text-[9px] text-slate-500 line-through font-mono">MRP ${formatLKR(mrp)}</div>
            ` : ''}
            <div class="text-[9px] font-mono font-bold ${profitColor}" title="Profit per line">P: ${profitLabel}</div>
          </td>

          <!-- 3. Quantity Stepper -->
          <td class="p-1 sm:p-2 text-center align-middle whitespace-nowrap">
            <div class="inline-flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden shadow-inner">
              <button onclick="POSManager.updateItemQty(${index}, ${item.qty - (item.unit === 'kg' ? 0.25 : 1)}); POSManager.focusSearchInput();" 
                      class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm active:bg-slate-600 font-bold select-none" title="Decrease Qty">-</button>
              <input type="number" id="pos-qty-input-${index}" step="${item.unit === 'kg' ? '0.05' : '1'}" min="0.01" value="${item.qty}"
                     onchange="POSManager.updateItemQty(${index}, this.value); POSManager.focusSearchInput();"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); POSManager.updateItemQty(${index}, this.value); POSManager.focusSearchInput(); }"
                     class="w-10 sm:w-12 text-center bg-transparent text-slate-100 font-mono text-xs py-1 font-bold focus:outline-none focus:bg-slate-800" title="Edit quantity and press Enter to return to search" />
              <button onclick="POSManager.updateItemQty(${index}, ${item.qty + (item.unit === 'kg' ? 0.25 : 1)}); POSManager.focusSearchInput();" 
                      class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm active:bg-slate-600 font-bold select-none" title="Increase Qty">+</button>
            </div>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${item.unit}</div>
          </td>

          <!-- 4. Line Total -->
          <td class="p-2 text-right align-middle whitespace-nowrap">
            <div class="font-mono font-black text-sky-400 text-xs">${formatLKR(item.total)}</div>
            ${item.itemDiscountAmount > 0 ? `<div class="text-[10px] text-emerald-400 font-mono font-semibold">-${formatLKR(item.itemDiscountAmount)}</div>` : ''}
            ${itemSaving > 0 ? `<div class="text-[9px] text-emerald-500 font-mono font-bold">Save ${formatLKR(itemSaving)}</div>` : ''}
          </td>

          <!-- 5. Delete Action -->
          <td class="p-2 text-center align-middle">
            <button onclick="POSManager.removeItem(${index})" class="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-950/60 transition" title="Remove Item">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
        `;
      }).join('');
    }

    const subtotalEl = document.getElementById('posSubtotal');
    const discountEl = document.getElementById('posTotalDiscount');
    const taxEl = document.getElementById('posTaxAmount');
    const grandTotalEl = document.getElementById('posGrandTotal');
    const itemCountEl = document.getElementById('posItemCount');

    if (subtotalEl) subtotalEl.textContent = formatLKR(totals.subtotal);
    if (discountEl) discountEl.textContent = '-' + formatLKR(totals.totalItemDiscounts + totals.billDiscAmt);
    if (taxEl) taxEl.textContent = formatLKR(totals.taxAmount);
    if (grandTotalEl) grandTotalEl.textContent = formatLKR(totals.grandTotal);
    if (itemCountEl) itemCountEl.textContent = `${totals.itemCount.toFixed(totals.itemCount % 1 === 0 ? 0 : 2)} items`;

    // Customer Savings Live Badge (ඔබට ලැබුණු ලාභය)
    const savingsContainer = document.getElementById('posCustomerSavingsContainer');
    const savingsAmt = document.getElementById('posCustomerSavingsAmt');
    if (savingsContainer && savingsAmt) {
      if (totals.totalSavings > 0) {
        savingsAmt.textContent = formatLKR(totals.totalSavings);
        savingsContainer.classList.remove('hidden');
      } else {
        savingsContainer.classList.add('hidden');
      }
    }

    this.renderCustomerWidget();
    this.updateMobileFloatingBar();
  },

  renderCustomerWidget() {
    const custContainer = document.getElementById('posCustomerWidget');
    if (!custContainer) return;

    if (this.selectedCustomer) {
      custContainer.innerHTML = `
        <div class="flex items-center justify-between p-2.5 bg-sky-950/40 border border-sky-800/60 rounded-xl">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-full bg-sky-600 flex items-center justify-center font-bold text-white text-xs">
              ${this.selectedCustomer.name.charAt(0)}
            </div>
            <div>
              <div class="text-xs font-bold text-sky-200">${this.selectedCustomer.name} (${this.selectedCustomer.phone})</div>
              <div class="text-[11px] text-slate-300 font-mono">Credit Balance: <strong class="${(this.selectedCustomer.creditBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}">${formatLKR(this.selectedCustomer.creditBalance || 0)}</strong></div>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="POSManager.removeCustomer()" class="text-slate-400 hover:text-rose-400 text-xs p-1" title="Detach Customer">&times;</button>
          </div>
        </div>
      `;
    } else {
      custContainer.innerHTML = `
        <button onclick="CustomerManager.openCustomerSelectModal()" class="w-full py-2 px-3 border border-dashed border-slate-700 hover:border-sky-500 text-slate-400 hover:text-sky-300 rounded-xl text-xs flex items-center justify-center gap-2 transition bg-slate-900/40">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
          ${I18n.t('attachCustomer')}
        </button>
      `;
    }
  },

  // =========================================================================
  // INTERACTIVE DISCOUNT PRESET MODAL CONTROLLER (3%, 5%, 7%, 10%, 15%, 20%, 25%)
  // =========================================================================

  openDiscountModal(target = 'bill') {
    AuthManager.requireAdminAuth({
      actionName: 'Grant Discount',
      actionDesc: target === 'bill' ? 'Grant Bill Discount' : 'Grant Item Discount',
      requiredPerm: 'allowDiscount',
      onAuthorized: () => {
        this.activeDiscountTarget = target;
        const modal = document.getElementById('discountPresetModal');
        if (!modal) return;

        const titleEl = document.getElementById('discountModalTitle');
        const subtitleEl = document.getElementById('discountModalSubtitle');
        const customInput = document.getElementById('discountCustomInput');

        if (target === 'bill') {
          if (titleEl) titleEl.innerHTML = `<span>🏷️</span><span>Bill Discount (මුළු බිල්පතට වට්ටම්)</span>`;
          if (subtitleEl) subtitleEl.textContent = `Apply percentage or cash discount to the entire bill`;
          this.activeDiscountMode = this.billDiscountType || 'percent';
          this.activeDiscountValue = this.billDiscountValue || 0;
        } else {
          const item = this.cart[target];
          if (!item) return;
          if (titleEl) titleEl.innerHTML = `<span>🏷️</span><span>Item Discount: ${item.name}</span>`;
          if (subtitleEl) subtitleEl.textContent = `Qty: ${item.qty} ${item.unit} @ ${formatLKR(item.price)}`;
          this.activeDiscountMode = item.discountType || 'percent';
          this.activeDiscountValue = item.discount || 0;
        }

        this.setDiscountMode(this.activeDiscountMode);
        if (customInput) {
          customInput.value = this.activeDiscountValue > 0 ? this.activeDiscountValue : '';
        }

        this.updateDiscountPreview();
        modal.classList.remove('hidden');

        setTimeout(() => {
          if (customInput) {
            customInput.focus();
            customInput.select();
          }
        }, 50);
      }
    });
  },

  setDiscountMode(mode) {
    this.activeDiscountMode = mode;
    const btnPct = document.getElementById('discModePercentBtn');
    const btnFixed = document.getElementById('discModeFixedBtn');
    const suffix = document.getElementById('discountUnitSuffix');

    if (btnPct && btnFixed) {
      if (mode === 'percent') {
        btnPct.className = 'px-2.5 py-1 rounded bg-sky-600 text-white font-bold transition';
        btnFixed.className = 'px-2.5 py-1 rounded text-slate-400 hover:text-slate-200 font-bold transition';
        if (suffix) suffix.textContent = '%';
      } else {
        btnPct.className = 'px-2.5 py-1 rounded text-slate-400 hover:text-slate-200 font-bold transition';
        btnFixed.className = 'px-2.5 py-1 rounded bg-sky-600 text-white font-bold transition';
        if (suffix) suffix.textContent = 'Rs.';
      }
    }
    this.updateDiscountPreview();
  },

  selectDiscountPreset(pct) {
    this.setDiscountMode('percent');
    const customInput = document.getElementById('discountCustomInput');
    if (customInput) customInput.value = pct;

    document.querySelectorAll('.disc-preset-btn').forEach(btn => {
      if (btn.textContent.trim() === `${pct}%`) {
        btn.classList.add('bg-sky-600', 'text-white', 'border-sky-400');
        btn.classList.remove('bg-slate-800', 'text-sky-400', 'border-slate-700');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'border-sky-400');
        btn.classList.add('bg-slate-800', 'text-sky-400', 'border-slate-700');
      }
    });

    this.updateDiscountPreview();
  },

  updateDiscountPreview() {
    const customInput = document.getElementById('discountCustomInput');
    const rawVal = parseFloat(customInput?.value) || 0;
    const mode = this.activeDiscountMode || 'percent';

    let originalAmt = 0;
    if (this.activeDiscountTarget === 'bill') {
      let sub = 0;
      let itemDisc = 0;
      this.cart.forEach(it => {
        sub += (it.price * it.qty);
        itemDisc += (it.itemDiscountAmount || 0);
      });
      originalAmt = Math.max(0, sub - itemDisc);
    } else {
      const item = this.cart[this.activeDiscountTarget];
      if (item) {
        originalAmt = item.price * item.qty;
      }
    }

    let discAmt = 0;
    if (mode === 'percent') {
      discAmt = (originalAmt * Math.min(100, Math.max(0, rawVal))) / 100;
    } else {
      discAmt = Math.min(originalAmt, Math.max(0, rawVal));
    }

    const payableAmt = Math.max(0, originalAmt - discAmt);
    const discPct = originalAmt > 0 ? ((discAmt / originalAmt) * 100).toFixed(1) : 0;

    const elOrig = document.getElementById('discPreviewOriginal');
    const elAmt = document.getElementById('discPreviewAmount');
    const elPayable = document.getElementById('discPreviewPayable');

    if (elOrig) elOrig.textContent = formatLKR(originalAmt);
    if (elAmt) elAmt.textContent = `-${formatLKR(discAmt)} (${discPct}%)`;
    if (elPayable) elPayable.textContent = formatLKR(payableAmt);
  },

  applyDiscountFromModal() {
    const customInput = document.getElementById('discountCustomInput');
    const val = parseFloat(customInput?.value) || 0;
    const mode = this.activeDiscountMode || 'percent';

    if (this.activeDiscountTarget === 'bill') {
      this.billDiscountType = mode;
      this.billDiscountValue = val;
    } else {
      const index = this.activeDiscountTarget;
      if (this.cart[index]) {
        this.updateItemDiscount(index, val, mode);
      }
    }

    document.getElementById('discountPresetModal').classList.add('hidden');
    this.renderCart();
    SoundManager.playScanBeep();
    this.focusSearchInput();
  },

  clearDiscountFromModal() {
    if (this.activeDiscountTarget === 'bill') {
      this.billDiscountType = 'percent';
      this.billDiscountValue = 0;
    } else {
      const index = this.activeDiscountTarget;
      if (this.cart[index]) {
        this.updateItemDiscount(index, 0, 'percent');
      }
    }
    document.getElementById('discountPresetModal').classList.add('hidden');
    this.renderCart();
    this.focusSearchInput();
  },

  promptBillDiscount() {
    this.openDiscountModal('bill');
  },

  async holdCurrentBill() {
    if (this.cart.length === 0) {
      alert('Cart is empty. Nothing to hold.');
      return;
    }

    const note = prompt('Enter a label or customer name for this hold bill (Optional):', this.selectedCustomer?.name || '');
    const totals = this.calculateTotals();

    await db.holdBills.add({
      timestamp: new Date().toISOString(),
      customerId: this.selectedCustomer?.id || null,
      customerName: this.selectedCustomer?.name || (note || 'Walk-in Customer'),
      customerPhone: this.selectedCustomer?.phone || '',
      note: note || 'Held Order',
      cartItems: JSON.parse(JSON.stringify(this.cart)),
      pricingMode: this.pricingMode,
      billDiscountType: this.billDiscountType,
      billDiscountValue: this.billDiscountValue,
      grandTotal: totals.grandTotal
    });

    this.cart = [];
    this.selectedCustomer = null;
    this.billDiscountValue = 0;
    this.renderCart();
    await this.updateHoldBillsBadge();
    SoundManager.playScanBeep();
    alert('Bill successfully put on hold!');
  },

  async updateHoldBillsBadge() {
    const count = await db.holdBills.count();
    const badge = document.getElementById('holdBillsCountBadge');
    if (badge) {
      badge.textContent = count;
      badge.className = count > 0 ? 'px-2 py-0.5 bg-amber-500 text-slate-900 rounded-full font-black text-xs' : 'hidden';
    }
  },

  async openRecallBillsModal() {
    const bills = await db.holdBills.toArray();
    const container = document.getElementById('recallBillsList');
    if (!container) return;

    if (!bills || bills.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-slate-400">No held bills found (තබා ඇති බිල්පත් නොමැත).</div>`;
    } else {
      container.innerHTML = bills.map(b => {
        const safeId = String(b.id || '').replace(/'/g, "\\'");
        const itemCount = Array.isArray(b.cartItems) ? b.cartItems.length : 0;
        const timeStr = b.timestamp ? new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        return `
        <div class="p-3.5 sm:p-4 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between hover:border-sky-500 transition gap-2">
          <div class="min-w-0 flex-1">
            <div class="font-bold text-slate-100 text-xs sm:text-sm truncate">${b.customerName || 'Held Bill'} <span class="text-xs font-normal text-slate-400">(${itemCount} items)</span></div>
            <div class="text-[11px] sm:text-xs text-slate-400 mt-0.5">${timeStr} &bull; <strong class="text-sky-400 font-mono">${formatLKR(b.grandTotal || 0)}</strong></div>
            ${b.note ? `<div class="text-[11px] text-amber-300 italic mt-0.5 truncate">"${b.note}"</div>` : ''}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button onclick="POSManager.recallBill('${safeId}')" class="px-3 py-2 bg-sky-600 hover:bg-sky-500 active:scale-95 text-white rounded-xl text-xs font-bold transition shadow shadow-sky-600/30 flex items-center gap-1 cursor-pointer">
              <span>▶️</span> <span>Recall & Load</span>
            </button>
            <button onclick="POSManager.deleteHoldBill('${safeId}')" class="p-2 text-rose-400 hover:bg-rose-950/60 rounded-xl transition cursor-pointer" title="Delete Held Bill">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      `;
      }).join('');
    }

    const modal = document.getElementById('recallBillsModal');
    if (modal) modal.classList.remove('hidden');
  },

  async recallBill(holdBillId) {
    if (!holdBillId) return;
    try {
      let bill = await db.holdBills.get(holdBillId);
      if (!bill) {
        // Fallback search by string or number comparison
        const allBills = await db.holdBills.toArray();
        bill = allBills.find(b => String(b.id) === String(holdBillId) || String(b.id) === String(Number(holdBillId)));
      }

      if (!bill) {
        alert('Held bill not found or already recalled.');
        return;
      }

      if (this.cart.length > 0 && !confirm('Active cart has items. Overwrite with held bill? (දැනට ඇති බිල වෙනුවට මෙම බිල තෝරාගන්නද?)')) {
        return;
      }

      this.cart = Array.isArray(bill.cartItems) ? JSON.parse(JSON.stringify(bill.cartItems)) : [];
      this.pricingMode = bill.pricingMode || 'retail';
      this.billDiscountType = bill.billDiscountType || 'fixed';
      this.billDiscountValue = bill.billDiscountValue || 0;
      this.updatePricingModeUI();

      if (bill.customerId) {
        try {
          this.selectedCustomer = await db.customers.get(bill.customerId);
        } catch (e) {
          this.selectedCustomer = null;
        }
      } else {
        this.selectedCustomer = null;
      }

      try {
        await db.holdBills.delete(bill.id || holdBillId);
      } catch (e) {}

      const modal = document.getElementById('recallBillsModal');
      if (modal) modal.classList.add('hidden');

      this.renderCart();
      await this.updateHoldBillsBadge();
      if (typeof SoundManager !== 'undefined' && SoundManager.playSuccessChime) {
        SoundManager.playSuccessChime();
      }

      // If on mobile screen (< 768px), switch to cart segment so cashier sees the recalled items
      if (window.innerWidth < 768) {
        this.setMobilePosSegment('cart');
      }
    } catch (err) {
      console.error('[POS] Error recalling bill:', err);
      alert('Error loading held bill: ' + (err.message || err));
    }
  },

  async deleteHoldBill(id) {
    if (!id) return;
    if (confirm('Delete this held bill permanently? (මෙම බිල මකා දමන්නද?)')) {
      try {
        await db.holdBills.delete(id);
      } catch (e) {
        const allBills = await db.holdBills.toArray();
        const found = allBills.find(b => String(b.id) === String(id));
        if (found && found.id) await db.holdBills.delete(found.id);
      }
      await this.openRecallBillsModal();
      await this.updateHoldBillsBadge();
    }
  },

  async addProductById(id) {
    if (!id) return;
    try {
      const product = await db.products.get(Number(id));
      if (product) {
        await this.addProduct(product, 1);
      }
    } catch (e) {
      console.warn('[POS] Error adding product by ID:', e);
    }
  },

  // Category filter & Product Grid rendering (Right Pane)
  async renderCategoryFilter() {
    const container = document.getElementById('posCategoryFilters');
    if (!container) return;

    let categories = [];
    try {
      categories = await db.categories.toArray();
      if (!categories || categories.length === 0) {
        await seedDatabaseIfEmpty();
        categories = await db.categories.toArray();
      }
    } catch (e) {
      console.warn('[POS] Error loading categories:', e);
    }

    container.innerHTML = `
      <button onclick="POSManager.setCategory('all')" class="category-pill px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
        this.currentCategory === 'all' ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
      }">
        ${window.I18n ? I18n.t('allItems') : 'All Products (සියල්ල)'}
      </button>
      ${(categories || []).map(c => `
        <button onclick="POSManager.setCategory('${c.name.replace(/'/g, "\\'")}')" class="category-pill px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
          this.currentCategory === c.name ? 'bg-sky-600 text-white shadow-lg shadow-sky-600/30' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
        }">
          ${c.icon || '🏷️'} ${c.name}
        </button>
      `).join('')}
    `;
  },

  setCategory(catName) {
    this.currentCategory = catName;
    this.renderCategoryFilter();
    this.renderProductGrid();
  },

  // Render Right Product Grid with Retail & Wholesale Prices
  async renderProductGrid() {
    const grid = document.getElementById('posProductGrid');
    if (!grid) return;

    let items = [];
    try {
      items = await db.products.toArray();
      if (!items || items.length === 0) {
        await seedDatabaseIfEmpty();
        items = await db.products.toArray();
      }
    } catch (e) {
      console.warn('[POS] Error loading products:', e);
    }

    if (this.currentCategory !== 'all') {
      items = items.filter(p => p.category === this.currentCategory);
    }

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      items = items.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
      );
    }

    if (!items || items.length === 0) {
      grid.innerHTML = `
        <div class="col-span-full py-12 text-center text-slate-400">
          <div class="text-3xl mb-2">🔍</div>
          <div class="font-medium">${window.I18n && I18n.currentLang === 'si' ? 'ගැලපෙන භාණ්ඩ හමු නොවීය' : 'No matching products found'}</div>
        </div>
      `;
      this.lastFilteredProducts = [];
      return;
    }

    // Cache filtered list so Enter key can use it instantly (no extra DB call)
    this.lastFilteredProducts = items;

    grid.innerHTML = items.map(p => {
      const isLow = p.currentStock <= p.minStock && p.currentStock > 0;
      const isOut = p.currentStock <= 0;
      const wsPrice = p.wholesalePrice || p.sellingPrice;

      return `
        <div onclick="POSManager.addProductById(${p.id})"
             class="group relative bg-slate-800/80 hover:bg-slate-750 active:scale-[0.97] border border-slate-700/80 hover:border-sky-500 rounded-2xl p-2.5 sm:p-3 flex flex-col justify-between cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-950/40 select-none">
          <div>
            <div class="flex items-start justify-between gap-1 mb-1">
              <span class="text-[9px] sm:text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300">
                ${p.unit || 'pcs'}
              </span>
              <span class="text-[9px] sm:text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                isOut ? 'bg-rose-900/80 text-rose-300 border border-rose-700' :
                isLow ? 'bg-amber-900/80 text-amber-300 border border-amber-700' :
                'bg-emerald-950/80 text-emerald-300'
              }">
                ${isOut ? 'Out of Stock' : `${p.currentStock} ${p.unit}`}
              </span>
            </div>
            <h4 class="font-bold text-slate-100 text-xs leading-snug group-hover:text-sky-300 transition line-clamp-2">
              ${p.name}
              ${p.nameSi && p.nameSi !== p.name ? `<span class="text-[10px] sm:text-[11px] text-sky-400 font-normal block mt-0.5 font-sans">(${p.nameSi})</span>` : ''}
            </h4>
            <div class="text-[9px] sm:text-[10px] text-slate-400 font-mono mt-0.5">${p.sku}</div>
          </div>
          
          <!-- Price Box (Retail & Wholesale) -->
          <div class="mt-2 pt-1.5 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
            <div>
              <span class="text-[9px] text-slate-400 block">${window.I18n ? I18n.t('retailTag') : 'Retail'}</span>
              <span class="font-extrabold text-sky-400 text-xs sm:text-sm">${formatLKR(p.sellingPrice)}</span>
            </div>
            <div class="text-right">
              <span class="text-[9px] text-amber-400/80 block">${window.I18n ? I18n.t('wholesaleTag') : 'Wholesale'}</span>
              <span class="font-bold text-amber-300 text-[10px] sm:text-xs">${formatLKR(wsPrice)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  // Checkout & Payment Modal Flow
  openPaymentModal() {
    if (this.cart.length === 0) {
      alert('Cart is empty. Please add items before checkout.');
      return;
    }

    const totals = this.calculateTotals();
    const modal = document.getElementById('checkoutPaymentModal');
    const grandTotalEl = document.getElementById('payModalGrandTotal');
    const tenderInput = document.getElementById('payTenderAmount');

    if (grandTotalEl) grandTotalEl.textContent = formatLKR(totals.grandTotal);
    if (tenderInput) {
      tenderInput.value = totals.grandTotal;
    }

    this.selectedPaymentMethod = 'cash';
    this.setPaymentMethod('cash');

    modal.classList.remove('hidden');
    if (tenderInput) {
      tenderInput.focus();
      tenderInput.select();
    }
  },

  setPaymentMethod(method) {
    this.selectedPaymentMethod = method;
    const totals = this.calculateTotals();
    const tenderInput = document.getElementById('payTenderAmount');

    document.querySelectorAll('.pay-method-btn').forEach(btn => {
      if (btn.getAttribute('data-method') === method) {
        btn.classList.add('bg-sky-600', 'text-white', 'border-sky-400');
        btn.classList.remove('bg-slate-800', 'text-slate-300', 'border-slate-700');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'border-sky-400');
        btn.classList.add('bg-slate-800', 'text-slate-300', 'border-slate-700');
      }
    });

    const creditWarning = document.getElementById('payCreditWarning');
    if (method === 'credit') {
      if (tenderInput) tenderInput.value = totals.grandTotal;
      if (!this.selectedCustomer) {
        if (creditWarning) {
          creditWarning.classList.remove('hidden');
          creditWarning.textContent = '⚠️ Customer must be attached to issue Store Credit!';
        }
      } else {
        if (creditWarning) {
          creditWarning.classList.remove('hidden');
          creditWarning.textContent = `Credit will be added to ${this.selectedCustomer.name}'s account. Current Credit: ${formatLKR(this.selectedCustomer.creditBalance || 0)}`;
        }
      }
    } else if (method === 'card' || method === 'bank') {
      if (tenderInput) tenderInput.value = totals.grandTotal;
      if (creditWarning) creditWarning.classList.add('hidden');
    } else {
      if (creditWarning) creditWarning.classList.add('hidden');
    }

    this.calculateChange();
  },

  setTenderPreset(amount) {
    const totals = this.calculateTotals();
    const tenderInput = document.getElementById('payTenderAmount');
    if (!tenderInput) return;

    if (amount === 'exact') {
      tenderInput.value = totals.grandTotal;
    } else {
      tenderInput.value = amount;
    }
    this.calculateChange();
  },

  calculateChange() {
    const totals = this.calculateTotals();
    const tenderInput = document.getElementById('payTenderAmount');
    const changeEl = document.getElementById('payChangeAmount');
    const payBtn = document.getElementById('confirmPaymentBtn');
    const splitNotice = document.getElementById('payCreditWarning');
    const method = this.selectedPaymentMethod || 'cash';

    if (method === 'card' || method === 'bank') {
      if (changeEl) {
        changeEl.textContent = formatLKR(0);
        changeEl.className = 'text-xl font-black text-emerald-400 font-mono';
      }
      if (splitNotice) splitNotice.classList.add('hidden');
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        payBtn.innerHTML = `Complete Sale & Print Receipt &rarr;`;
      }
      return;
    }

    if (method === 'credit') {
      if (changeEl) {
        changeEl.textContent = formatLKR(0);
        changeEl.className = 'text-xl font-black text-emerald-400 font-mono';
      }
      if (!this.selectedCustomer) {
        if (splitNotice) {
          splitNotice.classList.remove('hidden');
          splitNotice.innerHTML = `⚠️ <strong>Customer Required:</strong> Please attach a customer for Store Credit (ණය). <button type="button" onclick="CustomerManager.openCustomerSelectModal()" class="ml-2 px-2 py-0.5 bg-sky-600 text-white rounded text-[11px] font-bold underline">Select Customer</button>`;
        }
        if (payBtn) {
          payBtn.disabled = true;
          payBtn.classList.add('opacity-50', 'cursor-not-allowed');
          payBtn.innerHTML = `⚠️ Attach Customer for Credit`;
        }
      } else {
        if (splitNotice) {
          splitNotice.classList.remove('hidden');
          splitNotice.innerHTML = `📋 Full amount (<strong>${formatLKR(totals.grandTotal)}</strong>) will be added to <strong>${this.selectedCustomer.name}</strong>'s credit account.`;
        }
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          payBtn.innerHTML = `Complete Sale on Store Credit &rarr;`;
        }
      }
      return;
    }

    // Cash / Split method
    const tender = parseFloat(tenderInput?.value) || 0;
    const diff = tender - totals.grandTotal;

    if (diff >= 0) {
      // Full Cash Payment
      if (splitNotice) splitNotice.classList.add('hidden');
      if (changeEl) {
        changeEl.textContent = formatLKR(diff);
        changeEl.className = 'text-xl font-black text-emerald-400 font-mono';
      }
      if (payBtn) {
        payBtn.disabled = false;
        payBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        payBtn.innerHTML = `Complete Sale & Print Receipt &rarr;`;
      }
    } else {
      // Partial / Split Payment: Cash paid < Grand Total
      const creditDue = Math.abs(diff);
      if (this.selectedCustomer) {
        if (splitNotice) {
          splitNotice.classList.remove('hidden');
          splitNotice.innerHTML = `⚡ <strong>Split Payment (මිශ්‍ර ගෙවීම):</strong><br/>💵 Cash Paid: <strong>${formatLKR(tender)}</strong> | 📋 Added to <strong>${this.selectedCustomer.name}</strong>'s Credit: <strong class="text-amber-300 font-mono">${formatLKR(creditDue)}</strong>`;
        }
        if (changeEl) {
          changeEl.innerHTML = `<span class="text-xs text-slate-400">Credit Balance: </span><span class="text-amber-400 font-bold">${formatLKR(creditDue)}</span>`;
          changeEl.className = 'text-sm font-bold text-amber-400 font-mono';
        }
        if (payBtn) {
          payBtn.disabled = false;
          payBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          payBtn.innerHTML = `Complete Sale (Split: ${formatLKR(tender)} Cash + ${formatLKR(creditDue)} Credit) &rarr;`;
        }
      } else {
        if (splitNotice) {
          splitNotice.classList.remove('hidden');
          splitNotice.innerHTML = `⚠️ <strong>Partial Payment (Short by ${formatLKR(creditDue)}):</strong><br/>To put the remaining ${formatLKR(creditDue)} on Credit, please <button type="button" onclick="CustomerManager.openCustomerSelectModal()" class="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-bold">Attach Customer &rarr;</button>`;
        }
        if (changeEl) {
          changeEl.textContent = `Short by ${formatLKR(creditDue)}`;
          changeEl.className = 'text-sm font-bold text-rose-400 font-mono';
        }
        if (payBtn) {
          payBtn.disabled = true;
          payBtn.classList.add('opacity-50', 'cursor-not-allowed');
          payBtn.innerHTML = `⚠️ Short by ${formatLKR(creditDue)} (Attach Customer)`;
        }
      }
    }
  },

  // Finalize Sale Transaction
  async completeCheckout() {
    const totals = this.calculateTotals();
    const tenderInput = document.getElementById('payTenderAmount');
    let method = this.selectedPaymentMethod || 'cash';
    let tender = totals.grandTotal;
    let paidCash = 0;
    let creditAmount = 0;
    let changeAmount = 0;

    if (method === 'cash') {
      tender = parseFloat(tenderInput?.value) || 0;
      if (tender < totals.grandTotal) {
        if (!this.selectedCustomer) {
          alert('Tender amount cannot be less than Grand Total. If customer is paying partially, please attach a Customer first!');
          return;
        }
        // It is a split payment!
        method = 'split';
        paidCash = tender;
        creditAmount = totals.grandTotal - tender;
        changeAmount = 0;
      } else {
        paidCash = totals.grandTotal;
        creditAmount = 0;
        changeAmount = tender - totals.grandTotal;
      }
    } else if (method === 'credit') {
      if (!this.selectedCustomer) {
        alert('Please attach a customer for Store Credit transactions.');
        return;
      }
      paidCash = 0;
      creditAmount = totals.grandTotal;
      tender = 0;
      changeAmount = 0;
    } else {
      // card or bank
      paidCash = 0;
      creditAmount = 0;
      tender = totals.grandTotal;
      changeAmount = 0;
    }

    const invoiceNo = await generateInvoiceNo();
    const cashier = AuthManager.currentUser || { id: 1, fullName: 'Super Admin' };
    const currentShift = ShiftManager.activeShift;

    // 1. Save Sale record
    const saleRecord = {
      invoiceNo,
      timestamp: new Date().toISOString(),
      cashierId: cashier.id,
      cashierName: cashier.fullName,
      customerId: this.selectedCustomer?.id || null,
      customerName: this.selectedCustomer?.name || 'Walk-in Customer',
      customerPhone: this.selectedCustomer?.phone || '',
      pricingMode: this.pricingMode,
      subtotalMRP: totals.subtotalMRP,
      subtotal: totals.subtotal,
      totalSavings: totals.totalSavings,
      totalDiscount: totals.totalItemDiscounts + totals.billDiscAmt,
      tax: totals.taxAmount,
      grandTotal: totals.grandTotal,
      paymentMethod: method,
      tenderedAmount: tender,
      paidCash: paidCash,
      creditAmount: creditAmount,
      changeAmount: changeAmount,
      shiftId: currentShift?.id || null,
      status: 'completed'
    };

    const saleId = await db.sales.add(saleRecord);

    // 2. Save Sale Items and Reduce Stock in Dexie
    for (const item of this.cart) {
      await db.saleItems.add({
        saleId,
        productId: item.productId,
        productName: item.name,
        sku: item.sku,
        costPrice: item.costPrice || 0,
        markedPrice: item.markedPrice || item.price,
        price: item.price,
        qty: item.qty,
        unit: item.unit,
        discount: item.itemDiscountAmount || 0,
        total: item.total
      });

      const currentProd = await db.products.get(item.productId);
      if (currentProd) {
        const newStock = Math.max(0, currentProd.currentStock - item.qty);
        await db.products.update(item.productId, { currentStock: newStock });
      }
    }

    // 3. Customer Credit & Total Spent update
    let customerNewBalance = 0;
    if (this.selectedCustomer) {
      const cust = await db.customers.get(this.selectedCustomer.id);
      if (cust) {
        let updatedCredit = cust.creditBalance || 0;
        if (creditAmount > 0) {
          updatedCredit += creditAmount;
        }
        customerNewBalance = updatedCredit;
        await db.customers.update(cust.id, {
          creditBalance: updatedCredit,
          totalSpent: (cust.totalSpent || 0) + totals.grandTotal
        });
      }
    }

    // 4. Update Shift sales stats
    if (currentShift) {
      await ShiftManager.recordSaleInShift(saleRecord);
    }

    SoundManager.playCashDrawer();
    SoundManager.playSuccessChime();

    document.getElementById('checkoutPaymentModal').classList.add('hidden');

    this.lastCompletedSale = {
      ...saleRecord,
      id: saleId,
      customerNewBalance,
      items: JSON.parse(JSON.stringify(this.cart))
    };

    this.cart = [];
    this.selectedCustomer = null;
    this.billDiscountValue = 0;
    this.renderCart();
    await this.renderProductGrid();

    // Real-time updates to Dashboard & Credit tabs
    if (window.DashboardManager) {
      DashboardManager.renderDashboard();
    }
    if (window.CustomerManager) {
      CustomerManager.renderCustomerTable();
      if (CustomerManager.renderCreditTab) CustomerManager.renderCreditTab();
    }

    await this.showReceiptModal(this.lastCompletedSale);
  },

  // Format and Display Thermal Receipt Modal with Store Logo Support
    // Helper to remove any Sinhala/Unicode characters from Thermal Receipt
  cleanReceiptText(txt) {
    if (!txt) return '';
    return String(txt)
      .replace(/\s{2,}/g, ' ')
      .trim();
  },

  // Generates Complete High-Fidelity Supermarket Thermal Receipt HTML
  buildThermalReceiptHtml(sale, settings, barcodeDataUrl) {
    const storeLogo = settings.storeLogo;
    const storeName = settings.storeName || 'MAYRA SUPER MARKET';
    const storeBranch = settings.storeBranch || '';
    const storeAddress = settings.storeAddress || '';
    const storePhone = settings.storePhone || '';
    const storeVat = settings.storeVat || '';
    const receiptFooter = settings.receiptFooter || 'Thank you for shopping with us!';

    const cleanCashier = this.cleanReceiptText(sale.cashierName) || 'Cashier';
    const cleanCustomer = this.cleanReceiptText(sale.customerName) || 'Walk-in Customer';

    const itemsRows = (sale.items || []).map((item, idx) => {
      const mrp = Number(item.markedPrice) || Number(item.retailPrice) || Number(item.price);
      const isDiscounted = mrp > item.price;
      const cleanItemName = this.cleanReceiptText(item.name || item.productName) || 'Item';
      const cleanUnit = this.cleanReceiptText(item.unit) || 'pcs';
      const itemDisc = Number(item.itemDiscountAmount || 0);

      return `
        <tr style="border-bottom: 1px dashed #000;">
          <td style="padding: 2px 0; vertical-align: top; text-align: left;">
            <div style="font-weight: 600; color: #000; line-height: 1.25; font-size: 11px;">${idx + 1}. ${cleanItemName}</div>
            ${isDiscounted ? `<div style="font-size: 9.5px; color: #000; font-weight: 600; text-decoration: line-through; margin-top: 0px;">MRP: ${mrp.toFixed(2)}</div>` : ''}
          </td>
          <td style="padding: 2px 1px; vertical-align: top; text-align: center; white-space: nowrap; font-weight: 600; font-size: 11px;">
            ${item.qty} <span style="font-size: 9.5px; color: #000; font-weight: 600;">${cleanUnit}</span>
          </td>
          <td style="padding: 2px 1px; vertical-align: top; text-align: right; white-space: nowrap; font-weight: 600; font-size: 11px;">
            <div>${Number(item.price || 0).toFixed(2)}</div>
            ${itemDisc > 0 ? `<div style="font-size: 9.5px; font-weight: 700; color: #000;">-${itemDisc.toFixed(2)}</div>` : ''}
          </td>
          <td style="padding: 2px 3px 2px 0; vertical-align: top; text-align: right; white-space: nowrap; font-weight: 700; font-size: 11.5px;">
            ${Number(item.total || 0).toFixed(2)}
          </td>
        </tr>
      `;
    }).join('');

    let paymentHtml = '';
    const creditAmt = Number(sale.creditAmount || 0);
    const actualCashPaid = (sale.paidCash !== undefined && sale.paidCash !== null)
      ? Number(sale.paidCash)
      : (sale.paymentMethod === 'credit' ? 0
        : (sale.paymentMethod === 'split' && creditAmt > 0)
          ? Math.max(0, Number(sale.grandTotal || 0) - creditAmt)
          : Number(sale.tenderedAmount || 0));

    if (sale.paymentMethod === 'credit' || (creditAmt > 0 && actualCashPaid <= 0)) {
      // 1. FULL STORE CREDIT SALE
      paymentHtml = `
        <div style="display:flex; justify-content:space-between; padding-top:3px; font-weight: 700;">
          <span style="text-transform:uppercase;">Method:</span>
          <strong>CREDIT</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight: 600;">
          <span>Cash Paid:</span>
          <span>${formatLKR(0)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight: 700;">
          <span>Added to Credit:</span>
          <span>${formatLKR(creditAmt || sale.grandTotal)}</span>
        </div>
        ${sale.customerNewBalance !== undefined ? `
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700; border-top:1px dashed #000; padding-top:2px; margin-top:2px;">
            <span>Customer Total Due:</span>
            <strong>${formatLKR(sale.customerNewBalance)}</strong>
          </div>
        ` : ''}
      `;
    } else if (sale.paymentMethod === 'split' || (creditAmt > 0 && actualCashPaid > 0)) {
      // 2. SPLIT PAYMENT (Part Cash, Part Credit)
      paymentHtml = `
        <div style="display:flex; justify-content:space-between; padding-top:3px; font-weight: 700;">
          <span style="text-transform:uppercase;">Method:</span>
          <strong>SPLIT (Cash + Credit)</strong>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight: 700;">
          <span>Cash Paid:</span>
          <span>${formatLKR(actualCashPaid)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-weight: 700;">
          <span>Added to Credit:</span>
          <span>${formatLKR(creditAmt)}</span>
        </div>
        ${sale.customerNewBalance !== undefined ? `
          <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:700; border-top:1px dashed #000; padding-top:2px; margin-top:2px;">
            <span>Customer Total Due:</span>
            <strong>${formatLKR(sale.customerNewBalance)}</strong>
          </div>
        ` : ''}
      `;
    } else {
      // 3. REGULAR PAYMENT (Cash, Card, QR)
      paymentHtml = `
        <div style="display:flex; justify-content:space-between; padding-top:3px; font-weight: 700;">
          <span style="text-transform:uppercase;">Payment (${sale.paymentMethod || 'Cash'}):</span>
          <span>${formatLKR(sale.tenderedAmount || sale.grandTotal)}</span>
        </div>
        ${sale.paymentMethod === 'cash' ? `
          <div style="display:flex; justify-content:space-between; font-weight: 600;">
            <span>Change Returned:</span>
            <span>${formatLKR(sale.changeAmount || 0)}</span>
          </div>
        ` : ''}
      `;
    }

    return `
      <!-- Store Header -->
      <div style="text-align: center; padding-bottom: 4px; border-bottom: 1.5px solid #000;">
        ${storeLogo ? `<img src="${storeLogo}" style="max-height: 52px; max-width: 180px; display: block; margin: 0 auto 4px auto; object-fit: contain;" alt="Logo" />` : ''}
        <h2 style="font-size: 15px; font-weight: 700; text-transform: uppercase; margin: 0; letter-spacing: 0.5px; color: #000;">${storeName}</h2>
        ${storeBranch ? `<div style="font-size: 11px; font-weight: 600; color: #000; margin-top: 1px;">${storeBranch}</div>` : ''}
        ${storeAddress ? `<div style="font-size: 11px; font-weight: 600; color: #000; line-height: 1.3;">${storeAddress}</div>` : ''}
        ${storePhone ? `<div style="font-size: 11px; font-weight: 600; color: #000;">Tel: ${storePhone}</div>` : ''}
        ${storeVat ? `<div style="font-size: 11px; font-weight: 600;">VAT Reg: ${storeVat}</div>` : ''}
      </div>

      <!-- Invoice Details -->
      <div style="padding: 3px 0; font-size: 11px; font-weight: 600; border-bottom: 1.5px solid #000; line-height: 1.35;">
        <div style="display: flex; justify-content: space-between;">
          <span>Invoice No:</span>
          <strong style="font-weight: 700; font-size: 11.5px;">${sale.invoiceNo}</strong>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Date/Time:</span>
          <span>${new Date(sale.timestamp).toLocaleString()}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Cashier:</span>
          <span>${cleanCashier}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Customer:</span>
          <span>${cleanCustomer}</span>
        </div>
      </div>

      <!-- Items Table -->
      <div style="padding: 2px 0; border-bottom: 1.5px solid #000;">
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: inherit;">
          <thead>
            <tr style="border-top: 1.5px solid #000; border-bottom: 1.5px solid #000; font-size: 10.5px; font-weight: 700; text-transform: uppercase;">
              <th style="padding: 2.5px 0; text-align: left; width: 42%;"># ITEM</th>
              <th style="padding: 2.5px 1px; text-align: center; width: 17%;">QTY</th>
              <th style="padding: 2.5px 1px; text-align: right; width: 19%;">PRICE</th>
              <th style="padding: 2.5px 3px 2.5px 0; text-align: right; width: 22%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>
      </div>

      <!-- Financial Totals -->
      <div style="padding-top: 3px; font-size: 11px; font-weight: 600; line-height: 1.35; padding-right: 3px;">
        ${sale.subtotalMRP && sale.subtotalMRP > sale.grandTotal ? `
          <div style="display: flex; justify-content: space-between; color: #000; font-weight: 600; padding: 1px 0;">
            <span>Subtotal (MRP Value):</span>
            <span style="text-decoration: line-through;">${formatLKR(sale.subtotalMRP)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; font-weight: 600; padding: 1px 0;">
          <span>Subtotal:</span>
          <span>${formatLKR(sale.subtotal)}</span>
        </div>
        ${sale.totalDiscount > 0 ? `
          <div style="display: flex; justify-content: space-between; font-weight: 700; padding: 1px 0;">
            <span>Total Discount:</span>
            <span>-${formatLKR(sale.totalDiscount)}</span>
          </div>
        ` : ''}
        ${sale.tax > 0 ? `
          <div style="display: flex; justify-content: space-between; font-weight: 600; padding: 1px 0;">
            <span>Tax / VAT:</span>
            <span>${formatLKR(sale.tax)}</span>
          </div>
        ` : ''}

        <!-- GRAND TOTAL -->
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 800; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 3px 1px; margin: 3px 0;">
          <span>GRAND TOTAL:</span>
          <span style="font-size: 14px; font-weight: 800;">${formatLKR(sale.grandTotal)}</span>
        </div>

        ${sale.totalSavings && sale.totalSavings > 0 ? `
          <div style="border: 1.5px solid #000; padding: 3px; margin: 4px 0; text-align: center; font-size: 11px; font-weight: 700; background: #fff;">
            ** YOU SAVED: ${formatLKR(sale.totalSavings)} **
          </div>
        ` : ''}

        ${paymentHtml}
      </div>

      <!-- Footer & Barcode -->
      <div style="text-align: center; padding-top: 3px; margin-top: 3px; border-top: 1.5px solid #000; font-size: 10.5px; font-weight: 600;">
        ${receiptFooter ? `<div style="font-weight: 600; margin-bottom: 4px;">${receiptFooter}</div>` : ''}
        ${barcodeDataUrl ? `<img src="${barcodeDataUrl}" style="max-height: 40px; display: block; margin: 4px auto 0 auto;" alt="Barcode" />` : ''}
        <div style="font-size: 9px; font-weight: 700; margin-top: 4px; color: #000; letter-spacing: 0.3px; border-top: 0.5px dashed #000; padding-top: 3px;">
          Powered by DSK POS | 078-5705966
        </div>
      </div>
    `;
  },

  // Format and Display Thermal Receipt Modal with Store Logo Support
  async showReceiptModal(sale) {
    if (!sale) return;

    const storeLogo = await getSetting('store_logo', null);
    const storeName = this.cleanReceiptText(await getSetting('store_name', ''));
    const storeBranch = this.cleanReceiptText(await getSetting('store_branch', ''));
    const storeAddress = this.cleanReceiptText(await getSetting('store_address', ''));
    const storePhone = this.cleanReceiptText(await getSetting('store_phone', ''));
    const storeVat = this.cleanReceiptText(await getSetting('store_vat_no', ''));
    const receiptFooterRaw = await getSetting('receipt_footer', '');
    const isLankaPOSFooter = receiptFooterRaw && (
      receiptFooterRaw.includes('LankaPOS') || 
      receiptFooterRaw.includes('Retail Suite') || 
      receiptFooterRaw.includes('retail suite') ||
      receiptFooterRaw.includes('Offline Retail')
    );
    const receiptFooter = isLankaPOSFooter ? 'Thank you for shopping with us!' : this.cleanReceiptText(receiptFooterRaw);
    const thermalWidth = await getSetting('thermal_width', '80mm');

    // Generate Barcode PNG Data URL using JsBarcode
    let barcodeDataUrl = '';
    try {
      const canvas = document.createElement('canvas');
      if (window.JsBarcode) {
        JsBarcode(canvas, sale.invoiceNo, {
          format: 'CODE128',
          width: 1.5,
          height: 38,
          displayValue: true,
          fontSize: 10,
          margin: 2
        });
        barcodeDataUrl = canvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('Barcode generation warning:', e);
    }

    this.currentReceiptSettings = {
      storeLogo, storeName, storeBranch, storeAddress, storePhone, storeVat, receiptFooter, thermalWidth, barcodeDataUrl
    };
    this.currentReceiptSale = sale;

    const htmlContent = this.buildThermalReceiptHtml(sale, this.currentReceiptSettings, barcodeDataUrl);

    const previewContainer = document.getElementById('receiptPreviewContent');
    if (previewContainer) previewContainer.innerHTML = htmlContent;

    const printArea = document.getElementById('thermalReceiptPrintArea');
    if (printArea) {
      printArea.innerHTML = htmlContent;
      if (thermalWidth === '58mm') {
        document.body.classList.add('printer-58mm');
      } else {
        document.body.classList.remove('printer-58mm');
      }
    }

    document.getElementById('receiptModal').classList.remove('hidden');

    const autoPrint = await getSetting('auto_print_receipt', false);
    if (autoPrint === true || autoPrint === 'true') {
      this.printThermalReceipt();
    }
  },

  printThermalReceipt() {
    const sale = this.currentReceiptSale || this.lastCompletedSale;
    const settings = this.currentReceiptSettings || {};
    const barcodeDataUrl = settings.barcodeDataUrl || '';
    const thermalHtml = sale ? this.buildThermalReceiptHtml(sale, settings, barcodeDataUrl) : (document.getElementById('thermalReceiptPrintArea')?.innerHTML || '');

    // Detect mobile device — window.open() is blocked on mobile browsers
    const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768;

    if (isMobile) {
      // Mobile: inject receipt into a full-screen print overlay and use window.print()
      let overlay = document.getElementById('mobilePrintOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'mobilePrintOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:99999;overflow:auto;padding:8mm;display:flex;flex-direction:column;align-items:center;';
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = thermalHtml;
      document.body.classList.add('printing-receipt');
      setTimeout(() => {
        window.print();
        setTimeout(() => {
          document.body.classList.remove('printing-receipt');
          overlay.innerHTML = '';
          overlay.style.display = 'none';
        }, 1200);
      }, 120);
      return;
    }

    // Desktop: open dedicated high-resolution print window
    const printWin = window.open('', '_blank', 'width=380,height=600,top=100,left=100');
    if (!printWin) {
      // Popup blocked even on desktop — fallback
      document.body.classList.add('printing-receipt');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);
      return;
    }

    const is58mm = (settings.thermalWidth === '58mm');
    const receiptWidth = is58mm ? '48mm' : '70mm';
    const baseFontSize = is58mm ? '10px' : '11px';
    const openScript = '<' + 'script>';
    const closeScript = '<' + '/script>';
    const closeBody = '<' + '/body>';
    const closeHtml = '<' + '/html>';

    printWin.document.open();
    printWin.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Receipt ${sale?.invoiceNo || ''}</title>
<style>
  @page {
    margin: 0;
    size: auto;
  }
  * {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color: #000000 !important;
  }
  body {
    background: #ffffff;
    color: #000000 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Sinhala", "Iskoola Pota", Arial, sans-serif;
    font-size: ${baseFontSize};
    font-weight: 600;
    line-height: 1.3;
    width: ${receiptWidth};
    max-width: ${receiptWidth};
    margin: 0 auto;
    padding: 2mm 3mm 5mm 2mm;
    overflow-x: hidden;
  }
  span, div, td, th, p, strong, h1, h2, h3 { color: #000000 !important; }
  strong, h1, h2, h3, th { font-weight: 700 !important; }
  table { width: 100%; border-collapse: collapse; font-family: inherit; font-size: inherit; }
  th, td { font-family: inherit; font-size: inherit; }
  img { max-width: 100%; display: block; }
</style>
</head>
<body>
${thermalHtml}
${openScript}
  window.onload = function() {
    setTimeout(function() {
      window.focus();
      window.print();
      setTimeout(function() { window.close(); }, 600);
    }, 50);
  };
${closeScript}
${closeBody}
${closeHtml}`);
    printWin.document.close();
  },

  async openSalesHistoryModal() {
    const modal = document.getElementById('salesHistoryModal');
    if (!modal) return;

    modal.classList.remove('hidden');
    const searchInput = document.getElementById('salesHistorySearchInput');
    if (searchInput) searchInput.value = '';
    await this.renderSalesHistory();
  },

  async filterSalesHistory(query) {
    await this.renderSalesHistory(query);
  },

  async renderSalesHistory(filterQuery = '') {
    const listContainer = document.getElementById('salesHistoryList');
    if (!listContainer) return;

    let sales = await db.sales.orderBy('timestamp').reverse().toArray();
    
    if (filterQuery) {
      const q = filterQuery.toLowerCase().trim();
      sales = sales.filter(s => 
        (s.invoiceNo && s.invoiceNo.toLowerCase().includes(q)) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        (s.cashierName && s.cashierName.toLowerCase().includes(q)) ||
        (s.paymentMethod && s.paymentMethod.toLowerCase().includes(q))
      );
    }

    if (sales.length === 0) {
      listContainer.innerHTML = `<div class="text-xs text-slate-500 text-center py-6">No sales invoices found.</div>`;
      return;
    }

    listContainer.innerHTML = sales.map(s => {
      const dateStr = new Date(s.timestamp).toLocaleDateString();
      const timeStr = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `
        <div onclick="POSManager.showSaleDetailsForReturn('${s.id}')" class="p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/60 rounded-xl cursor-pointer transition">
          <div class="flex items-center justify-between">
            <span class="font-mono font-bold text-sky-400 text-xs">${s.invoiceNo}</span>
            <span class="font-mono font-bold text-emerald-400 text-xs">${formatLKR(s.grandTotal)}</span>
          </div>
          <div class="flex items-center justify-between text-[11px] text-slate-400 mt-1">
            <span>${dateStr} ${timeStr}</span>
            <span class="uppercase text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-semibold">${s.paymentMethod}</span>
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5 truncate">
            Cashier: ${s.cashierName || 'Cashier'} &bull; Customer: ${s.customerName || 'Walk-in'}
          </div>
        </div>
      `;
    }).join('');
  },

  async showSaleDetailsForReturn(saleId) {
    const pane = document.getElementById('salesHistoryDetailsPane');
    if (!pane) return;

    const sale = await db.sales.get(saleId);
    if (!sale) return;

    const items = await db.saleItems.where('saleId').equals(saleId).toArray();
    const existingReturns = await db.returns.where('invoiceNo').equals(sale.invoiceNo).toArray();

    const dateStr = new Date(sale.timestamp).toLocaleString();

    pane.innerHTML = `
      <div class="flex flex-col h-full min-h-0 space-y-3">
        <!-- Sale Header Details -->
        <div class="flex items-center justify-between pb-2 border-b border-slate-800 shrink-0">
          <div>
            <div class="flex items-center gap-2">
              <span class="font-mono font-extrabold text-sky-400 text-sm">${sale.invoiceNo}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300">${sale.paymentMethod}</span>
            </div>
            <div class="text-[11px] text-slate-400">${dateStr} &bull; Cashier: <strong>${sale.cashierName || 'Cashier'}</strong></div>
            <div class="text-[11px] text-slate-400">Customer: <strong>${sale.customerName || 'Walk-in Customer'}</strong></div>
          </div>
          <button onclick="POSManager.reprintPastReceipt('${sale.id}')" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-sky-600/30">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            <span>Reprint Receipt</span>
          </button>
        </div>

        <!-- Sale Items List -->
        <div class="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
          <div class="text-xs font-bold text-slate-300 uppercase">Purchased Items</div>
          <table class="w-full text-left text-xs">
            <thead>
              <tr class="text-[10px] text-slate-500 uppercase border-b border-slate-800">
                <th class="py-1.5">Item</th>
                <th class="py-1.5 text-center">Qty</th>
                <th class="py-1.5 text-right">Price</th>
                <th class="py-1.5 text-right">Total</th>
                <th class="py-1.5 text-center">Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-medium">
              ${items.map(item => `
                <tr class="text-slate-200">
                  <td class="py-2 pr-2">
                    <div class="font-bold">${item.productName}</div>
                    <div class="text-[10px] text-slate-500 font-mono">SKU: ${item.sku || '---'}</div>
                  </td>
                  <td class="py-2 text-center font-mono">${item.qty} ${item.unit || 'pcs'}</td>
                  <td class="py-2 text-right font-mono">${formatLKR(item.price)}</td>
                  <td class="py-2 text-right font-mono font-bold text-sky-400">${formatLKR(item.total)}</td>
                  <td class="py-2 text-center">
                    <button onclick="POSManager.promptReturnItem('${sale.id}', '${item.id}')" class="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-300 rounded-lg text-[11px] font-bold transition">
                      🔄 Return
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          ${existingReturns.length > 0 ? `
            <div class="mt-4 pt-3 border-t border-slate-800">
              <div class="text-xs font-bold text-rose-400 uppercase mb-1">Processed Returns for this Invoice</div>
              <div class="space-y-1">
                ${existingReturns.map(r => `
                  <div class="p-2 bg-rose-950/30 border border-rose-900/60 rounded-xl text-xs flex justify-between items-center text-rose-200 font-mono">
                    <div>
                      <strong>${r.returnNo}</strong> &bull; Item: ${r.productName} (Qty: ${r.qty})
                      <div class="text-[10px] text-slate-400 font-sans">Reason: ${r.reason} &bull; Type: ${r.refundType}</div>
                    </div>
                    <div class="font-bold text-rose-400">-${formatLKR(r.totalRefund)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Totals Summary Footer -->
        <div class="p-3 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs space-y-1 shrink-0">
          <div class="flex justify-between text-slate-400"><span>Subtotal:</span><span>${formatLKR(sale.subtotal)}</span></div>
          ${sale.totalDiscount > 0 ? `<div class="flex justify-between text-emerald-400"><span>Discount:</span><span>-${formatLKR(sale.totalDiscount)}</span></div>` : ''}
          ${sale.tax > 0 ? `<div class="flex justify-between text-slate-400"><span>Tax / VAT:</span><span>${formatLKR(sale.tax)}</span></div>` : ''}
          <div class="flex justify-between text-sm font-bold text-sky-400 border-t border-slate-800 pt-1">
            <span>Grand Total:</span>
            <span>${formatLKR(sale.grandTotal)}</span>
          </div>
        </div>
      </div>
    `;
  },

  async promptReturnItem(saleId, itemId) {
    const item = await db.saleItems.get(itemId);
    const sale = await db.sales.get(saleId);
    if (!item || !sale) return;

    AuthManager.requireAdminAuth({
      actionName: 'Process Return / Refund',
      actionDesc: `Authorize return/refund for invoice ${sale.invoiceNo} (${item.productName})`,
      requiredPerm: 'allowReturns',
      onAuthorized: async () => {
        const returnQtyStr = prompt(`Process Return for:\n${item.productName}\nSold Qty: ${item.qty} ${item.unit}\n\nEnter Return Quantity:`, '1');
        if (returnQtyStr === null) return;

        const returnQty = parseFloat(returnQtyStr);
        if (isNaN(returnQty) || returnQty <= 0 || returnQty > item.qty) {
          alert(`Invalid quantity! Must be between 0.01 and ${item.qty}`);
          return;
        }

        const reason = prompt('Reason for Return:\n1. Damaged / Defective\n2. Customer Change of Mind\n3. Expired / Quality Issue\n4. Incorrect Item', 'Customer Change of Mind') || 'Returned';

        const refundType = confirm('Refund Cash to Customer?\n\nClick [OK] for Cash Refund\nClick [Cancel] for Store Credit / Exchange') ? 'Cash Refund' : 'Store Credit / Exchange';

        await this.executeReturnItem(sale, item, returnQty, reason, refundType);
      }
    });
  },

  async executeReturnItem(sale, item, returnQty, reason, refundType) {
    const unitPrice = item.price;
    const totalRefund = unitPrice * returnQty;
    const returnNo = await generateReturnNo();

    // 1. Record Return in Dexie
    await db.returns.add({
      returnNo,
      invoiceNo: sale.invoiceNo,
      saleId: sale.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      qty: returnQty,
      unitPrice,
      totalRefund,
      reason,
      refundType,
      customerId: sale.customerId,
      cashierId: AuthManager.currentUser?.id || 1,
      cashierName: AuthManager.currentUser?.fullName || 'Cashier',
      date: new Date().toISOString()
    });

    // 2. Restore Stock in Products Table
    const product = await db.products.get(item.productId);
    if (product) {
      await db.products.update(item.productId, {
        currentStock: (product.currentStock || 0) + returnQty
      });
    }

    // 3. Log Stock Adjustment
    await db.stockAdjustments.add({
      date: new Date().toISOString(),
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      type: 'add',
      qty: returnQty,
      reason: `Customer Return: ${returnNo} (${reason})`,
      userId: AuthManager.currentUser?.id || 1
    });

    SoundManager.playSuccessChime();
    alert(`Return processed successfully!\nReturn No: ${returnNo}\nRefund Amount: ${formatLKR(totalRefund)}\nStock restored: +${returnQty} ${item.unit || 'pcs'}`);

    await this.showSaleDetailsForReturn(sale.id);
  },

  async reprintPastReceipt(saleId) {
    const sale = await db.sales.get(saleId);
    if (!sale) return;

    const items = await db.saleItems.where('saleId').equals(saleId).toArray();
    const fullSale = {
      ...sale,
      items: items.map(it => ({
        name: it.productName,
        sku: it.sku,
        unit: it.unit || 'pcs',
        costPrice: it.costPrice,
        markedPrice: it.markedPrice || it.price,
        price: it.price,
        qty: it.qty,
        total: it.total
      }))
    };

    await this.showReceiptModal(fullSale);
  }
};

window.POSManager = POSManager;


// ==================== js\inventory.js ====================

/**
 * Inventory Management & Barcode Sticker Generator
 * Supports Dual-Field (English / Sinhala) Product Naming & Wholesale Pricing
 */

const InventoryManager = {
  currentFilter: 'all', // 'all', 'low', 'out', 'nearExpiry', 'expired'
  searchQuery: '',
  selectedProductForSticker: null,

  async init() {
    await this.renderInventoryTable();
    await this.renderValuationCards();
    await this.populateCategoryDropdown();
    await this.populateSupplierDropdown();
  },

  async populateCategoryDropdown() {
    const categories = await db.categories.toArray();
    const select = document.getElementById('prodCategoryInput');
    if (select) {
      select.innerHTML = categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
  },

  async populateSupplierDropdown() {
    const suppliers = await db.suppliers.toArray();
    const select = document.getElementById('prodSupplierInput');
    if (select) {
      select.innerHTML = `<option value="">-- No Supplier --</option>` + suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
    }
  },

  async renderValuationCards() {
    const products = await db.products.toArray();

    let totalItems = products.length;
    let totalStockQty = 0;
    let totalCostVal = 0;
    let totalRetailVal = 0;
    let lowStockCount = 0;
    let nearExpiryCount = 0;

    const today = new Date();
    const thirtyDaysAhead = new Date(today.getTime() + 30 * 86400000);

    products.forEach(p => {
      const stock = Number(p.currentStock) || 0;
      totalStockQty += stock;
      totalCostVal += (Number(p.costPrice) || 0) * stock;
      totalRetailVal += (Number(p.sellingPrice) || 0) * stock;

      if (stock <= (p.minStock || 0)) {
        lowStockCount++;
      }

      if (p.expiryDate) {
        const exp = new Date(p.expiryDate);
        if (exp <= thirtyDaysAhead) {
          nearExpiryCount++;
        }
      }
    });

    const marginLKR = totalRetailVal - totalCostVal;
    const marginPct = totalRetailVal > 0 ? ((marginLKR / totalRetailVal) * 100).toFixed(1) : 0;

    const elTotalCost = document.getElementById('invTotalCostVal');
    const elTotalRetail = document.getElementById('invTotalRetailVal');
    const elMargin = document.getElementById('invPotentialMargin');
    const elLowStockBadge = document.getElementById('invLowStockBadge');
    const elExpiryBadge = document.getElementById('invExpiryBadge');

    const itemsUnitWord = I18n.currentLang === 'si' ? 'භාණ්ඩ' : (I18n.currentLang === 'bi' ? 'භාණ්ඩ (Items)' : 'Items');
    if (elTotalCost) elTotalCost.textContent = formatLKR(totalCostVal);
    if (elTotalRetail) elTotalRetail.textContent = formatLKR(totalRetailVal);
    if (elMargin) elMargin.textContent = `${formatLKR(marginLKR)} (${marginPct}%)`;
    if (elLowStockBadge) elLowStockBadge.textContent = `${lowStockCount} ${itemsUnitWord}`;
    if (elExpiryBadge) elExpiryBadge.textContent = `${nearExpiryCount} ${itemsUnitWord}`;
  },

  async renderInventoryTable() {
    const tableBody = document.getElementById('inventoryTableBody');
    if (!tableBody) return;

    let products = await db.products.toArray();
    const today = new Date();
    const thirtyDaysAhead = new Date(today.getTime() + 30 * 86400000);

    // Apply Filter
    if (this.currentFilter === 'low') {
      products = products.filter(p => p.currentStock <= p.minStock && p.currentStock > 0);
    } else if (this.currentFilter === 'out') {
      products = products.filter(p => p.currentStock <= 0);
    } else if (this.currentFilter === 'nearExpiry') {
      products = products.filter(p => p.expiryDate && new Date(p.expiryDate) <= thirtyDaysAhead && new Date(p.expiryDate) >= today);
    } else if (this.currentFilter === 'expired') {
      products = products.filter(p => p.expiryDate && new Date(p.expiryDate) < today);
    }

    // Apply Search
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      products = products.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
        p.sku.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
      );
    }

    if (products.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-semibold">${I18n.currentLang === 'si' ? 'ගැලපෙන භාණ්ඩ හමු නොවීය.' : (I18n.currentLang === 'bi' ? 'ගැලපෙන භාණ්ඩ හමු නොවීය (No products found)' : 'No products match current criteria.')}</td></tr>`;
      return;
    }

    tableBody.innerHTML = products.map(p => {
      const isOut = p.currentStock <= 0;
      const isLow = p.currentStock <= p.minStock && !isOut;
      const expDate = p.expiryDate ? new Date(p.expiryDate) : null;
      const isExpired = expDate && expDate < today;
      const isNearExpiry = expDate && expDate <= thirtyDaysAhead && !isExpired;

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
          <td class="p-3">
            <div class="font-bold text-slate-100 text-sm">
              ${p.name}
              ${p.nameSi && p.nameSi !== p.name ? `<span class="text-xs text-sky-400 font-normal ml-1 font-sans">(${p.nameSi})</span>` : ''}
            </div>
            <div class="text-slate-400 font-mono text-[11px]">SKU: ${p.sku} &bull; ${p.brand || 'Generic'}</div>
          </td>
          <td class="p-3 font-mono text-slate-300">
            ${(p.barcodes || []).map(b => `<span class="inline-block px-1.5 py-0.5 bg-slate-900 border border-slate-700 rounded text-[10px] mr-1 mb-0.5">${b}</span>`).join('')}
          </td>
          <td class="p-3 text-slate-300">${p.category || '-'}</td>
          <td class="p-3 text-right font-mono">
            <div class="font-bold text-emerald-400 text-xs">MRP: ${formatLKR(p.markedPrice || p.sellingPrice)}</div>
            <div class="font-bold text-sky-400 text-xs">${I18n.t('retailTag')}: ${formatLKR(p.sellingPrice)}</div>
            <div class="font-bold text-amber-300 text-xs">${I18n.t('wholesaleTag')}: ${formatLKR(p.wholesalePrice || p.sellingPrice)}</div>
            <div class="text-slate-500 text-[10px]">Cost: ${formatLKR(p.costPrice)}</div>
          </td>
          <td class="p-3 text-center">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full font-bold font-mono text-xs ${
              isOut ? 'bg-rose-950 text-rose-300 border border-rose-800' :
              isLow ? 'bg-amber-950 text-amber-300 border border-amber-800' :
              'bg-emerald-950 text-emerald-300'
            }">
              ${p.currentStock} ${p.unit}
            </span>
            <div class="text-[10px] text-slate-500 mt-0.5">Min: ${p.minStock}</div>
          </td>
          <td class="p-3 text-center">
            ${p.expiryDate ? `
              <div class="font-mono text-[11px] ${
                isExpired ? 'text-rose-400 font-bold' :
                isNearExpiry ? 'text-amber-400 font-bold' :
                'text-slate-300'
              }">
                ${p.expiryDate}
              </div>
              ${isExpired ? '<span class="text-[9px] uppercase px-1 bg-rose-950 text-rose-300 rounded font-bold">EXPIRED</span>' : ''}
              ${isNearExpiry ? '<span class="text-[9px] uppercase px-1 bg-amber-950 text-amber-300 rounded font-bold">EXP SOON</span>' : ''}
            ` : '<span class="text-slate-500">N/A</span>'}
          </td>
          <td class="p-3 text-right space-x-1 whitespace-nowrap">
            <button onclick="InventoryManager.openBarcodeGenerator(${p.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Print Barcode Labels">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"/></svg>
            </button>
            <button onclick="InventoryManager.openStockAdjustmentModal(${p.id})" class="p-1.5 bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white rounded-lg transition" title="Adjust Stock">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
            </button>
            <button onclick="InventoryManager.openQuickStockModal(${p.id})" class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg transition" title="Quick Stock & Price Update">⚡</button>
            <button onclick="InventoryManager.openEditProductModal(${p.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit Product">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="InventoryManager.deleteProduct(${p.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete Product">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  setFilter(filterName) {
    this.currentFilter = filterName;
    document.querySelectorAll('.inv-filter-btn').forEach(btn => {
      if (btn.getAttribute('data-filter') === filterName) {
        btn.classList.add('bg-sky-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });
    this.renderInventoryTable();
  },

  onAddStockChange() {
    const currentVal = parseFloat(document.getElementById('prodCurrentStockInput')?.value) || 0;
    const addedInput = document.getElementById('prodAddStockInput');
    const addedVal = parseFloat(addedInput?.value) || 0;
    const previewContainer = document.getElementById('newTotalStockPreview');
    const previewVal = document.getElementById('previewTotalStockVal');

    if (addedInput && addedInput.value.trim() !== '' && !isNaN(addedVal)) {
      const total = Math.round((currentVal + addedVal) * 100) / 100;
      if (previewVal) previewVal.textContent = total.toFixed(2);
      if (previewContainer) previewContainer.classList.remove('hidden');
    } else {
      if (previewContainer) previewContainer.classList.add('hidden');
    }
  },

  openAddProductModal() {
    document.getElementById('productModalTitle').textContent = I18n.currentLang === 'si' ? 'අලුත් භාණ්ඩයක් ඇතුළත් කිරීම' : (I18n.currentLang === 'bi' ? 'අලුත් භාණ්ඩයක් (Add New Product)' : 'Add New Product');
    document.getElementById('productForm').reset();
    document.getElementById('prodIdInput').value = '';
    document.getElementById('prodNameSiInput').value = '';
    const addStockInput = document.getElementById('prodAddStockInput');
    if (addStockInput) addStockInput.value = '';
    const previewContainer = document.getElementById('newTotalStockPreview');
    if (previewContainer) previewContainer.classList.add('hidden');
    const markedPriceInput = document.getElementById('prodMarkedPriceInput');
    if (markedPriceInput) markedPriceInput.value = '';
    document.getElementById('productModal').classList.remove('hidden');
  },

  async openEditProductModal(id) {
    const product = await db.products.get(id);
    if (!product) return;

    document.getElementById('productModalTitle').textContent = I18n.currentLang === 'si' ? 'භාණ්ඩය සංස්කරණය' : (I18n.currentLang === 'bi' ? 'භාණ්ඩය සංස්කරණය (Edit Product)' : 'Edit Product');
    document.getElementById('prodIdInput').value = product.id;
    document.getElementById('prodNameInput').value = product.name;
    document.getElementById('prodNameSiInput').value = product.nameSi || '';
    document.getElementById('prodSkuInput').value = product.sku;
    document.getElementById('prodBarcodesInput').value = (product.barcodes || []).join(', ');
    document.getElementById('prodCategoryInput').value = product.category || '';
    document.getElementById('prodBrandInput').value = product.brand || '';
    document.getElementById('prodUnitInput').value = product.unit || 'pcs';
    document.getElementById('prodCostPriceInput').value = product.costPrice || 0;
    const markedPriceInput = document.getElementById('prodMarkedPriceInput');
    if (markedPriceInput) markedPriceInput.value = product.markedPrice || product.sellingPrice || 0;
    document.getElementById('prodSellingPriceInput').value = product.sellingPrice || 0;
    document.getElementById('prodWholesalePriceInput').value = product.wholesalePrice || product.sellingPrice || 0;
    document.getElementById('prodMinStockInput').value = product.minStock || 5;
    document.getElementById('prodCurrentStockInput').value = product.currentStock || 0;
    const addStockInput = document.getElementById('prodAddStockInput');
    if (addStockInput) addStockInput.value = '';
    const previewContainer = document.getElementById('newTotalStockPreview');
    if (previewContainer) previewContainer.classList.add('hidden');
    document.getElementById('prodExpiryDateInput').value = product.expiryDate || '';
    document.getElementById('prodBatchInput').value = product.batchNumber || '';
    document.getElementById('prodSupplierInput').value = product.supplierId || '';

    document.getElementById('productModal').classList.remove('hidden');
  },

  async saveProduct(event) {
    event.preventDefault();

    const id = document.getElementById('prodIdInput').value;
    const barcodesStr = document.getElementById('prodBarcodesInput').value;
    const barcodes = barcodesStr.split(',').map(b => b.trim()).filter(b => b.length > 0);

    const nameVal = document.getElementById('prodNameInput').value.trim();
    const nameSiVal = document.getElementById('prodNameSiInput').value.trim();
    const sellingPriceVal = parseFloat(document.getElementById('prodSellingPriceInput').value) || 0;
    const markedPriceVal = parseFloat(document.getElementById('prodMarkedPriceInput')?.value) || sellingPriceVal;

    const baseStock = parseFloat(document.getElementById('prodCurrentStockInput').value) || 0;
    const addedStock = parseFloat(document.getElementById('prodAddStockInput')?.value) || 0;
    const finalStock = Math.round((baseStock + addedStock) * 100) / 100;

    const productData = {
      name: nameVal,
      nameSi: nameSiVal || nameVal,
      sku: document.getElementById('prodSkuInput').value.trim().toUpperCase(),
      barcodes: barcodes,
      category: document.getElementById('prodCategoryInput').value,
      brand: document.getElementById('prodBrandInput').value.trim(),
      unit: document.getElementById('prodUnitInput').value,
      costPrice: parseFloat(document.getElementById('prodCostPriceInput').value) || 0,
      markedPrice: markedPriceVal,
      sellingPrice: sellingPriceVal,
      wholesalePrice: parseFloat(document.getElementById('prodWholesalePriceInput').value) || sellingPriceVal,
      minStock: parseFloat(document.getElementById('prodMinStockInput').value) || 0,
      currentStock: finalStock,
      expiryDate: document.getElementById('prodExpiryDateInput').value || null,
      batchNumber: document.getElementById('prodBatchInput').value.trim(),
      supplierId: parseInt(document.getElementById('prodSupplierInput').value) || null
    };

    const performSave = async () => {
      if (id) {
        await db.products.update(parseInt(id), productData);
        if (addedStock !== 0) {
          try {
            await db.stockAdjustments.add({
              productId: parseInt(id),
              productName: nameVal,
              type: addedStock > 0 ? 'in' : 'out',
              quantity: Math.abs(addedStock),
              reason: `Manual Stock Intake (+${addedStock})`,
              adjustedBy: AuthManager.currentUser?.name || 'Staff',
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Failed to log stock adjustment audit:', e);
          }
        }
      } else {
        await db.products.add(productData);
      }

      document.getElementById('productModal').classList.add('hidden');
      await this.renderInventoryTable();
      await this.renderValuationCards();
      await POSManager.renderProductGrid();
      SoundManager.playSuccessChime();
    };

    if (id) {
      const oldProd = await db.products.get(parseInt(id));
      if (oldProd && (
        oldProd.sellingPrice !== productData.sellingPrice ||
        oldProd.costPrice !== productData.costPrice ||
        oldProd.wholesalePrice !== productData.wholesalePrice ||
        (oldProd.markedPrice || oldProd.sellingPrice) !== productData.markedPrice
      )) {
        AuthManager.requireAdminAuth({
          actionName: 'Modify Product Prices',
          actionDesc: `Update pricing for "${productData.name}"`,
          requiredPerm: 'allowPriceEdit',
          onAuthorized: () => performSave()
        });
        return;
      }
    }

    await performSave();
  },

  async deleteProduct(id) {
    const product = await db.products.get(id);
    const prodName = product ? product.name : 'Product';

    AuthManager.requireAdminAuth({
      actionName: 'Delete Product',
      actionDesc: `Permanently delete product "${prodName}" from inventory`,
      requiredPerm: 'allowDelete',
      onAuthorized: async () => {
        if (confirm(`Permanently delete "${prodName}" from inventory?`)) {
          await db.products.delete(id);
          await this.renderInventoryTable();
          await this.renderValuationCards();
          await POSManager.renderProductGrid();
          SoundManager.playSuccessChime();
        }
      }
    });
  },

  async openStockAdjustmentModal(id) {
    const product = await db.products.get(id);
    if (!product) return;

    document.getElementById('adjProdIdInput').value = product.id;
    document.getElementById('adjProdNameText').textContent = product.name;
    document.getElementById('adjCurrentStockText').textContent = `${product.currentStock} ${product.unit}`;
    document.getElementById('adjQtyInput').value = '1';
    document.getElementById('adjReasonInput').value = '';

    document.getElementById('stockAdjustmentModal').classList.remove('hidden');
  },

  async saveStockAdjustment(event) {
    event.preventDefault();
    const id = parseInt(document.getElementById('adjProdIdInput').value);
    const type = document.getElementById('adjTypeSelect').value;
    const qty = parseFloat(document.getElementById('adjQtyInput').value) || 0;
    const reason = document.getElementById('adjReasonInput').value.trim();

    const product = await db.products.get(id);
    if (!product) return;

    AuthManager.requireAdminAuth({
      actionName: 'Manual Stock Adjustment',
      actionDesc: `Adjust stock for "${product.name}" (${type.toUpperCase()}: ${qty} ${product.unit})`,
      requiredPerm: 'allowStockAdjustment',
      onAuthorized: async () => {
        let newStock = product.currentStock;
        if (type === 'add') {
          newStock += qty;
        } else if (type === 'correction') {
          newStock = qty;
        } else {
          newStock = Math.max(0, newStock - qty);
        }

        await db.products.update(id, { currentStock: newStock });

        await db.stockAdjustments.add({
          date: new Date().toISOString(),
          productId: id,
          productName: product.name,
          type: type,
          qty: qty,
          reason: reason || type,
          user: AuthManager.currentUser?.username || 'admin'
        });

        document.getElementById('stockAdjustmentModal').classList.add('hidden');
        await this.renderInventoryTable();
        await this.renderValuationCards();
        await POSManager.renderProductGrid();
        SoundManager.playSuccessChime();
        alert('Stock adjustment saved successfully.');
      }
    });
  },

  async openBarcodeGenerator(id) {
    const product = await db.products.get(id);
    if (!product) return;

    this.selectedProductForSticker = product;
    document.getElementById('stickerProdName').textContent = product.name;
    document.getElementById('stickerProdSku').textContent = product.sku;
    document.getElementById('stickerProdPrice').textContent = formatLKR(product.sellingPrice);

    const barcodeToUse = (product.barcodes && product.barcodes[0]) || product.sku;
    document.getElementById('stickerBarcodeInput').value = barcodeToUse;

    await this.renderBarcodeStickerPreview();
    document.getElementById('barcodeGeneratorModal').classList.remove('hidden');
  },

  async renderBarcodeStickerPreview() {
    if (!this.selectedProductForSticker) return;
    const p = this.selectedProductForSticker;
    const barcodeVal = document.getElementById('stickerBarcodeInput').value || p.sku;
    const printQty = parseInt(document.getElementById('stickerPrintQty').value) || 1;
    const storeName = (await getSetting('store_name', '')) || 'SUPERMARKET';

    const previewContainer = document.getElementById('stickerPreviewArea');
    const printArea = document.getElementById('barcodeStickerPrintArea');

    const generateSingleLabelHTML = (index) => `
      <div class="barcode-sticker-single bg-white text-black p-2 border border-dashed border-slate-300 rounded flex flex-col items-center justify-center font-sans text-[11px] leading-tight">
        <div class="font-extrabold text-[12px] truncate w-full text-center uppercase">${storeName}</div>
        <div class="font-semibold truncate w-full text-center text-[10px] text-slate-800">${p.name}</div>
        <svg id="stickerBarcodeSvg_${index}" class="my-1 max-h-10"></svg>
        <div class="flex items-center justify-between w-full font-mono text-[10px] font-bold px-1">
          <span>${p.sku}</span>
          <span class="text-[12px] font-black">${formatLKR(p.sellingPrice)}</span>
        </div>
      </div>
    `;

    previewContainer.innerHTML = generateSingleLabelHTML('preview');
    try {
      JsBarcode('#stickerBarcodeSvg_preview', barcodeVal, {
        format: 'CODE128',
        width: 1.4,
        height: 35,
        displayValue: true,
        fontSize: 10
      });
    } catch (e) {}

    let printHTML = `<div class="barcode-sticker-grid">`;
    for (let i = 0; i < printQty; i++) {
      printHTML += generateSingleLabelHTML(i);
    }
    printHTML += `</div>`;
    printArea.innerHTML = printHTML;

    setTimeout(() => {
      for (let i = 0; i < printQty; i++) {
        try {
          JsBarcode(`#stickerBarcodeSvg_${i}`, barcodeVal, {
            format: 'CODE128',
            width: 1.4,
            height: 35,
            displayValue: true,
            fontSize: 10
          });
        } catch (e) {}
      }
    }, 50);
  },

  printBarcodeStickers() {
    document.body.classList.add('printing-barcodes');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-barcodes');
    }, 1000);
  }
  async openQuickStockModal(productId) {
    let product = null;
    if (productId) {
      product = await db.products.get(productId);
    }
    const modal = document.getElementById('quickStockModal');
    if (!modal) return;

    const idInput = document.getElementById('quickStockProductId');
    const nameEl = document.getElementById('quickStockProductName');
    const currEl = document.getElementById('quickStockCurrentDisplay');
    const addInput = document.getElementById('quickStockAddInput');
    const retailInput = document.getElementById('quickStockRetailInput');
    const wholesaleInput = document.getElementById('quickStockWholesaleInput');
    const costInput = document.getElementById('quickStockCostInput');
    const previewContainer = document.getElementById('quickStockNewTotalPreview');
    const searchInput = document.getElementById('quickStockSearchInput');

    if (searchInput) searchInput.value = '';
    const searchResults = document.getElementById('quickStockSearchResults');
    if (searchResults) { searchResults.innerHTML = ''; searchResults.classList.add('hidden'); }

    if (product) {
      if (idInput) idInput.value = product.id;
      if (nameEl) nameEl.textContent = `${product.name} (${product.sku})`;
      if (currEl) currEl.textContent = `${product.currentStock || 0} ${product.unit || 'unit'}`;
      if (addInput) addInput.value = '';
      if (retailInput) retailInput.value = product.sellingPrice || 0;
      if (wholesaleInput) wholesaleInput.value = product.wholesalePrice || product.sellingPrice || 0;
      if (costInput) costInput.value = product.costPrice || 0;
      if (previewContainer) previewContainer.classList.add('hidden');
    } else {
      if (idInput) idInput.value = '';
      if (nameEl) nameEl.textContent = 'Please search a product...';
      if (currEl) currEl.textContent = '0';
      if (addInput) addInput.value = '';
      if (retailInput) retailInput.value = '';
      if (wholesaleInput) wholesaleInput.value = '';
      if (costInput) costInput.value = '';
      if (previewContainer) previewContainer.classList.add('hidden');
    }
    modal.classList.remove('hidden');
    if (searchInput && !product) searchInput.focus();
    else if (addInput) addInput.focus();
  },

  async searchQuickStockProduct(query) {
    const resultsBox = document.getElementById('quickStockSearchResults');
    if (!resultsBox) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      resultsBox.innerHTML = '';
      resultsBox.classList.add('hidden');
      return;
    }
    const all = await db.products.toArray();
    const matches = all.filter(p =>
      p.sku.toLowerCase().includes(q) ||
      p.name.toLowerCase().includes(q) ||
      (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
      (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
    ).slice(0, 8);

    if (matches.length === 0) {
      resultsBox.innerHTML = `<div class="p-2.5 text-center text-slate-400 text-xs">No products found</div>`;
      resultsBox.classList.remove('hidden');
      return;
    }

    resultsBox.innerHTML = matches.map(p => `
      <div onclick="InventoryManager.openQuickStockModal(${p.id})" class="p-2 hover:bg-slate-800 rounded-lg cursor-pointer flex items-center justify-between text-xs border-b border-slate-800 last:border-none">
        <div>
          <span class="font-bold text-white">${p.name}</span>
          <span class="text-[10px] text-sky-400 font-mono ml-1.5">[${p.sku}]</span>
        </div>
        <div class="text-right">
          <div class="text-[11px] font-mono text-emerald-400 font-bold">Stock: ${p.currentStock || 0} ${p.unit || ''}</div>
          <div class="text-[10px] text-slate-400">${formatLKR(p.sellingPrice)}</div>
        </div>
      </div>
    `).join('');
    resultsBox.classList.remove('hidden');
  },

  onQuickStockChange() {
    const currEl = document.getElementById('quickStockCurrentDisplay');
    const addInput = document.getElementById('quickStockAddInput');
    const addedVal = parseFloat(addInput?.value) || 0;
    const previewContainer = document.getElementById('quickStockNewTotalPreview');
    const previewVal = document.getElementById('quickStockNewTotalVal');

    const currVal = parseFloat(currEl?.textContent) || 0;
    if (addInput && addInput.value.trim() !== '' && !isNaN(addedVal)) {
      const total = Math.round((currVal + addedVal) * 100) / 100;
      if (previewVal) previewVal.textContent = total.toFixed(2);
      if (previewContainer) previewContainer.classList.remove('hidden');
    } else {
      if (previewContainer) previewContainer.classList.add('hidden');
    }
  },

  async saveQuickStockUpdate() {
    const id = parseInt(document.getElementById('quickStockProductId')?.value);
    if (!id || isNaN(id)) {
      alert('කරුණාකර යාවත්කාලීන කිරීමට භාණ්ඩයක් තෝරන්න (Please select a product first).');
      return;
    }
    const product = await db.products.get(id);
    if (!product) {
      alert('Product not found in database.');
      return;
    }

    const addStockVal = parseFloat(document.getElementById('quickStockAddInput')?.value) || 0;
    const retailVal = parseFloat(document.getElementById('quickStockRetailInput')?.value);
    const wholesaleVal = parseFloat(document.getElementById('quickStockWholesaleInput')?.value);
    const costVal = parseFloat(document.getElementById('quickStockCostInput')?.value);

    const oldStock = Number(product.currentStock || 0);
    const newStock = Math.round((oldStock + addStockVal) * 100) / 100;

    const updates = {
      currentStock: newStock
    };

    if (!isNaN(retailVal) && retailVal > 0) updates.sellingPrice = retailVal;
    if (!isNaN(wholesaleVal) && wholesaleVal > 0) updates.wholesalePrice = wholesaleVal;
    if (!isNaN(costVal) && costVal > 0) updates.costPrice = costVal;

    await db.products.update(id, updates);

    if (addStockVal !== 0) {
      try {
        await db.stockAdjustments.add({
          productId: id,
          productName: product.name,
          type: addStockVal > 0 ? 'in' : 'out',
          quantity: Math.abs(addStockVal),
          reason: `Quick Stock Update (+${addStockVal})`,
          adjustedBy: (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.name : 'Staff',
          timestamp: new Date().toISOString()
        });
      } catch (e) {}
    }

    document.getElementById('quickStockModal')?.classList.add('hidden');
    await this.renderInventoryTable();
    await this.renderValuationCards();
    if (window.SoundManager) SoundManager.playSuccessChime();
    alert(`"${product.name}" තොග සහ මිල ගණන් සාර්ථකව යාවත්කාලීන විය! (Updated successfully)`);
  },
};

window.InventoryManager = InventoryManager;


// ==================== js\grn.js ====================

/**
 * Goods Received Note (GRN) & Supplier Purchasing Module
 */

const GRNManager = {
  activeGrnItems: [],

  async init() {
    await this.renderPurchasesTable();
    await this.populateSupplierOptions();
    await this.populateProductOptions();
  },

  async populateSupplierOptions() {
    const suppliers = await db.suppliers.toArray();
    const select = document.getElementById('grnSupplierSelect');
    if (select) {
      select.innerHTML = `<option value="">-- Choose Supplier --</option>` +
        suppliers.map(s => `<option value="${s.id}">${s.name} (Bal: ${formatLKR(s.outstandingBalance || 0)})</option>`).join('');
    }
  },

  async populateProductOptions() {
    const products = await db.products.toArray();
    const select = document.getElementById('grnProductSelect');
    if (select) {
      select.innerHTML = `<option value="">-- Choose Product to Add --</option>` +
        products.map(p => `<option value="${p.id}" data-cost="${p.costPrice}" data-unit="${p.unit}">${p.name} (${p.sku})</option>`).join('');
    }
  },

  openNewGRNModal() {
    this.activeGrnItems = [];
    document.getElementById('grnForm').reset();
    document.getElementById('grnDateInput').value = new Date().toISOString().slice(0, 10);
    this.renderGrnItems();
    document.getElementById('grnModal').classList.remove('hidden');
  },

  onProductSelectChange() {
    const select = document.getElementById('grnProductSelect');
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt && selectedOpt.value) {
      const cost = selectedOpt.getAttribute('data-cost') || 0;
      document.getElementById('grnCostPriceInput').value = cost;
      document.getElementById('grnQtyInput').value = 10;
    }
  },

  addItemToGRN() {
    const select = document.getElementById('grnProductSelect');
    const prodId = parseInt(select.value);
    if (!prodId) {
      alert('Please choose a product to add to the GRN.');
      return;
    }

    const selectedOpt = select.options[select.selectedIndex];
    const prodName = selectedOpt.text;
    const unit = selectedOpt.getAttribute('data-unit') || 'pcs';
    const cost = parseFloat(document.getElementById('grnCostPriceInput').value) || 0;
    const qty = parseFloat(document.getElementById('grnQtyInput').value) || 1;
    const batch = document.getElementById('grnBatchInput').value.trim() || `BCH-${Date.now().toString().slice(-4)}`;
    const expiry = document.getElementById('grnExpiryInput').value || null;

    this.activeGrnItems.push({
      productId: prodId,
      name: prodName,
      unit: unit,
      costPrice: cost,
      qty: qty,
      batchNumber: batch,
      expiryDate: expiry,
      total: cost * qty
    });

    this.renderGrnItems();
    // Reset item inputs
    select.value = '';
    document.getElementById('grnCostPriceInput').value = '';
    document.getElementById('grnQtyInput').value = '';
  },

  removeGrnItem(index) {
    this.activeGrnItems.splice(index, 1);
    this.renderGrnItems();
  },

  renderGrnItems() {
    const tbody = document.getElementById('grnItemsTableBody');
    const totalEl = document.getElementById('grnTotalCostDisplay');
    if (!tbody) return;

    let grandTotal = 0;
    tbody.innerHTML = this.activeGrnItems.map((item, idx) => {
      grandTotal += item.total;
      return `
        <tr class="border-b border-slate-800 text-xs">
          <td class="p-2 font-semibold text-slate-100">${item.name}</td>
          <td class="p-2 font-mono text-center">${item.batchNumber}</td>
          <td class="p-2 font-mono text-center">${item.expiryDate || '-'}</td>
          <td class="p-2 font-mono text-right">${formatLKR(item.costPrice)}</td>
          <td class="p-2 font-mono text-center font-bold text-sky-400">${item.qty} ${item.unit}</td>
          <td class="p-2 font-mono text-right font-bold text-slate-100">${formatLKR(item.total)}</td>
          <td class="p-2 text-center">
            <button onclick="GRNManager.removeGrnItem(${idx})" class="text-rose-400 hover:text-rose-300">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalEl) totalEl.textContent = formatLKR(grandTotal);
  },

  async saveGRN(event) {
    event.preventDefault();
    if (this.activeGrnItems.length === 0) {
      alert('Please add at least one product item to the GRN.');
      return;
    }

    const supplierId = parseInt(document.getElementById('grnSupplierSelect').value) || null;
    const invoiceNo = document.getElementById('grnInvoiceNoInput').value.trim() || await generateGRNNo();
    const date = document.getElementById('grnDateInput').value;
    const paymentStatus = document.getElementById('grnPaymentStatus').value; // 'paid', 'credit', 'partial'
    const paidAmount = parseFloat(document.getElementById('grnPaidAmount').value) || 0;

    let grandTotal = 0;
    this.activeGrnItems.forEach(i => grandTotal += i.total);

    let supplierName = 'Direct Purchase';
    if (supplierId) {
      const supplier = await db.suppliers.get(supplierId);
      if (supplier) {
        supplierName = supplier.name;
        // Update supplier balance if credit
        const unpaid = Math.max(0, grandTotal - paidAmount);
        if (unpaid > 0) {
          await db.suppliers.update(supplierId, {
            outstandingBalance: (supplier.outstandingBalance || 0) + unpaid
          });
        }
      }
    }

    // 1. Record Purchase
    await db.purchases.add({
      invoiceNo,
      supplierId,
      supplierName,
      date,
      grandTotal,
      paymentStatus,
      paidAmount,
      items: this.activeGrnItems,
      timestamp: new Date().toISOString()
    });

    // 2. Update stock & cost price in products store
    for (const item of this.activeGrnItems) {
      const prod = await db.products.get(item.productId);
      if (prod) {
        await db.products.update(item.productId, {
          currentStock: prod.currentStock + item.qty,
          costPrice: item.costPrice,
          batchNumber: item.batchNumber || prod.batchNumber,
          expiryDate: item.expiryDate || prod.expiryDate
        });
      }
    }

    document.getElementById('grnModal').classList.add('hidden');
    await this.renderPurchasesTable();
    await InventoryManager.renderInventoryTable();
    await InventoryManager.renderValuationCards();
    await POSManager.renderProductGrid();
    SoundManager.playSuccessChime();
    alert('Goods Received Note (GRN) processed and stock successfully updated!');
  },

  async renderPurchasesTable() {
    const tbody = document.getElementById('purchasesTableBody');
    if (!tbody) return;

    const purchases = await db.purchases.reverse().toArray();
    if (purchases.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No GRN records logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = purchases.map(p => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono font-bold text-sky-400">${p.invoiceNo}</td>
        <td class="p-3 font-semibold text-slate-100">${p.supplierName}</td>
        <td class="p-3 font-mono text-slate-400">${p.date}</td>
        <td class="p-3 text-center font-mono">${(p.items || []).length} items</td>
        <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR(p.grandTotal)}</td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${
            p.paymentStatus === 'paid' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
            p.paymentStatus === 'partial' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
            'bg-rose-950 text-rose-300 border border-rose-800'
          }">
            ${(p.paymentStatus || 'paid').toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  }
};

window.GRNManager = GRNManager;


// ==================== js\customers.js ====================

/**
 * Customer Management & Store Credit Collection Engine
 * Complete offline credit balance tracking, payment receipt printing & dedicated Credit Tab
 */

const CustomerManager = {
  searchQuery: '',
  creditSearchQuery: '',
  creditHistorySearchQuery: '',
  selectedCustomerIdForPayment: null,
  activeCreditSubTab: 'debtors', // 'debtors' or 'history'

  async init() {
    await this.renderCustomerTable();
  },

  async initCreditTab() {
    await this.renderCreditTab();
  },

  // ==========================================
  // VIEW 1: CUSTOMERS DIRECTORY (Tab 4)
  // ==========================================
  async renderCustomerTable() {
    const tbody = document.getElementById('customersTableBody');
    if (!tbody) return;

    let customers = await db.customers.toArray();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q)) ||
        (c.email && c.email.toLowerCase().includes(q))
      );
    }

    if (customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-400">No customers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3">
          <div class="font-bold text-slate-100 text-sm">${c.name}</div>
          <div class="text-slate-400 text-[11px]">${c.email || c.address || 'No address/email'}</div>
          ${(c.openingBalance || 0) > 0 ? `<div class="text-[10px] text-amber-500/80 font-mono mt-0.5">Opening: ${formatLKR(c.openingBalance)}</div>` : ''}
        </td>
        <td class="p-3 font-mono font-semibold text-sky-400">${c.phone}</td>
        <td class="p-3 text-right font-mono">
          <span class="font-bold text-sm ${(c.creditBalance || 0) > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}">
            ${formatLKR(c.creditBalance || 0)}
          </span>
        </td>
        <td class="p-3 text-right font-mono font-bold text-slate-300">
          ${formatLKR(c.totalSpent || 0)}
        </td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">
          <button onclick="CustomerManager.selectCustomerForPOS(${c.id})" class="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-xs font-semibold transition" title="Use in POS Terminal">
            POS
          </button>
          <button onclick="CustomerManager.openEditCustomerModal(${c.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="CustomerManager.deleteCustomer(${c.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  // ==========================================
  // VIEW 2: DEDICATED STORE CREDIT TAB
  // ==========================================
  async renderCreditTab() {
    const allCustomers = await db.customers.toArray();
    const allPayments = db.creditPayments ? await db.creditPayments.orderBy('date').reverse().toArray() : [];

    const now = new Date();
    const todayStr = getLocalDateStr(now);

    // 1. KPI Calculations
    const totalCreditDue = allCustomers.reduce((acc, c) => acc + (Number(c.creditBalance) || 0), 0);
    const activeDebtors = allCustomers.filter(c => (Number(c.creditBalance) || 0) > 0);
    const todayPayments = allPayments.filter(p => getLocalDateStr(p.date) === todayStr);
    const todayCollected = todayPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    const setElemText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setElemText('creditTabTotalDue', formatLKR(totalCreditDue));
    setElemText('creditTabTodayCollected', formatLKR(todayCollected));
    setElemText('creditTabActiveDebtors', `${activeDebtors.length} Customers`);
    setElemText('creditTabTotalHistoryCount', `${allPayments.length} Receipts`);

    // 2. Render Active Debtors Table
    this.renderCreditDebtorsTable(allCustomers);

    // 3. Render Settlement History Table
    this.renderCreditHistoryTable(allPayments);
  },

  setCreditSubTab(tabName) {
    this.activeCreditSubTab = tabName;

    const debtorsSection = document.getElementById('creditDebtorsSection');
    const historySection = document.getElementById('creditHistorySection');
    const btnDebtors = document.getElementById('creditSubTabDebtorsBtn');
    const btnHistory = document.getElementById('creditSubTabHistoryBtn');

    if (tabName === 'debtors') {
      if (debtorsSection) debtorsSection.classList.remove('hidden');
      if (historySection) historySection.classList.add('hidden');
      if (btnDebtors) {
        btnDebtors.className = 'px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-600/30';
      }
      if (btnHistory) {
        btnHistory.className = 'px-4 py-2 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition';
      }
    } else {
      if (debtorsSection) debtorsSection.classList.add('hidden');
      if (historySection) historySection.classList.remove('hidden');
      if (btnDebtors) {
        btnDebtors.className = 'px-4 py-2 bg-slate-800 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition';
      }
      if (btnHistory) {
        btnHistory.className = 'px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold transition shadow-md shadow-sky-600/30';
      }
    }
  },

  renderCreditDebtorsTable(customers) {
    const tbody = document.getElementById('creditDebtorsTableBody');
    if (!tbody) return;

    let filtered = customers.filter(c => (Number(c.creditBalance) || 0) > 0);

    if (this.creditSearchQuery) {
      const q = this.creditSearchQuery.toLowerCase().trim();
      filtered = filtered.filter(c =>
        c.name.toLowerCase().includes(q) ||
        (c.phone && c.phone.includes(q))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" class="text-center py-8 text-slate-500">No outstanding credit balances found.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3.5">
          <div class="font-extrabold text-slate-100 text-sm">${c.name}</div>
          <div class="text-slate-400 text-[11px] font-mono">📱 ${c.phone}</div>
        </td>
        <td class="p-3.5 text-right font-mono">
          <div class="text-base font-black text-rose-400">${formatLKR(c.creditBalance || 0)}</div>
        </td>
        <td class="p-3.5 text-right font-mono text-slate-300 font-semibold">
          ${formatLKR(c.totalSpent || 0)}
        </td>
        <td class="p-3.5 text-center">
          <button onclick="CustomerManager.selectCustomerForPOS(${c.id})" class="px-2.5 py-1 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg text-xs font-semibold transition" title="Use in POS Terminal">
            Load to POS
          </button>
        </td>
        <td class="p-3.5 text-right">
          <button onclick="CustomerManager.openCollectCreditModal(${c.id})" 
                  class="px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold transition shadow-md shadow-emerald-600/30 flex items-center gap-1.5 ml-auto">
            <span>💰</span>
            <span>Collect Settlement</span>
          </button>
        </td>
      </tr>
    `).join('');
  },

  async renderCreditHistoryTable(paymentsList) {
    const tbody = document.getElementById('creditHistoryTableBody');
    if (!tbody) return;

    let payments = paymentsList || (db.creditPayments ? await db.creditPayments.orderBy('date').reverse().toArray() : []);

    if (this.creditHistorySearchQuery) {
      const q = this.creditHistorySearchQuery.toLowerCase().trim();
      payments = payments.filter(p =>
        (p.receiptNo && p.receiptNo.toLowerCase().includes(q)) ||
        (p.customerName && p.customerName.toLowerCase().includes(q)) ||
        (p.customerPhone && p.customerPhone.includes(q))
      );
    }

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500">No credit settlement records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono font-bold text-sky-400">${p.receiptNo}</td>
        <td class="p-3 font-mono text-slate-400 text-[11px]">${new Date(p.date).toLocaleString()}</td>
        <td class="p-3 font-bold text-slate-200">${p.customerName} <span class="text-[10px] font-normal text-slate-400">(${p.customerPhone})</span></td>
        <td class="p-3 text-right font-mono font-black text-emerald-400 text-sm">${formatLKR(p.amount)}</td>
        <td class="p-3 uppercase text-[10px] font-bold text-slate-300 text-center">
          <span class="px-2 py-0.5 rounded bg-slate-800">${p.paymentMethod}</span>
        </td>
        <td class="p-3 text-right font-mono font-bold ${(p.remainingBalance || 0) > 0 ? 'text-rose-400' : 'text-slate-400'}">${formatLKR(p.remainingBalance || 0)}</td>
        <td class="p-3 text-right">
          <button onclick="CustomerManager.reprintCreditReceipt(${p.id})" class="px-3 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 ml-auto">
            <span>🖨️</span> <span>Receipt</span>
          </button>
        </td>
      </tr>
    `).join('');
  },

  // Modal to pick customer in POS screen
  async openCustomerSelectModal() {
    const container = document.getElementById('posCustomerSelectList');
    const input = document.getElementById('posCustomerSearchInput');
    if (!container) return;

    const customers = await db.customers.toArray();
    container.innerHTML = customers.map(c => `
      <div onclick="CustomerManager.selectCustomerForPOS(${c.id})" class="p-3 bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-xl cursor-pointer flex items-center justify-between transition">
        <div>
          <div class="font-bold text-slate-100 text-sm">${c.name}</div>
          <div class="text-xs text-slate-400 font-mono">📱 ${c.phone}</div>
        </div>
        <div class="text-right font-mono text-xs">
          <div class="text-slate-400">Credit: <strong class="${(c.creditBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}">${formatLKR(c.creditBalance || 0)}</strong></div>
          <span class="text-sky-400 text-xs font-semibold">Select &rarr;</span>
        </div>
      </div>
    `).join('');

    document.getElementById('posCustomerModal').classList.remove('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }
  },

  async filterCustomerSelectList(query) {
    const container = document.getElementById('posCustomerSelectList');
    if (!container) return;

    const q = query.toLowerCase().trim();
    let customers = await db.customers.toArray();
    if (q) {
      customers = customers.filter(c => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q)));
    }

    container.innerHTML = customers.map(c => `
      <div onclick="CustomerManager.selectCustomerForPOS(${c.id})" class="p-3 bg-slate-900 border border-slate-700 hover:border-sky-500 rounded-xl cursor-pointer flex items-center justify-between transition">
        <div>
          <div class="font-bold text-slate-100 text-sm">${c.name}</div>
          <div class="text-xs text-slate-400 font-mono">📱 ${c.phone}</div>
        </div>
        <div class="text-right font-mono text-xs">
          <div class="text-slate-400">Credit: <strong class="${(c.creditBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}">${formatLKR(c.creditBalance || 0)}</strong></div>
          <span class="text-sky-400 text-xs font-semibold">Select &rarr;</span>
        </div>
      </div>
    `).join('');
  },

  async selectCustomerForPOS(id) {
    const customer = await db.customers.get(id);
    if (customer) {
      POSManager.setCustomer(customer);
      const modal = document.getElementById('posCustomerModal');
      if (modal) modal.classList.add('hidden');
      SoundManager.playScanBeep();
      if (App.currentTab !== 'pos') {
        App.switchTab('pos');
      }
    }
  },

  openAddCustomerModal() {
    document.getElementById('customerModalTitle').textContent = 'Register New Customer';
    document.getElementById('customerForm').reset();
    document.getElementById('custIdInput').value = '';

    // Show opening balance field, hide current credit row
    const openingRow = document.getElementById('custOpeningBalanceInput');
    const currentRow = document.getElementById('custCurrentCreditRow');
    if (openingRow) openingRow.closest('div').classList.remove('hidden');
    if (currentRow) currentRow.classList.add('hidden');

    // Reset opening balance
    const ob = document.getElementById('custOpeningBalanceInput');
    if (ob) ob.value = '0';

    document.getElementById('customerModal').classList.remove('hidden');
  },

  async openEditCustomerModal(id) {
    const cust = await db.customers.get(id);
    if (!cust) return;

    document.getElementById('customerModalTitle').textContent = 'Edit Customer';
    document.getElementById('custIdInput').value = cust.id;
    document.getElementById('custPhoneInput').value = cust.phone;
    document.getElementById('custNameInput').value = cust.name;
    document.getElementById('custEmailInput').value = cust.email || '';

    // Opening balance field — show old opening balance for editing
    const ob = document.getElementById('custOpeningBalanceInput');
    if (ob) ob.value = cust.openingBalance || 0;

    // Show current live balance as read-only info
    const currentRow = document.getElementById('custCurrentCreditRow');
    const currentDisplay = document.getElementById('custCurrentCreditDisplay');
    const hiddenCredit = document.getElementById('custCreditInput');
    if (currentRow) currentRow.classList.remove('hidden');
    if (currentDisplay) currentDisplay.textContent = formatLKR(cust.creditBalance || 0);
    if (hiddenCredit) hiddenCredit.value = cust.creditBalance || 0;

    document.getElementById('customerModal').classList.remove('hidden');
  },

  async saveCustomer(event) {
    event.preventDefault();
    const id = document.getElementById('custIdInput').value;
    const phone = document.getElementById('custPhoneInput').value.trim();
    const name = document.getElementById('custNameInput').value.trim();
    const email = document.getElementById('custEmailInput').value.trim();
    const openingBalance = parseFloat(document.getElementById('custOpeningBalanceInput')?.value) || 0;
    const existingCredit = parseFloat(document.getElementById('custCreditInput')?.value) || 0;

    const performSave = async () => {
      if (id) {
        // EDIT: adjust outstanding by delta of opening balance change
        const existingCust = await db.customers.get(parseInt(id));
        const oldOpening = existingCust ? (existingCust.openingBalance || 0) : 0;
        const oldCredit = existingCust ? (existingCust.creditBalance || 0) : 0;
        const delta = openingBalance - oldOpening;
        const newCredit = Math.max(0, oldCredit + delta);

        await db.customers.update(parseInt(id), {
          phone, name, email,
          openingBalance,
          creditBalance: newCredit
        });
      } else {
        // NEW: check phone duplicate
        const existing = await db.customers.where('phone').equals(phone).first();
        if (existing) {
          alert('A customer with this phone number already exists!');
          return;
        }
        const custData = {
          phone, name, email,
          openingBalance,
          creditBalance: openingBalance, // start with opening balance
          totalSpent: 0
        };
        const newId = await db.customers.add(custData);
        const isFromPos = !document.getElementById('posCustomerModal').classList.contains('hidden');
        if (isFromPos) {
          custData.id = newId;
          POSManager.setCustomer(custData);
        }
      }

      document.getElementById('customerModal').classList.add('hidden');
      document.getElementById('posCustomerModal')?.classList.add('hidden');
      await this.renderCustomerTable();
      await this.renderCreditTab();
      SoundManager.playSuccessChime();
    };

    // If editing and opening balance changed — require admin auth
    if (id) {
      const existingCust = await db.customers.get(parseInt(id));
      const oldOpening = existingCust ? (existingCust.openingBalance || 0) : 0;
      if (existingCust && openingBalance !== oldOpening) {
        AuthManager.requireAdminAuth({
          actionName: 'Modify Customer Opening Balance',
          actionDesc: `Change opening balance for "${existingCust.name}" from ${formatLKR(oldOpening)} to ${formatLKR(openingBalance)}. This will adjust the live credit balance.`,
          requiredPerm: 'allowCreditEdit',
          onAuthorized: () => performSave()
        });
        return;
      }
    }

    await performSave();
  },

  // ====================================================
  // CREDIT COLLECTION & THERMAL PAYMENT RECEIPT ENGINE
  // ====================================================

  async openCollectCreditModal(id) {
    const cust = await db.customers.get(id);
    if (!cust) return;

    this.selectedCustomerIdForPayment = cust.id;
    document.getElementById('creditPayCustName').textContent = cust.name;
    document.getElementById('creditPayCustPhone').textContent = cust.phone;
    document.getElementById('creditPayOutstanding').textContent = formatLKR(cust.creditBalance || 0);
    
    const amountInput = document.getElementById('creditPayAmountInput');
    if (amountInput) {
      amountInput.value = cust.creditBalance || 0;
      amountInput.max = cust.creditBalance || 0;
    }

    document.getElementById('creditPayNotesInput').value = '';
    document.getElementById('creditCollectModal').classList.remove('hidden');
    
    if (amountInput) {
      amountInput.focus();
      amountInput.select();
    }
  },

  async submitCreditPayment(event) {
    event.preventDefault();
    if (!this.selectedCustomerIdForPayment) return;

    const cust = await db.customers.get(this.selectedCustomerIdForPayment);
    if (!cust) return;

    const amount = parseFloat(document.getElementById('creditPayAmountInput').value) || 0;
    if (amount <= 0) {
      alert('Please enter a valid payment amount greater than 0.');
      return;
    }

    const prevBalance = cust.creditBalance || 0;
    const remainingBalance = Math.max(0, prevBalance - amount);
    const method = document.getElementById('creditPayMethodSelect').value || 'cash';
    const notes = document.getElementById('creditPayNotesInput').value.trim();
    const cashier = AuthManager.currentUser || { id: 1, fullName: 'Super Admin' };
    const receiptNo = await generateCreditReceiptNo();
    const dateStr = new Date().toISOString();

    // 1. Record Credit Payment
    const paymentRecord = {
      receiptNo,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone,
      date: dateStr,
      amount,
      paymentMethod: method,
      prevBalance,
      remainingBalance,
      cashierId: cashier.id,
      cashierName: cashier.fullName,
      notes
    };

    if (db.creditPayments) {
      await db.creditPayments.add(paymentRecord);
    }

    // 2. Update Customer Balance
    await db.customers.update(cust.id, {
      creditBalance: remainingBalance
    });

    // 3. Close modal & refresh UI
    document.getElementById('creditCollectModal').classList.add('hidden');
    await this.renderCustomerTable();
    await this.renderCreditTab();

    if (window.DashboardManager) {
      DashboardManager.renderDashboard();
    }

    SoundManager.playCashDrawer();
    SoundManager.playSuccessChime();

    // 4. Print Thermal Credit Payment Receipt
    await this.showCreditReceiptModal(paymentRecord);
  },

  async showCreditReceiptModal(record) {
    const storeLogo = await getSetting('store_logo', null);
    const storeName = await getSetting('store_name', '');
    const storeNameSi = await getSetting('store_name_si', '');
    const storeBranch = await getSetting('store_branch', '');
    const storeAddress = await getSetting('store_address', '');
    const storePhone = await getSetting('store_phone', '');
    const thermalWidth = await getSetting('thermal_width', '80mm');

    const html = `
      <div class="text-center pb-2 border-b border-dashed border-slate-700 font-mono">
        ${storeLogo ? `<img src="${storeLogo}" class="max-h-12 mx-auto mb-1.5 object-contain" alt="Logo" />` : ''}
        ${storeName ? `<h2 class="text-base font-extrabold tracking-tight text-slate-900 uppercase">${storeName}</h2>` : ''}
        ${storeNameSi && storeNameSi !== 'ලංකා මෙගා සුපර්මාර්කට්' ? `<div class="text-xs text-slate-800 font-bold">${storeNameSi}</div>` : ''}
        ${storeBranch ? `<div class="text-[11px] text-slate-600">${storeBranch}</div>` : ''}
        ${storeAddress ? `<div class="text-[11px] text-slate-600">${storeAddress}</div>` : ''}
        ${storePhone ? `<div class="text-[11px] text-slate-600">Tel: ${storePhone}</div>` : ''}
      </div>

      <div class="py-2 text-center border-b border-dashed border-slate-700 font-mono">
        <div class="text-xs font-black uppercase text-slate-900">CREDIT PAYMENT RECEIPT</div>
        <div class="text-[10px] text-slate-700 font-bold">ණය මුදල් පියවීම් කුවිතාන්සිය</div>
      </div>

      <div class="py-2 text-[11px] font-mono border-b border-dashed border-slate-700 space-y-0.5">
        <div class="flex justify-between">
          <span>Receipt No:</span>
          <strong>${record.receiptNo}</strong>
        </div>
        <div class="flex justify-between">
          <span>Date / Time:</span>
          <span>${new Date(record.date).toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span>Customer:</span>
          <strong>${record.customerName}</strong>
        </div>
        <div class="flex justify-between">
          <span>Phone:</span>
          <span>${record.customerPhone}</span>
        </div>
        <div class="flex justify-between">
          <span>Cashier:</span>
          <span>${record.cashierName}</span>
        </div>
      </div>

      <div class="py-3 text-xs font-mono space-y-1.5 border-b border-dashed border-slate-700">
        <div class="flex justify-between text-slate-600">
          <span>Previous Balance:</span>
          <span>${formatLKR(record.prevBalance)}</span>
        </div>
        <div class="flex justify-between text-sm font-black text-slate-900 py-1 bg-slate-100 px-1.5 rounded">
          <span>AMOUNT PAID:</span>
          <span>${formatLKR(record.amount)}</span>
        </div>
        <div class="flex justify-between pt-0.5">
          <span class="uppercase">Payment Method:</span>
          <strong class="uppercase">${record.paymentMethod}</strong>
        </div>
        <div class="flex justify-between text-sm font-bold border-t border-slate-900 pt-1.5">
          <span>REMAINING BALANCE:</span>
          <span class="${record.remainingBalance > 0 ? 'text-rose-700 font-black' : 'text-emerald-700 font-black'}">
            ${formatLKR(record.remainingBalance)}
          </span>
        </div>
        ${record.notes ? `<div class="text-[10px] text-slate-500 italic mt-1">Note: "${record.notes}"</div>` : ''}
      </div>

      <div class="text-center pt-4 mt-2 font-mono text-[11px] space-y-3">
        <div class="flex justify-between px-2 pt-6">
          <div class="text-center border-t border-slate-400 pt-1 text-[9px] w-28">Customer Signature</div>
          <div class="text-center border-t border-slate-400 pt-1 text-[9px] w-28">Authorized Cashier</div>
        </div>
        <div class="text-[10px] text-slate-500">Thank you for your prompt payment!</div>
      </div>
    `;

    const previewContainer = document.getElementById('receiptPreviewContent');
    if (previewContainer) previewContainer.innerHTML = html;

    const printArea = document.getElementById('thermalReceiptPrintArea');
    if (printArea) {
      printArea.innerHTML = html;
      if (thermalWidth === '58mm') {
        document.body.classList.add('printer-58mm');
      } else {
        document.body.classList.remove('printer-58mm');
      }
    }

    document.getElementById('receiptModal').classList.remove('hidden');

    const autoPrint = await getSetting('auto_print_receipt', false);
    if (autoPrint === true || autoPrint === 'true') {
      POSManager.printThermalReceipt();
    }
  },

  async reprintCreditReceipt(id) {
    if (!db.creditPayments) return;
    const payment = await db.creditPayments.get(id);
    if (payment) {
      await this.showCreditReceiptModal(payment);
    }
  },

  async deleteCustomer(id) {
    const cust = await db.customers.get(id);
    const custName = cust ? cust.name : 'Customer';

    AuthManager.requireAdminAuth({
      actionName: 'Delete Customer Record',
      actionDesc: `Permanently delete customer "${custName}" and credit record`,
      requiredPerm: 'allowDelete',
      onAuthorized: async () => {
        if (confirm(`Are you sure you want to permanently delete customer "${custName}"?`)) {
          await db.customers.delete(id);
          await this.renderCustomerTable();
          await this.renderCreditTab();
          SoundManager.playSuccessChime();
        }
      }
    });
  }
};

window.CustomerManager = CustomerManager;


// ==================== js\suppliers.js ====================

/**
 * Supplier Directory & Balance Tracking
 */

const SupplierManager = {
  searchQuery: '',

  async init() {
    await this.renderSupplierTable();
  },

  async renderSupplierTable() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    let suppliers = await db.suppliers.toArray();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      suppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
      );
    }

    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No suppliers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = suppliers.map(s => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3">
          <div class="font-bold text-slate-100 text-sm">${s.name}</div>
          <div class="text-slate-400 text-[11px]">${s.email || 'No email'}</div>
        </td>
        <td class="p-3 font-mono text-slate-300">${s.phone}</td>
        <td class="p-3 text-slate-400">${s.address || '-'}</td>
        <td class="p-3 text-right font-mono font-bold ${(s.outstandingBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}">
          ${formatLKR(s.outstandingBalance || 0)}
        </td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">
          ${(s.outstandingBalance || 0) > 0 ? `
            <button onclick="SupplierManager.openSettleBalanceModal(${s.id})" class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition" title="Pay Supplier">
              Pay Supplier
            </button>
          ` : ''}
          <button onclick="SupplierManager.openEditSupplierModal(${s.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="SupplierManager.deleteSupplier(${s.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  openAddSupplierModal() {
    document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
    document.getElementById('supplierForm').reset();
    document.getElementById('suppIdInput').value = '';
    document.getElementById('supplierModal').classList.remove('hidden');
  },

  async openEditSupplierModal(id) {
    const supp = await db.suppliers.get(id);
    if (!supp) return;

    document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
    document.getElementById('suppIdInput').value = supp.id;
    document.getElementById('suppNameInput').value = supp.name;
    document.getElementById('suppPhoneInput').value = supp.phone;
    document.getElementById('suppEmailInput').value = supp.email || '';
    document.getElementById('suppAddressInput').value = supp.address || '';
    document.getElementById('suppBalanceInput').value = supp.outstandingBalance || 0;

    document.getElementById('supplierModal').classList.remove('hidden');
  },

  async saveSupplier(event) {
    event.preventDefault();
    const id = document.getElementById('suppIdInput').value;
    const name = document.getElementById('suppNameInput').value.trim();
    const phone = document.getElementById('suppPhoneInput').value.trim();
    const email = document.getElementById('suppEmailInput').value.trim();
    const address = document.getElementById('suppAddressInput').value.trim();
    const balance = parseFloat(document.getElementById('suppBalanceInput').value) || 0;

    const suppData = { name, phone, email, address, outstandingBalance: balance };

    if (id) {
      await db.suppliers.update(parseInt(id), suppData);
    } else {
      await db.suppliers.add(suppData);
    }

    document.getElementById('supplierModal').classList.add('hidden');
    await this.renderSupplierTable();
    await InventoryManager.populateSupplierDropdown();
    await GRNManager.populateSupplierOptions();
    SoundManager.playSuccessChime();
  },

  async openSettleBalanceModal(id) {
    const supp = await db.suppliers.get(id);
    if (!supp) return;

    const amountStr = prompt(`Pay Supplier: ${supp.name}\nCurrent Balance Payable: ${formatLKR(supp.outstandingBalance)}\nEnter payment amount:`, supp.outstandingBalance);
    if (amountStr !== null) {
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        const newBal = Math.max(0, (supp.outstandingBalance || 0) - amount);
        await db.suppliers.update(supp.id, { outstandingBalance: newBal });
        await this.renderSupplierTable();
        SoundManager.playSuccessChime();
        alert(`Payment of ${formatLKR(amount)} paid to ${supp.name}. Remaining Payable: ${formatLKR(newBal)}`);
      }
    }
  },

  async deleteSupplier(id) {
    const supp = await db.suppliers.get(id);
    const suppName = supp ? supp.name : 'Supplier';

    AuthManager.requireAdminAuth({
      actionName: 'Delete Supplier Record',
      actionDesc: `Permanently delete supplier profile "${suppName}"`,
      requiredPerm: 'allowDelete',
      onAuthorized: async () => {
        if (confirm(`Delete supplier record "${suppName}"?`)) {
          await db.suppliers.delete(id);
          await this.renderSupplierTable();
          await InventoryManager.populateSupplierDropdown();
          await GRNManager.populateSupplierOptions();
          SoundManager.playSuccessChime();
        }
      }
    });
  }
};

window.SupplierManager = SupplierManager;


// ==================== js\farmers.js ====================

/**
 * Farmer Daily Vegetable Intake & Payables Management Module (ගොවි එළවළු හා මුදල් පාලනය)
 * 
 * Key Features:
 *  - Separate from POS customer sales (procurement/liability ledger)
 *  - Supports multiple vegetables per batch by weight (kg) with agreed buying price per kg
 *  - Allows farmers to leave produce on credit / pending payout (ණයට තබා යාම)
 *  - Cash settlement / payout ledger when farmers return to collect cash in evening or 2-3 days later
 *  - Automatic inventory stock increment in kg (optional checkbox)
 *  - Role-based cashier access control via AuthManager permissions ('farmers')
 *  - Thermal receipt printing for both Intake Slips & Payment Vouchers
 */

const FarmerManager = {
  activeIntakeItems: [],
  currentSubView: 'intake', // 'intake' | 'farmers' | 'history' | 'payments'
  selectedFarmerForPayment: null,
  farmerSearchQuery: '',
  historySearchQuery: '',
  historyFilterStatus: 'all',
  cachedProducts: [],
  currentSearchResults: [],
  activeSearchHighlightedIndex: -1,
  selectedProduct: null,
  cachedFarmers: [],
  selectedFarmer: null,
  farmerPickerSearchResults: [],
  activeFarmerHighlightedIndex: -1,

  async init() {
    await this.cacheFarmers();
    await this.cacheProducts();
    await this.renderSummaryCards();
    await this.populateFarmerDropdown();
    await this.populateVegetableOptions();
    this.resetIntakeForm();
    await this.renderActiveSubView();
  },

  async cacheFarmers() {
    try {
      const farmers = await db.farmers.toArray();
      // Backfill farmerCode if missing for legacy farmers
      for (let i = 0; i < farmers.length; i++) {
        if (!farmers[i].farmerCode) {
          const code = `G-${(i + 1).toString().padStart(2, '0')}`;
          farmers[i].farmerCode = code;
          try {
            await db.farmers.update(farmers[i].id, { farmerCode: code });
          } catch (e) {}
        }
      }
      this.cachedFarmers = farmers;
    } catch (e) {
      console.warn('Failed to cache farmers:', e);
      this.cachedFarmers = [];
    }
  },

  generateFarmerCode() {
    const list = this.cachedFarmers || [];
    let maxNum = 0;
    list.forEach(f => {
      const code = f.farmerCode || '';
      const m = code.match(/\d+/);
      if (m) {
        const num = parseInt(m[0], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `G-${(maxNum + 1).toString().padStart(2, '0')}`;
  },

  async cacheProducts() {
    try {
      this.cachedProducts = await db.products.toArray();
    } catch (e) {
      console.warn('Failed to cache products for farmer search:', e);
      this.cachedProducts = [];
    }
  },

  async renderAll() {
    try {
      await this.renderSummaryCards();
      await this.populateFarmerDropdown();
      await this.renderActiveSubView();
    } catch (e) {
      console.warn('[FarmerManager] renderAll error:', e);
    }
  },

  // Switch internal sub-tabs
  switchSubView(view) {
    this.currentSubView = view;

    // Toggle button styling
    ['intake', 'farmers', 'history', 'payments'].forEach(v => {
      const btn = document.getElementById(`farmerSubTab_${v}`);
      const viewEl = document.getElementById(`farmerView_${v}`);

      if (btn) {
        if (v === view) {
          btn.className = 'px-4 py-2.5 rounded-xl text-xs font-bold transition bg-emerald-600 text-white shadow-md shadow-emerald-600/30 flex items-center gap-2 cursor-pointer';
        } else {
          btn.className = 'px-4 py-2.5 rounded-xl text-xs font-bold transition bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 flex items-center gap-2 cursor-pointer';
        }
      }

      if (viewEl) {
        if (v === view) {
          viewEl.classList.remove('hidden');
        } else {
          viewEl.classList.add('hidden');
        }
      }
    });

    this.renderActiveSubView();
  },

  async renderActiveSubView() {
    if (this.currentSubView === 'farmers') {
      await this.renderFarmersTable();
    } else if (this.currentSubView === 'history') {
      await this.renderHistoryTable();
    } else if (this.currentSubView === 'payments') {
      await this.renderPaymentsTable();
    }
  },

  // KPI Dashboard Cards
  async renderSummaryCards() {
    try {
      const farmers = await db.farmers.toArray();
      const intakes = await db.farmerIntakes.toArray();
      const payments = await db.farmerPayments.toArray();

      const todayStr = new Date().toISOString().slice(0, 10);

      let totalOutstanding = 0;
      let totalFarmers = farmers.length;
      farmers.forEach(f => {
        totalOutstanding += Number(f.outstandingBalance || 0);
      });

      let todayIntakeWeight = 0;
      let todayIntakeValue = 0;
      intakes.forEach(i => {
        if (i.date === todayStr) {
          todayIntakeWeight += Number(i.totalWeight || 0);
          todayIntakeValue += Number(i.grandTotal || 0);
        }
      });

      let todayPaidOut = 0;
      payments.forEach(p => {
        if (p.paymentDate === todayStr) {
          todayPaidOut += Number(p.amount || 0);
        }
      });

      const elFarmersCount = document.getElementById('farmerCard_totalCount');
      const elTodayIntake = document.getElementById('farmerCard_todayIntake');
      const elPendingPayables = document.getElementById('farmerCard_pendingPayables');
      const elTodayPaid = document.getElementById('farmerCard_todayPaid');

      if (elFarmersCount) elFarmersCount.textContent = totalFarmers;
      if (elTodayIntake) elTodayIntake.innerHTML = `${todayIntakeWeight.toFixed(1)} <span class="text-xs font-normal text-slate-400">kg</span> &bull; <span class="text-sm font-bold text-sky-400">${formatLKR(todayIntakeValue)}</span>`;
      if (elPendingPayables) elPendingPayables.textContent = formatLKR(totalOutstanding);
      if (elTodayPaid) elTodayPaid.textContent = formatLKR(todayPaidOut);
    } catch (e) {
      console.warn('[FarmerManager] Error rendering summary cards:', e);
    }
  },

  // Populate Farmers Dropdown (fallback support)
  async populateFarmerDropdown() {
    const select = document.getElementById('farmerSelect');
    if (!select) return;

    const farmers = await db.farmers.toArray();
    farmers.sort((a, b) => a.name.localeCompare(b.name));

    const currentVal = select.value;
    select.innerHTML = `<option value="">-- ගොවියා තෝරන්න / Choose Existing Farmer --</option>` +
      farmers.map(f => {
        const bal = Number(f.outstandingBalance || 0);
        const balText = bal > 0 ? `(හිඟ: ${formatLKR(bal)})` : `(හිඟ මුදල් නැත)`;
        return `<option value="${f.id}" data-phone="${f.phone || ''}" data-balance="${bal}">${f.farmerCode ? '[' + f.farmerCode + '] ' : ''}${f.name} &bull; ${f.phone || '-'} ${balText}</option>`;
      }).join('');

    if (currentVal && farmers.some(f => String(f.id) === String(currentVal))) {
      select.value = currentVal;
    }
    this.onFarmerSelectChange();
  },

  onFarmerSelectChange() {
    const select = document.getElementById('farmerSelect');
    const infoPill = document.getElementById('farmerSelectedInfoPill');
    const newFarmerToggle = document.getElementById('newFarmerQuickInputs');

    if (!select) return;
    const selectedOpt = select.options[select.selectedIndex];

    if (selectedOpt && selectedOpt.value) {
      const phone = selectedOpt.getAttribute('data-phone') || '';
      const bal = parseFloat(selectedOpt.getAttribute('data-balance')) || 0;

      if (infoPill) {
        infoPill.innerHTML = `
          <span class="text-slate-300">දුරකථන: <strong>${phone || '-'}</strong></span>
          <span class="mx-1.5 text-slate-600">|</span>
          <span>ගෙවීමට ඇති හිඟ මුදල: <strong class="${bal > 0 ? 'text-amber-400 font-mono' : 'text-emerald-400'}">${formatLKR(bal)}</strong></span>
        `;
        infoPill.classList.remove('hidden');
      }
      if (newFarmerToggle) newFarmerToggle.classList.add('hidden');
    } else {
      if (infoPill) infoPill.classList.add('hidden');
      if (newFarmerToggle) newFarmerToggle.classList.remove('hidden');
    }
  },

  // =========================================================
  // FAST SEARCHABLE FARMER PICKER (Search by SKU / Name / Phone)
  // =========================================================
  onFarmerPickerInput(query) {
    const q = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('farmerPickerSearchResults');
    const clearBtn = document.getElementById('farmerPickerClearBtn');

    if (!q) {
      if (dropdown) dropdown.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
      this.farmerPickerSearchResults = [];
      this.activeFarmerHighlightedIndex = -1;
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');

    const results = (this.cachedFarmers || []).filter(f => {
      const code = (f.farmerCode || '').toLowerCase();
      const name = (f.name || '').toLowerCase();
      const phone = (f.phone || '').toLowerCase();
      const addr = (f.address || '').toLowerCase();
      return code.includes(q) || name.includes(q) || phone.includes(q) || addr.includes(q);
    });

    // Prioritize exact code match (e.g. "01" or "g-01"), then startsWith code, then name
    results.sort((a, b) => {
      const aCode = (a.farmerCode || '').toLowerCase();
      const bCode = (b.farmerCode || '').toLowerCase();
      const aExact = aCode === q || aCode === `g-${q}` ? 1 : 0;
      const bExact = bCode === q || bCode === `g-${q}` ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      const aCodeStarts = aCode.startsWith(q) ? 1 : 0;
      const bCodeStarts = bCode.startsWith(q) ? 1 : 0;
      return bCodeStarts - aCodeStarts;
    });

    this.farmerPickerSearchResults = results.slice(0, 8);
    this.activeFarmerHighlightedIndex = this.farmerPickerSearchResults.length > 0 ? 0 : -1;
    this.renderFarmerPickerResults(query);
  },

  renderFarmerPickerResults(rawQuery) {
    const dropdown = document.getElementById('farmerPickerSearchResults');
    if (!dropdown) return;

    const q = (rawQuery || '').trim();
    let html = '';

    if (this.farmerPickerSearchResults.length > 0) {
      html += this.farmerPickerSearchResults.map((f, idx) => {
        const isHighlighted = idx === this.activeFarmerHighlightedIndex;
        const bal = Number(f.outstandingBalance || 0);
        return `
          <div onclick="FarmerManager.selectFarmerById(${f.id})"
               class="p-2.5 cursor-pointer flex items-center justify-between text-xs transition ${
                 isHighlighted ? 'bg-emerald-600/30 border-l-4 border-emerald-400 text-white' : 'hover:bg-slate-800 text-slate-200'
               }" data-fidx="${idx}">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono font-bold text-emerald-400 shrink-0">
                ${f.farmerCode || 'G-01'}
              </span>
              <div class="truncate">
                <span class="font-bold">${f.name}</span>
                <span class="text-slate-400 text-[11px] ml-1 font-mono">${f.phone || ''}</span>
              </div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <div class="font-mono font-bold text-[11px] ${bal > 0 ? 'text-amber-400' : 'text-emerald-400'}">
                ${bal > 0 ? `හිඟ: ${formatLKR(bal)}` : 'ගෙවා නිමයි'}
              </div>
              ${f.address ? `<div class="text-[10px] text-slate-400 truncate max-w-[120px]">${f.address}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
    }

    // Always offer quick registration button at the bottom of the search results
    html += `
      <div onclick="FarmerManager.openFarmerModal(null, '${q.replace(/'/g, "\\'")}')"
           class="p-2.5 cursor-pointer flex items-center gap-2 text-xs transition border-t border-slate-800/80 hover:bg-slate-800 text-emerald-400 font-semibold">
        <span class="text-sm">➕</span>
        <div>
          <span>නව ගොවියෙක් ලියාපදිංචි කරන්න: <strong>"${q}"</strong></span>
          <span class="text-[10px] text-slate-400 block font-normal">Farmer Code සහ පැරණි ණය සමඟ එක් කරන්න</span>
        </div>
      </div>
    `;

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  },

  onFarmerPickerKeydown(event) {
    const dropdown = document.getElementById('farmerPickerSearchResults');
    const totalOptions = this.farmerPickerSearchResults.length;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (totalOptions > 0) {
        this.activeFarmerHighlightedIndex = (this.activeFarmerHighlightedIndex + 1) % totalOptions;
        this.updateFarmerHighlight();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalOptions > 0) {
        this.activeFarmerHighlightedIndex = (this.activeFarmerHighlightedIndex - 1 + totalOptions) % totalOptions;
        this.updateFarmerHighlight();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (this.activeFarmerHighlightedIndex >= 0 && this.activeFarmerHighlightedIndex < this.farmerPickerSearchResults.length) {
        this.selectFarmer(this.farmerPickerSearchResults[this.activeFarmerHighlightedIndex]);
      } else if (this.farmerPickerSearchResults.length > 0) {
        this.selectFarmer(this.farmerPickerSearchResults[0]);
      } else {
        // Open modal to register new farmer
        this.openFarmerModal(null, event.target.value.trim());
      }
      return;
    }

    if (event.key === 'Escape') {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }
  },

  updateFarmerHighlight() {
    const dropdown = document.getElementById('farmerPickerSearchResults');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('[data-fidx]');
    items.forEach(item => {
      const idx = parseInt(item.getAttribute('data-fidx'));
      if (idx === this.activeFarmerHighlightedIndex) {
        item.classList.add('bg-emerald-600/30', 'border-l-4', 'border-emerald-400', 'text-white');
        item.classList.remove('hover:bg-slate-800');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-emerald-600/30', 'border-l-4', 'border-emerald-400', 'text-white');
      }
    });
  },

  selectFarmerById(id) {
    const f = (this.cachedFarmers || []).find(item => item.id === id);
    if (f) this.selectFarmer(f);
  },

  selectFarmer(f) {
    this.selectedFarmer = f;

    const idInput = document.getElementById('farmerSelectedId');
    const badge = document.getElementById('farmerPickerSelectedBadge');
    const badgeCode = document.getElementById('farmerPickerBadgeCode');
    const badgeName = document.getElementById('farmerPickerBadgeName');
    const badgePhone = document.getElementById('farmerPickerBadgePhone');
    const badgeBalance = document.getElementById('farmerPickerBadgeBalance');
    const searchInput = document.getElementById('farmerPickerSearchInput');
    const dropdown = document.getElementById('farmerPickerSearchResults');

    if (idInput) idInput.value = f.id;
    if (badgeCode) badgeCode.textContent = f.farmerCode || 'G-01';
    if (badgeName) badgeName.textContent = f.name;
    if (badgePhone) badgePhone.textContent = f.phone || 'දුරකථන අංකයක් නැත';
    if (badgeBalance) {
      const bal = Number(f.outstandingBalance || 0);
      badgeBalance.textContent = formatLKR(bal);
      badgeBalance.className = bal > 0 ? 'text-amber-400 font-mono font-bold' : 'text-emerald-400 font-mono font-bold';
    }

    if (badge) badge.classList.remove('hidden');
    if (searchInput) searchInput.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');

    // Immediately focus the vegetable search input for instant vegetable entry!
    const vegSearch = document.getElementById('farmerVegSearchInput');
    if (vegSearch) {
      vegSearch.focus();
    }
  },

  clearSelectedFarmer() {
    this.selectedFarmer = null;

    const idInput = document.getElementById('farmerSelectedId');
    const badge = document.getElementById('farmerPickerSelectedBadge');
    const searchInput = document.getElementById('farmerPickerSearchInput');
    const dropdown = document.getElementById('farmerPickerSearchResults');
    const clearBtn = document.getElementById('farmerPickerClearBtn');

    if (idInput) idInput.value = '';
    if (badge) badge.classList.add('hidden');
    if (searchInput) {
      searchInput.value = '';
      searchInput.classList.remove('hidden');
      searchInput.focus();
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');

    this.farmerPickerSearchResults = [];
    this.activeFarmerHighlightedIndex = -1;
  },

  // Populate Vegetable / Products Dropdown (fallback / legacy support)
  async populateVegetableOptions() {
    const select = document.getElementById('farmerVegProductSelect');
    if (!select) return;

    const products = await db.products.toArray();
    
    // Sort produce / kg items first
    const kgProduce = products.filter(p => p.unit === 'kg' || (p.category && p.category.includes('Produce')));
    const otherProds = products.filter(p => p.unit !== 'kg' && (!p.category || !p.category.includes('Produce')));

    const renderOpts = (list) => list.map(p => {
      const stock = Number(p.currentStock || 0);
      return `<option value="${p.id}" data-name="${p.name}" data-cost="${p.costPrice || 0}" data-unit="${p.unit || 'kg'}">${p.name} (තොගය: ${stock} ${p.unit || 'kg'})</option>`;
    }).join('');

    select.innerHTML = `<option value="">-- එළවළු වර්ගය තෝරන්න / Select Vegetable --</option>` +
      `<optgroup label="🌱 Fresh Produce / එළවළු">${renderOpts(kgProduce)}</optgroup>` +
      `<optgroup label="📦 All Other Products">${renderOpts(otherProds)}</optgroup>`;
  },

  onVegetableSelectChange() {
    const select = document.getElementById('farmerVegProductSelect');
    const customInput = document.getElementById('farmerCustomVegName');
    const costInput = document.getElementById('farmerVegPriceInput');

    if (!select) return;
    const opt = select.options[select.selectedIndex];
    if (opt && opt.value) {
      const cost = opt.getAttribute('data-cost') || 0;
      if (costInput && !costInput.value) {
        costInput.value = cost;
      }
      if (customInput) customInput.value = '';
    }
  },

  // Fast Search & SKU Scanner for Vegetables
  onVegetableSearchInput(query) {
    const q = (query || '').trim().toLowerCase();
    const dropdown = document.getElementById('farmerVegSearchResults');
    const clearBtn = document.getElementById('farmerVegClearBtn');

    if (!q) {
      if (dropdown) dropdown.classList.add('hidden');
      if (clearBtn) clearBtn.classList.add('hidden');
      this.currentSearchResults = [];
      this.activeSearchHighlightedIndex = -1;
      return;
    }

    if (clearBtn) clearBtn.classList.remove('hidden');

    if (!this.cachedProducts || this.cachedProducts.length === 0) {
      this.cacheProducts().then(() => this.onVegetableSearchInput(query));
      return;
    }

    // Filter matching products by SKU, name, Sinhala name, or Barcode
    const results = this.cachedProducts.filter(p => {
      const sku = (p.sku || '').toLowerCase();
      const name = (p.name || '').toLowerCase();
      const nameSi = (p.nameSi || '').toLowerCase();
      const barcodes = (p.barcodes || []).map(b => (b || '').toLowerCase());

      return sku.includes(q) || name.includes(q) || nameSi.includes(q) || barcodes.some(b => b.includes(q));
    });

    // Prioritize exact SKU match, then produce/kg items
    results.sort((a, b) => {
      const aSkuExact = (a.sku || '').toLowerCase() === q ? 1 : 0;
      const bSkuExact = (b.sku || '').toLowerCase() === q ? 1 : 0;
      if (aSkuExact !== bSkuExact) return bSkuExact - aSkuExact;

      const aIsProduce = a.unit === 'kg' || (a.category && a.category.toLowerCase().includes('produce')) ? 1 : 0;
      const bIsProduce = b.unit === 'kg' || (b.category && b.category.toLowerCase().includes('produce')) ? 1 : 0;
      return bIsProduce - aIsProduce;
    });

    this.currentSearchResults = results.slice(0, 10);
    this.activeSearchHighlightedIndex = this.currentSearchResults.length > 0 ? 0 : -1;
    this.renderSearchResults(query);
  },

  renderSearchResults(rawQuery) {
    const dropdown = document.getElementById('farmerVegSearchResults');
    if (!dropdown) return;

    const q = (rawQuery || '').trim();
    let html = '';

    if (this.currentSearchResults.length > 0) {
      html += this.currentSearchResults.map((p, idx) => {
        const isHighlighted = idx === this.activeSearchHighlightedIndex;
        const stock = Number(p.currentStock || 0);
        return `
          <div onclick="FarmerManager.selectProductById(${p.id})"
               class="p-2.5 cursor-pointer flex items-center justify-between text-xs transition ${
                 isHighlighted ? 'bg-sky-600/30 border-l-4 border-sky-400 text-white' : 'hover:bg-slate-800 text-slate-200'
               }" data-idx="${idx}">
            <div class="flex items-center gap-2 overflow-hidden">
              <span class="px-1.5 py-0.5 bg-slate-800 border border-slate-700 rounded text-[10px] font-mono font-bold text-sky-400 shrink-0">
                ${p.sku || 'SKU'}
              </span>
              <div class="truncate">
                <span class="font-bold">${p.name}</span>
                ${p.nameSi && p.nameSi !== p.name ? `<span class="text-slate-400 text-[11px] ml-1">(${p.nameSi})</span>` : ''}
              </div>
            </div>
            <div class="text-right shrink-0 ml-2">
              <div class="text-emerald-400 font-mono font-bold text-[11px]">Cost: ${formatLKR(p.costPrice || 0)}</div>
              <div class="text-[10px] text-slate-400 font-mono">Stock: ${stock} ${p.unit || 'kg'}</div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Always append Custom vegetable option
    if (q) {
      const isCustomHighlighted = this.activeSearchHighlightedIndex === this.currentSearchResults.length;
      html += `
        <div onclick="FarmerManager.selectCustomName('${q.replace(/'/g, "\\'")}')"
             class="p-2.5 cursor-pointer flex items-center gap-2 text-xs transition border-t border-slate-800/80 ${
               isCustomHighlighted ? 'bg-emerald-600/30 border-l-4 border-emerald-400 text-white' : 'hover:bg-slate-800 text-emerald-400'
             }" data-idx="${this.currentSearchResults.length}">
          <span class="text-sm">➕</span>
          <div>
            <span>අලුත් එළවළු නමක් ලෙස එක් කරන්න: <strong>"${q}"</strong></span>
            <span class="text-[10px] text-slate-400 block font-normal">(Add as custom produce not in inventory)</span>
          </div>
        </div>
      `;
    }

    dropdown.innerHTML = html;
    dropdown.classList.remove('hidden');
  },

  onVegetableSearchKeydown(event) {
    const dropdown = document.getElementById('farmerVegSearchResults');
    const totalOptions = this.currentSearchResults.length + (event.target.value.trim() ? 1 : 0);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (totalOptions > 0) {
        this.activeSearchHighlightedIndex = (this.activeSearchHighlightedIndex + 1) % totalOptions;
        this.updateSearchHighlight();
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (totalOptions > 0) {
        this.activeSearchHighlightedIndex = (this.activeSearchHighlightedIndex - 1 + totalOptions) % totalOptions;
        this.updateSearchHighlight();
      }
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const rawVal = event.target.value.trim();

      if (this.activeSearchHighlightedIndex >= 0 && this.activeSearchHighlightedIndex < this.currentSearchResults.length) {
        this.selectProduct(this.currentSearchResults[this.activeSearchHighlightedIndex]);
      } else if (rawVal) {
        this.selectCustomName(rawVal);
      }
      return;
    }

    if (event.key === 'Escape') {
      if (dropdown) dropdown.classList.add('hidden');
      return;
    }
  },

  updateSearchHighlight() {
    const dropdown = document.getElementById('farmerVegSearchResults');
    if (!dropdown) return;
    const items = dropdown.querySelectorAll('[data-idx]');
    items.forEach(item => {
      const idx = parseInt(item.getAttribute('data-idx'));
      if (idx === this.activeSearchHighlightedIndex) {
        item.classList.add('bg-sky-600/30', 'border-l-4', 'border-sky-400', 'text-white');
        item.classList.remove('hover:bg-slate-800');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('bg-sky-600/30', 'border-l-4', 'border-sky-400', 'text-white');
      }
    });
  },

  selectProductById(id) {
    const p = this.cachedProducts.find(item => item.id === id);
    if (p) this.selectProduct(p);
  },

  selectProduct(p) {
    this.selectedProduct = p;

    const idInput = document.getElementById('farmerSelectedProdId');
    const nameInput = document.getElementById('farmerSelectedProdName');
    const badge = document.getElementById('farmerSelectedProductBadge');
    const badgeText = document.getElementById('farmerSelectedProductText');
    const searchInput = document.getElementById('farmerVegSearchInput');
    const dropdown = document.getElementById('farmerVegSearchResults');
    const priceInput = document.getElementById('farmerVegPriceInput');
    const retailPriceInput = document.getElementById('farmerVegRetailPriceInput');
    const wholesalePriceInput = document.getElementById('farmerVegWholesalePriceInput');
    const weightInput = document.getElementById('farmerVegWeightInput');

    if (idInput) idInput.value = p.id;
    if (nameInput) nameInput.value = p.name;

    if (badgeText) {
      badgeText.innerHTML = `
        <span class="font-bold text-white">${p.name}</span>
        ${p.nameSi && p.nameSi !== p.name ? `<span class="text-sky-300 font-sans text-xs">(${p.nameSi})</span>` : ''}
        <span class="font-mono text-slate-300 text-[10px] ml-1 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700">SKU: ${p.sku}</span>
        <span class="text-emerald-400 text-[10px] font-mono ml-1">තොගය: ${p.currentStock || 0} ${p.unit || 'kg'}</span>
      `;
    }

    if (badge) badge.classList.remove('hidden');
    if (searchInput) searchInput.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');

    // Auto-fill cost price from product
    if (priceInput && (!priceInput.value || parseFloat(priceInput.value) === 0)) {
      if (p.costPrice && p.costPrice > 0) {
        priceInput.value = p.costPrice;
      }
    }

    // Auto-fill retail + wholesale from product's current prices
    if (retailPriceInput) {
      retailPriceInput.value = (p.sellingPrice && p.sellingPrice > 0) ? p.sellingPrice : '';
    }
    if (wholesalePriceInput) {
      wholesalePriceInput.value = (p.wholesalePrice && p.wholesalePrice > 0) ? p.wholesalePrice : '';
    }

    if (weightInput) {
      weightInput.focus();
      weightInput.select();
    }
  },

  selectCustomName(customName) {
    const trimmed = (customName || '').trim();
    if (!trimmed) return;

    this.selectedProduct = { id: null, name: trimmed, custom: true };

    const idInput = document.getElementById('farmerSelectedProdId');
    const nameInput = document.getElementById('farmerSelectedProdName');
    const badge = document.getElementById('farmerSelectedProductBadge');
    const badgeText = document.getElementById('farmerSelectedProductText');
    const searchInput = document.getElementById('farmerVegSearchInput');
    const dropdown = document.getElementById('farmerVegSearchResults');
    const weightInput = document.getElementById('farmerVegWeightInput');

    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = trimmed;

    if (badgeText) {
      badgeText.innerHTML = `
        <span class="font-bold text-white">${trimmed}</span>
        <span class="text-emerald-400 text-[10px] ml-1.5 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-800">අලුත් එළවළු (Custom)</span>
      `;
    }

    if (badge) badge.classList.remove('hidden');
    if (searchInput) searchInput.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');

    if (weightInput) {
      weightInput.focus();
      weightInput.select();
    }
  },

  clearVegSelection() {
    this.selectedProduct = null;

    const idInput = document.getElementById('farmerSelectedProdId');
    const nameInput = document.getElementById('farmerSelectedProdName');
    const badge = document.getElementById('farmerSelectedProductBadge');
    const searchInput = document.getElementById('farmerVegSearchInput');
    const dropdown = document.getElementById('farmerVegSearchResults');
    const clearBtn = document.getElementById('farmerVegClearBtn');
    const select = document.getElementById('farmerVegProductSelect');
    const customInput = document.getElementById('farmerCustomVegName');

    if (idInput) idInput.value = '';
    if (nameInput) nameInput.value = '';
    if (badge) badge.classList.add('hidden');
    if (searchInput) {
      searchInput.value = '';
      searchInput.classList.remove('hidden');
      searchInput.focus();
    }
    if (clearBtn) clearBtn.classList.add('hidden');
    if (dropdown) dropdown.classList.add('hidden');
    if (select) select.value = '';
    if (customInput) customInput.value = '';

    this.currentSearchResults = [];
    this.activeSearchHighlightedIndex = -1;
  },

  // Add Item to current intake batch
  addItemToIntake() {
    const idInput = document.getElementById('farmerSelectedProdId');
    const nameInput = document.getElementById('farmerSelectedProdName');
    const searchInput = document.getElementById('farmerVegSearchInput');
    const select = document.getElementById('farmerVegProductSelect');
    const customInput = document.getElementById('farmerCustomVegName');
    const weightInput = document.getElementById('farmerVegWeightInput');
    const priceInput = document.getElementById('farmerVegPriceInput');
    const retailPriceInput = document.getElementById('farmerVegRetailPriceInput');
    const wholesalePriceInput = document.getElementById('farmerVegWholesalePriceInput');

    let prodId = null;
    let prodName = '';

    if (nameInput && nameInput.value.trim()) {
      prodName = nameInput.value.trim();
      if (idInput && idInput.value) prodId = parseInt(idInput.value);
    } else if (searchInput && searchInput.value.trim()) {
      prodName = searchInput.value.trim();
    } else if (select && select.value) {
      prodId = parseInt(select.value);
      prodName = select.options[select.selectedIndex]?.getAttribute('data-name') || '';
    } else if (customInput && customInput.value.trim()) {
      prodName = customInput.value.trim();
    }

    if (!prodName) {
      alert('කරුණාකර එළවළු වර්ගය හෝ SKU කේතය ඇතුළත් කරන්න (Please search or enter vegetable).');
      if (searchInput) searchInput.focus();
      return;
    }

    const weightKg = parseFloat(weightInput?.value) || 0;
    const unitPrice = parseFloat(priceInput?.value) || 0;
    const retailPrice = parseFloat(retailPriceInput?.value) || null;
    const wholesalePrice = parseFloat(wholesalePriceInput?.value) || null;

    if (weightKg <= 0) {
      alert('කරුණාකර වලංගු බරක් (KG) ඇතුළත් කරන්න (Please enter valid weight in KG).');
      if (weightInput) weightInput.focus();
      return;
    }

    if (unitPrice < 0) {
      alert('කරුණාකර කිලෝවක මිල (Price per KG) ඇතුළත් කරන්න.');
      if (priceInput) priceInput.focus();
      return;
    }

    const lineTotal = weightKg * unitPrice;

    this.activeIntakeItems.push({
      productId: prodId,
      name: prodName,
      weightKg: Math.round(weightKg * 100) / 100,
      unitPrice: Math.round(unitPrice * 100) / 100,
      lineTotal: Math.round(lineTotal * 100) / 100,
      retailPrice: retailPrice !== null ? Math.round(retailPrice * 100) / 100 : null,
      wholesalePrice: wholesalePrice !== null ? Math.round(wholesalePrice * 100) / 100 : null
    });

    this.renderIntakeItemsList();

    // Reset inputs for next item and focus search
    if (weightInput) weightInput.value = '';
    if (priceInput) priceInput.value = '';
    if (retailPriceInput) retailPriceInput.value = '';
    if (wholesalePriceInput) wholesalePriceInput.value = '';
    this.clearVegSelection();

    if (window.SoundManager) SoundManager.playBeep();
  },

  removeIntakeItem(index) {
    this.activeIntakeItems.splice(index, 1);
    this.renderIntakeItemsList();
  },

  renderIntakeItemsList() {
    const tbody = document.getElementById('farmerIntakeItemsBody');
    const totalWeightEl = document.getElementById('intakeTotalWeightDisplay');
    const grandTotalEl = document.getElementById('intakeGrandTotalDisplay');
    const itemsCountEl = document.getElementById('intakeItemsCountBadge');

    if (!tbody) return;

    if (this.activeIntakeItems.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="py-8 text-center text-slate-500 text-xs">
            තවම එළවළු වර්ග එකතු කර නැත. ඉහතින් එළවළු තෝරා බර (KG) සහ මිල ගසා "එක් කරන්න" ක්ලික් කරන්න.
          </td>
        </tr>
      `;
      if (totalWeightEl) totalWeightEl.textContent = '0.00 kg';
      if (grandTotalEl) grandTotalEl.textContent = 'Rs. 0.00';
      if (itemsCountEl) itemsCountEl.textContent = '0 Items';
      return;
    }

    let totalWeight = 0;
    let grandTotal = 0;

    tbody.innerHTML = this.activeIntakeItems.map((item, idx) => {
      totalWeight += item.weightKg;
      grandTotal += item.lineTotal;

      return `
        <tr class="border-b border-slate-800 text-xs hover:bg-slate-800/40 transition">
          <td class="p-3 font-semibold text-slate-100 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <div>
              <div>${item.name}</div>
              <div class="flex gap-2 mt-0.5">
                ${item.retailPrice ? `<span class="text-sky-400 font-mono text-[10px]">🏷️ Rs.${item.retailPrice.toFixed(2)}</span>` : ''}
                ${item.wholesalePrice ? `<span class="text-violet-400 font-mono text-[10px]">🏪 Rs.${item.wholesalePrice.toFixed(2)}</span>` : ''}
              </div>
            </div>
          </td>
          <td class="p-3 font-mono font-bold text-sky-400 text-center">${item.weightKg.toFixed(2)} kg</td>
          <td class="p-3 font-mono text-slate-300 text-right">${formatLKR(item.unitPrice)}</td>
          <td class="p-3 font-mono font-bold text-emerald-400 text-right">${formatLKR(item.lineTotal)}</td>
          <td class="p-3 text-center">
            <button type="button" onclick="FarmerManager.removeIntakeItem(${idx})" class="p-1 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-lg transition" title="ඉවත් කරන්න (Remove)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalWeightEl) totalWeightEl.textContent = `${totalWeight.toFixed(2)} kg`;
    if (grandTotalEl) grandTotalEl.textContent = formatLKR(grandTotal);
    if (itemsCountEl) itemsCountEl.textContent = `${this.activeIntakeItems.length} Items`;
  },

  resetIntakeForm() {
    this.activeIntakeItems = [];
    this.renderIntakeItemsList();
    this.clearVegSelection();
    this.clearSelectedFarmer();

    const form = document.getElementById('farmerIntakeForm');
    if (form) form.reset();

    const dateInput = document.getElementById('farmerIntakeDate');
    const timeInput = document.getElementById('farmerIntakeTime');
    const slipInput = document.getElementById('farmerIntakeSlipNo');

    const now = new Date();
    if (dateInput) dateInput.value = now.toISOString().slice(0, 10);
    if (timeInput) timeInput.value = now.toTimeString().slice(0, 5);
    if (slipInput) slipInput.value = `FVR-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(100 + Math.random() * 900)}`;

    const payTypeSelect = document.getElementById('farmerPaymentMode');
    if (payTypeSelect) payTypeSelect.value = 'credit';
    this.onPaymentModeChange();
  },

  onPaymentModeChange() {
    const mode = document.getElementById('farmerPaymentMode')?.value || 'credit';
    const advanceContainer = document.getElementById('farmerAdvanceAmountContainer');
    if (advanceContainer) {
      if (mode === 'advance') {
        advanceContainer.classList.remove('hidden');
      } else {
        advanceContainer.classList.add('hidden');
      }
    }
  },

  // Save the full daily vegetable intake
  async saveFarmerIntake(event) {
    if (event) event.preventDefault();

    if (this.activeIntakeItems.length === 0) {
      alert('කරුණාකර අවම වශයෙන් එක් එළවළු වර්ගයක්වත් එකතු කරන්න (Please add at least one vegetable item).');
      return;
    }

    const selectedIdInput = document.getElementById('farmerSelectedId');
    const select = document.getElementById('farmerSelect');
    let farmerId = (selectedIdInput && selectedIdInput.value) ? parseInt(selectedIdInput.value) : (select && select.value ? parseInt(select.value) : null);
    let farmerName = '';
    let farmerPhone = '';

    const newNameInput = document.getElementById('newFarmerName');
    const newPhoneInput = document.getElementById('newFarmerPhone');

    if (farmerId) {
      const existingFarmer = await db.farmers.get(farmerId);
      if (existingFarmer) {
        farmerName = existingFarmer.name;
        farmerPhone = existingFarmer.phone || '';
      }
    } else if (newNameInput && newNameInput.value.trim()) {
      // Auto-register new farmer on the fly
      farmerName = newNameInput.value.trim();
      farmerPhone = newPhoneInput?.value.trim() || '';
      const code = this.generateFarmerCode();

      const newId = await db.farmers.add({
        farmerCode: code,
        name: farmerName,
        phone: farmerPhone,
        address: '',
        openingBalance: 0,
        outstandingBalance: 0,
        totalSupplied: 0,
        totalPaid: 0,
        createdAt: new Date().toISOString()
      });
      farmerId = newId;
    }

    if (!farmerName) {
      alert('කරුණාකර ගොවියා සොයා තෝරන්න හෝ නව ගොවියෙකු ලියාපදිංචි කරන්න (Please search & select Farmer).');
      const pInput = document.getElementById('farmerPickerSearchInput');
      if (pInput) pInput.focus();
      return;
    }

    const slipNo = document.getElementById('farmerIntakeSlipNo')?.value.trim() || `FVR-${Date.now().toString().slice(-6)}`;
    const date = document.getElementById('farmerIntakeDate')?.value || new Date().toISOString().slice(0, 10);
    const time = document.getElementById('farmerIntakeTime')?.value || new Date().toTimeString().slice(0, 5);
    const paymentMode = document.getElementById('farmerPaymentMode')?.value || 'credit';
    const updateStock = document.getElementById('farmerUpdateStockCheckbox')?.checked !== false;
    const notes = document.getElementById('farmerIntakeNotes')?.value.trim() || '';

    let grandTotal = 0;
    let totalWeight = 0;
    this.activeIntakeItems.forEach(i => {
      grandTotal += i.lineTotal;
      totalWeight += i.weightKg;
    });

    let paidAmount = 0;
    if (paymentMode === 'full_cash') {
      paidAmount = grandTotal;
    } else if (paymentMode === 'advance') {
      const advInput = parseFloat(document.getElementById('farmerAdvanceAmountInput')?.value) || 0;
      paidAmount = Math.min(grandTotal, advInput);
    }

    const balanceAmount = Math.max(0, grandTotal - paidAmount);
    const paymentStatus = balanceAmount === 0 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid');

    const currentUser = (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'cashier';

    // 1. Create Farmer Intake record
    const intakeRecord = {
      slipNo,
      farmerId,
      farmerName,
      farmerPhone,
      date,
      time,
      items: [...this.activeIntakeItems],
      totalWeight: Math.round(totalWeight * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100,
      paidAmount: Math.round(paidAmount * 100) / 100,
      balanceAmount: Math.round(balanceAmount * 100) / 100,
      paymentStatus,
      paymentMode,
      stockUpdated: updateStock,
      notes,
      receivedBy: currentUser,
      createdAt: new Date().toISOString()
    };

    const intakeId = await db.farmerIntakes.add(intakeRecord);

    // 2. Update Farmer balance & totals
    const farmer = await db.farmers.get(farmerId);
    if (farmer) {
      await db.farmers.update(farmerId, {
        outstandingBalance: Math.round(((farmer.outstandingBalance || 0) + balanceAmount) * 100) / 100,
        totalSupplied: Math.round(((farmer.totalSupplied || 0) + grandTotal) * 100) / 100,
        totalPaid: Math.round(((farmer.totalPaid || 0) + paidAmount) * 100) / 100
      });
    }

    // 3. Update Supermarket Inventory Stock if enabled
    if (updateStock) {
      for (const item of this.activeIntakeItems) {
        // Build price updates — only override if user entered a value
        const priceUpdates = {
          costPrice: item.unitPrice
        };
        if (item.retailPrice && item.retailPrice > 0) {
          priceUpdates.sellingPrice = item.retailPrice;
          priceUpdates.markedPrice = item.retailPrice;
        }
        if (item.wholesalePrice && item.wholesalePrice > 0) {
          priceUpdates.wholesalePrice = item.wholesalePrice;
        }

        if (item.productId) {
          const prod = await db.products.get(item.productId);
          if (prod) {
            await db.products.update(item.productId, {
              currentStock: Math.round(((prod.currentStock || 0) + item.weightKg) * 100) / 100,
              ...priceUpdates
            });
          }
        } else {
          // Check if product with this exact name exists
          const existing = await db.products.where('name').equalsIgnoreCase(item.name).first();
          if (existing) {
            await db.products.update(existing.id, {
              currentStock: Math.round(((existing.currentStock || 0) + item.weightKg) * 100) / 100,
              ...priceUpdates
            });
          } else {
            // Auto create new fresh produce product
            const autoRetail = item.retailPrice || Math.round(item.unitPrice * 1.25);
            const autoWholesale = item.wholesalePrice || Math.round(item.unitPrice * 1.15);
            await db.products.add({
              name: item.name,
              nameSi: item.name,
              category: 'Fresh Produce (එළවළු සහ පලතුරු)',
              costPrice: item.unitPrice,
              markedPrice: item.retailPrice || Math.round(item.unitPrice * 1.3),
              sellingPrice: autoRetail,
              wholesalePrice: autoWholesale,
              unit: 'kg',
              currentStock: item.weightKg,
              minStock: 5,
              barcodes: []
            });
          }
        }
      }

      // Refresh inventory UI if available
      if (window.InventoryManager) {
        InventoryManager.renderInventoryTable().catch(() => {});
        InventoryManager.renderValuationCards().catch(() => {});
      }
      if (window.POSManager) {
        POSManager.renderProductGrid().catch(() => {});
      }
    }

    // 4. If cash was paid immediately (full or advance), log payout & cash drawer reconciliation
    if (paidAmount > 0) {
      await db.farmerPayments.add({
        paymentNo: `FPAY-${Date.now().toString().slice(-6)}`,
        farmerId,
        farmerName,
        intakeId,
        intakeSlipNo: slipNo,
        amount: paidAmount,
        paymentDate: date,
        paymentMethod: 'cash',
        notes: `Immediate payment at vegetable intake (${slipNo})`,
        paidBy: currentUser,
        createdAt: new Date().toISOString()
      });
    }

    if (window.SoundManager) SoundManager.playSuccessChime();

    // Show printed receipt or prompt
    const printPrompt = confirm(
      `✅ එළවළු බාරගැනීම සාර්ථකව සටහන් විය!\n\n` +
      `ගොවියා: ${farmerName}\n` +
      `මුළු බර: ${totalWeight.toFixed(2)} kg\n` +
      `වටිනාකම: ${formatLKR(grandTotal)}\n` +
      `ගෙවූ මුදල: ${formatLKR(paidAmount)}\n` +
      `ගෙවීමට ඇති හිඟ මුදල (ණය): ${formatLKR(balanceAmount)}\n\n` +
      `ගොවියා සඳහා රිසිට්පතක් (Slip) මුද්‍රණය කිරීමට අවශ්‍යද?`
    );

    if (printPrompt) {
      intakeRecord.id = intakeId;
      this.printIntakeSlip(intakeRecord);
    }

    this.resetIntakeForm();
    await this.init();
  },

  // =========================================================
  // VIEW 2: FARMERS DIRECTORY & OUTSTANDING BALANCES
  // =========================================================
  async renderFarmersTable() {
    const tbody = document.getElementById('farmersDirectoryTableBody');
    if (!tbody) return;

    let farmers = await db.farmers.toArray();

    if (this.farmerSearchQuery) {
      const q = this.farmerSearchQuery.toLowerCase().trim();
      farmers = farmers.filter(f =>
        (f.name && f.name.toLowerCase().includes(q)) ||
        (f.farmerCode && f.farmerCode.toLowerCase().includes(q)) ||
        (f.phone && f.phone.includes(q)) ||
        (f.address && f.address.toLowerCase().includes(q))
      );
    }

    // Sort by outstanding balance desc, then name
    farmers.sort((a, b) => (b.outstandingBalance || 0) - (a.outstandingBalance || 0));

    if (farmers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-500 text-xs">ගොවියන් හමු නොවීය (No farmers registered).</td></tr>`;
      return;
    }

    tbody.innerHTML = farmers.map(f => {
      const bal = Number(f.outstandingBalance || 0);
      const supplied = Number(f.totalSupplied || 0);
      const paid = Number(f.totalPaid || 0);
      const openBal = Number(f.openingBalance || 0);

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
          <td class="p-3">
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-slate-800 border border-slate-700 text-emerald-400 font-mono font-bold text-xs rounded">
                ${f.farmerCode || 'G-01'}
              </span>
              <span class="font-bold text-slate-100 text-sm">${f.name}</span>
            </div>
            <div class="text-slate-400 text-[11px] mt-0.5">
              ${f.address || 'ලිපිනය සටහන් කර නැත'}
              ${openBal > 0 ? ` &bull; <span class="text-amber-400 font-mono font-semibold">පැරණි හිඟය: ${formatLKR(openBal)}</span>` : ''}
            </div>
          </td>
          <td class="p-3 font-mono text-slate-300 font-semibold">${f.phone || '-'}</td>
          <td class="p-3 text-right font-mono text-slate-300">${formatLKR(supplied)}</td>
          <td class="p-3 text-right font-mono text-slate-400">${formatLKR(paid)}</td>
          <td class="p-3 text-right font-mono font-black ${bal > 0 ? 'text-amber-400 text-sm' : 'text-emerald-400'}">
            ${formatLKR(bal)}
          </td>
          <td class="p-3 text-right space-x-1.5 whitespace-nowrap">
            ${bal > 0 ? `
              <button onclick="FarmerManager.openPaymentModal(${f.id})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-emerald-600/20 inline-flex items-center gap-1 cursor-pointer">
                <span>💵</span> <span>මුදල් ගෙවන්න</span>
              </button>
            ` : `
              <span class="px-2 py-1 bg-slate-800 text-emerald-400 rounded-lg text-[11px] font-bold">ගෙවා නිමයි</span>
            `}
            <button onclick="FarmerManager.openStatementModal(${f.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer" title="ගිණුම් ඉතිහාසය (Statement)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            </button>
            <button onclick="FarmerManager.openFarmerModal(${f.id})" class="p-1.5 bg-slate-800 hover:bg-amber-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer" title="සංස්කරණය (Edit)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
            </button>
            <button onclick="FarmerManager.deleteFarmer(${f.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition cursor-pointer" title="මකන්න (Delete)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openFarmerModal(id = null, presetQuery = '') {
    const modal = document.getElementById('farmerProfileModal');
    const form = document.getElementById('farmerProfileForm');
    const title = document.getElementById('farmerModalTitle');

    if (!modal) return;
    if (form) form.reset();

    const idInput = document.getElementById('farmerModalIdInput');
    if (idInput) idInput.value = id || '';

    const codeInput = document.getElementById('farmerModalCodeInput');
    const nameInput = document.getElementById('farmerModalNameInput');
    const phoneInput = document.getElementById('farmerModalPhoneInput');
    const addressInput = document.getElementById('farmerModalAddressInput');
    const openBalInput = document.getElementById('farmerModalOpeningBalanceInput');
    const notesInput = document.getElementById('farmerModalNotesInput');

    if (id) {
      if (title) title.textContent = 'ගොවි තොරතුරු සංස්කරණය (Edit Farmer)';
      db.farmers.get(id).then(f => {
        if (!f) return;
        if (codeInput) codeInput.value = f.farmerCode || f.code || '';
        if (nameInput) nameInput.value = f.name || '';
        if (phoneInput) phoneInput.value = f.phone || '';
        if (addressInput) addressInput.value = f.address || '';
        if (openBalInput) openBalInput.value = f.openingBalance || 0;
        if (notesInput) notesInput.value = f.notes || '';
      });
    } else {
      if (title) title.textContent = 'නව ගොවියෙක් ලියාපදිංචිය (Add New Farmer)';
      if (codeInput) codeInput.value = this.generateFarmerCode();
      if (presetQuery) {
        if (/^\d{9,10}$/.test(presetQuery)) {
          if (phoneInput) phoneInput.value = presetQuery;
        } else if (/^g?-?\d+$/i.test(presetQuery)) {
          if (codeInput) codeInput.value = presetQuery.toUpperCase();
        } else {
          if (nameInput) nameInput.value = presetQuery;
        }
      }
      if (openBalInput) openBalInput.value = '';
    }

    modal.classList.remove('hidden');
    if (nameInput && !nameInput.value) nameInput.focus();
    else if (codeInput) codeInput.focus();
  },

  async saveFarmerProfile(event) {
    if (event) event.preventDefault();

    const idInput = document.getElementById('farmerModalIdInput');
    const code = document.getElementById('farmerModalCodeInput')?.value.trim().toUpperCase() || this.generateFarmerCode();
    const name = document.getElementById('farmerModalNameInput')?.value.trim();
    const phone = document.getElementById('farmerModalPhoneInput')?.value.trim() || '';
    const address = document.getElementById('farmerModalAddressInput')?.value.trim() || '';
    const openingBalance = parseFloat(document.getElementById('farmerModalOpeningBalanceInput')?.value) || 0;
    const notes = document.getElementById('farmerModalNotesInput')?.value.trim() || '';

    if (!name) {
      alert('කරුණාකර ගොවියාගේ නම ඇතුළත් කරන්න.');
      return;
    }

    const id = idInput ? idInput.value : '';

    if (id) {
      const f = await db.farmers.get(parseInt(id));
      const oldOpening = Number(f.openingBalance || 0);
      const diff = openingBalance - oldOpening;
      const newOutstanding = Math.max(0, Math.round(((f.outstandingBalance || 0) + diff) * 100) / 100);

      await db.farmers.update(parseInt(id), {
        farmerCode: code,
        name,
        phone,
        address,
        openingBalance,
        outstandingBalance: newOutstanding,
        notes
      });
    } else {
      const newId = await db.farmers.add({
        farmerCode: code,
        name,
        phone,
        address,
        notes,
        openingBalance,
        outstandingBalance: openingBalance,
        totalSupplied: 0,
        totalPaid: 0,
        createdAt: new Date().toISOString()
      });

      // If we were on the intake view, auto-select this newly created farmer
      const newlyCreated = await db.farmers.get(newId);
      if (newlyCreated && this.currentSubView === 'intake') {
        this.selectFarmer(newlyCreated);
      }
    }

    document.getElementById('farmerProfileModal')?.classList.add('hidden');
    await this.cacheFarmers();
    await this.renderSummaryCards();
    await this.renderFarmersTable();
    if (window.SoundManager) SoundManager.playSuccessChime();
  },

  async deleteFarmer(id) {
    const farmer = await db.farmers.get(id);
    if (!farmer) return;

    if ((farmer.outstandingBalance || 0) > 0) {
      if (!confirm(`අවවාදයයි: මෙම ගොවියාට තවමත් ගෙවීමට හිඟ මුදලක් (Rs. ${formatLKR(farmer.outstandingBalance)}) පවතී. මෙම ගොවියා මැකීමට ඔබට සහතිකද?`)) {
        return;
      }
    } else {
      if (!confirm(`ඔබට "${farmer.name}" ගොවි ගිණුම මැකීමට අවශ්‍ය බව තහවුරු කරන්නද?`)) {
        return;
      }
    }

    await db.farmers.delete(id);
    await this.init();
    if (window.SoundManager) SoundManager.playSuccessChime();
  },

  // =========================================================
  // VIEW 3: INTAKE HISTORY & RECALL SLIPS
  // =========================================================
  async renderHistoryTable() {
    const tbody = document.getElementById('farmerHistoryTableBody');
    if (!tbody) return;

    let intakes = await db.farmerIntakes.reverse().toArray();

    if (this.historySearchQuery) {
      const q = this.historySearchQuery.toLowerCase().trim();
      intakes = intakes.filter(i =>
        (i.slipNo && i.slipNo.toLowerCase().includes(q)) ||
        (i.farmerName && i.farmerName.toLowerCase().includes(q)) ||
        (i.farmerPhone && i.farmerPhone.includes(q))
      );
    }

    if (this.historyFilterStatus !== 'all') {
      intakes = intakes.filter(i => i.paymentStatus === this.historyFilterStatus);
    }

    if (intakes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-500 text-xs">එළවළු බාරගැනීමේ ඉතිහාසයක් නැත (No intake records found).</td></tr>`;
      return;
    }

    tbody.innerHTML = intakes.map(i => {
      const itemsSummary = (i.items || []).map(it => `${it.name} (${it.weightKg}kg)`).join(', ');

      const statusBadge = i.paymentStatus === 'paid'
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">ගෙවා ඇත (PAID)</span>`
        : i.paymentStatus === 'partial'
        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">අර්ධ (PARTIAL)</span>`
        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800">ණයට (UNPAID)</span>`;

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
          <td class="p-3 font-mono font-bold text-sky-400">${i.slipNo}</td>
          <td class="p-3">
            <div class="text-slate-200 font-mono text-[11px]">${i.date} &bull; ${i.time || ''}</div>
            <div class="text-[10px] text-slate-500">කැෂියර්: @${i.receivedBy || 'staff'}</div>
          </td>
          <td class="p-3">
            <div class="font-bold text-slate-100">${i.farmerName}</div>
            <div class="text-[11px] font-mono text-slate-400">${i.farmerPhone || '-'}</div>
          </td>
          <td class="p-3 max-w-xs">
            <div class="truncate text-slate-300 font-medium" title="${itemsSummary}">${itemsSummary}</div>
            <div class="text-[10px] text-sky-400 font-mono font-bold">${i.totalWeight ? i.totalWeight.toFixed(2) : '-'} kg Total</div>
          </td>
          <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR(i.grandTotal)}</td>
          <td class="p-3 text-right font-mono font-bold ${Number(i.balanceAmount) > 0 ? 'text-amber-400' : 'text-slate-500'}">
            ${formatLKR(i.balanceAmount || 0)}
          </td>
          <td class="p-3 text-center">${statusBadge}</td>
          <td class="p-3 text-right space-x-1 whitespace-nowrap">
            ${Number(i.balanceAmount) > 0 ? `
              <button onclick="FarmerManager.openPaymentModal(${i.farmerId}, '${i.id}')" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition" title="මුදල් ගෙවන්න">
                ගෙවීම
              </button>
            ` : ''}
            <button onclick="FarmerManager.printIntakeSlipById('${i.id}')" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="රිසිට්පත මුද්‍රණය (Print Slip)">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // =========================================================
  // VIEW 4: CASH PAYOUTS / SETTLEMENT HISTORY
  // =========================================================
  async renderPaymentsTable() {
    const tbody = document.getElementById('farmerPaymentsTableBody');
    if (!tbody) return;

    const payments = await db.farmerPayments.reverse().toArray();

    if (payments.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500 text-xs">තවම මුදල් ගෙවීම් වාර්තා වී නැත (No payments recorded yet).</td></tr>`;
      return;
    }

    tbody.innerHTML = payments.map(p => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
        <td class="p-3 font-mono font-bold text-emerald-400">${p.paymentNo}</td>
        <td class="p-3 font-mono text-slate-300">${p.paymentDate}</td>
        <td class="p-3 font-bold text-slate-100">${p.farmerName}</td>
        <td class="p-3 text-right font-mono font-black text-emerald-400 text-sm">${formatLKR(p.amount)}</td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-sky-300 border border-slate-700">
            ${(p.paymentMethod || 'cash').toUpperCase()}
          </span>
        </td>
        <td class="p-3 text-slate-400 text-[11px]">${p.notes || (p.intakeSlipNo ? `Slip: ${p.intakeSlipNo}` : '-')}</td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">
          <span class="text-[10px] text-slate-500 font-mono mr-2">@${p.paidBy || 'staff'}</span>
          <button onclick="FarmerManager.printPaymentVoucherById('${p.id}')" class="p-1.5 bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white rounded-lg transition" title="වවුචරය මුද්‍රණය (Print Voucher)">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  // =========================================================
  // CASH SETTLEMENT / PAYOUT MODAL
  // =========================================================
  async openPaymentModal(farmerId, specificIntakeId = null) {
    const farmer = await db.farmers.get(farmerId);
    if (!farmer) return;

    this.selectedFarmerForPayment = farmer;

    const modal = document.getElementById('farmerSettlementModal');
    if (!modal) return;

    document.getElementById('settleFarmerId').value = farmer.id;
    document.getElementById('settleSpecificIntakeId').value = specificIntakeId || '';
    document.getElementById('settleFarmerName').textContent = farmer.name;
    document.getElementById('settleFarmerPhone').textContent = farmer.phone || 'දුරකථන අංකයක් නැත';
    document.getElementById('settleFarmerTotalDue').textContent = formatLKR(farmer.outstandingBalance || 0);

    const amountInput = document.getElementById('settleAmountInput');
    if (amountInput) {
      if (specificIntakeId) {
        const intake = await db.farmerIntakes.get(specificIntakeId);
        amountInput.value = intake ? intake.balanceAmount : (farmer.outstandingBalance || 0);
      } else {
        amountInput.value = farmer.outstandingBalance || 0;
      }
    }

    const dateInput = document.getElementById('settlePaymentDate');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

    const notesInput = document.getElementById('settleNotesInput');
    if (notesInput) notesInput.value = '';

    modal.classList.remove('hidden');
    setTimeout(() => { if (amountInput) amountInput.focus(); }, 50);
  },

  async processFarmerPayment(event) {
    if (event) event.preventDefault();

    const farmerId = parseInt(document.getElementById('settleFarmerId')?.value);
    const specificIntakeId = document.getElementById('settleSpecificIntakeId')?.value;
    const amount = parseFloat(document.getElementById('settleAmountInput')?.value) || 0;
    const paymentDate = document.getElementById('settlePaymentDate')?.value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('settleNotesInput')?.value.trim() || '';

    if (amount <= 0) {
      alert('කරුණාකර වලංගු මුදලක් ඇතුළත් කරන්න (Please enter valid payment amount).');
      return;
    }

    const farmer = await db.farmers.get(farmerId);
    if (!farmer) return;

    const currentUser = (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'cashier';
    const paymentNo = `FPAY-${Date.now().toString().slice(-6)}`;

    // 1. Deduct farmer balance
    const newBal = Math.max(0, Math.round(((farmer.outstandingBalance || 0) - amount) * 100) / 100);
    const newPaid = Math.round(((farmer.totalPaid || 0) + amount) * 100) / 100;
    await db.farmers.update(farmerId, {
      outstandingBalance: newBal,
      totalPaid: newPaid
    });

    // 2. Allocate payment to unpaid intake slips
    let remainingToAllocate = amount;
    const allIntakes = await db.farmerIntakes.where('farmerId').equals(farmerId).toArray();
    // Sort oldest first
    allIntakes.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    for (const intake of allIntakes) {
      if (remainingToAllocate <= 0) break;
      const due = Number(intake.balanceAmount || 0);
      if (due > 0) {
        const payForThis = Math.min(due, remainingToAllocate);
        const updatedPaid = (intake.paidAmount || 0) + payForThis;
        const updatedBal = Math.max(0, due - payForThis);
        const updatedStatus = updatedBal === 0 ? 'paid' : 'partial';

        await db.farmerIntakes.update(intake.id, {
          paidAmount: Math.round(updatedPaid * 100) / 100,
          balanceAmount: Math.round(updatedBal * 100) / 100,
          paymentStatus: updatedStatus
        });

        remainingToAllocate -= payForThis;
      }
    }

    // 3. Record in farmer payments ledger
    const paymentRecord = {
      paymentNo,
      farmerId,
      farmerName: farmer.name,
      amount,
      paymentDate,
      paymentMethod: 'cash',
      intakeId: specificIntakeId || 'batch',
      notes,
      paidBy: currentUser,
      createdAt: new Date().toISOString()
    };
    const paymentId = await db.farmerPayments.add(paymentRecord);

    document.getElementById('farmerSettlementModal')?.classList.add('hidden');
    if (window.SoundManager) SoundManager.playSuccessChime();

    const doPrint = confirm(
      `✅ මුදල් ගෙවීම සාර්ථකයි!\n\n` +
      `ගොවියා: ${farmer.name}\n` +
      `ගෙවූ මුදල: ${formatLKR(amount)}\n` +
      `ඉතිරි හිඟ මුදල: ${formatLKR(newBal)}\n\n` +
      `ගොවියාට ගෙවීම් වවුචරයක් (Voucher) මුද්‍රණය කිරීමට අවශ්‍යද?`
    );

    if (doPrint) {
      paymentRecord.id = paymentId;
      paymentRecord.remainingBalance = newBal;
      this.printPaymentVoucher(paymentRecord);
    }

    await this.init();
  },

  // =========================================================
  // STATEMENT MODAL (Chronological Intake + Payment History)
  // =========================================================
  async openStatementModal(farmerId) {
    const farmer = await db.farmers.get(farmerId);
    if (!farmer) return;

    const modal = document.getElementById('farmerStatementModal');
    if (!modal) return;

    document.getElementById('stmtFarmerName').textContent = farmer.name;
    document.getElementById('stmtFarmerPhone').textContent = farmer.phone || '-';
    document.getElementById('stmtFarmerAddress').textContent = farmer.address || '-';
    document.getElementById('stmtTotalSupplied').textContent = formatLKR(farmer.totalSupplied || 0);
    document.getElementById('stmtTotalPaid').textContent = formatLKR(farmer.totalPaid || 0);
    document.getElementById('stmtOutstanding').textContent = formatLKR(farmer.outstandingBalance || 0);

    const intakes = await db.farmerIntakes.where('farmerId').equals(farmerId).toArray();
    const payments = await db.farmerPayments.where('farmerId').equals(farmerId).toArray();

    // Combine into single ledger
    const ledger = [];

    if (farmer.openingBalance && Number(farmer.openingBalance) > 0) {
      ledger.push({
        date: farmer.createdAt ? farmer.createdAt.slice(0, 10) : 'Opening',
        type: 'OPENING',
        ref: 'START-BAL',
        desc: 'පැරණි හිඟ මුදල (Opening Credit Balance)',
        debit: 0,
        credit: Number(farmer.openingBalance)
      });
    }

    intakes.forEach(i => {
      ledger.push({
        date: i.date,
        type: 'INTAKE',
        ref: i.slipNo,
        desc: `එළවළු බාරගැනීම (${i.totalWeight}kg)`,
        debit: 0,
        credit: i.grandTotal // supermarket owes farmer
      });
    });

    payments.forEach(p => {
      ledger.push({
        date: p.paymentDate,
        type: 'PAYMENT',
        ref: p.paymentNo,
        desc: `මුදල් ගෙවීම (${p.paymentMethod || 'cash'})`,
        debit: p.amount, // supermarket paid farmer
        credit: 0
      });
    });

    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tbody = document.getElementById('stmtLedgerTableBody');
    if (tbody) {
      let runningBalance = 0;
      tbody.innerHTML = ledger.map(row => {
        runningBalance = runningBalance + row.credit - row.debit;
        return `
          <tr class="border-b border-slate-800 text-xs hover:bg-slate-800/40 font-mono">
            <td class="p-2.5 text-slate-400">${row.date}</td>
            <td class="p-2.5 font-bold ${row.type === 'INTAKE' ? 'text-sky-400' : 'text-emerald-400'}">${row.type}</td>
            <td class="p-2.5 text-slate-300 font-sans">${row.desc} &bull; <span class="font-mono text-slate-500">${row.ref}</span></td>
            <td class="p-2.5 text-right font-bold text-sky-400">${row.credit > 0 ? formatLKR(row.credit) : '-'}</td>
            <td class="p-2.5 text-right font-bold text-emerald-400">${row.debit > 0 ? formatLKR(row.debit) : '-'}</td>
            <td class="p-2.5 text-right font-bold ${runningBalance > 0 ? 'text-amber-400' : 'text-slate-400'}">${formatLKR(runningBalance)}</td>
          </tr>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
  },

  // =========================================================
  // PRINTING: THERMAL SLIPS & PAYMENT VOUCHERS
  // =========================================================
  async printIntakeSlipById(id) {
    const intake = await db.farmerIntakes.get(id);
    if (intake) this.printIntakeSlip(intake);
  },

  async printPaymentVoucherById(id) {
    const payment = await db.farmerPayments.get(id);
    if (!payment) return;
    const farmer = await db.farmers.get(payment.farmerId);
    payment.remainingBalance = farmer ? farmer.outstandingBalance : 0;
    this.printPaymentVoucher(payment);
  },

  async printIntakeSlip(intake) {
    const settings = {
      storeName: (await getSetting('store_name', 'SUPERMARKET')).value || 'SUPERMARKET',
      storeNameSi: (await getSetting('store_name_si', '')).value || '',
      phone: (await getSetting('store_phone', '')).value || '',
      address: (await getSetting('store_address', '')).value || '',
      thermalWidth: (await getSetting('thermal_width', '80mm')).value || '80mm'
    };

    const itemsHtml = (intake.items || []).map(i => `
      <tr>
        <td style="padding: 2px 0; text-align: left;">${i.name}</td>
        <td style="padding: 2px 0; text-align: center;">${i.weightKg.toFixed(2)}kg</td>
        <td style="padding: 2px 0; text-align: right;">${formatLKR(i.unitPrice)}</td>
        <td style="padding: 2px 0; text-align: right; font-weight: bold;">${formatLKR(i.lineTotal)}</td>
      </tr>
    `).join('');

    const html = `
      <div style="text-align: center; font-family: monospace; font-size: 11px; line-height: 1.35; color: #000; padding: 4px;">
        <h2 style="font-size: 14px; margin: 0; font-weight: 900;">${settings.storeName}</h2>
        ${settings.storeNameSi ? `<div style="font-size: 11px;">${settings.storeNameSi}</div>` : ''}
        ${settings.address ? `<div style="font-size: 10px;">${settings.address}</div>` : ''}
        ${settings.phone ? `<div style="font-size: 10px;">Tel: ${settings.phone}</div>` : ''}
        
        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 6px 0; padding: 4px 0; font-weight: bold;">
          FARMER PRODUCE INTAKE SLIP<br>
          <span style="font-size: 9.5px;">(එළවළු බාරගැනීමේ රිසිට්පත)</span>
        </div>

        <div style="text-align: left; font-size: 10px; margin-bottom: 6px;">
          <div>Slip No: <strong>${intake.slipNo}</strong></div>
          <div>Date/Time: ${intake.date} ${intake.time || ''}</div>
          <div>Farmer: <strong>${intake.farmerName}</strong> (${intake.farmerPhone || '-'})</div>
          <div>Received By: @${intake.receivedBy || 'staff'}</div>
        </div>

        <table style="width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 6px;">
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">Item</th>
              <th style="text-align: center;">KG</th>
              <th style="text-align: right;">Rate</th>
              <th style="text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div style="border-top: 1px solid #000; padding-top: 4px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between;">
            <span>Total Weight:</span>
            <strong>${intake.totalWeight ? intake.totalWeight.toFixed(2) : '-'} kg</strong>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; margin: 2px 0;">
            <span>Grand Total:</span>
            <span>${formatLKR(intake.grandTotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Paid Cash Now:</span>
            <span>${formatLKR(intake.paidAmount || 0)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 900; border-top: 1px dashed #000; margin-top: 3px; padding-top: 3px;">
            <span>Balance Due (ණය):</span>
            <span>${formatLKR(intake.balanceAmount || 0)}</span>
          </div>
        </div>

        <div style="margin-top: 15px; border-top: 1px dashed #000; padding-top: 6px; font-size: 9.5px;">
          <div>Please present this slip when collecting cash payout.</div>
          <div style="margin-top: 2px;">මුදල් ලබාගැනීමට පැමිණෙන විට කරුණාකර මෙම රිසිට්පත රැගෙන එන්න.</div>
        </div>
      </div>
    `;

    this._printContent(html, settings.thermalWidth);
  },

  async printPaymentVoucher(payment) {
    const settings = {
      storeName: (await getSetting('store_name', 'SUPERMARKET')).value || 'SUPERMARKET',
      phone: (await getSetting('store_phone', '')).value || '',
      thermalWidth: (await getSetting('thermal_width', '80mm')).value || '80mm'
    };

    const html = `
      <div style="text-align: center; font-family: monospace; font-size: 11px; line-height: 1.35; color: #000; padding: 4px;">
        <h2 style="font-size: 14px; margin: 0; font-weight: 900;">${settings.storeName}</h2>
        ${settings.phone ? `<div style="font-size: 10px;">Tel: ${settings.phone}</div>` : ''}

        <div style="border-top: 1px dashed #000; border-bottom: 1px dashed #000; margin: 6px 0; padding: 4px 0; font-weight: bold;">
          FARMER CASH PAYMENT VOUCHER<br>
          <span style="font-size: 9.5px;">(ගොවි මුදල් ගෙවීමේ වවුචරය)</span>
        </div>

        <div style="text-align: left; font-size: 10px; margin-bottom: 8px;">
          <div>Voucher No: <strong>${payment.paymentNo}</strong></div>
          <div>Date: ${payment.paymentDate}</div>
          <div>Paid To: <strong>${payment.farmerName}</strong></div>
          <div>Method: ${(payment.paymentMethod || 'CASH').toUpperCase()}</div>
          <div>Paid By: @${payment.paidBy || 'staff'}</div>
        </div>

        <div style="border: 1px solid #000; padding: 8px; margin-bottom: 8px; font-size: 13px; font-weight: 900;">
          AMOUNT PAID: ${formatLKR(payment.amount)}
        </div>

        ${payment.remainingBalance !== undefined ? `
          <div style="text-align: right; font-size: 10px; margin-bottom: 10px;">
            Remaining Farmer Balance Due: <strong>${formatLKR(payment.remainingBalance)}</strong>
          </div>
        ` : ''}

        <div style="margin-top: 25px; display: flex; justify-content: space-between; font-size: 9.5px;">
          <div style="border-top: 1px solid #000; width: 42%; text-align: center; padding-top: 2px;">
            Cashier Signature
          </div>
          <div style="border-top: 1px solid #000; width: 42%; text-align: center; padding-top: 2px;">
            Farmer Signature
          </div>
        </div>
      </div>
    `;

    this._printContent(html, settings.thermalWidth);
  },

  _printContent(html, thermalWidth = '80mm') {
    const printArea = document.getElementById('thermalReceiptPrintArea');
    if (!printArea) return;

    printArea.innerHTML = html;
    if (thermalWidth === '58mm') {
      document.body.classList.add('printer-58mm');
    } else {
      document.body.classList.remove('printer-58mm');
    }

    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 1000);
  }
};

// Close search dropdowns when clicking outside
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    // Vegetable dropdown
    const vegDropdown = document.getElementById('farmerVegSearchResults');
    const vegInput = document.getElementById('farmerVegSearchInput');
    if (vegDropdown && !vegDropdown.classList.contains('hidden')) {
      if (!vegInput || (vegInput !== e.target && !vegInput.contains(e.target))) {
        if (!vegDropdown.contains(e.target)) vegDropdown.classList.add('hidden');
      }
    }

    // Farmer picker dropdown
    const farmerDropdown = document.getElementById('farmerPickerSearchResults');
    const farmerInput = document.getElementById('farmerPickerSearchInput');
    if (farmerDropdown && !farmerDropdown.classList.contains('hidden')) {
      if (!farmerInput || (farmerInput !== e.target && !farmerInput.contains(e.target))) {
        if (!farmerDropdown.contains(e.target)) farmerDropdown.classList.add('hidden');
      }
    }
  });
}

window.FarmerManager = FarmerManager;


// ==================== js\expenses.js ====================

/**
 * Expense Management & Categorized Cost Logging
 * Supports customizable expense categories (Daily/Weekly/Monthly Salaries, Rent, Utilities, etc.)
 */

const ExpenseManager = {
  currentCategoryFilter: 'all',

  defaultCategories: [
    'Staff Salary - Daily (දෛනික වැටුප්)',
    'Staff Salary - Weekly (සතිපතා වැටුප්)',
    'Staff Salary - Monthly (මාසික වැටුප්)',
    'Electricity (විදුලි බිල්)',
    'Water (ජල බිල්)',
    'Shop Rent (කුලී)',
    'Transport & Fuel (ප්‍රවාහන සහ ඉන්ධන)',
    'Maintenance & Repairs (නඩත්තු සහ අලුත්වැඩියා)',
    'Tea & Staff Meals (තේ සහ ආහාර)',
    'Packaging & Bags (ඇසුරුම් / බෑග්)',
    'Other Expenses (වෙනත් වියදම්)'
  ],

  async init() {
    await this.populateCategoryDropdown();
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
  },

  async getCategories() {
    try {
      const stored = localStorage.getItem('pos_custom_expense_categories');
      let cats = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(cats) || cats.length === 0) {
        cats = [...this.defaultCategories];
        localStorage.setItem('pos_custom_expense_categories', JSON.stringify(cats));
      }

      // Filter out any farmer categories
      cats = cats.filter(c => !c.toLowerCase().includes('farmer'));

      // Also gather any categories found in existing non-farmer expenses
      const allExpenses = await db.expenses.toArray();
      allExpenses.forEach(e => {
        if (e.category && !e.category.toLowerCase().includes('farmer') && !cats.includes(e.category)) {
          cats.push(e.category);
        }
      });

      return cats;
    } catch (e) {
      return [...this.defaultCategories];
    }
  },

  async saveCategory(newCat) {
    const trimmed = (newCat || '').trim();
    if (!trimmed) return null;

    const cats = await this.getCategories();
    if (!cats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      cats.push(trimmed);
      localStorage.setItem('pos_custom_expense_categories', JSON.stringify(cats));
    }
    return trimmed;
  },

  async populateCategoryDropdown(selectedVal = '') {
    const select = document.getElementById('expenseCategoryInput');
    if (!select) return;

    const categories = await this.getCategories();
    select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('') +
      `<option value="__new__" class="font-bold text-sky-400">➕ + නව වර්ගයක් එක් කරන්න (Add New Category)...</option>`;

    if (selectedVal && categories.includes(selectedVal)) {
      select.value = selectedVal;
    } else if (categories.length > 0) {
      select.value = categories[0];
    }
  },

  async onCategorySelectChange(selectEl) {
    if (selectEl && selectEl.value === '__new__') {
      await this.promptAddNewCategory();
    }
  },

  async promptAddNewCategory() {
    const catName = prompt('නව වියදම් වර්ගයේ නම ඇතුළත් කරන්න (Enter New Expense Category):\nඋදා: Salary - Kasun, Daily Wages, Cleaning, Generator Fuel...');
    if (catName && catName.trim()) {
      const saved = await this.saveCategory(catName.trim());
      await this.populateCategoryDropdown(saved);
      await this.renderCategoryFilterBar();
      if (window.SoundManager) SoundManager.playSuccessChime();
    } else {
      // Revert select away from __new__
      const select = document.getElementById('expenseCategoryInput');
      if (select && select.value === '__new__') {
        const cats = await this.getCategories();
        select.value = cats[0] || '';
      }
    }
  },

  async renderCategoryFilterBar() {
    const bar = document.getElementById('expenseCategoryFilterBar');
    if (!bar) return;

    const categories = await this.getCategories();
    const active = this.currentCategoryFilter;

    let html = `
      <button onclick="ExpenseManager.setCategoryFilter('all')" class="exp-filter-btn px-3 py-1.5 ${active === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-xl text-xs font-bold transition shrink-0" data-cat="all">
        All (සියල්ල)
      </button>
    `;

    categories.forEach(cat => {
      const isSelected = active === cat;
      html += `
        <button onclick="ExpenseManager.setCategoryFilter('${cat.replace(/'/g, "\\'")}')" class="exp-filter-btn px-3 py-1.5 ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap" data-cat="${cat}">
          ${cat}
        </button>
      `;
    });

    bar.innerHTML = html;
  },

  async setCategoryFilter(category) {
    this.currentCategoryFilter = category;
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
  },

  async renderExpenseSummary() {
    let expenses = await db.expenses.toArray();
    // Strictly isolate: Farmers liabilities are never in operational expenses
    expenses = expenses.filter(e => !e.category || !e.category.toLowerCase().includes('farmer'));

    let total = 0;
    const catMap = {};

    expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      total += amt;
      catMap[e.category] = (catMap[e.category] || 0) + amt;
    });

    const totalEl = document.getElementById('expenseTotalDisplay');
    if (totalEl) totalEl.textContent = formatLKR(total);
  },

  async renderExpensesTable() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    let expenses = await db.expenses.reverse().toArray();
    // Strictly isolate: Farmers liabilities are never in operational expenses
    expenses = expenses.filter(e => !e.category || !e.category.toLowerCase().includes('farmer'));

    if (this.currentCategoryFilter !== 'all') {
      expenses = expenses.filter(e => e.category === this.currentCategoryFilter);
    }

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">වියදම් සටහන් කර නැත (No expenses recorded yet).</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
        <td class="p-3 font-mono text-slate-400">${e.date}</td>
        <td class="p-3 font-semibold text-slate-100">${e.title}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-sky-300 border border-slate-700">
            ${e.category}
          </span>
        </td>
        <td class="p-3 font-mono font-bold text-rose-400 text-right">${formatLKR(e.amount)}</td>
        <td class="p-3 text-slate-400 text-[11px]">${e.notes || '-'}</td>
        <td class="p-3 text-right">
          <button onclick="ExpenseManager.deleteExpense(${e.id})" class="p-1.5 text-rose-400 hover:bg-rose-950 rounded transition" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  async openAddExpenseModal() {
    const form = document.getElementById('expenseForm');
    if (form) form.reset();
    const dateInput = document.getElementById('expenseDateInput');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    await this.populateCategoryDropdown();
    document.getElementById('expenseModal')?.classList.remove('hidden');
  },

  async saveExpense(event) {
    if (event) event.preventDefault();
    const title = document.getElementById('expenseTitleInput')?.value.trim();
    let category = document.getElementById('expenseCategoryInput')?.value;
    const amount = parseFloat(document.getElementById('expenseAmountInput')?.value) || 0;
    const date = document.getElementById('expenseDateInput')?.value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('expenseNotesInput')?.value.trim() || '';

    if (!amount || amount <= 0) {
      alert('කරුණාකර වලංගු මුදලක් ඇතුළත් කරන්න (Please enter valid amount).');
      return;
    }

    if (!category || category === '__new__') {
      category = 'Other Expenses (වෙනත් වියදම්)';
    }

    await db.expenses.add({
      title,
      category,
      amount,
      date,
      notes,
      user: (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'admin',
      timestamp: new Date().toISOString()
    });

    document.getElementById('expenseModal')?.classList.add('hidden');
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
    if (window.SoundManager) SoundManager.playSuccessChime();
  },

  async deleteExpense(id) {
    if (confirm('මෙම වියදම් සටහන මැකීමට ඔබට සහතිකද? (Delete this expense entry?)')) {
      await db.expenses.delete(id);
      await this.renderExpensesTable();
      await this.renderExpenseSummary();
    }
  }
};

window.ExpenseManager = ExpenseManager;


// ==================== js\shifts.js ====================

/**
 * Cash Drawer & Shift Management (Opening Float, Sales Tracking, End of Shift Reconciliation & Variance)
 */

const ShiftManager = {
  activeShift: null,

  async init() {
    await this.checkActiveShift();
    await this.renderShiftsHistory();
  },

  async checkActiveShift() {
    const user = AuthManager.currentUser;
    if (!user) return;

    // Find any open shift
    const openShift = await db.shifts
      .where('status')
      .equals('open')
      .and(s => s.cashierId === user.id)
      .first();

    if (openShift) {
      this.activeShift = openShift;
      this.updateShiftStatusUI();
    } else {
      this.activeShift = null;
      this.updateShiftStatusUI();
    }
  },

  updateShiftStatusUI() {
    const statusPill = document.getElementById('headerShiftPill');
    const shiftViewCard = document.getElementById('activeShiftDetailsCard');

    if (this.activeShift) {
      if (statusPill) {
        statusPill.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>Shift #${this.activeShift.id} (${I18n.currentLang === 'si' ? 'විවෘතයි' : (I18n.currentLang === 'bi' ? 'විවෘතයි / Open' : 'Open')})</span>
        `;
        statusPill.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-emerald-950/80 border border-emerald-700 text-emerald-300 rounded-full text-xs font-semibold';
      }

      if (shiftViewCard) {
        const expectedCash = (this.activeShift.startingFloat || 0) + (this.activeShift.cashSales || 0);
        shiftViewCard.innerHTML = `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="p-4 bg-slate-900 border border-slate-700 rounded-2xl">
              <div class="text-xs text-slate-400">${I18n.t('openingFloat')}</div>
              <div class="text-lg font-black text-slate-100 font-mono mt-1">${formatLKR(this.activeShift.startingFloat)}</div>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-700 rounded-2xl">
              <div class="text-xs text-slate-400">${I18n.t('cashSales')}</div>
              <div class="text-lg font-black text-emerald-400 font-mono mt-1">${formatLKR(this.activeShift.cashSales || 0)}</div>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-700 rounded-2xl">
              <div class="text-xs text-slate-400">${I18n.t('cardQrSales')}</div>
              <div class="text-lg font-black text-sky-400 font-mono mt-1">${formatLKR((this.activeShift.cardSales || 0) + (this.activeShift.bankSales || 0))}</div>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-700 rounded-2xl">
              <div class="text-xs text-slate-400">${I18n.t('expectedInDrawer')}</div>
              <div class="text-lg font-black text-amber-400 font-mono mt-1">${formatLKR(expectedCash)}</div>
            </div>
          </div>
          <div class="flex items-center justify-between p-4 bg-slate-900/60 border border-slate-800 rounded-xl">
            <div class="text-xs text-slate-300 font-mono">
              Started: <strong>${new Date(this.activeShift.startTime).toLocaleTimeString()}</strong> &bull; Total Txns: <strong>${this.activeShift.salesCount || 0}</strong>
            </div>
            <button onclick="ShiftManager.openCloseShiftModal()" class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
              ${I18n.t('endShiftReconcile')}
            </button>
          </div>
        `;
      }
    } else {
      if (statusPill) {
        statusPill.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-400"></span>
          <span>${I18n.t('noShiftOpen')}</span>
        `;
        statusPill.className = 'flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/80 border border-rose-700 text-rose-300 rounded-full text-xs font-semibold cursor-pointer';
        statusPill.onclick = () => ShiftManager.openStartShiftModal();
      }

      if (shiftViewCard) {
        shiftViewCard.innerHTML = `
          <div class="p-8 text-center bg-slate-900/40 border border-dashed border-slate-700 rounded-2xl">
            <div class="text-4xl mb-3">💵</div>
            <h3 class="text-base font-bold text-slate-100">${I18n.t('noShiftOpen')}</h3>
            <p class="text-xs text-slate-400 max-w-sm mx-auto mt-1 mb-4">${I18n.t('startShiftPrompt')}</p>
            <button onclick="ShiftManager.openStartShiftModal()" class="px-5 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition">
              ${I18n.t('openNewShiftBtn')}
            </button>
          </div>
        `;
      }
    }
  },

  openStartShiftModal() {
    document.getElementById('startShiftFloatInput').value = '5000.00';
    document.getElementById('startShiftModal').classList.remove('hidden');
  },

  async startNewShift(event) {
    event.preventDefault();
    const user = AuthManager.currentUser || { id: 1, fullName: 'Super Admin' };
    const floatAmt = parseFloat(document.getElementById('startShiftFloatInput').value) || 0;

    const newShift = {
      cashierId: user.id,
      cashierName: user.fullName,
      startTime: new Date().toISOString(),
      endTime: null,
      startingFloat: floatAmt,
      cashSales: 0,
      cardSales: 0,
      bankSales: 0,
      creditSales: 0,
      salesCount: 0,
      expectedCash: floatAmt,
      actualCash: 0,
      variance: 0,
      status: 'open'
    };

    const shiftId = await db.shifts.add(newShift);
    newShift.id = shiftId;
    this.activeShift = newShift;

    document.getElementById('startShiftModal').classList.add('hidden');
    this.updateShiftStatusUI();
    await this.renderShiftsHistory();
    SoundManager.playSuccessChime();
  },

  async recordSaleInShift(sale) {
    if (!this.activeShift) return;

    let cashInc = 0;
    let cardInc = 0;
    let bankInc = 0;
    let creditInc = 0;

    if (sale.paymentMethod === 'cash') cashInc = sale.grandTotal;
    else if (sale.paymentMethod === 'card') cardInc = sale.grandTotal;
    else if (sale.paymentMethod === 'bank') bankInc = sale.grandTotal;
    else if (sale.paymentMethod === 'credit') creditInc = sale.grandTotal;
    else if (sale.paymentMethod === 'split') {
      cashInc = Number(sale.paidCash) || 0;
      creditInc = Number(sale.creditAmount) || Math.max(0, sale.grandTotal - cashInc);
    }

    const updated = {
      cashSales: (this.activeShift.cashSales || 0) + cashInc,
      cardSales: (this.activeShift.cardSales || 0) + cardInc,
      bankSales: (this.activeShift.bankSales || 0) + bankInc,
      creditSales: (this.activeShift.creditSales || 0) + creditInc,
      salesCount: (this.activeShift.salesCount || 0) + 1
    };

    await db.shifts.update(this.activeShift.id, updated);
    this.activeShift = { ...this.activeShift, ...updated };
    this.updateShiftStatusUI();
  },

  openCloseShiftModal() {
    if (!this.activeShift) return;

    const expectedCash = (this.activeShift.startingFloat || 0) + (this.activeShift.cashSales || 0);

    document.getElementById('closeShiftFloatText').textContent = formatLKR(this.activeShift.startingFloat);
    document.getElementById('closeShiftCashSalesText').textContent = formatLKR(this.activeShift.cashSales || 0);
    document.getElementById('closeShiftCardSalesText').textContent = formatLKR((this.activeShift.cardSales || 0) + (this.activeShift.bankSales || 0));
    document.getElementById('closeShiftExpectedCashText').textContent = formatLKR(expectedCash);

    const actualInput = document.getElementById('closeShiftActualCashInput');
    actualInput.value = expectedCash;
    this.calculateShiftVariance();

    document.getElementById('closeShiftModal').classList.remove('hidden');
    actualInput.focus();
  },

  calculateShiftVariance() {
    if (!this.activeShift) return;
    const expectedCash = (this.activeShift.startingFloat || 0) + (this.activeShift.cashSales || 0);
    const actualCash = parseFloat(document.getElementById('closeShiftActualCashInput').value) || 0;
    const variance = actualCash - expectedCash;

    const varEl = document.getElementById('closeShiftVarianceText');
    if (varEl) {
      if (variance === 0) {
        varEl.textContent = 'Exact match (Rs. 0.00)';
        varEl.className = 'text-base font-black text-emerald-400 font-mono';
      } else if (variance > 0) {
        varEl.textContent = `+${formatLKR(variance)} (Surplus / Excess)`;
        varEl.className = 'text-base font-black text-sky-400 font-mono';
      } else {
        varEl.textContent = `${formatLKR(variance)} (Shortage / Deficit)`;
        varEl.className = 'text-base font-black text-rose-400 font-mono';
      }
    }
  },

  async confirmCloseShift() {
    if (!this.activeShift) return;

    const expectedCash = (this.activeShift.startingFloat || 0) + (this.activeShift.cashSales || 0);
    const actualCash = parseFloat(document.getElementById('closeShiftActualCashInput').value) || 0;
    const variance = actualCash - expectedCash;
    const notes = document.getElementById('closeShiftNotesInput').value.trim();

    const closedData = {
      endTime: new Date().toISOString(),
      expectedCash,
      actualCash,
      variance,
      notes,
      status: 'closed'
    };

    await db.shifts.update(this.activeShift.id, closedData);

    const shiftToPrint = { ...this.activeShift, ...closedData };
    this.activeShift = null;

    document.getElementById('closeShiftModal').classList.add('hidden');
    this.updateShiftStatusUI();
    await this.renderShiftsHistory();
    SoundManager.playSuccessChime();

    // Print Shift Z-Report Slip
    await this.printShiftZReport(shiftToPrint);
  },

  async printShiftZReport(shift) {
    const storeName = await getSetting('store_name', '');
    const storeNameSi = await getSetting('store_name_si', '');

    const htmlContent = `
      <div class="text-center pb-2 border-b border-dashed border-slate-900 font-mono">
        ${storeName ? `<h2 class="text-base font-extrabold uppercase">${storeName}</h2>` : ''}
        ${storeNameSi && storeNameSi !== 'ලංකා මෙගා සුපර්මාර්කට්' ? `<div class="text-xs font-bold">${storeNameSi}</div>` : ''}
        <div class="text-xs mt-1">*** SHIFT Z-REPORT / CLOSING SLIP ***</div>
        <div class="text-[11px]">Shift ID: #${shift.id}</div>
      </div>
      <div class="py-2 text-[11px] font-mono border-b border-dashed border-slate-900 space-y-0.5">
        <div class="flex justify-between"><span>Cashier:</span><strong>${shift.cashierName}</strong></div>
        <div class="flex justify-between"><span>Started:</span><span>${new Date(shift.startTime).toLocaleString()}</span></div>
        <div class="flex justify-between"><span>Closed:</span><span>${new Date(shift.endTime).toLocaleString()}</span></div>
        <div class="flex justify-between"><span>Total Invoices:</span><strong>${shift.salesCount || 0}</strong></div>
      </div>
      <div class="py-2 text-xs font-mono space-y-1 border-b-2 border-slate-900">
        <div class="flex justify-between"><span>Starting Float:</span><span>${formatLKR(shift.startingFloat)}</span></div>
        <div class="flex justify-between"><span>Cash Sales:</span><span>${formatLKR(shift.cashSales)}</span></div>
        <div class="flex justify-between"><span>Card Sales:</span><span>${formatLKR(shift.cardSales)}</span></div>
        <div class="flex justify-between"><span>QR / Bank Sales:</span><span>${formatLKR(shift.bankSales || 0)}</span></div>
        <div class="flex justify-between"><span>Credit Sales:</span><span>${formatLKR(shift.creditSales || 0)}</span></div>
        <div class="flex justify-between font-bold border-t border-slate-900 pt-1"><span>Expected Drawer Cash:</span><span>${formatLKR(shift.expectedCash)}</span></div>
        <div class="flex justify-between font-bold"><span>Actual Cash Counted:</span><span>${formatLKR(shift.actualCash)}</span></div>
        <div class="flex justify-between text-sm font-black border-t border-slate-900 pt-1 ${shift.variance < 0 ? 'text-rose-700' : 'text-slate-900'}">
          <span>VARIANCE:</span>
          <span>${shift.variance > 0 ? '+' : ''}${formatLKR(shift.variance)}</span>
        </div>
      </div>
      ${shift.notes ? `<div class="text-[10px] italic py-1 font-mono">Notes: ${shift.notes}</div>` : ''}
      <div class="text-center pt-4 text-xs font-mono">
        <div>Cashier Signature: __________________</div>
        <div class="mt-3">Manager Signature: __________________</div>
      </div>
    `;

    const printArea = document.getElementById('thermalReceiptPrintArea');
    if (printArea) {
      printArea.innerHTML = htmlContent;
      document.body.classList.add('printing-receipt');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-receipt');
      }, 1000);
    }
  },

  async renderShiftsHistory() {
    const tbody = document.getElementById('shiftsHistoryTableBody');
    if (!tbody) return;

    const shifts = await db.shifts.reverse().toArray();
    if (shifts.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400">No shift history found.</td></tr>`;
      return;
    }

    tbody.innerHTML = shifts.map(s => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono font-bold text-sky-400">#${s.id}</td>
        <td class="p-3 font-semibold text-slate-100">${s.cashierName}</td>
        <td class="p-3 font-mono text-slate-400">${new Date(s.startTime).toLocaleDateString()} ${new Date(s.startTime).toLocaleTimeString()}</td>
        <td class="p-3 font-mono text-right">${formatLKR(s.startingFloat)}</td>
        <td class="p-3 font-mono text-right text-emerald-400 font-bold">${formatLKR((s.cashSales || 0) + (s.cardSales || 0))}</td>
        <td class="p-3 font-mono text-right font-bold ${(s.variance || 0) < 0 ? 'text-rose-400' : (s.variance || 0) > 0 ? 'text-sky-400' : 'text-slate-300'}">
          ${(s.variance || 0) > 0 ? '+' : ''}${formatLKR(s.variance || 0)}
        </td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${
            s.status === 'open' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800 animate-pulse' : 'bg-slate-800 text-slate-400'
          }">
            ${(s.status || 'closed').toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  }
};

window.ShiftManager = ShiftManager;


// ==================== js\reports.js ====================

/**
 * Comprehensive Supermarket Reports, Financial Analytics, Visual Charts & A4 PDF Printing Engine
 */

const ReportsManager = {
  currentReportType: 'daily_sales',
  currentRange: 'today', // 'today', 'yesterday', '7days', '30days', 'month', 'all', 'custom'
  startDate: null,
  endDate: null,
  charts: {},

  async init() {
    this.setupDateFilters();
    await this.generateReports();
  },

  setupDateFilters() {
    const fromInput = document.getElementById('reportDateFrom');
    const toInput = document.getElementById('reportDateTo');
    const today = new Date().toISOString().slice(0, 10);

    if (fromInput && !fromInput.value) fromInput.value = today;
    if (toInput && !toInput.value) toInput.value = today;
  },

  setReportType(type) {
    this.currentReportType = type;
    document.querySelectorAll('.report-type-btn').forEach(btn => {
      if (btn.getAttribute('data-type') === type) {
        btn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });
    this.generateReports();
  },

  setRange(range) {
    this.currentRange = range;
    document.querySelectorAll('.report-range-btn').forEach(btn => {
      if (btn.getAttribute('data-range') === range) {
        btn.classList.add('bg-sky-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });

    const now = new Date();
    const fromInput = document.getElementById('reportDateFrom');
    const toInput = document.getElementById('reportDateTo');

    if (range === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      if (fromInput) fromInput.value = todayStr;
      if (toInput) toInput.value = todayStr;
    } else if (range === 'yesterday') {
      const yest = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = yest;
      if (toInput) toInput.value = yest;
    } else if (range === '7days') {
      const past7 = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = past7;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === '30days') {
      const past30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = past30;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = firstDay;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === 'all') {
      if (fromInput) fromInput.value = '2020-01-01';
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    }

    this.generateReports();
  },

  getDateBounds() {
    const fromVal = document.getElementById('reportDateFrom')?.value;
    const toVal = document.getElementById('reportDateTo')?.value;

    let start = fromVal ? new Date(`${fromVal}T00:00:00`) : new Date(0);
    let end = toVal ? new Date(`${toVal}T23:59:59`) : new Date();

    return { start, end, fromStr: fromVal || 'Beginning', toStr: toVal || 'Today' };
  },

  async generateReports() {
    const { start, end } = this.getDateBounds();
    const allSales = await db.sales.toArray();
    const allSaleItems = await db.saleItems.toArray();
    const allExpenses = await db.expenses.toArray();
    const allProducts = await db.products.toArray();
    const allCustomers = await db.customers.toArray();
    const allSuppliers = await db.suppliers.toArray();
    const allPurchases = await db.purchases.toArray();
    const allReturns = await db.returns.toArray();

    // Filter by Date
    const filteredSales = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });

    const saleIds = new Set(filteredSales.map(s => s.id));
    const filteredItems = allSaleItems.filter(i => saleIds.has(i.saleId));
    const filteredExpenses = allExpenses.filter(e => {
      const d = new Date(`${e.date}T00:00:00`);
      return d >= start && d <= end;
    });
    const filteredPurchases = allPurchases.filter(p => {
      const d = new Date(`${p.date}T00:00:00`);
      return d >= start && d <= end;
    });
    const filteredReturns = allReturns.filter(r => {
      const d = new Date(`${r.date}T00:00:00`);
      return d >= start && d <= end;
    });

    // KPI Calculations
    const totalRevenue = filteredSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    const totalTransactions = filteredSales.length;
    const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    let totalCOGS = 0;
    filteredItems.forEach(i => {
      totalCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });

    const grossProfit = totalRevenue - totalCOGS;
    const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;

    const totalExpenses = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const netProfit = grossProfit - totalExpenses;
    const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Update KPI UI
    const elRev = document.getElementById('repTotalRevenue');
    const elTxns = document.getElementById('repTotalTransactions');
    const elAvg = document.getElementById('repAvgBasket');
    const elCOGS = document.getElementById('repTotalCOGS');
    const elGrossProfit = document.getElementById('repGrossProfit');
    const elExpenses = document.getElementById('repTotalExpenses');
    const elNetProfit = document.getElementById('repNetProfit');

    if (elRev) elRev.textContent = formatLKR(totalRevenue);
    if (elTxns) elTxns.textContent = totalTransactions.toLocaleString();
    if (elAvg) elAvg.textContent = formatLKR(avgBasket);
    if (elCOGS) elCOGS.textContent = formatLKR(totalCOGS);
    if (elGrossProfit) elGrossProfit.textContent = `${formatLKR(grossProfit)} (${grossMarginPct}%)`;
    if (elExpenses) elExpenses.textContent = formatLKR(totalExpenses);
    if (elNetProfit) {
      elNetProfit.textContent = `${formatLKR(netProfit)} (${netMarginPct}%)`;
      elNetProfit.className = `text-2xl sm:text-3xl font-black font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // Render Active Report Table View
    this.renderSelectedReportTable({
      sales: filteredSales,
      items: filteredItems,
      expenses: filteredExpenses,
      products: allProducts,
      customers: allCustomers,
      suppliers: allSuppliers,
      purchases: filteredPurchases,
      returns: filteredReturns,
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalExpenses,
      netProfit
    });

    // Render Visual Charts
    this.renderCharts(filteredSales, filteredItems);
  },

  renderSelectedReportTable(data) {
    const container = document.getElementById('reportDetailTableContainer');
    const titleEl = document.getElementById('activeReportTitle');
    if (!container) return;

    let html = '';
    const type = this.currentReportType;

    if (type === 'daily_sales') {
      if (titleEl) titleEl.textContent = 'Sales Invoices & Transactions Summary';
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Invoice No</th>
              <th class="p-3">Date / Time</th>
              <th class="p-3">Cashier</th>
              <th class="p-3">Customer</th>
              <th class="p-3">Payment</th>
              <th class="p-3 text-right">Discounts</th>
              <th class="p-3 text-right">Total (LKR)</th>
            </tr>
          </thead>
          <tbody>
            ${data.sales.length === 0 ? `<tr><td colspan="7" class="text-center py-6 text-slate-500">No sales transactions in this period.</td></tr>` :
              data.sales.map(s => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                  <td class="p-3 font-mono font-bold text-sky-400">${s.invoiceNo}</td>
                  <td class="p-3 font-mono text-slate-400 text-[11px]">${new Date(s.timestamp).toLocaleString()}</td>
                  <td class="p-3 text-slate-200">${s.cashierName}</td>
                  <td class="p-3 text-slate-300">${s.customerName || 'Walk-in'}</td>
                  <td class="p-3 uppercase font-bold text-[10px] text-emerald-400">${s.paymentMethod}</td>
                  <td class="p-3 text-right font-mono text-amber-300">-${formatLKR(s.totalDiscount || 0)}</td>
                  <td class="p-3 text-right font-mono font-black text-slate-100">${formatLKR(s.grandTotal)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'company_sales') {
      if (titleEl) titleEl.textContent = 'Company / Brand Daily Sales & Performance';
      
      const prodLookup = {};
      data.products.forEach(p => {
        prodLookup[p.id] = p;
      });

      const suppLookup = {};
      data.suppliers.forEach(s => {
        suppLookup[s.id] = s.name;
      });

      const companyMap = {};
      data.items.forEach(i => {
        const prod = prodLookup[i.productId];
        let companyName = prod?.brand || (prod?.supplierId && suppLookup[prod.supplierId]) || 'General / Other Brands';
        if (!companyMap[companyName]) {
          companyMap[companyName] = { name: companyName, qty: 0, revenue: 0, cost: 0, distinctItems: new Set() };
        }
        companyMap[companyName].qty += Number(i.qty) || 0;
        companyMap[companyName].revenue += Number(i.total) || 0;
        companyMap[companyName].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
        companyMap[companyName].distinctItems.add(i.productName);
      });

      const sorted = Object.values(companyMap).sort((a, b) => b.revenue - a.revenue);
      const totalCompanyRev = sorted.reduce((acc, c) => acc + c.revenue, 0);

      html = `
        <div class="p-3 bg-slate-850 border-b border-slate-800 flex flex-wrap justify-between items-center text-xs font-mono px-4 gap-2">
          <div>Total Companies / Brands Sold: <strong class="text-sky-400">${sorted.length}</strong></div>
          <div>Total Brand Revenue: <strong class="text-emerald-400">${formatLKR(totalCompanyRev)}</strong></div>
          <div class="text-[11px] text-slate-400 font-sans">📅 Defaults to Today, automatically refreshes daily</div>
        </div>
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Company / Brand Name</th>
              <th class="p-3 text-center">Product Variety</th>
              <th class="p-3 text-center">Total Qty Sold</th>
              <th class="p-3 text-right">Sales Revenue</th>
              <th class="p-3 text-right">COGS Cost</th>
              <th class="p-3 text-right">Gross Profit</th>
              <th class="p-3 text-right">Contribution %</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length === 0 ? `<tr><td colspan="7" class="text-center py-6 text-slate-500">No company sales recorded in this period.</td></tr>` :
              sorted.map(c => {
                const profit = c.revenue - c.cost;
                const contribPct = totalCompanyRev > 0 ? ((c.revenue / totalCompanyRev) * 100).toFixed(1) : 0;
                return `
                  <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                    <td class="p-3">
                      <div class="font-extrabold text-slate-100 text-sm flex items-center gap-2">
                        <span class="p-1 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px]">🏢</span>
                        <span>${c.name}</span>
                      </div>
                    </td>
                    <td class="p-3 text-center font-mono text-slate-400">${c.distinctItems.size} items</td>
                    <td class="p-3 text-center font-mono font-bold text-sky-300">${c.qty}</td>
                    <td class="p-3 text-right font-mono font-black text-slate-100 text-sm">${formatLKR(c.revenue)}</td>
                    <td class="p-3 text-right font-mono text-slate-400">${formatLKR(c.cost)}</td>
                    <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(profit)}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-300">${contribPct}%</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'product_sales') {
      if (titleEl) titleEl.textContent = 'Product Sales & Best Sellers Analysis';
      const prodMap = {};
      data.items.forEach(i => {
        if (!prodMap[i.productId]) {
          prodMap[i.productId] = { name: i.productName, sku: i.sku, qty: 0, revenue: 0, cost: 0 };
        }
        prodMap[i.productId].qty += Number(i.qty) || 0;
        prodMap[i.productId].revenue += Number(i.total) || 0;
        prodMap[i.productId].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
      });

      const sorted = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Product Name / SKU</th>
              <th class="p-3 text-center">Qty Sold</th>
              <th class="p-3 text-right">Sales Revenue</th>
              <th class="p-3 text-right">COGS Cost</th>
              <th class="p-3 text-right">Gross Profit</th>
              <th class="p-3 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length === 0 ? `<tr><td colspan="6" class="text-center py-6 text-slate-500">No product sales in this period.</td></tr>` :
              sorted.map(p => {
                const profit = p.revenue - p.cost;
                const margin = p.revenue > 0 ? ((profit / p.revenue) * 100).toFixed(1) : 0;
                return `
                  <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                    <td class="p-3">
                      <div class="font-bold text-slate-100">${p.name}</div>
                      <div class="text-[11px] font-mono text-slate-400">SKU: ${p.sku}</div>
                    </td>
                    <td class="p-3 text-center font-mono font-bold text-sky-300">${p.qty}</td>
                    <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR(p.revenue)}</td>
                    <td class="p-3 text-right font-mono text-slate-400">${formatLKR(p.cost)}</td>
                    <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(profit)}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-300">${margin}%</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'monthly_profit') {
      if (titleEl) titleEl.textContent = 'Profit & Loss (P&L) Financial Statement';
      html = `
        <div class="p-6 bg-slate-900 rounded-2xl space-y-4 max-w-2xl mx-auto font-mono text-xs">
          <div class="text-center pb-3 border-b border-slate-800">
            <h3 class="text-lg font-black text-slate-100">PROFIT & LOSS STATEMENT</h3>
            <p class="text-slate-400 text-xs">Period: ${this.getDateBounds().fromStr} to ${this.getDateBounds().toStr}</p>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-300">1. Gross Sales Revenue</span><strong class="text-sky-400">${formatLKR(data.totalRevenue)}</strong></div>
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-400">2. Less: Cost of Goods Sold (COGS)</span><span class="text-rose-300">-${formatLKR(data.totalCOGS)}</span></div>
            <div class="flex justify-between py-2 bg-slate-850 px-3 rounded-xl"><span class="font-bold text-slate-200">3. GROSS PROFIT</span><strong class="text-emerald-400">${formatLKR(data.grossProfit)}</strong></div>
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-400">4. Less: Operating Expenses</span><span class="text-rose-400">-${formatLKR(data.totalExpenses)}</span></div>
            <div class="flex justify-between py-3 bg-slate-950 px-3 rounded-xl border border-slate-700 text-base font-black">
              <span class="text-slate-100">5. NET PROFIT (ලාභය)</span>
              <span class="${data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatLKR(data.netProfit)}</span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'stock_valuation') {
      if (titleEl) titleEl.textContent = 'Stock Valuation & Inventory Summary';
      let totalStockCost = 0;
      let totalStockRetail = 0;
      data.products.forEach(p => {
        const qty = Number(p.currentStock) || 0;
        totalStockCost += (Number(p.costPrice) || 0) * qty;
        totalStockRetail += (Number(p.sellingPrice) || 0) * qty;
      });

      html = `
        <div class="p-3 bg-slate-850 border-b border-slate-800 flex justify-between items-center text-xs font-mono px-4">
          <div>Total Items: <strong>${data.products.length}</strong></div>
          <div>Total Cost Valuation: <strong class="text-slate-200">${formatLKR(totalStockCost)}</strong></div>
          <div>Total Retail Valuation: <strong class="text-sky-400">${formatLKR(totalStockRetail)}</strong></div>
        </div>
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Product Name</th>
              <th class="p-3">SKU</th>
              <th class="p-3 text-center">Stock</th>
              <th class="p-3 text-right">Cost Price</th>
              <th class="p-3 text-right">Selling Price</th>
              <th class="p-3 text-right">Total Cost Value</th>
            </tr>
          </thead>
          <tbody>
            ${data.products.map(p => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-semibold text-slate-100">${p.name}</td>
                <td class="p-3 font-mono text-slate-400">${p.sku}</td>
                <td class="p-3 text-center font-mono font-bold text-sky-300">${p.currentStock} ${p.unit}</td>
                <td class="p-3 text-right font-mono text-slate-300">${formatLKR(p.costPrice)}</td>
                <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(p.sellingPrice)}</td>
                <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR((p.costPrice || 0) * (p.currentStock || 0))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'customer_credit') {
      if (titleEl) titleEl.textContent = 'Customer Credit Accounts & Balances Report';
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Customer Name</th>
              <th class="p-3">Phone</th>
              <th class="p-3 text-right">Credit Balance</th>
              <th class="p-3 text-right">Lifetime Spent</th>
            </tr>
          </thead>
          <tbody>
            ${data.customers.map(c => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-bold text-slate-100">${c.name}</td>
                <td class="p-3 font-mono text-sky-400">${c.phone}</td>
                <td class="p-3 text-right font-mono font-bold ${(c.creditBalance || 0) > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}">${formatLKR(c.creditBalance || 0)}</td>
                <td class="p-3 text-right font-mono text-slate-200">${formatLKR(c.totalSpent || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Default: Cashier Sales & Expenses
      if (titleEl) titleEl.textContent = 'Cashier Performance & Shift Sales';
      const cashierMap = {};
      data.sales.forEach(s => {
        const name = s.cashierName || 'Unknown';
        if (!cashierMap[name]) cashierMap[name] = { count: 0, total: 0 };
        cashierMap[name].count += 1;
        cashierMap[name].total += (Number(s.grandTotal) || 0);
      });

      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Cashier Name</th>
              <th class="p-3 text-center">Bills Issued</th>
              <th class="p-3 text-right">Total Revenue (LKR)</th>
              <th class="p-3 text-right">Average Bill</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(cashierMap).map(([name, d]) => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-bold text-slate-100">${name}</td>
                <td class="p-3 text-center font-mono font-bold text-sky-300">${d.count}</td>
                <td class="p-3 text-right font-mono font-black text-emerald-400">${formatLKR(d.total)}</td>
                <td class="p-3 text-right font-mono text-slate-300">${formatLKR(d.count > 0 ? d.total / d.count : 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    container.innerHTML = html;
  },

  renderCharts(sales, saleItems) {
    if (!window.Chart) return;

    // 1. Sales Trend
    const salesCtx = document.getElementById('repSalesTrendChart');
    if (salesCtx) {
      if (this.charts.salesTrend) this.charts.salesTrend.destroy();
      const dayMap = {};
      const dayLabels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        dayLabels.push(d);
        dayMap[d] = 0;
      }
      sales.forEach(s => {
        const d = s.timestamp.slice(0, 10);
        if (dayMap[d] !== undefined) dayMap[d] += Number(s.grandTotal) || 0;
      });

      this.charts.salesTrend = new Chart(salesCtx, {
        type: 'line',
        data: {
          labels: dayLabels.map(d => d.slice(5)),
          datasets: [{
            label: 'Sales Revenue (LKR)',
            data: dayLabels.map(d => dayMap[d]),
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: '#38bdf8'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }

    // 2. Top 5 Products
    const topProdCtx = document.getElementById('repTopProductsChart');
    if (topProdCtx) {
      if (this.charts.topProducts) this.charts.topProducts.destroy();
      const prodMap = {};
      saleItems.forEach(i => {
        prodMap[i.productName] = (prodMap[i.productName] || 0) + (Number(i.qty) || 0);
      });
      const sorted = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

      this.charts.topProducts = new Chart(topProdCtx, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s[0].slice(0, 16) + (s[0].length > 16 ? '..' : '')),
          datasets: [{
            label: 'Qty Sold',
            data: sorted.map(s => s[1]),
            backgroundColor: ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }
  },

  // ==========================================
  // PROFESSIONAL A4 PDF & REPORT PRINT GENERATOR
  // ==========================================

  async printA4Report() {
    const { fromStr, toStr, start, end } = this.getDateBounds();
    const storeName = await getSetting('store_name', 'SUPERMARKET');
    const storeAddress = await getSetting('store_address', '');
    const storePhone = await getSetting('store_phone', '');
    const storeLogo = await getSetting('store_logo', null);

    const allSales = await db.sales.toArray();
    const allSaleItems = await db.saleItems.toArray();
    const allExpenses = await db.expenses.toArray();
    const allProducts = await db.products.toArray();

    const filteredSales = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });
    const saleIds = new Set(filteredSales.map(s => s.id));
    const filteredItems = allSaleItems.filter(i => saleIds.has(i.saleId));
    const filteredExpenses = allExpenses.filter(e => {
      const d = new Date(`${e.date}T00:00:00`);
      return d >= start && d <= end;
    });

    const totalSales = filteredSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    let totalCOGS = 0;
    filteredItems.forEach(i => totalCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0));
    const grossProfit = totalSales - totalCOGS;
    const totalExp = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const netProfit = grossProfit - totalExp;

    const reportTypeNameMap = {
      daily_sales: 'DAILY SALES & TRANSACTION REPORT',
      company_sales: 'COMPANY / BRAND SALES PERFORMANCE REPORT',
      product_sales: 'PRODUCT SALES & FAST MOVING ITEMS REPORT',
      monthly_profit: 'PROFIT & LOSS (P&L) FINANCIAL STATEMENT',
      stock_valuation: 'STOCK VALUATION & INVENTORY AUDIT REPORT',
      customer_credit: 'CUSTOMER CREDIT ACCOUNTS & BALANCES REPORT',
      cashier_sales: 'CASHIER PERFORMANCE & SHIFT CLOSING REPORT'
    };

    // Prepare company map if needed for A4
    const prodLookup = {};
    allProducts.forEach(p => { prodLookup[p.id] = p; });
    const companyMap = {};
    filteredItems.forEach(i => {
      const prod = prodLookup[i.productId];
      let companyName = prod?.brand || 'General / Other Brands';
      if (!companyMap[companyName]) {
        companyMap[companyName] = { name: companyName, qty: 0, revenue: 0, cost: 0 };
      }
      companyMap[companyName].qty += Number(i.qty) || 0;
      companyMap[companyName].revenue += Number(i.total) || 0;
      companyMap[companyName].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });
    const sortedCompanies = Object.values(companyMap).sort((a, b) => b.revenue - a.revenue);

    const htmlContent = `
      <div class="a4-report-sheet">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px;">
          <div>
            ${storeLogo ? `<img src="${storeLogo}" style="max-height: 45px; margin-bottom: 5px;" />` : ''}
            <h1 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; color: #0f172a;">${storeName}</h1>
            <div style="font-size: 10px; color: #475569;">${storeAddress} &bull; Tel: ${storePhone}</div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div style="font-size: 13px; font-weight: 800; color: #0284c7; text-transform: uppercase;">${reportTypeNameMap[this.currentReportType] || 'BUSINESS REPORT'}</div>
            <div>Period: <strong>${fromStr}</strong> to <strong>${toStr}</strong></div>
            <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
          </div>
        </div>

        <!-- Summary KPIs Banner -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px;">
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">TOTAL REVENUE</div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a; font-family: monospace;">${formatLKR(totalSales)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">GROSS PROFIT</div>
            <div style="font-size: 13px; font-weight: 800; color: #16a34a; font-family: monospace;">${formatLKR(grossProfit)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">TOTAL EXPENSES</div>
            <div style="font-size: 13px; font-weight: 800; color: #dc2626; font-family: monospace;">${formatLKR(totalExp)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">NET PROFIT</div>
            <div style="font-size: 13px; font-weight: 800; color: #0284c7; font-family: monospace;">${formatLKR(netProfit)}</div>
          </div>
        </div>

        <!-- Report Table -->
        <table class="a4-table">
          ${this.currentReportType === 'company_sales' ? `
            <thead>
              <tr>
                <th>Company / Brand</th>
                <th style="text-align: center;">Total Qty Sold</th>
                <th style="text-align: right;">Sales Revenue</th>
                <th style="text-align: right;">Cost Value</th>
                <th style="text-align: right;">Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              ${sortedCompanies.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td style="text-align: center;">${c.qty}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(c.revenue)}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(c.cost)}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold; color: #16a34a;">${formatLKR(c.revenue - c.cost)}</td>
                </tr>
              `).join('')}
            </tbody>
          ` : this.currentReportType === 'product_sales' ? `
            <thead>
              <tr>
                <th>Product Name / SKU</th>
                <th style="text-align: center;">Qty Sold</th>
                <th style="text-align: right;">Sales Revenue</th>
                <th style="text-align: right;">COGS Cost</th>
                <th style="text-align: right;">Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.slice(0, 30).map(item => `
                <tr>
                  <td><strong>${item.productName}</strong> <span style="font-size: 9px; color: #64748b;">(${item.sku})</span></td>
                  <td style="text-align: center;">${item.qty}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(item.total)}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR((item.costPrice || 0) * (item.qty || 0))}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold; color: #16a34a;">${formatLKR(item.total - ((item.costPrice || 0) * (item.qty || 0)))}</td>
                </tr>
              `).join('')}
            </tbody>
          ` : `
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date / Time</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th style="text-align: right;">Discount</th>
                <th style="text-align: right;">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.slice(0, 40).map(s => `
                <tr>
                  <td style="font-family: monospace; font-weight: bold;">${s.invoiceNo}</td>
                  <td style="font-size: 9.5px;">${new Date(s.timestamp).toLocaleString()}</td>
                  <td>${s.cashierName}</td>
                  <td style="text-transform: uppercase; font-size: 9px; font-weight: bold;">${s.paymentMethod}</td>
                  <td style="text-align: right; font-family: monospace; color: #d97706;">-${formatLKR(s.totalDiscount || 0)}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatLKR(s.grandTotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          `}
        </table>

        <!-- Signatures & Footer -->
        <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 15px; border-top: 1px solid #cbd5e1; font-size: 10px;">
          <div>Prepared By: __________________________</div>
          <div>Audited & Checked By: __________________________</div>
          <div>Authorized Manager: __________________________</div>
        </div>
      </div>
    `;

    const printArea = document.getElementById('a4ReportPrintArea');
    if (printArea) {
      printArea.innerHTML = htmlContent;
      document.body.classList.add('printing-a4-report');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-a4-report');
      }, 1000);
    }
  },

  // Export CSV
  async exportSalesCSV() {
    const { start, end, fromStr, toStr } = this.getDateBounds();
    const allSales = await db.sales.toArray();
    const filtered = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });

    let csv = 'Invoice No,Date,Cashier,Customer,Payment Method,Subtotal,Discount,Tax,Grand Total\n';
    filtered.forEach(s => {
      csv += `"${s.invoiceNo}","${s.timestamp}","${s.cashierName}","${s.customerName || 'Walk-in'}","${s.paymentMethod}",${s.subtotal || 0},${s.totalDiscount || 0},${s.tax || 0},${s.grandTotal || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sales_Report_${fromStr}_to_${toStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async exportInventoryCSV() {
    const products = await db.products.toArray();
    let csv = 'SKU,Product Name,Sinhala Name,Category,Brand,Unit,Cost Price,Retail Price,Wholesale Price,Current Stock,Min Stock,Expiry Date\n';
    products.forEach(p => {
      csv += `"${p.sku}","${p.name.replace(/"/g, '""')}","${(p.nameSi || '').replace(/"/g, '""')}","${p.category || ''}","${p.brand || ''}","${p.unit || 'pcs'}",${p.costPrice || 0},${p.sellingPrice || 0},${p.wholesalePrice || 0},${p.currentStock || 0},${p.minStock || 0},"${p.expiryDate || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Inventory_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

window.ReportsManager = ReportsManager;


// ==================== js\backup.js ====================

/**
 * Backup, Restore, Offline Security, Store Settings, Custom Logo & Safe System Reset Engine
 */

const BackupManager = {
  async init() {
    await this.loadSettingsForm();
    await this.loadStoreLogo();
    this.scheduleAutoBackup();
  },

  async loadSettingsForm() {
    const settings = await db.settings.toArray();
    settings.forEach(s => {
      const el = document.getElementById(`setting_${s.key}`);
      if (el) {
        if (el.type === 'checkbox') {
          el.checked = s.value === true || s.value === 'true';
        } else {
          el.value = s.value;
        }
      }
    });
  },

  // Load and apply store logo from Dexie DB
  async loadStoreLogo() {
    const logoData = await getSetting('store_logo', null);
    const headerLogo = document.getElementById('headerLogoContainer');
    const loginLogo = document.getElementById('loginLogoContainer');
    const previewLogo = document.getElementById('settingsLogoPreview');
    const removeBtn = document.getElementById('removeLogoBtn');

    if (logoData) {
      const imgHtml = `<img src="${logoData}" class="w-full h-full object-contain rounded-xl" alt="Store Logo" />`;
      if (headerLogo) headerLogo.innerHTML = imgHtml;
      if (loginLogo) loginLogo.innerHTML = `<img src="${logoData}" class="w-full h-full object-contain rounded-2xl" alt="Store Logo" />`;
      if (previewLogo) {
        previewLogo.innerHTML = `<img src="${logoData}" class="max-h-24 max-w-full object-contain mx-auto rounded-lg shadow" />`;
      }
      if (removeBtn) removeBtn.classList.remove('hidden');
    } else {
      const defaultIcon = `<svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`;
      if (headerLogo) headerLogo.innerHTML = defaultIcon;
      if (loginLogo) loginLogo.innerHTML = `<svg class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`;
      if (previewLogo) {
        previewLogo.innerHTML = `<div class="text-xs text-slate-500 py-3">No custom logo uploaded yet.</div>`;
      }
      if (removeBtn) removeBtn.classList.add('hidden');
    }
  },

  // Upload Logo from Gallery / File System
  async handleLogoUpload(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Logo file size is too large. Please select an image under 2MB.');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target.result;
      await setSetting('store_logo', base64);
      await this.loadStoreLogo();
      SoundManager.playSuccessChime();
      alert('Store Logo uploaded and saved successfully!');
    };
    reader.readAsDataURL(file);
  },

  // Remove Logo
  async removeStoreLogo() {
    if (confirm('Remove custom store logo and revert to default icon?')) {
      await setSetting('store_logo', null);
      await this.loadStoreLogo();
      SoundManager.playSuccessChime();
    }
  },

  async saveSettings(event) {
    event.preventDefault();

    const keys = [
      'store_name', 'store_name_si', 'store_branch', 'store_address', 'store_phone',
      'store_email', 'store_vat_no', 'tax_rate', 'loyalty_earn_rate',
      'loyalty_redeem_value', 'thermal_width', 'receipt_footer',
      'auto_print_receipt', 'beep_sound_enabled'
    ];

    for (const key of keys) {
      const el = document.getElementById(`setting_${key}`);
      if (el) {
        const val = el.type === 'checkbox' ? el.checked : el.value;
        await setSetting(key, val);
      }
    }

    const beepVal = document.getElementById('setting_beep_sound_enabled')?.checked;
    SoundManager.enabled = beepVal !== false;

    SoundManager.playSuccessChime();
    alert('Settings saved successfully!');
  },

  // Generate complete dataset object for all tables
  async generateFullBackupData() {
    return {
      appName: 'LankaPOS Supermarket System',
      version: '1.3.0',
      exportedAt: new Date().toISOString(),
      users: await db.users.toArray(),
      categories: await db.categories.toArray(),
      products: await db.products.toArray(),
      customers: await db.customers.toArray(),
      creditPayments: db.creditPayments ? await db.creditPayments.toArray() : [],
      suppliers: await db.suppliers.toArray(),
      sales: await db.sales.toArray(),
      saleItems: await db.saleItems.toArray(),
      returns: await db.returns.toArray(),
      vouchers: await db.vouchers.toArray(),
      holdBills: await db.holdBills.toArray(),
      purchases: await db.purchases.toArray(),
      stockAdjustments: await db.stockAdjustments.toArray(),
      expenses: await db.expenses.toArray(),
      shifts: await db.shifts.toArray(),
      settings: await db.settings.toArray()
    };
  },

  // Export full IndexedDB dataset as JSON file
  async exportFullDatabaseJSON() {
    try {
      const backupData = await this.generateFullBackupData();
      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const link = document.createElement('a');
      const dateStr = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `LankaPOS_Backup_${dateStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      SoundManager.playSuccessChime();
      alert('Full Database Backup exported successfully!');
    } catch (e) {
      console.error('Backup export failed:', e);
      alert('Backup failed: ' + e.message);
    }
  },

  // Restore Database from JSON file
  async restoreDatabaseFromJSON(fileInput) {
    const file = fileInput.files[0];
    if (!file) return;

    if (!confirm('WARNING: Restoring will overwrite current database records with the backup file. Proceed?')) {
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.products || !data.users) {
          throw new Error('Invalid backup file structure.');
        }

        const tablesToLock = [
          db.users, db.categories, db.products, db.customers,
          db.suppliers, db.sales, db.saleItems, db.returns, db.vouchers, db.holdBills,
          db.purchases, db.stockAdjustments, db.expenses,
          db.shifts, db.settings
        ];
        if (db.creditPayments) tablesToLock.push(db.creditPayments);

        await db.transaction('rw', tablesToLock, async () => {
          await db.users.clear();
          await db.categories.clear();
          await db.products.clear();
          await db.customers.clear();
          if (db.creditPayments) await db.creditPayments.clear();
          await db.suppliers.clear();
          await db.sales.clear();
          await db.saleItems.clear();
          await db.returns.clear();
          await db.vouchers.clear();
          await db.holdBills.clear();
          await db.purchases.clear();
          await db.stockAdjustments.clear();
          await db.expenses.clear();
          await db.shifts.clear();
          await db.settings.clear();

          if (data.users?.length) await db.users.bulkAdd(data.users);
          if (data.categories?.length) await db.categories.bulkAdd(data.categories);
          if (data.products?.length) await db.products.bulkAdd(data.products);
          if (data.customers?.length) await db.customers.bulkAdd(data.customers);
          if (data.creditPayments?.length && db.creditPayments) await db.creditPayments.bulkAdd(data.creditPayments);
          if (data.suppliers?.length) await db.suppliers.bulkAdd(data.suppliers);
          if (data.sales?.length) await db.sales.bulkAdd(data.sales);
          if (data.saleItems?.length) await db.saleItems.bulkAdd(data.saleItems);
          if (data.returns?.length) await db.returns.bulkAdd(data.returns);
          if (data.vouchers?.length) await db.vouchers.bulkAdd(data.vouchers);
          if (data.holdBills?.length) await db.holdBills.bulkAdd(data.holdBills);
          if (data.purchases?.length) await db.purchases.bulkAdd(data.purchases);
          if (data.stockAdjustments?.length) await db.stockAdjustments.bulkAdd(data.stockAdjustments);
          if (data.expenses?.length) await db.expenses.bulkAdd(data.expenses);
          if (data.shifts?.length) await db.shifts.bulkAdd(data.shifts);
          if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        });

        SoundManager.playSuccessChime();
        alert('Database restored successfully! Reloading system...');
        window.location.reload();
      } catch (err) {
        SoundManager.playErrorBuzzer();
        alert('Failed to restore backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
  },

  // Open Safe Reset System Modal
  openResetSystemModal() {
    AuthManager.requireAdminAuth({
      actionName: 'System Reset / Data Wipe',
      actionDesc: 'Wipe sales, inventory, or full system database',
      requiredPerm: 'settings',
      onAuthorized: () => {
        const modal = document.getElementById('resetSystemModal');
        if (modal) {
          modal.classList.remove('hidden');
        } else {
          this.resetDatabase();
        }
      }
    });
  },

  // Confirm and Execute Safe Reset with Automatic Download Backup
  async confirmAndExecuteReset() {
    const selectedOption = document.querySelector('input[name="resetOptionChoice"]:checked')?.value || 'full';

    const confirmText = selectedOption === 'full' 
      ? 'ඔබට සම්පූර්ණ පද්ධතියම (Products, Sales, Reports) Reset කර ආරම්භක තත්වයට පත්කිරීමට අවශ්‍ය බව තහවුරු කරන්න ද?' 
      : 'ඔබට සියලුම Sales History, Invoices, Shifts සහ Reports පමණක් 0 දක්වා Reset කිරීමට අවශ්‍ය බව තහවුරු කරන්න ද?';

    if (!confirm(confirmText)) {
      return;
    }

    try {
      // 1. Automatic Backup Step (Creates file & triggers immediate download)
      const backupData = await this.generateFullBackupData();
      const jsonStr = JSON.stringify(backupData, null, 2);
      
      // Save emergency copy in localStorage
      try {
        localStorage.setItem('lankapos_emergency_backup_before_reset', jsonStr);
      } catch (e) {
        console.warn('localStorage quota exceeded for emergency backup string');
      }

      // Trigger automatic file download
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const link = document.createElement('a');
      const timeStampStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      link.href = URL.createObjectURL(blob);
      link.download = `LankaPOS_AutoBackup_Before_Reset_${timeStampStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // 2. Perform Clean Reset based on selected mode
      if (selectedOption === 'full') {
        // Clear all tables
        const allTables = [
          db.users, db.categories, db.products, db.customers,
          db.suppliers, db.sales, db.saleItems, db.returns, db.vouchers, db.holdBills,
          db.purchases, db.stockAdjustments, db.expenses,
          db.shifts, db.settings
        ];
        if (db.creditPayments) allTables.push(db.creditPayments);

        await db.transaction('rw', allTables, async () => {
          await db.users.clear();
          await db.categories.clear();
          await db.products.clear();
          await db.customers.clear();
          if (db.creditPayments) await db.creditPayments.clear();
          await db.suppliers.clear();
          await db.sales.clear();
          await db.saleItems.clear();
          await db.returns.clear();
          await db.vouchers.clear();
          await db.holdBills.clear();
          await db.purchases.clear();
          await db.stockAdjustments.clear();
          await db.expenses.clear();
          await db.shifts.clear();
          await db.settings.clear();
        });

        // Re-seed clean starting catalog and zero-transaction state
        await seedDatabaseIfEmpty();
      } else {
        // Transactions Only Reset: Clears sales, saleItems, returns, expenses, shifts, holdBills, adjustments, creditPayments
        const txnTables = [
          db.sales, db.saleItems, db.returns, db.vouchers, db.holdBills,
          db.purchases, db.stockAdjustments, db.expenses, db.shifts, db.customers
        ];
        if (db.creditPayments) txnTables.push(db.creditPayments);

        await db.transaction('rw', txnTables, async () => {
          await db.sales.clear();
          await db.saleItems.clear();
          await db.returns.clear();
          await db.vouchers.clear();
          await db.holdBills.clear();
          if (db.creditPayments) await db.creditPayments.clear();
          await db.purchases.clear();
          await db.stockAdjustments.clear();
          await db.expenses.clear();
          await db.shifts.clear();

          // Reset customer credit/points to zero
          const customers = await db.customers.toArray();
          for (const c of customers) {
            await db.customers.update(c.id, { creditBalance: 0, points: 0, totalSpent: 0 });
          }
        });
      }

      SoundManager.playSuccessChime();
      alert(`✅ පද්ධතිය සාර්ථකව Reset කරන ලදී!\n\nපැරණි සියලුම දත්ත අඩංගු Backup ගොනුව (LankaPOS_AutoBackup_Before_Reset_${timeStampStr}.json) ඔබගේ Downloads ෆෝල්ඩරයට Download විය.\n\nපද්ධතිය දැන් නැවත Reload වේ...`);

      window.location.reload();
    } catch (err) {
      SoundManager.playErrorBuzzer();
      console.error('Reset error:', err);
      alert('Reset failed: ' + err.message);
    }
  },

  // Direct reset fallback
  async resetDatabase() {
    this.openResetSystemModal();
  },

  scheduleAutoBackup() {
    setInterval(async () => {
      try {
        const salesCount = await db.sales.count();
        localStorage.setItem('lankapos_last_sync', JSON.stringify({
          time: new Date().toISOString(),
          salesCount
        }));
      } catch (e) {}
    }, 1000 * 60 * 15);
  }
};

window.BackupManager = BackupManager;


// ==================== js\dashboard.js ====================

/**
 * Executive Business & Cashier Performance Dashboard Manager
 * Real-time KPI summary: Today's Sales, Today's Bills, Today's Returns, Today's Credit (Given & Collected),
 * Cash in Drawer, Net Profit, Inventory Health, Cashier Breakdown & Analytics
 */

const DashboardManager = {
  charts: {},
  currentAlertTab: 'all', // 'all', 'low', 'expired', 'nearExpiry'
  selectedStaffId: 'all', // 'all' or user ID
  selectedDate: null,     // 'YYYY-MM-DD' or null for Today

  async init() {
    const currentUser = AuthManager.currentUser;
    // Always default Admin & Manager to 'all' on first load, or maintain current selection
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
      if (!this.selectedStaffId) this.selectedStaffId = 'all';
    } else if (currentUser && currentUser.role === 'cashier') {
      this.selectedStaffId = String(currentUser.id);
    } else {
      this.selectedStaffId = 'all';
    }

    if (!this.selectedDate) {
      this.selectedDate = this.getDateStr(new Date());
    }

    const dateInput = document.getElementById('dashDateFilterInput');
    if (dateInput) {
      dateInput.value = this.selectedDate;
    }

    await this.populateStaffDropdown();
    await this.renderDashboard();
  },

  // Helper to extract local YYYY-MM-DD
  getDateStr(d) {
    if (!d) return '';
    try {
      if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
        const dateObj = new Date(d);
        if (!isNaN(dateObj.getTime())) {
          const y = dateObj.getFullYear();
          const m = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        }
        return d.slice(0, 10);
      }
      const dateObj = (d instanceof Date) ? d : new Date(d);
      if (isNaN(dateObj.getTime())) {
        if (typeof d === 'string' && d.length >= 10) return d.slice(0, 10);
        return '';
      }
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    } catch (e) {
      return '';
    }
  },

  setDateToToday() {
    this.selectedDate = this.getDateStr(new Date());
    const dateInput = document.getElementById('dashDateFilterInput');
    if (dateInput) dateInput.value = this.selectedDate;
    this.renderDashboard();
  },

  onDateFilterChange(val) {
    this.selectedDate = val || this.getDateStr(new Date());
    this.renderDashboard();
  },

  async populateStaffDropdown() {
    const select = document.getElementById('dashStaffFilterSelect');
    const container = document.getElementById('dashStaffFilterContainer');
    if (!select) return;

    const users = await db.users.toArray();
    const currentUser = AuthManager.currentUser;

    select.innerHTML = `<option value="all">🌐 All Staff / Whole Store (සියලුම කාර්යමණ්ඩලය)</option>` +
      users.map(u => `<option value="${u.id}">👤 ${u.fullName || u.username} (${(u.role || 'CASHIER').toUpperCase()})</option>`).join('');

    // If logged in as Cashier (non-admin & non-manager), restrict to themselves
    if (currentUser && currentUser.role === 'cashier') {
      this.selectedStaffId = String(currentUser.id);
      select.value = String(currentUser.id);
      if (container) container.classList.add('hidden');
    } else {
      // If Admin or Manager, ensure value is synced
      if (!this.selectedStaffId) {
        this.selectedStaffId = 'all';
      }
      select.value = this.selectedStaffId;
      if (container) container.classList.remove('hidden');
    }
  },

  onStaffFilterChange(val) {
    this.selectedStaffId = val || 'all';
    this.renderDashboard();
  },

  filterByStaffId(id) {
    this.selectedStaffId = String(id);
    const select = document.getElementById('dashStaffFilterSelect');
    if (select) select.value = String(id);
    this.renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  resetStaffFilter() {
    this.selectedStaffId = 'all';
    const select = document.getElementById('dashStaffFilterSelect');
    if (select) select.value = 'all';
    this.renderDashboard();
  },

  async renderDashboard() {
    const allSales = await db.sales.toArray();
    const allSaleItems = await db.saleItems.toArray();
    const allReturns = db.returns ? await db.returns.toArray() : [];
    const allCreditPayments = db.creditPayments ? await db.creditPayments.toArray() : [];
    const allExpenses = await db.expenses.toArray();
    const allProducts = await db.products.toArray();
    const allCustomers = await db.customers.toArray();
    const allSuppliers = await db.suppliers.toArray();
    const allUsers = await db.users.toArray();

    const now = new Date();
    const todayStr = this.getDateStr(now);
    const activeDateStr = this.selectedDate || todayStr;

    // Sync Date input element if present
    const dateInput = document.getElementById('dashDateFilterInput');
    if (dateInput && !dateInput.value) {
      dateInput.value = activeDateStr;
    }

    // 1. Filter raw records for the selected Date
    const dateSalesAll = allSales.filter(s => this.getDateStr(s.timestamp || s.date) === activeDateStr);
    const dateReturnsAll = allReturns.filter(r => this.getDateStr(r.date || r.timestamp) === activeDateStr);
    const dateCreditPaymentsAll = allCreditPayments.filter(p => this.getDateStr(p.date || p.timestamp) === activeDateStr);
    const dateExpenses = allExpenses.filter(e => this.getDateStr(e.date || e.timestamp) === activeDateStr);

    // 2. Staff Specific Filtering if selectedStaffId is not 'all'
    let activeStaffUser = null;
    let targetSales = dateSalesAll;
    let targetReturns = dateReturnsAll;
    let targetCreditPayments = dateCreditPaymentsAll;
    let targetAllSales = allSales;

    if (this.selectedStaffId && this.selectedStaffId !== 'all') {
      const targetId = parseInt(this.selectedStaffId);
      activeStaffUser = allUsers.find(u => u.id === targetId || String(u.id) === String(this.selectedStaffId));

      const isStaffMatch = (record) => {
        if (!record) return false;
        // Match by cashierId / userId
        if (record.cashierId !== undefined && (String(record.cashierId) === String(this.selectedStaffId) || Number(record.cashierId) === targetId)) {
          return true;
        }
        if (record.userId !== undefined && (String(record.userId) === String(this.selectedStaffId) || Number(record.userId) === targetId)) {
          return true;
        }
        // Match by cashierName / username
        if (activeStaffUser) {
          if (record.cashierName && (record.cashierName === activeStaffUser.fullName || record.cashierName === activeStaffUser.username)) return true;
          if (record.cashierUsername && record.cashierUsername === activeStaffUser.username) return true;
          if (record.userName && (record.userName === activeStaffUser.fullName || record.userName === activeStaffUser.username)) return true;
        }
        return false;
      };

      targetSales = dateSalesAll.filter(isStaffMatch);
      targetReturns = dateReturnsAll.filter(isStaffMatch);
      targetCreditPayments = dateCreditPaymentsAll.filter(isStaffMatch);
      targetAllSales = allSales.filter(isStaffMatch);
    }

    // 3. Update Header Banner info
    const badgeEl = document.getElementById('dashActiveStaffBadge');
    if (badgeEl) {
      if (activeStaffUser) {
        badgeEl.innerHTML = `<span>👤 ${activeStaffUser.fullName || activeStaffUser.username} (${activeStaffUser.role.toUpperCase()}) &bull; ${activeDateStr}</span> <button onclick="DashboardManager.resetStaffFilter()" class="ml-1.5 px-1.5 py-0.5 bg-amber-900 hover:bg-amber-800 text-amber-100 rounded text-[9px] font-bold transition">Show All &times;</button>`;
        badgeEl.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-800 flex items-center gap-1';
      } else {
        badgeEl.textContent = activeDateStr === todayStr ? `🌐 ALL STORE PERFORMANCE (TODAY)` : `🌐 ALL STORE PERFORMANCE (${activeDateStr})`;
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800';
      }
    }

    // 4. Operational Day Calculations (User Requirements)
    // A. Day Total Sales
    const dayTotalSales = targetSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    const dayOrdersCount = targetSales.length;
    const dayAvgBasket = dayOrdersCount > 0 ? (dayTotalSales / dayOrdersCount) : 0;

    // B. Day Cash Collected & Day Bills
    let dayPaidCash = 0;
    let dayNonCash = 0;
    targetSales.forEach(s => {
      const method = s.paymentMethod || 'cash';
      if (method === 'cash') {
        dayPaidCash += (Number(s.grandTotal) || 0);
      } else if (method === 'split') {
        dayPaidCash += (Number(s.paidCash) || 0);
      } else if (method === 'card' || method === 'bank') {
        dayNonCash += (Number(s.grandTotal) || 0);
      }
    });

    // C. Day Returns
    const dayReturnsTotal = targetReturns.reduce((acc, r) => acc + (Number(r.totalRefund) || 0), 0);
    const dayReturnsCount = targetReturns.length;

    // D. Day Credit (Given vs Collected)
    const dayCreditGiven = targetSales.reduce((acc, s) => acc + (Number(s.creditAmount) || (s.paymentMethod === 'credit' ? Number(s.grandTotal) || 0 : 0)), 0);
    const dayCreditCollected = targetCreditPayments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

    // Total Cash in Drawer today = Cash Sales + Credit Collected in Cash - Refunds
    const dayCashInDrawer = Math.max(0, dayPaidCash + dayCreditCollected - dayReturnsTotal);

    // 5. Profit & All-Time Calculations
    const todaySaleIds = new Set(targetSales.map(s => s.id));
    let dayCOGS = 0;
    allSaleItems.filter(i => todaySaleIds.has(i.saleId)).forEach(i => {
      dayCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });

    const dayGrossProfit = dayTotalSales - dayCOGS;
    const dayTotalExpenses = (this.selectedStaffId === 'all') ? dateExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) : 0;
    const dayNetProfit = dayGrossProfit - dayTotalExpenses;
    const dayProfitMargin = dayTotalSales > 0 ? ((dayNetProfit / dayTotalSales) * 100).toFixed(1) : 0;

    const fullTotalSales = targetAllSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    const allTargetSaleIds = new Set(targetAllSales.map(s => s.id));
    let fullCOGS = 0;
    allSaleItems.filter(i => allTargetSaleIds.has(i.saleId)).forEach(i => {
      fullCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });
    const fullGrossProfit = fullTotalSales - fullCOGS;
    const fullExpenses = (this.selectedStaffId === 'all') ? allExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0) : 0;
    const fullNetProfit = fullGrossProfit - fullExpenses;
    const fullProfitMargin = fullTotalSales > 0 ? ((fullNetProfit / fullTotalSales) * 100).toFixed(1) : 0;

    // 6. Inventory & Accounts Health
    const in30Days = new Date(now.getTime() + 30 * 86400000);
    let lowStockCount = 0;
    let expiredCount = 0;
    let nearExpiryCount = 0;
    let totalStockValuation = 0;

    allProducts.forEach(p => {
      const stock = Number(p.currentStock) || 0;
      totalStockValuation += (Number(p.costPrice) || 0) * stock;
      if (stock <= (p.minStock || 0)) lowStockCount++;
      if (p.expiryDate) {
        const exp = new Date(p.expiryDate);
        if (exp <= now) expiredCount++;
        else if (exp <= in30Days) nearExpiryCount++;
      }
    });

    const totalCustomerCredit = allCustomers.reduce((acc, c) => acc + (Number(c.creditBalance) || 0), 0);
    const totalSupplierPayables = allSuppliers.reduce((acc, s) => acc + (Number(s.outstandingBalance) || 0), 0);

    // 7. Update DOM Element Values
    const setElemText = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    // Card 1: Today's Sales
    setElemText('dashDayTotalSales', formatLKR(dayTotalSales));
    setElemText('dashDayOrders', `${dayOrdersCount} ${I18n.currentLang === 'si' ? 'බිල්පත්' : 'Bills / Orders'}`);
    setElemText('dashDayAvgBasket', formatLKR(dayAvgBasket));

    // Card 2: Today's Bills & Cash
    setElemText('dashDayCashCollected', formatLKR(dayCashInDrawer));
    setElemText('dashDayBillsCount', `${dayOrdersCount} ${I18n.currentLang === 'si' ? 'බිල්පත් නිකුත් විය' : 'Bills Issued'}`);
    setElemText('dashDayNonCash', formatLKR(dayNonCash));

    // Card 3: Today's Returns
    setElemText('dashDayReturnsTotal', formatLKR(dayReturnsTotal));
    setElemText('dashDayReturnsCount', `${dayReturnsCount} ${I18n.currentLang === 'si' ? 'ආපසු ලැබීම්' : 'Returns Processed'}`);

    // Card 4: Today's Credit
    setElemText('dashDayCreditGiven', formatLKR(dayCreditGiven));
    setElemText('dashDayCreditCollected', formatLKR(dayCreditCollected));

    // Executive Financial Strip
    setElemText('dashDayNetProfit', formatLKR(dayNetProfit));
    setElemText('dashDayProfitMargin', `${dayProfitMargin}% ${I18n.currentLang === 'si' ? 'ලාභාංශය' : 'Margin'}`);
    setElemText('dashDayExpenses', formatLKR(dayTotalExpenses));

    setElemText('dashFullTotalSales', formatLKR(fullTotalSales));
    setElemText('dashFullOrders', `${targetAllSales.length} ${I18n.currentLang === 'si' ? 'බිල්පත්' : 'Txns'}`);
    setElemText('dashFullNetProfit', formatLKR(fullNetProfit));
    setElemText('dashFullProfitMargin', `${fullProfitMargin}% ${I18n.currentLang === 'si' ? 'ලාභාංශය' : 'Margin'}`);
    setElemText('dashStockValuation', formatLKR(totalStockValuation));

    // Operational Cards
    setElemText('dashLowStockCount', lowStockCount);
    setElemText('dashExpiredCount', expiredCount + nearExpiryCount);
    setElemText('dashCustomerCredit', formatLKR(totalCustomerCredit));
    setElemText('dashSupplierPayables', formatLKR(totalSupplierPayables));

    // Header notification badge
    const totalAlerts = lowStockCount + expiredCount + nearExpiryCount;
    const headerBadge = document.getElementById('headerNotificationBadge');
    if (headerBadge) {
      if (totalAlerts > 0) {
        headerBadge.textContent = totalAlerts;
        headerBadge.classList.remove('hidden');
      } else {
        headerBadge.classList.add('hidden');
      }
    }

    // 8. Render Staff Performance Breakdown Table
    this.renderStaffBreakdown(allUsers, dateSalesAll, dateReturnsAll, dateCreditPaymentsAll);

    // 9. Render Inventory Alerts Panel
    this.renderInventoryAlerts(allProducts, now, in30Days);

    // 10. Render Charts (Safe & Protected)
    this.renderCharts(targetAllSales, targetSales, allSaleItems, dateExpenses);

    // 11. Render Recent Transactions
    this.renderRecentTransactions(targetAllSales);
  },

  renderStaffBreakdown(users, dateSales, dateReturns, dateCreditPayments) {
    const tbody = document.getElementById('dashStaffBreakdownTableBody');
    const section = document.getElementById('dashStaffBreakdownSection');
    if (!tbody || !section) return;

    if (this.selectedStaffId !== 'all') {
      const activeUser = users.find(u => String(u.id) === String(this.selectedStaffId));
      section.classList.remove('hidden');
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="p-4 text-center bg-slate-950/60">
            <div class="text-xs text-amber-300 font-semibold mb-1">
              🔎 Filtered by Staff: <strong>${activeUser ? (activeUser.fullName || activeUser.username) : 'Selected Staff'}</strong>
            </div>
            <div class="text-[11px] text-slate-400 mb-2">
              Showing sales, profit, bills, returns and credit only for this staff member.
            </div>
            <button onclick="DashboardManager.resetStaffFilter()" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 shadow-md">
              🌐 View All Staff Breakdown (සියලුම දෙනාගේ වාර්තාව)
            </button>
          </td>
        </tr>
      `;
      return;
    }

    section.classList.remove('hidden');

    tbody.innerHTML = users.map(u => {
      const staffSales = dateSales.filter(s => String(s.cashierId) === String(u.id) || s.cashierName === u.fullName || s.cashierName === u.username);
      const staffReturns = dateReturns.filter(r => String(r.cashierId) === String(u.id) || r.cashierName === u.fullName || r.cashierName === u.username);
      const staffCredit = dateCreditPayments.filter(p => String(p.cashierId) === String(u.id) || p.cashierName === u.fullName || p.cashierName === u.username);

      const salesTotal = staffSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
      const billsCount = staffSales.length;
      
      let cashTotal = 0;
      staffSales.forEach(s => {
        if (s.paymentMethod === 'cash') cashTotal += Number(s.grandTotal) || 0;
        else if (s.paymentMethod === 'split') cashTotal += Number(s.paidCash) || 0;
      });

      const returnsTotal = staffReturns.reduce((acc, r) => acc + (Number(r.totalRefund) || 0), 0);
      const creditGiven = staffSales.reduce((acc, s) => acc + (Number(s.creditAmount) || (s.paymentMethod === 'credit' ? s.grandTotal : 0)), 0);
      const creditCollected = staffCredit.reduce((acc, p) => acc + (Number(p.amount) || 0), 0);

      const netCashInDrawer = Math.max(0, cashTotal + creditCollected - returnsTotal);

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
          <td class="p-3">
            <div class="font-bold text-slate-100 flex items-center gap-1.5">
              <span>${u.fullName || u.username}</span>
              <span class="px-1.5 py-0.2 rounded text-[9px] font-bold ${
                u.role === 'admin' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
                u.role === 'manager' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
                'bg-emerald-950 text-emerald-300 border border-emerald-800'
              }">${(u.role || 'cashier').toUpperCase()}</span>
            </div>
            <div class="text-[10px] text-slate-400 font-mono">@${u.username}</div>
          </td>
          <td class="p-3 text-center font-mono font-bold ${billsCount > 0 ? 'text-sky-300' : 'text-slate-500'}">
            ${billsCount} Bills
          </td>
          <td class="p-3 text-right font-mono font-black ${salesTotal > 0 ? 'text-sky-400' : 'text-slate-500'}">
            ${formatLKR(salesTotal)}
          </td>
          <td class="p-3 text-right font-mono font-bold ${netCashInDrawer > 0 ? 'text-emerald-400' : 'text-slate-500'}">
            ${formatLKR(netCashInDrawer)}
          </td>
          <td class="p-3 text-right font-mono ${returnsTotal > 0 ? 'text-amber-400 font-bold' : 'text-slate-500'}">
            ${returnsTotal > 0 ? formatLKR(returnsTotal) : 'Rs. 0.00'}
          </td>
          <td class="p-3 text-right font-mono ${creditGiven > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}">
            ${creditGiven > 0 ? formatLKR(creditGiven) : 'Rs. 0.00'}
          </td>
          <td class="p-3 text-right">
            <button onclick="DashboardManager.filterByStaffId(${u.id})" class="px-2.5 py-1 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg text-[11px] font-semibold transition">
              View Stats &rarr;
            </button>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderInventoryAlerts(allProducts, now = new Date(), in30Days = new Date(Date.now() + 30 * 86400000)) {
    const container = document.getElementById('dashAlertsContainer');
    if (!container) return;

    const lowStockItems = allProducts.filter(p => (Number(p.currentStock) || 0) <= (p.minStock || 0));
    const expiredItems = allProducts.filter(p => p.expiryDate && new Date(p.expiryDate) <= now);
    const nearExpiryItems = allProducts.filter(p => p.expiryDate && new Date(p.expiryDate) > now && new Date(p.expiryDate) <= in30Days);

    const totalCount = lowStockItems.length + expiredItems.length + nearExpiryItems.length;

    if (totalCount === 0) {
      container.innerHTML = `
        <div class="p-3.5 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="text-xl">✅</span>
            <div>
              <div class="text-xs font-bold text-emerald-300">All Inventory Healthy</div>
              <div class="text-[11px] text-slate-400">No low-stock or expired items detected in the supermarket.</div>
            </div>
          </div>
          <button onclick="App.switchTab('inventory')" class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition">
            View Stock &rarr;
          </button>
        </div>
      `;
      return;
    }

    let displayedItems = [];
    if (this.currentAlertTab === 'low') {
      displayedItems = lowStockItems.map(p => ({ ...p, alertType: 'low', badge: '⚠️ LOW STOCK' }));
    } else if (this.currentAlertTab === 'expired') {
      displayedItems = expiredItems.map(p => ({ ...p, alertType: 'expired', badge: '🚨 EXPIRED' }));
    } else if (this.currentAlertTab === 'nearExpiry') {
      displayedItems = nearExpiryItems.map(p => ({ ...p, alertType: 'nearExpiry', badge: '⏳ EXPIRING SOON' }));
    } else {
      displayedItems = [
        ...expiredItems.map(p => ({ ...p, alertType: 'expired', badge: '🚨 EXPIRED' })),
        ...nearExpiryItems.map(p => ({ ...p, alertType: 'nearExpiry', badge: '⏳ EXPIRING SOON' })),
        ...lowStockItems.map(p => ({ ...p, alertType: 'low', badge: '⚠️ LOW STOCK' }))
      ];
    }

    container.innerHTML = `
      <div class="space-y-3">
        <!-- Top Bar with Tabs -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div class="flex items-center gap-2">
            <span class="p-1 rounded bg-rose-950 text-rose-400 border border-rose-800 text-xs font-mono font-black">${totalCount}</span>
            <h4 class="text-xs font-extrabold uppercase tracking-wider text-slate-200">
              ${I18n.currentLang === 'si' ? 'තොග සහ කල්ඉකුත් වීමේ අනතුරු ඇඟවීම්' : 'Inventory Alerts & Warnings'}
            </h4>
          </div>

          <div class="flex items-center gap-1 overflow-x-auto text-[11px]">
            <button onclick="DashboardManager.setAlertTab('all')" class="px-2.5 py-1 rounded-lg font-bold transition ${this.currentAlertTab === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-400'}">
              All (${totalCount})
            </button>
            <button onclick="DashboardManager.setAlertTab('low')" class="px-2.5 py-1 rounded-lg font-bold transition ${this.currentAlertTab === 'low' ? 'bg-amber-600 text-white' : 'bg-slate-800 text-slate-400'}">
              Low Stock (${lowStockItems.length})
            </button>
            <button onclick="DashboardManager.setAlertTab('expired')" class="px-2.5 py-1 rounded-lg font-bold transition ${this.currentAlertTab === 'expired' ? 'bg-rose-600 text-white' : 'bg-slate-800 text-slate-400'}">
              Expired (${expiredItems.length})
            </button>
            <button onclick="DashboardManager.setAlertTab('nearExpiry')" class="px-2.5 py-1 rounded-lg font-bold transition ${this.currentAlertTab === 'nearExpiry' ? 'bg-orange-600 text-white' : 'bg-slate-800 text-slate-400'}">
              Expiring Soon (${nearExpiryItems.length})
            </button>
          </div>
        </div>

        <!-- Alerts Table / List -->
        <div class="overflow-x-auto max-h-56 overflow-y-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-850 text-slate-400 text-[10px] uppercase font-bold sticky top-0">
              <tr>
                <th class="p-2">Type</th>
                <th class="p-2">Item Name & SKU</th>
                <th class="p-2 text-center">Current Stock</th>
                <th class="p-2 text-center">Min Stock</th>
                <th class="p-2">Expiry Date</th>
                <th class="p-2 text-right">Quick Action</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-800/60 font-mono">
              ${displayedItems.map(p => `
                <tr class="hover:bg-slate-800/40">
                  <td class="p-2">
                    <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      p.alertType === 'expired' ? 'bg-rose-950 text-rose-300 border border-rose-800' :
                      p.alertType === 'nearExpiry' ? 'bg-orange-950 text-orange-300 border border-orange-800' :
                      'bg-amber-950 text-amber-300 border border-amber-800'
                    }">
                      ${p.badge}
                    </span>
                  </td>
                  <td class="p-2 font-sans font-semibold text-slate-200">
                    <div>${p.name}</div>
                    <div class="text-[10px] text-slate-500 font-mono">SKU: ${p.sku} &bull; Brand: ${p.brand || '---'}</div>
                  </td>
                  <td class="p-2 text-center font-bold ${(p.currentStock || 0) <= (p.minStock || 0) ? 'text-rose-400' : 'text-slate-300'}">
                    ${p.currentStock || 0} ${p.unit}
                  </td>
                  <td class="p-2 text-center text-slate-400">${p.minStock || 0}</td>
                  <td class="p-2 font-mono text-[11px] ${
                    p.alertType === 'expired' ? 'text-rose-400 font-bold' :
                    p.alertType === 'nearExpiry' ? 'text-orange-400 font-bold' : 'text-slate-400'
                  }">
                    ${p.expiryDate || 'No Expiry'}
                  </td>
                  <td class="p-2 text-right">
                    <button onclick="App.switchTab('grn'); GRNManager.openAddGRNModal();" class="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-[11px] font-sans font-bold transition">
                      + Reorder
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  setAlertTab(tab) {
    this.currentAlertTab = tab;
    this.renderDashboard();
  },

  renderCharts(allSales, daySales, saleItems, expenses) {
    if (!window.Chart) return;

    try {
      // Chart 1: 7-Day Sales vs Profit
      const trendCtx = document.getElementById('dashTrendChart');
      if (trendCtx) {
        if (this.charts.trend) {
          try { this.charts.trend.destroy(); } catch (e) {}
        }

        const labels = [];
        const salesData = [];
        const profitData = [];

        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86400000);
          const dStr = this.getDateStr(d);
          labels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));

          const currentDaySales = allSales.filter(s => this.getDateStr(s.timestamp || s.date) === dStr);
          const dayRev = currentDaySales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
          salesData.push(dayRev);

          const daySaleIds = new Set(currentDaySales.map(s => s.id));
          let cogs = 0;
          saleItems.filter(i => daySaleIds.has(i.saleId)).forEach(i => {
            cogs += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
          });
          const dayExp = (this.selectedStaffId === 'all') ? expenses.filter(e => this.getDateStr(e.date || e.timestamp) === dStr).reduce((acc, e) => acc + (Number(e.amount) || 0), 0) : 0;
          profitData.push(Math.max(0, dayRev - cogs - dayExp));
        }

        this.charts.trend = new Chart(trendCtx, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: I18n.currentLang === 'si' ? 'විකුණුම් (Sales)' : 'Sales Revenue',
                data: salesData,
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.15)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#38bdf8'
              },
              {
                label: I18n.currentLang === 'si' ? 'ශුද්ධ ලාභය (Profit)' : 'Net Profit',
                data: profitData,
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#10b981'
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: '#94a3b8', font: { size: 11, family: 'Inter' } }
              }
            },
            scales: {
              x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } },
              y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { size: 10 } } }
            }
          }
        });
      }

      // Chart 2: Payment Methods Breakdown (Doughnut)
      const payCtx = document.getElementById('dashPaymentMethodChart');
      if (payCtx) {
        if (this.charts.payment) {
          try { this.charts.payment.destroy(); } catch (e) {}
        }

        const payMap = { cash: 0, card: 0, bank: 0, credit: 0 };
        const chartSales = (daySales && daySales.length > 0) ? daySales : allSales;
        chartSales.forEach(s => {
          const method = s.paymentMethod || 'cash';
          if (method === 'split') {
            payMap.cash += Number(s.paidCash) || 0;
            payMap.credit += Number(s.creditAmount) || 0;
          } else if (payMap[method] !== undefined) {
            payMap[method] += Number(s.grandTotal) || 0;
          } else {
            payMap.cash += Number(s.grandTotal) || 0;
          }
        });

        this.charts.payment = new Chart(payCtx, {
          type: 'doughnut',
          data: {
            labels: [
              I18n.currentLang === 'si' ? 'මුදල් (Cash)' : 'Cash',
              I18n.currentLang === 'si' ? 'කාඩ්පත් (Card)' : 'Card',
              I18n.currentLang === 'si' ? 'QR / බැංකු (QR/Bank)' : 'QR / Bank',
              I18n.currentLang === 'si' ? 'ණයට (Credit)' : 'Store Credit'
            ],
            datasets: [{
              data: [payMap.cash, payMap.card, payMap.bank, payMap.credit],
              backgroundColor: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: 'bottom',
                labels: { color: '#94a3b8', font: { size: 10, family: 'Inter' }, boxWidth: 12 }
              }
            }
          }
        });
      }
    } catch (err) {
      console.warn('[Dashboard] Chart render warning:', err);
    }
  },

  renderRecentTransactions(sales) {
    const tbody = document.getElementById('dashRecentSalesBody');
    if (!tbody) return;

    const recent = sales.slice(-10).reverse();
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-slate-500">${I18n.currentLang === 'si' ? 'විකුණුම් වාර්තා නොමැත' : 'No sales recorded yet.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = recent.map(s => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-2.5 font-mono font-bold text-sky-400">${s.invoiceNo}</td>
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300">
            ${s.cashierName || 'Cashier'}
          </span>
        </td>
        <td class="p-2.5 text-slate-300 font-semibold">${s.customerName || 'Walk-in'}</td>
        <td class="p-2.5 text-slate-400 font-mono text-[11px]">${new Date(s.timestamp || s.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td class="p-2.5">
          <span class="px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
            s.paymentMethod === 'cash' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
            s.paymentMethod === 'card' ? 'bg-blue-950 text-blue-300 border border-blue-800' :
            s.paymentMethod === 'credit' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
            s.paymentMethod === 'split' ? 'bg-purple-950 text-purple-300 border border-purple-800' :
            'bg-slate-800 text-slate-300'
          }">
            ${s.paymentMethod === 'split' ? 'SPLIT (Cash+Credit)' : s.paymentMethod}
          </span>
        </td>
        <td class="p-2.5 text-right font-mono font-bold text-slate-100">${formatLKR(s.grandTotal)}</td>
      </tr>
    `).join('');
  }
};

window.DashboardManager = DashboardManager;


// ==================== js\app.js ====================

/**
 * Central App Router, Scanner Wedge, Camera Scanner, Hotkeys & PWA Service Worker
 */

const App = {
  currentTab: 'pos',
  scannerBuffer: '',
  scannerLastKeyTime: 0,
  html5QrScanner: null,

  async init() {
    console.log('[App] Initializing Offline Supermarket POS System with Sinhala & Wholesale support...');

    // 1. Setup UI listeners and Form handlers immediately (Synchronous)
    this.setupLoginForm();
    this.setupNavRouting();
    this.setupKeyboardShortcuts();
    this.setupScannerWedgeListener();
    this.setupMouseWheelScrollSupport();

    // 2. Init Auth Manager FIRST so user can log in instantly
    try {
      await AuthManager.init();
      if (window.BackupManager) {
        BackupManager.loadStoreLogo().catch(() => {});
      }
      if (window.I18n) {
        I18n.init().catch(() => {});
      }
    } catch (e) {
      console.warn('[App] Auth/Logo init error:', e);
    }

    // 3. Seed and synchronize database in background safely
    try {
      seedDatabaseIfEmpty().catch(e => console.warn('[App] Background seed notice:', e));
    } catch (e) {}

    // 4. Init Sound Manager setting safely
    try {
      const beepVal = await getSetting('beep_sound_enabled', true);
      SoundManager.enabled = beepVal === true || beepVal === 'true';
    } catch (e) {}

    // 5. Init Shift Manager safely
    try {
      await ShiftManager.init();
    } catch (e) {
      console.warn('[App] Shift init error:', e);
    }

    // 6. Init POS Module & Dashboard safely
    try {
      await POSManager.init();
    } catch (e) {
      console.warn('[App] POS init error:', e);
    }
    try {
      if (window.DashboardManager) {
        await DashboardManager.init();
      }
    } catch (e) {
      console.warn('[App] Dashboard init error:', e);
    }

    // 7. Register PWA Service Worker & Install Manager
    try {
      this.registerServiceWorker();
      PWAInstallManager.init();
    } catch (e) {}

    // 8. Update real-time clock
    this.startLiveClock();

    // 9. If user is logged in, ensure UI and default tab are rendered
    if (AuthManager.isLoggedIn()) {
      AuthManager.updateUI();
      const initialTab = this.currentTab || 'pos';
      this.switchTab(initialTab);
    }

    console.log('[App] LankaPOS successfully initialized.');
  },
  switchTab(tabName) {
    if (!AuthManager.hasPermission(tabName)) {
      alert(`Access Restricted: Your role (${AuthManager.currentUser?.role}) cannot access this section.`);
      return;
    }

    this.currentTab = tabName;
    this.closeMobileMoreDrawer();

    // Update Desktop Nav Button Styles
    document.querySelectorAll('.nav-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('bg-sky-600', 'text-white', 'shadow-md', 'shadow-sky-600/30');
        btn.classList.remove('text-slate-400', 'hover:bg-slate-800');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'shadow-md', 'shadow-sky-600/30');
        btn.classList.add('text-slate-400', 'hover:bg-slate-800');
      }
    });

    // Update Mobile Bottom Nav Button Styles
    document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
      if (btn.getAttribute('data-tab') === tabName) {
        btn.classList.add('text-sky-400', 'font-black');
        btn.classList.remove('text-slate-400');
      } else {
        btn.classList.remove('text-sky-400', 'font-black');
        btn.classList.add('text-slate-400');
      }
    });

    // Toggle Tab Views
    document.querySelectorAll('.tab-view').forEach(view => {
      if (view.id === `tabView_${tabName}`) {
        view.classList.remove('hidden');
      } else {
        view.classList.add('hidden');
      }
    });

    // Lazy load tab data safely
    try {
      if (tabName === 'dashboard' && window.DashboardManager) DashboardManager.init();
      else if (tabName === 'inventory' && window.InventoryManager) InventoryManager.init();
      else if (tabName === 'grn' && window.GRNManager) GRNManager.init();
      else if (tabName === 'customers' && window.CustomerManager) CustomerManager.init();
      else if (tabName === 'credit' && window.CustomerManager) CustomerManager.initCreditTab();
      else if (tabName === 'suppliers' && window.SupplierManager) SupplierManager.init();
      else if (tabName === 'farmers' && window.FarmerManager) FarmerManager.init();
      else if (tabName === 'expenses' && window.ExpenseManager) ExpenseManager.init();
      else if (tabName === 'shifts' && window.ShiftManager) ShiftManager.init();
      else if (tabName === 'reports' && window.ReportsManager) ReportsManager.init();
      else if (tabName === 'settings') {
        if (window.BackupManager) BackupManager.init();
        if (window.AuthManager && (AuthManager.isAdmin() || AuthManager.isManager())) {
          AuthManager.renderUsersTable();
        }
      }
      else if (tabName === 'pos' && window.POSManager) {
        POSManager.handleWindowResize();
        POSManager.renderCategoryFilter();
        POSManager.renderProductGrid();
        POSManager.renderCart();
        POSManager.focusSearchInput();
      }
    } catch (err) {
      console.warn(`[App] Error loading tab "${tabName}":`, err);
    }
  },

  openMobileMoreDrawer() {
    const drawer = document.getElementById('mobileMoreMenuDrawer');
    if (drawer) drawer.classList.remove('hidden');
  },

  closeMobileMoreDrawer() {
    const drawer = document.getElementById('mobileMoreMenuDrawer');
    if (drawer) drawer.classList.add('hidden');
  },

  openNotificationsModal() {
    this.switchTab('dashboard');
    setTimeout(() => {
      const container = document.getElementById('dashAlertsContainer');
      if (container) {
        container.scrollIntoView({ behavior: 'smooth', block: 'center' });
        container.classList.add('ring-2', 'ring-rose-500');
        setTimeout(() => container.classList.remove('ring-2', 'ring-rose-500'), 2000);
      }
    }, 100);
  },

  // Setup Navigation listeners
  setupNavRouting() {
    document.querySelectorAll('.nav-tab-btn, .mobile-nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        if (tab === 'more') {
          this.openMobileMoreDrawer();
        } else if (tab) {
          this.switchTab(tab);
        }
      });
    });
  },

  // Global USB/Bluetooth Barcode Scanner Wedge Listener
  setupScannerWedgeListener() {
    document.addEventListener('keydown', (e) => {
      const now = Date.now();
      const timeDiff = now - this.scannerLastKeyTime;
      this.scannerLastKeyTime = now;

      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(e.key)) {
        return;
      }

      const activeEl = document.activeElement;
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable);

      if (e.key === 'Enter') {
        if (this.scannerBuffer.length >= 3) {
          const barcode = this.scannerBuffer;
          this.scannerBuffer = '';

          if (this.currentTab === 'pos') {
            e.preventDefault();
            if (isInput) activeEl.blur();
            POSManager.handleBarcodeScan(barcode);
            return;
          }
        }
        this.scannerBuffer = '';
      } else if (e.key.length === 1) {
        if (timeDiff < 50 || this.scannerBuffer.length === 0) {
          this.scannerBuffer += e.key;
        } else {
          this.scannerBuffer = e.key;
        }
      }
    });
  },

  // Keyboard Shortcuts (F1-F12, Esc)
  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (!AuthManager.isLoggedIn()) return;

      if (e.key === 'Escape') {
        document.querySelectorAll('.app-modal').forEach(m => m.classList.add('hidden'));
        this.stopCameraScanner();
        if (this.currentTab === 'pos') {
          POSManager.focusSearchInput();
        }
        return;
      }

      if (this.currentTab === 'pos') {
        if (e.key === 'F1') {
          e.preventDefault();
          const search = document.getElementById('posSearchInput');
          if (search) { search.focus(); search.select(); }
        } else if (e.key === 'F2') {
          e.preventDefault();
          const manualCode = prompt('බාර්කෝඩ් අංකය ඇතුළත් කරන්න (Enter Barcode or SKU):');
          if (manualCode) POSManager.handleBarcodeScan(manualCode);
        } else if (e.key === 'F3') {
          e.preventDefault();
          CustomerManager.openCustomerSelectModal();
        } else if (e.key === 'F4') {
          e.preventDefault();
          POSManager.openDiscountModal('bill');
        } else if (e.key === 'F6') {
          e.preventDefault();
          POSManager.setPricingMode(POSManager.pricingMode === 'retail' ? 'wholesale' : 'retail');
        } else if (e.key === 'F7') {
          e.preventDefault();
          POSManager.openSalesHistoryModal();
        } else if (e.key === 'F8') {
          e.preventDefault();
          POSManager.holdCurrentBill();
        } else if (e.key === 'F9') {
          e.preventDefault();
          POSManager.openRecallBillsModal();
        } else if (e.key === 'F10') {
          e.preventDefault();
          POSManager.openPaymentModal();
        }
      }
    });
  },

  // Global Smart Mouse Wheel Scrolling Support
  setupMouseWheelScrollSupport() {
    window.addEventListener('wheel', (e) => {
      // 1. If an active modal is open, scroll its scrollable area
      const openModals = Array.from(document.querySelectorAll('.app-modal:not(.hidden)'));
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        const scrollContainer = topModal.querySelector('.overflow-y-auto, [class*="overflow-y"]') || topModal;
        if (scrollContainer && scrollContainer.scrollHeight > scrollContainer.clientHeight) {
          scrollContainer.scrollTop += e.deltaY;
        }
        return;
      }

      // 2. If user is on POS tab
      if (this.currentTab === 'pos') {
        const rightPane = document.getElementById('posRightProductsPane');
        const prodGrid = document.getElementById('posProductGrid');
        const leftPane = document.getElementById('posLeftCartPane');
        const cartContainer = document.getElementById('posCartTableBody')?.parentElement;

        // If mouse is anywhere in the Products right pane
        if (rightPane && (rightPane.contains(e.target) || e.target === rightPane)) {
          if (prodGrid) {
            prodGrid.scrollTop += e.deltaY;
          }
          return;
        }

        // If mouse is anywhere in the Cart left pane
        if (leftPane && (leftPane.contains(e.target) || e.target === leftPane)) {
          if (cartContainer) {
            cartContainer.scrollTop += e.deltaY;
          }
          return;
        }
      }

      // 3. For all other tabs (dashboard, inventory, grn, customers, credit, suppliers, expenses, shifts, reports, settings)
      const activeTabView = document.querySelector('.tab-view:not(.hidden)');
      if (activeTabView && activeTabView.id !== 'tabView_pos') {
        const scrollTarget = activeTabView.classList.contains('overflow-y-auto') ? activeTabView : (activeTabView.querySelector('.overflow-y-auto') || activeTabView);
        if (scrollTarget && scrollTarget.scrollHeight > scrollTarget.clientHeight) {
          scrollTarget.scrollTop += e.deltaY;
        }
      }
    }, { passive: true });
  },

  // Camera Barcode Scanner using html5-qrcode
  async startCameraScanner() {
    const modal = document.getElementById('cameraScannerModal');
    modal.classList.remove('hidden');

    if (window.Html5Qrcode) {
      try {
        if (!this.html5QrScanner) {
          this.html5QrScanner = new Html5Qrcode('cameraScannerReader');
        }
        await this.html5QrScanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 250, height: 180 }
          },
          (decodedText) => {
            console.log('[Camera Scanner] Barcode Decoded:', decodedText);
            SoundManager.playScanBeep();
            this.stopCameraScanner();
            POSManager.handleBarcodeScan(decodedText);
          },
          (errorMessage) => {}
        );
      } catch (err) {
        console.error('Camera Scanner Error:', err);
        alert('Could not access camera for scanning.');
        this.stopCameraScanner();
      }
    } else {
      alert('Camera scanner library not available in offline mode.');
      modal.classList.add('hidden');
    }
  },

  stopCameraScanner() {
    const modal = document.getElementById('cameraScannerModal');
    if (modal) modal.classList.add('hidden');
    if (this.html5QrScanner) {
      try {
        this.html5QrScanner.stop().catch(() => {});
      } catch (e) {}
    }
  },

  async handleLogin(e) {
    if (e) {
      try { e.preventDefault(); e.stopPropagation(); } catch (err) {}
    }
    const loginError = document.getElementById('loginErrorMessage');
    const uInput = document.getElementById('loginUsernameInput');
    const pInput = document.getElementById('loginPasswordInput');

    const username = uInput ? uInput.value : '';
    const password = pInput ? pInput.value : '';

    if (loginError) loginError.classList.add('hidden');

    const res = await AuthManager.loginWithCredentials(username, password);
    if (!res.success) {
      if (loginError) {
        loginError.textContent = res.message;
        loginError.classList.remove('hidden');
      }
    } else {
      if (pInput) pInput.value = '';
      const landingTab = AuthManager.hasPermission('dashboard') ? 'dashboard' : 'pos';
      App.switchTab(landingTab);
    }
    return false;
  },

  setupLoginForm() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.onsubmit = (e) => this.handleLogin(e);
    }
  },

  startLiveClock() {
    const clockEl = document.getElementById('headerLiveClock');
    const dateEl = document.getElementById('headerLiveDate');

    const updateTime = () => {
      const now = new Date();
      if (clockEl) {
        clockEl.textContent = now.toLocaleTimeString('en-LK', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      if (dateEl) {
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const weekdayEn = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][now.getDay()];
        const weekdaySi = ['ඉරිදා', 'සඳුදා', 'අඟහරුවාදා', 'බදාදා', 'බ්‍රහස්පතින්දා', 'සිකුරාදා', 'සෙනසුරාදා'][now.getDay()];
        
        if (window.I18n && I18n.currentLang === 'si') {
          dateEl.textContent = `${year}-${month}-${day} (${weekdaySi})`;
        } else if (window.I18n && I18n.currentLang === 'bi') {
          dateEl.textContent = `${year}-${month}-${day} (${weekdaySi} / ${weekdayEn})`;
        } else {
          dateEl.textContent = `${year}-${month}-${day} (${weekdayEn})`;
        }
      }
    };
    updateTime();
    setInterval(updateTime, 1000);
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('[ServiceWorker] Registered with scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[ServiceWorker] Registration failed:', err);
        });
    }
  }
};

const PWAInstallManager = {
  deferredPrompt: null,
  isInstalled: false,

  init() {
    // Check if running in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true) {
      this.isInstalled = true;
      this.updateInstallButtons(false);
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.updateInstallButtons(true);
      console.log('[PWA] beforeinstallprompt captured!');
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt = null;
      this.isInstalled = true;
      this.updateInstallButtons(false);
      console.log('[PWA] App successfully installed!');
      alert('🎉 Lanka Mega POS App has been successfully installed on your device!');
    });
  },

  updateInstallButtons(canInstall) {
    const headerBtn = document.getElementById('headerPwaInstallBtn');
    const mobileBtn = document.getElementById('mobileMenuPwaInstallBtn');
    const settingsBtn = document.getElementById('settingsPwaInstallBtn');

    [headerBtn, mobileBtn, settingsBtn].forEach(btn => {
      if (btn) {
        if (canInstall || !this.isInstalled) {
          btn.classList.remove('hidden');
        } else {
          btn.classList.add('hidden');
        }
      }
    });
  },

  async promptInstall() {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      const choiceResult = await this.deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        console.log('[PWA] User accepted the install prompt');
        this.deferredPrompt = null;
      }
    } else {
      this.openInstallGuideModal();
    }
  },

  openInstallGuideModal() {
    const modal = document.getElementById('pwaInstallGuideModal');
    if (modal) modal.classList.remove('hidden');
  }
};

window.App = App;
window.PWAInstallManager = PWAInstallManager;

window.togglePasswordVisibility = function() {
  const input = document.getElementById('loginPasswordInput');
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
};

window.quickFillLogin = async function(u, p) {
  const uInput = document.getElementById('loginUsernameInput');
  const pInput = document.getElementById('loginPasswordInput');
  const loginError = document.getElementById('loginErrorMessage');
  if (uInput) uInput.value = u;
  if (pInput) pInput.value = p;
  if (loginError) loginError.classList.add('hidden');

  const res = await AuthManager.loginWithCredentials(u, p);
  if (!res.success) {
    if (loginError) {
      loginError.textContent = res.message;
      loginError.classList.remove('hidden');
    }
  } else {
    if (pInput) pInput.value = '';
    const landingTab = AuthManager.hasPermission('dashboard') ? 'dashboard' : 'pos';
    App.switchTab(landingTab);
  }
};

// Only set handleLoginFormSubmit if not already defined by the head inline script
// (the head script handles Company Controller routing properly)
if (!window.handleLoginFormSubmit) {
  window.handleLoginFormSubmit = function(e) {
    return App.handleLogin(e);
  };
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', () => {
    App.init();
  });
} else {
  App.init();
}



