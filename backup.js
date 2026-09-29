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
