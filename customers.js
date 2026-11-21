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
          <button onclick="CustomerManager.openCustomerStatementModal(${c.id})" class="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-bold transition inline-flex items-center gap-1 shadow-sm cursor-pointer" title="ගනුදෙනු ඉතිහාසය හා ලෙජරය (All Transactions Ledger)">
            <span>📋</span> <span>ඉතිහාසය</span>
          </button>
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
          <div class="font-extrabold text-slate-100 text-sm flex items-center gap-1.5">
            ${c.isSchool || c.schoolCode ? `<span class="px-1.5 py-0.5 bg-sky-950 text-sky-300 border border-sky-800 rounded font-mono text-[10px]">🏫 ${c.schoolCode || 'SCHOOL'}</span>` : ''}
            <span>${c.name}</span>
          </div>
          <div class="text-slate-400 text-[11px] font-mono">📱 ${c.phone || 'No phone'}</div>
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
          <div class="flex items-center justify-end gap-1.5 flex-wrap">
            <button onclick="CustomerManager.openAddDirectCreditModal(${c.id})" class="px-2.5 py-1.5 bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-300 rounded-xl text-xs font-bold transition flex items-center gap-1" title="Add Day Credit without POS bill">
              <span>➕</span> <span>ණය දැමීම</span>
            </button>
            <button onclick="CustomerManager.openCollectCreditModal(${c.id})" 
                    class="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl text-xs font-extrabold transition shadow-md shadow-emerald-600/30 flex items-center gap-1">
              <span>💰</span>
              <span>අයවීම</span>
            </button>
            <button onclick="CustomerManager.openCustomerStatementModal(${c.id})" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition" title="View Statement Ledger">
              <span>📋</span>
            </button>
          </div>
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
  renderCustomerSelectCards(customers, container) {
    if (!container) return;
    if (customers.length === 0) {
      container.innerHTML = `<div class="text-center py-8 text-slate-400 text-xs font-medium">පාරිභෝගිකයින් හමු නොවීය (No matching customers).</div>`;
      return;
    }

    container.innerHTML = customers.map(c => `
      <div onclick="CustomerManager.selectCustomerForPOS(${c.id})" class="p-3 bg-slate-900 border ${c.isSchool || c.customerType === 'school' ? 'border-amber-500/70 bg-amber-950/20 hover:border-amber-400' : 'border-slate-700 hover:border-sky-500'} rounded-2xl cursor-pointer flex items-center justify-between transition shadow-sm">
        <div>
          <div class="font-extrabold text-slate-100 text-sm flex items-center gap-1.5 flex-wrap">
            <span>${c.name}</span>
            ${c.isSchool || c.customerType === 'school' ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-950 text-amber-300 border border-amber-600">🏫 ${c.schoolName || 'පාසල් ණය'}</span>` : ''}
          </div>
          <div class="text-xs text-slate-400 font-mono mt-0.5">📱 ${c.phone || 'No phone'} ${c.address ? '&bull; ' + c.address : ''}</div>
        </div>
        <div class="text-right font-mono text-xs">
          <div class="text-slate-400">ණය: <strong class="${(c.creditBalance || 0) > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}">${formatLKR(c.creditBalance || 0)}</strong></div>
          <span class="text-sky-400 text-xs font-bold">තෝරන්න &rarr;</span>
        </div>
      </div>
    `).join('');
  },

  async openCustomerSelectModal(filterType = 'all') {
    this.posCustomerFilterType = filterType;
    const container = document.getElementById('posCustomerSelectList');
    const input = document.getElementById('posCustomerSearchInput');
    const btnAll = document.getElementById('posCustFilter_all');
    const btnSchool = document.getElementById('posCustFilter_school');

    if (btnAll && btnSchool) {
      if (filterType === 'school') {
        btnAll.className = 'px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition';
        btnSchool.className = 'px-3 py-1 bg-amber-600 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 shadow-md shadow-amber-600/30';
      } else {
        btnAll.className = 'px-3 py-1 bg-sky-600 text-white rounded-lg text-xs font-bold transition shadow-md shadow-sky-600/30';
        btnSchool.className = 'px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1';
      }
    }

    if (!container) return;

    let customers = await db.customers.toArray();
    if (filterType === 'school') {
      customers = customers.filter(c => c.isSchool === true || c.customerType === 'school' || (c.schoolName && c.schoolName.trim() !== ''));
    }

    this.renderCustomerSelectCards(customers, container);

    document.getElementById('posCustomerModal')?.classList.remove('hidden');
    if (input) {
      input.value = '';
      input.focus();
    }
  },

  async filterCustomerSelectList(query) {
    const container = document.getElementById('posCustomerSelectList');
    if (!container) return;

    const q = (query || '').toLowerCase().trim();
    let customers = await db.customers.toArray();
    if (this.posCustomerFilterType === 'school') {
      customers = customers.filter(c => c.isSchool === true || c.customerType === 'school' || (c.schoolName && c.schoolName.trim() !== ''));
    }

    if (q) {
      customers = customers.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) || 
        (c.phone && c.phone.includes(q)) ||
        (c.schoolName && c.schoolName.toLowerCase().includes(q))
      );
    }

    this.renderCustomerSelectCards(customers, container);
  },

  async selectCustomerForPOS(id) {
    try {
      let customer = await db.customers.get(id);
      if (!customer && !isNaN(Number(id))) customer = await db.customers.get(Number(id));
      if (!customer && typeof id === 'number') customer = await db.customers.get(String(id));
      if (!customer && typeof id === 'string') customer = await db.customers.get(parseInt(id, 10));

      if (customer) {
        if (window.POSManager) {
          POSManager.setCustomer(customer);
        }
        document.getElementById('posCustomerModal')?.classList.add('hidden');
        if (window.App) App.switchTab('pos');
        if (window.SoundManager) SoundManager.playSuccessChime();
      } else {
        console.warn('Customer not found with id:', id);
      }
    } catch (err) {
      console.error('Error selecting customer for POS:', err);
    }
  },

  openAddCustomerModal(fromPOS = false) {
    // Store flag BEFORE any modal changes — used in performSave
    this._calledFromPOS = fromPOS;

    document.getElementById('customerModalTitle').textContent = fromPOS
      ? 'POS සඳහා නව පාරිභෝගිකයා | New Customer for POS'
      : 'Register New Customer';
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

    // Hide POS modal first so z-index doesn't conflict
    if (fromPOS) {
      document.getElementById('posCustomerModal')?.classList.add('hidden');
    }

    document.getElementById('customerModal').classList.remove('hidden');

    // Focus name field
    setTimeout(() => {
      const nameInput = document.getElementById('custNameInput');
      if (nameInput) nameInput.focus();
    }, 150);
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
        // Use stored flag — reliable even after modal state changes
        if (this._calledFromPOS) {
          custData.id = newId;
          POSManager.setCustomer(custData);
          this._calledFromPOS = false;
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
  },

  // ==========================================
  // DIRECT DAY CREDIT ENTRY (Without POS Invoice)
  // Allows shop owners to record manual daily book credits on any date
  // ==========================================
  async openAddDirectCreditModal(id) {
    let cust = null;
    if (id) {
      cust = await db.customers.get(id);
    }
    const modal = document.getElementById('directCreditModal');
    if (!modal) return;

    const nameEl = document.getElementById('directCreditCustName');
    const idInput = document.getElementById('directCreditCustId');
    const amtInput = document.getElementById('directCreditAmountInput');
    const dateInput = document.getElementById('directCreditDateInput');
    const refInput = document.getElementById('directCreditRefInput');
    const notesInput = document.getElementById('directCreditNotesInput');

    if (cust) {
      if (nameEl) nameEl.textContent = `${cust.name} ${cust.phone ? '(' + cust.phone + ')' : ''}`;
      if (idInput) idInput.value = cust.id;
    } else {
      if (nameEl) nameEl.textContent = 'Please select customer';
      if (idInput) idInput.value = '';
    }

    if (amtInput) amtInput.value = '';
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    if (refInput) refInput.value = 'CR-' + Date.now().toString().slice(-5);
    if (notesInput) notesInput.value = 'දෛනික පොතේ ණය (Daily Book Credit)';

    modal.classList.remove('hidden');
    if (amtInput) amtInput.focus();
  },

  async saveDirectCredit(e) {
    if (e) e.preventDefault();
    const idVal = document.getElementById('directCreditCustId')?.value;
    const custId = parseInt(idVal);
    if (!custId || isNaN(custId)) {
      alert('කරුණාකර පාරිභෝගිකයෙකු තෝරන්න (Please select a customer).');
      return;
    }

    const cust = await db.customers.get(custId);
    if (!cust) {
      alert('Customer not found in database.');
      return;
    }

    const amount = parseFloat(document.getElementById('directCreditAmountInput')?.value) || 0;
    if (amount <= 0) {
      alert('කරුණාකර වලංගු ණය මුදලක් ඇතුළත් කරන්න (Please enter a valid credit amount > 0).');
      return;
    }

    const date = document.getElementById('directCreditDateInput')?.value || new Date().toISOString().slice(0, 10);
    const refNo = document.getElementById('directCreditRefInput')?.value.trim() || ('CR-' + Date.now().toString().slice(-6));
    const notes = document.getElementById('directCreditNotesInput')?.value.trim() || 'Direct Day Credit Entry';
    const currentUser = (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'Staff';

    // 1. Record in manualCredits collection
    const creditRecord = {
      customerId: cust.id,
      customerName: cust.name,
      amount: Math.round(amount * 100) / 100,
      date: date,
      time: new Date().toTimeString().slice(0, 5),
      refNo: refNo,
      notes: notes,
      recordedBy: currentUser,
      type: 'manual_credit',
      timestamp: new Date().toISOString()
    };

    if (db.manualCredits) {
      await db.manualCredits.add(creditRecord);
    }

    // 2. Update Customer Balance
    const currentBal = Number(cust.creditBalance || 0);
    const newBal = Math.round((currentBal + amount) * 100) / 100;
    await db.customers.update(cust.id, {
      creditBalance: newBal,
      totalSpent: Math.round(((cust.totalSpent || 0) + amount) * 100) / 100
    });

    document.getElementById('directCreditModal')?.classList.add('hidden');
    await this.renderCreditTab();
    await this.renderCustomerTable();
    if (window.SchoolCreditManager) SchoolCreditManager.init();
    if (window.SoundManager) SoundManager.playSuccessChime();

    alert(`රු. ${formatLKR(amount)} ක ණය මුදල ${cust.name} ගිණුමට සාර්ථකව එකතු කරන ලදී!\nනව ණය ශේෂය: ${formatLKR(newBal)}`);
  },

  // Open Full Customer Ledger / Statement
  async openCustomerStatementModal(id) {
    let cust = await db.customers.get(id);
    if (!cust && !isNaN(Number(id))) cust = await db.customers.get(Number(id));
    if (!cust) return;

    const modal = document.getElementById('customerStatementModal');
    if (!modal) return;

    this.selectedCustomerIdForStatement = cust.id;
    document.getElementById('stmtCustName').textContent = cust.name;
    document.getElementById('stmtCustPhone').textContent = cust.phone || 'No Phone';
    document.getElementById('stmtCustDue').textContent = formatLKR(cust.creditBalance || 0);

    const tbody = document.getElementById('customerStatementTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Loading ledger records...</td></tr>`;

      // 1. Sales (both Credit and Cash/Card so user sees full transaction history!)
      let allSales = [];
      try {
        const salesRaw = await db.sales.toArray();
        allSales = salesRaw.filter(s => s.customerId == cust.id || String(s.customerId) === String(cust.id) || (cust.phone && s.customerPhone && s.customerPhone === cust.phone));
      } catch (e) {
        allSales = await db.sales.where('customerId').equals(cust.id).toArray();
      }

      // 2. Direct Manual Credits
      let manualCredits = [];
      try {
        if (db.manualCredits) {
          const rawM = await db.manualCredits.toArray();
          manualCredits = rawM.filter(m => m.customerId == cust.id || String(m.customerId) === String(cust.id));
        }
      } catch (e) {}

      // 3. Settlement Payments
      let payments = [];
      try {
        if (db.creditPayments) {
          const rawP = await db.creditPayments.toArray();
          payments = rawP.filter(p => p.customerId == cust.id || String(p.customerId) === String(cust.id));
        }
      } catch (e) {}

      const ledger = [];
      if (Number(cust.openingBalance || 0) > 0) {
        ledger.push({
          date: cust.createdAt ? cust.createdAt.slice(0, 10) : 'Opening',
          ref: 'START',
          saleId: null,
          notes: 'Opening Credit Balance (ආරම්භක ණය)',
          debit: Number(cust.openingBalance),
          credit: 0
        });
      }

      allSales.forEach(s => {
        const isCredit = (s.paymentMethod === 'credit' || Number(s.creditAmount) > 0);
        const billTotal = Number(s.grandTotal || 0);
        const creditPart = Number(s.creditAmount || (isCredit ? billTotal : 0));

        if (isCredit) {
          ledger.push({
            date: s.timestamp ? s.timestamp.slice(0, 10) : (s.date || '---'),
            ref: s.invoiceNo,
            saleId: s.id,
            notes: `Store Invoice (${(s.paymentMethod || 'credit').toUpperCase()}) - ${s.items?.length || 0} items`,
            debit: creditPart,
            credit: 0
          });
        } else {
          // Cash/Card/Bank bill: Show full transaction with debit & credit equal (fully paid)
          ledger.push({
            date: s.timestamp ? s.timestamp.slice(0, 10) : (s.date || '---'),
            ref: s.invoiceNo,
            saleId: s.id,
            notes: `Store Bill (${(s.paymentMethod || 'CASH').toUpperCase()} Paid)`,
            debit: billTotal,
            credit: billTotal
          });
        }
      });

      manualCredits.forEach(m => {
        ledger.push({
          date: m.date,
          ref: m.refNo || 'CREDIT',
          saleId: null,
          notes: m.notes || 'Direct Day Credit (දෛනික ණය)',
          debit: Number(m.amount || 0),
          credit: 0
        });
      });

      payments.forEach(p => {
        ledger.push({
          date: p.date ? p.date.slice(0, 10) : '---',
          ref: p.receiptNo || 'REC',
          saleId: null,
          notes: `${p.paymentMethod || 'Cash'} Settlement (ණය ගෙවීම)`,
          debit: 0,
          credit: Number(p.amount || 0)
        });
      });

      ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBal = 0;
      tbody.innerHTML = ledger.map(entry => {
        runningBal += (entry.debit - entry.credit);
        return `
          <tr class="border-b border-slate-800 text-xs font-mono hover:bg-slate-800/40">
            <td class="p-2.5 text-slate-400">${entry.date}</td>
            <td class="p-2.5">
              ${entry.saleId ? `
                <button type="button" onclick="CustomerManager.viewCustomerInvoice('${entry.saleId}')" class="text-sky-400 hover:text-sky-300 font-bold hover:underline cursor-pointer flex items-center gap-1" title="බිල්පත බලන්න (View Invoice & Details)">
                  <span>${entry.ref}</span>
                  <span class="text-[10px] bg-sky-950 px-1 py-0.2 rounded border border-sky-800 text-sky-400">බිල ↗</span>
                </button>
              ` : `<span class="text-sky-400 font-bold">${entry.ref}</span>`}
            </td>
            <td class="p-2.5 text-slate-300 font-sans">${entry.notes}</td>
            <td class="p-2.5 text-right ${entry.debit > 0 ? 'text-amber-400 font-bold' : 'text-slate-600'}">
              ${entry.debit > 0 ? formatLKR(entry.debit) : '-'}
            </td>
            <td class="p-2.5 text-right ${entry.credit > 0 ? 'text-emerald-400 font-bold' : 'text-slate-600'}">
              ${entry.credit > 0 ? formatLKR(entry.credit) : '-'}
            </td>
            <td class="p-2.5 text-right font-bold text-slate-100">
              ${formatLKR(runningBal)}
            </td>
          </tr>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
  },

  async viewCustomerInvoice(saleId) {
    document.getElementById('customerStatementModal')?.classList.add('hidden');
    if (window.POSManager) {
      await POSManager.openSalesHistoryModal();
      await POSManager.showSaleDetailsForReturn(saleId);
    }
  },

  // Print Customer Statement in A4 PDF format
  async printCustomerStatementA4(id) {
    const custId = id || this.selectedCustomerIdForStatement;
    let cust = await db.customers.get(custId);
    if (!cust && !isNaN(Number(custId))) cust = await db.customers.get(Number(custId));
    if (!cust) return;

    const storeName = (await getSetting('store_name', '')) || 'LANKA MEGA SUPERMARKET';
    const storeAddress = (await getSetting('store_address', '')) || 'Main Street, Sri Lanka';
    const storePhone = (await getSetting('store_phone', '')) || '011-2345678';

    let allSales = [];
    try {
      const salesRaw = await db.sales.toArray();
      allSales = salesRaw.filter(s => s.customerId == cust.id || String(s.customerId) === String(cust.id) || (cust.phone && s.customerPhone && s.customerPhone === cust.phone));
    } catch (e) {
      allSales = await db.sales.where('customerId').equals(cust.id).toArray();
    }

    let manualCredits = [];
    try {
      if (db.manualCredits) {
        const rawM = await db.manualCredits.toArray();
        manualCredits = rawM.filter(m => m.customerId == cust.id || String(m.customerId) === String(cust.id));
      }
    } catch (e) {}

    let payments = [];
    try {
      if (db.creditPayments) {
        const rawP = await db.creditPayments.toArray();
        payments = rawP.filter(p => p.customerId == cust.id || String(p.customerId) === String(cust.id));
      }
    } catch (e) {}

    const ledger = [];
    if (Number(cust.openingBalance || 0) > 0) {
      ledger.push({ date: cust.createdAt?.slice(0, 10) || 'Opening', ref: 'START', desc: 'Opening Balance (ආරම්භක ණය)', debit: Number(cust.openingBalance), credit: 0 });
    }
    allSales.forEach(s => {
      const isCredit = (s.paymentMethod === 'credit' || Number(s.creditAmount) > 0);
      const billTotal = Number(s.grandTotal || 0);
      const creditPart = Number(s.creditAmount || (isCredit ? billTotal : 0));
      if (isCredit) {
        ledger.push({ date: s.timestamp?.slice(0, 10) || s.date || '---', ref: s.invoiceNo, desc: `Store Invoice (${(s.paymentMethod || 'credit').toUpperCase()})`, debit: creditPart, credit: 0 });
      } else {
        ledger.push({ date: s.timestamp?.slice(0, 10) || s.date || '---', ref: s.invoiceNo, desc: `Store Bill (${(s.paymentMethod || 'CASH').toUpperCase()} Paid)`, debit: billTotal, credit: billTotal });
      }
    });
    manualCredits.forEach(m => {
      ledger.push({ date: m.date, ref: m.refNo || 'CREDIT', desc: m.notes || 'Direct Day Credit', debit: Number(m.amount || 0), credit: 0 });
    });
    payments.forEach(p => {
      ledger.push({ date: p.date?.slice(0, 10) || '---', ref: p.receiptNo || 'REC', desc: `${p.paymentMethod || 'Cash'} Settlement`, debit: 0, credit: Number(p.amount || 0) });
    });

    ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let runningBal = 0;
    const rowsHtml = ledger.map(l => {
      runningBal += (l.debit - l.credit);
      return `
        <tr>
          <td>${l.date}</td>
          <td style="font-family:monospace;font-weight:bold;">${l.ref}</td>
          <td>${l.desc}</td>
          <td style="text-align:right;font-family:monospace;">${l.debit > 0 ? formatLKR(l.debit) : '-'}</td>
          <td style="text-align:right;font-family:monospace;color:#16a34a;">${l.credit > 0 ? formatLKR(l.credit) : '-'}</td>
          <td style="text-align:right;font-family:monospace;font-weight:bold;">${formatLKR(runningBal)}</td>
        </tr>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Customer Credit Statement - ${cust.name}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 15px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 800; color: #0284c7; }
          .cust-info { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 15px; display: grid; grid-template-columns: 2fr 1fr; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th { background: #0f172a; color: #ffffff; text-align: left; padding: 6px 8px; font-size: 10px; }
          td { border-bottom: 1px solid #e2e8f0; padding: 6px 8px; }
          .footer { display: flex; justify-content: space-between; margin-top: 35px; border-top: 1px solid #cbd5e1; padding-top: 10px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="title">${storeName}</div>
            <div>${storeAddress} &bull; Tel: ${storePhone}</div>
            <div style="font-weight: bold; margin-top: 4px; color: #475569;">CUSTOMER CREDIT ACCOUNT STATEMENT (පාරිභෝගික ණය ප්‍රකාශනය)</div>
          </div>
          <div style="text-align: right; font-size: 10px;">
            <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
            <div>Account Status: <strong style="color: #dc2626;">ACTIVE</strong></div>
          </div>
        </div>

        <div class="cust-info">
          <div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">👤 ${cust.name}</div>
            <div>Phone: <strong>${cust.phone || '---'}</strong></div>
            <div>Address: ${cust.address || '---'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #64748b;">TOTAL OUTSTANDING BALANCE:</div>
            <div style="font-size: 18px; font-weight: 900; color: #dc2626; font-family: monospace;">${formatLKR(cust.creditBalance || 0)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Ref No</th>
              <th>Description</th>
              <th style="text-align: right;">Charges (Debit)</th>
              <th style="text-align: right;">Payments (Credit)</th>
              <th style="text-align: right;">Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          <div>Customer Signature: _______________________</div>
          <div>Authorized Supermarket Sign: _______________________</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() { window.focus(); window.print(); }, 200);
          };
        <\/script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=900,height=800');
    if (printWin) {
      printWin.document.write(html);
      printWin.document.close();
    }
  }
};

window.CustomerManager = CustomerManager;
