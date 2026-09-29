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
        }
      } catch (err) {
        console.warn('[Firestore Realtime UI] Error updating UI:', err);
      }
    }, 80);
  };
})();

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
    this.isReady = true;
    this.unsubscribeSnapshot = null;
  }

  async ensureReady() {
    return;
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

      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        this.isReady = true;
        
      } else {
        triggerRealtimeUIUpdate(this.name);
      }
    }, (error) => {
      console.warn(`[Firestore Realtime] Snapshot error on "${this.name}":`, error);
      if (isFirstSnapshot) {
        isFirstSnapshot = false;
        this.isReady = true;
        
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
    return Array.from(this.docsMap.values());
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

    const strId = String(id);
    if (this.docsMap.has(strId)) return this.docsMap.get(strId);
    for (const item of this.docsMap.values()) {
      if (item.id == id || String(item.id) === strId) return item;
    }
    return undefined;
  }

  async add(data) {
    const docData = { ...data };
    let docId = docData.id !== undefined && docData.id !== null ? String(docData.id) : null;

    if (!docId) {
      if (this.name === 'settings' && docData.key) {
        docId = String(docData.key);
      } else if (['users', 'products', 'categories', 'customers', 'suppliers'].includes(this.name)) {
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

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      try {
        const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, docId);
        this.dbInstance.sdk.setDoc(docRef, cleanData).catch(() => {});
      } catch (e) {}
    }

    return docData.id !== undefined ? docData.id : docId;
  }

  async put(data, key) {
    const docData = { ...data };
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

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      try {
        const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, docId);
        this.dbInstance.sdk.setDoc(docRef, cleanData, { merge: true }).catch(() => {});
      } catch (e) {}
    }

    return docData.id !== undefined ? docData.id : (docData.key !== undefined ? docData.key : docId);
  }

  async update(id, updates) {
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

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      try {
        const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, targetDocId);
        this.dbInstance.sdk.setDoc(docRef, cleanUpdates, { merge: true }).catch(() => {});
      } catch (e) {}
    }

    return 1;
  }

  async delete(id) {
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

    if (this.dbInstance && this.dbInstance.sdk && this.dbInstance.firestoreDb) {
      try {
        const docRef = this.dbInstance.sdk.doc(this.dbInstance.firestoreDb, this.name, targetDocId);
        this.dbInstance.sdk.deleteDoc(docRef).catch(() => {});
      } catch (e) {}
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
        return false;
      }

      this.sdk = firestoreModule;
      this.app = appModule.initializeApp(firebaseConfig);
      this.firestoreDb = firestoreModule.getFirestore(this.app);

      for (const name of COLLECTION_NAMES) {
        this[name].setupRealtimeListener(this.firestoreDb, this.sdk);
      }

      console.log('[Firestore] Real-time listeners successfully connected.');
      return true;
    } catch (err) {
      console.warn('[Firestore] Fallback to in-memory store:', err);
      return false;
    }
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
