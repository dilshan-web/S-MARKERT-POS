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
    document.getElementById('custCreditInput').value = cust.creditBalance || 0;

    document.getElementById('customerModal').classList.remove('hidden');
  },

  async saveCustomer(event) {
    event.preventDefault();
    const id = document.getElementById('custIdInput').value;
    const phone = document.getElementById('custPhoneInput').value.trim();
    const name = document.getElementById('custNameInput').value.trim();
    const email = document.getElementById('custEmailInput').value.trim();
    const credit = parseFloat(document.getElementById('custCreditInput').value) || 0;

    const performSave = async () => {
      const custData = { phone, name, email, creditBalance: credit };

      if (id) {
        await db.customers.update(parseInt(id), custData);
      } else {
        const existing = await db.customers.where('phone').equals(phone).first();
        if (existing) {
          alert('A customer with this phone number already exists!');
          return;
        }
        custData.totalSpent = 0;
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

    if (id) {
      const existingCust = await db.customers.get(parseInt(id));
      if (existingCust && existingCust.creditBalance !== credit) {
        AuthManager.requireAdminAuth({
          actionName: 'Modify Customer Credit Balance',
          actionDesc: `Change credit balance for "${existingCust.name}" from ${formatLKR(existingCust.creditBalance || 0)} to ${formatLKR(credit)}`,
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
