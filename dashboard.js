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
    // Always default Admin & Manager to 'all' so all supermarket terminals/cashiers are shown
    if (currentUser && (currentUser.role === 'admin' || currentUser.role === 'manager')) {
      this.selectedStaffId = 'all';
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
    this.selectedStaffId = val;
    this.renderDashboard();
  },

  filterByStaffId(id) {
    this.selectedStaffId = String(id);
    const select = document.getElementById('dashStaffFilterSelect');
    if (select) select.value = String(id);
    this.renderDashboard();
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
      activeStaffUser = allUsers.find(u => u.id === targetId);

      targetSales = dateSalesAll.filter(s => String(s.cashierId) === String(targetId) || (activeStaffUser && (s.cashierName === activeStaffUser.fullName || s.cashierName === activeStaffUser.username)));
      targetReturns = dateReturnsAll.filter(r => String(r.cashierId) === String(targetId));
      targetCreditPayments = dateCreditPaymentsAll.filter(p => String(p.cashierId) === String(targetId));
      targetAllSales = allSales.filter(s => String(s.cashierId) === String(targetId) || (activeStaffUser && (s.cashierName === activeStaffUser.fullName || s.cashierName === activeStaffUser.username)));
    }

    // 3. Update Header Banner info
    const badgeEl = document.getElementById('dashActiveStaffBadge');
    if (badgeEl) {
      if (activeStaffUser) {
        badgeEl.textContent = `${activeStaffUser.fullName || activeStaffUser.username} (${activeStaffUser.role.toUpperCase()}) - ${activeDateStr}`;
        badgeEl.className = 'px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800';
      } else {
        badgeEl.textContent = activeDateStr === todayStr ? `ALL STORE PERFORMANCE (TODAY)` : `ALL STORE PERFORMANCE (${activeDateStr})`;
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

    // 8. Render Staff Performance Breakdown Table (When viewing All Staff or for Admin)
    this.renderStaffBreakdown(allUsers, dateSalesAll, dateReturnsAll, dateCreditPaymentsAll);

    // 9. Render Inventory Alerts Panel
    this.renderInventoryAlerts(allProducts, now, in30Days);

    // 10. Render Charts (Safe & Protected)
    this.renderCharts(targetAllSales, allSaleItems, dateExpenses);

    // 11. Render Recent Transactions
    this.renderRecentTransactions(targetAllSales);
  },

  renderStaffBreakdown(users, dateSales, dateReturns, dateCreditPayments) {
    const tbody = document.getElementById('dashStaffBreakdownTableBody');
    const section = document.getElementById('dashStaffBreakdownSection');
    if (!tbody || !section) return;

    if (this.selectedStaffId !== 'all') {
      // Hide breakdown table if filtering by a single staff member to keep UI compact
      section.classList.add('hidden');
      return;
    }

    section.classList.remove('hidden');

    tbody.innerHTML = users.map(u => {
      const staffSales = dateSales.filter(s => String(s.cashierId) === String(u.id) || s.cashierName === u.fullName || s.cashierName === u.username);
      const staffReturns = dateReturns.filter(r => String(r.cashierId) === String(u.id));
      const staffCredit = dateCreditPayments.filter(p => String(p.cashierId) === String(u.id));

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
              }">${u.role.toUpperCase()}</span>
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

  renderCharts(sales, saleItems, expenses) {
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

          const daySales = sales.filter(s => this.getDateStr(s.timestamp || s.date) === dStr);
          const dayRev = daySales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
          salesData.push(dayRev);

          const daySaleIds = new Set(daySales.map(s => s.id));
          let cogs = 0;
          saleItems.filter(i => daySaleIds.has(i.saleId)).forEach(i => {
            cogs += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
          });
          const dayExp = expenses.filter(e => this.getDateStr(e.date || e.timestamp) === dStr).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
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
        sales.forEach(s => {
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
