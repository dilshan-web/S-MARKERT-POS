/**
 * School Credit Management Module (පාසල් ණය පාලනය)
 * Dedicated terminal for School Canteens, School Orders & Staff Credit Accounts
 * - SKU / School Code Support (e.g. SCH-01, SCH-CENTRAL)
 * - Shared balance syncing with Main Customer / Credit directory
 * - Direct Day Credit Entry (without POS invoice) with custom date selection
 * - Settlement collection with thermal payment receipts & A4 official audit statements
 */

const SchoolCreditManager = {
  searchQuery: '',
  historySearchQuery: '',
  selectedSchoolIdForAction: null,
  activeSubTab: 'debtors', // 'debtors' | 'history'

  async init() {
    await this.renderKPIs();
    await this.renderSchoolDebtorsTable();
    await this.renderSchoolHistoryTable();
  },

  setSubTab(tab) {
    this.activeSubTab = tab;
    const debtorsView = document.getElementById('schoolCreditDebtorsView');
    const historyView = document.getElementById('schoolCreditHistoryView');
    const btnDebtors = document.getElementById('schoolSubTabDebtorsBtn');
    const btnHistory = document.getElementById('schoolSubTabHistoryBtn');

    if (tab === 'debtors') {
      if (debtorsView) debtorsView.classList.remove('hidden');
      if (historyView) historyView.classList.add('hidden');
      if (btnDebtors) {
        btnDebtors.className = 'px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/30 transition';
      }
      if (btnHistory) {
        btnHistory.className = 'px-4 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition';
      }
      this.renderSchoolDebtorsTable();
    } else {
      if (debtorsView) debtorsView.classList.add('hidden');
      if (historyView) historyView.classList.remove('hidden');
      if (btnDebtors) {
        btnDebtors.className = 'px-4 py-2 bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs font-bold transition';
      }
      if (btnHistory) {
        btnHistory.className = 'px-4 py-2 bg-sky-600 text-white rounded-xl text-xs font-bold shadow-md shadow-sky-600/30 transition';
      }
      this.renderSchoolHistoryTable();
    }
  },

  async ensureDefaultSchool() {
    let schools = await this.getSchoolCustomers();
    if (schools.length === 0) {
      const defaultSchool = {
        name: 'පාසල් දිවා ආහාර වැඩසටහන (School Meals)',
        schoolCode: 'SCH-MEAL',
        phone: '07X XXXXXXX',
        address: 'පාසල් මුළුතැන්ගෙය / Canteen',
        creditLimit: 0,
        openingBalance: 0,
        creditBalance: 0,
        isSchool: true,
        customerType: 'school',
        createdAt: new Date().toISOString()
      };
      const id = await db.customers.add(defaultSchool);
      defaultSchool.id = id;
      await this.init();
      return defaultSchool;
    }
    return schools[0];
  },

  async createDefaultSchoolAndOpen() {
    const school = await this.ensureDefaultSchool();
    await this.openSchoolMealCreditModal(school.id);
  },

  async getSchoolCustomers() {
    const all = await db.customers.toArray();
    return all.filter(c => c.isSchool === true || c.customerType === 'school' || (c.schoolCode && c.schoolCode.trim() !== ''));
  },

  async renderKPIs() {
    try {
      const schools = await this.getSchoolCustomers();
      const allPayments = db.creditPayments ? await db.creditPayments.toArray() : [];
      const schoolIds = new Set(schools.map(s => s.id));

      const totalDue = schools.reduce((sum, s) => sum + (Number(s.creditBalance) || 0), 0);
      const activeDebtors = schools.filter(s => (Number(s.creditBalance) || 0) > 0);

      const todayStr = new Date().toISOString().slice(0, 10);
      const todayCollected = allPayments
        .filter(p => schoolIds.has(p.customerId) && p.date && p.date.slice(0, 10) === todayStr)
        .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

      const elDue = document.getElementById('schoolTotalDueKpi');
      const elCount = document.getElementById('schoolActiveCountKpi');
      const elToday = document.getElementById('schoolTodayCollectedKpi');

      if (elDue) elDue.textContent = formatLKR(totalDue);
      if (elCount) elCount.textContent = `${activeDebtors.length} / ${schools.length} Schools`;
      if (elToday) elToday.textContent = formatLKR(todayCollected);
    } catch (e) {
      console.warn('Error rendering School KPIs:', e);
    }
  },

  async renderSchoolDebtorsTable() {
    const tbody = document.getElementById('schoolDebtorsTableBody');
    if (!tbody) return;

    let schools = await this.getSchoolCustomers();
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      const cleanDigits = q.replace(/[^0-9]/g, '');
      schools = schools.filter(s => {
        const name = (s.name || '').toLowerCase();
        const code = (s.schoolCode || '').toLowerCase();
        const phone = (s.phone || '').toLowerCase();
        const cleanPhone = (s.phone || '').replace(/[^0-9]/g, '');
        const addr = (s.address || '').toLowerCase();
        return name.includes(q) ||
          code.includes(q) ||
          phone.includes(q) ||
          (cleanDigits && cleanPhone.includes(cleanDigits)) ||
          addr.includes(q);
      });
    }

    if (schools.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center py-10 text-slate-400">
            <div class="text-3xl mb-2">🏫</div>
            <div class="font-bold text-slate-200 text-sm">පාසල් ගිණුම් කිසිවක් හමු නොවීය (No School Credit accounts found)</div>
            <p class="text-xs text-slate-400 mt-1 mb-3">ළමයින්ගේ කෑම උයන දෙමාපියන්ට එළවළු ණයට දීම සඳහා පහසුවෙන්ම ගිණුම සාදන්න</p>
            <div class="flex items-center justify-center gap-2 flex-wrap">
              <button onclick="SchoolCreditManager.createDefaultSchoolAndOpen()" class="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-extrabold shadow-lg shadow-amber-600/30 transition flex items-center gap-1.5 cursor-pointer">
                <span>🥕</span> <span>පෙරනිමි පාසල් ආහාර ගිණුම සාදා ණය සටහන් කරන්න</span>
              </button>
              <button onclick="SchoolCreditManager.openAddSchoolModal()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                <span>➕</span> <span>අලුත් පාසලක් එක් කරන්න (Add School)</span>
              </button>
            </div>
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = schools.map((s, idx) => {
      const due = Number(s.creditBalance) || 0;
      const limit = Number(s.creditLimit) || 0;
      const spent = Number(s.totalSpent) || 0;

      return `
        <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition font-mono">
          <td class="p-3 text-slate-500 font-sans">${idx + 1}</td>
          <td class="p-3 font-sans">
            <div class="font-extrabold text-slate-100 text-sm flex items-center gap-1.5">
              <span>👤</span>
              <span>${s.name}</span>
            </div>
            <div class="text-amber-400 font-bold text-[11px] mt-0.5">🏫 ${s.schoolName || s.name}</div>
            <div class="text-slate-500 text-[10px]">${s.address || 'ලිපිනයක් නැත'}</div>
          </td>
          <td class="p-3 text-sky-400">📱 ${s.phone || '---'}</td>
          <td class="p-3 text-right text-slate-400">
            ${limit > 0 ? formatLKR(limit) : '<span class="text-slate-600">No Limit</span>'}
          </td>
          <td class="p-3 text-right">
            <span class="text-sm font-black ${due > 0 ? 'text-rose-400' : 'text-emerald-400'}">
              ${formatLKR(due)}
            </span>
          </td>
          <td class="p-3 text-right text-slate-300">
            ${formatLKR(spent)}
          </td>
          <td class="p-3 text-center font-sans">
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold ${due > 0 ? 'bg-rose-950/80 text-rose-300 border border-rose-800' : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'}">
              ${due > 0 ? 'ණය හිඟයි (Due)' : 'ගෙවා අවසන් (Settled)'}
            </span>
          </td>
          <td class="p-3 text-right font-sans">
            <div class="flex items-center justify-end gap-1.5 flex-wrap">
              <button onclick="SchoolCreditManager.openSchoolMealCreditModal(${s.id})" class="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-lg text-[11px] font-black transition flex items-center gap-1 shadow-md shadow-amber-600/30" title="දෙමාපියන් එළවළු ණයට ගැනීම (School Meal Vegetable Credit)">
                <span>🥕</span> <span>එළවළු ණය</span>
              </button>
              <button onclick="CustomerManager.openCustomerStatementModal(${s.id})" class="px-2.5 py-1 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 shadow-sm" title="සම්පූර්ණ ගනුදෙනු ඉතිහාසය හා බිල්පත් ලෙජරය (Full History & Statement)">
                <span>📋</span> <span>ඉතිහාසය</span>
              </button>
              <button onclick="SchoolCreditManager.openSchoolSettlementModal(${s.id})" class="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700 text-emerald-300 rounded-lg text-[11px] font-bold transition" title="ණය මුදල් අයවීම (Collect Payment)">
                💰 අයවීම
              </button>
              <button onclick="SchoolCreditManager.openEditSchoolModal(${s.id})" class="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition" title="Edit Customer Details">
                ✏️
              </button>
              <button onclick="CustomerManager.deleteCustomer(${s.id})" class="p-1 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 rounded transition" title="Delete Customer">
                🗑️
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  async renderSchoolHistoryTable() {
    const tbody = document.getElementById('schoolHistoryTableBody');
    if (!tbody) return;

    const schools = await this.getSchoolCustomers();
    const schoolIds = new Set(schools.map(s => s.id));
    const schoolMap = new Map(schools.map(s => [s.id, s]));

    // Gather both settlements (payments) and manual direct credits
    const allPayments = db.creditPayments ? await db.creditPayments.toArray() : [];
    const allManualCredits = db.manualCredits ? await db.manualCredits.toArray() : [];

    const historyItems = [];

    allPayments.filter(p => schoolIds.has(p.customerId)).forEach(p => {
      const sch = schoolMap.get(p.customerId);
      historyItems.push({
        id: p.id,
        date: p.date,
        schoolName: sch?.name || p.customerName || 'School',
        schoolCode: sch?.schoolCode || '---',
        type: 'SETTLEMENT',
        ref: p.receiptNo || 'REC-' + p.id,
        notes: p.notes || p.paymentMethod || 'Cash Payment',
        amount: Number(p.amount) || 0,
        sign: -1,
        user: p.collectedBy || 'Staff'
      });
    });

    allManualCredits.filter(c => schoolIds.has(c.customerId)).forEach(c => {
      const sch = schoolMap.get(c.customerId);
      historyItems.push({
        id: c.id,
        date: c.date,
        schoolName: sch?.name || c.customerName || 'School',
        schoolCode: sch?.schoolCode || '---',
        type: c.isSchoolMeal ? 'SCHOOL_MEAL_CREDIT' : 'DIRECT_CREDIT',
        ref: c.refNo || 'CREDIT-' + c.id,
        notes: c.notes || 'Daily School Credit Charge',
        amount: Number(c.amount) || 0,
        sign: 1,
        user: c.recordedBy || 'Staff'
      });
    });

    // Sort newest first
    historyItems.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (historyItems.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-500">ගනුදෙනු කිසිවක් හමු නොවීය (No School Credit transactions recorded yet).</td></tr>`;
      return;
    }

    tbody.innerHTML = historyItems.map(item => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono text-slate-400">${item.date ? item.date.slice(0, 10) : '---'}</td>
        <td class="p-3 font-mono text-sky-400 font-bold">${item.schoolCode}</td>
        <td class="p-3 font-bold text-slate-100">${item.schoolName}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${item.type === 'SCHOOL_MEAL_CREDIT' ? 'bg-amber-950 text-amber-300 border border-amber-800' : (item.sign > 0 ? 'bg-sky-950 text-sky-300 border border-sky-800' : 'bg-emerald-950 text-emerald-300 border border-emerald-800')}">
            ${item.type === 'SCHOOL_MEAL_CREDIT' ? '🥕 එළවළු ණය (School Meal)' : (item.sign > 0 ? '➕ ණය දැමීම (Credit)' : '💰 අයවීම (Settlement)')}
          </span>
        </td>
        <td class="p-3 text-slate-400 truncate max-w-xs">${item.notes || '---'}</td>
        <td class="p-3 text-right font-mono font-bold ${item.sign > 0 ? 'text-amber-400' : 'text-emerald-400'}">
          ${item.sign > 0 ? '+' : '-'}${formatLKR(item.amount)}
        </td>
        <td class="p-3 text-slate-500 text-[11px]">${item.user}</td>
      </tr>
    `).join('');
  },

  openAddSchoolModal() {
    this.selectedSchoolIdForAction = null;
    const modal = document.getElementById('schoolCustomerModal');
    if (!modal) return;
    const title = document.getElementById('schoolCustomerModalTitle');
    if (title) title.textContent = 'පාසල් පාරිභෝගිකයෙකු / දෙමාපියන් එක් කිරීම (Add School Customer)';
    document.getElementById('schoolCustIdInput').value = '';
    document.getElementById('schoolCustNameInput').value = '';
    const schoolNameInput = document.getElementById('schoolCustSchoolNameInput');
    if (schoolNameInput) schoolNameInput.value = '';
    document.getElementById('schoolCustCodeInput').value = 'SCH-' + Math.floor(100 + Math.random() * 900);
    document.getElementById('schoolCustPhoneInput').value = '';
    document.getElementById('schoolCustAddressInput').value = '';
    document.getElementById('schoolCustLimitInput').value = '50000';
    document.getElementById('schoolCustOpeningBalInput').value = '0';
    modal.classList.remove('hidden');
  },

  async openEditSchoolModal(id) {
    let cust = await db.customers.get(id);
    if (!cust && !isNaN(Number(id))) cust = await db.customers.get(Number(id));
    if (!cust) return;
    this.selectedSchoolIdForAction = cust.id;

    const modal = document.getElementById('schoolCustomerModal');
    if (!modal) return;
    const title = document.getElementById('schoolCustomerModalTitle');
    if (title) title.textContent = `පාරිභෝගික විස්තර සංස්කරණය (Edit: ${cust.name})`;
    document.getElementById('schoolCustIdInput').value = cust.id;
    document.getElementById('schoolCustNameInput').value = cust.name;
    const schoolNameInput = document.getElementById('schoolCustSchoolNameInput');
    if (schoolNameInput) schoolNameInput.value = cust.schoolName || '';
    document.getElementById('schoolCustCodeInput').value = cust.schoolCode || ('SCH-' + cust.id);
    document.getElementById('schoolCustPhoneInput').value = cust.phone || '';
    document.getElementById('schoolCustAddressInput').value = cust.address || '';
    document.getElementById('schoolCustLimitInput').value = cust.creditLimit || '0';
    document.getElementById('schoolCustOpeningBalInput').value = cust.openingBalance || '0';
    modal.classList.remove('hidden');
  },

  async saveSchoolCustomer(e) {
    if (e) e.preventDefault();
    const id = document.getElementById('schoolCustIdInput')?.value;
    const name = document.getElementById('schoolCustNameInput')?.value.trim();
    const schoolName = document.getElementById('schoolCustSchoolNameInput')?.value.trim() || 'පාසල් දිවා ආහාරය';
    const code = document.getElementById('schoolCustCodeInput')?.value.trim().toUpperCase() || ('SCH-' + Date.now().toString().slice(-4));
    const phone = document.getElementById('schoolCustPhoneInput')?.value.trim();
    const address = document.getElementById('schoolCustAddressInput')?.value.trim();
    const creditLimit = parseFloat(document.getElementById('schoolCustLimitInput')?.value) || 0;
    const openingBalance = parseFloat(document.getElementById('schoolCustOpeningBalInput')?.value) || 0;

    if (!name) {
      alert('කරුණාකර පාරිභෝගිකයාගේ නම ඇතුළත් කරන්න (Please enter Customer Name)');
      return;
    }

    const data = {
      name,
      schoolName,
      schoolCode: code,
      phone: phone || '',
      address: address || '',
      creditLimit,
      openingBalance,
      isSchool: true,
      customerType: 'school',
      updatedAt: new Date().toISOString()
    };

    if (id) {
      await db.customers.update(parseInt(id), data);
    } else {
      data.creditBalance = openingBalance;
      data.totalSpent = 0;
      data.createdAt = new Date().toISOString();
      await db.customers.add(data);
    }

    document.getElementById('schoolCustomerModal')?.classList.add('hidden');
    await this.init();
    if (window.CustomerManager) {
      await CustomerManager.renderCustomerTable();
      await CustomerManager.renderCreditTab();
    }
    if (window.DashboardManager) DashboardManager.renderDashboard();
    if (window.SoundManager) SoundManager.playSuccessChime();
    alert('පාසල් පාරිභෝගිකයා සාර්ථකව සුරකින ලදී! (School customer saved successfully)');
  },

  // =========================================================================
  // SCHOOL MEAL VEGETABLE CREDIT (කෑම උයන දෙමාපියන් එළවළු ණයට ගැනීම)
  // =========================================================================
  async openSchoolMealCreditModal(schoolId) {
    let schools = await this.getSchoolCustomers();
    if (schools.length === 0) {
      const sch = await this.ensureDefaultSchool();
      schools = [sch];
    }

    const select = document.getElementById('mealCreditSchoolSelect');
    if (select) {
      select.innerHTML = schools.map(s => `
        <option value="${s.id}" ${(schoolId && s.id === schoolId) || (!schoolId && s === schools[0]) ? 'selected' : ''}>
          [${s.schoolCode || 'SCH'}] ${s.name} (ණය හිඟය: ${formatLKR(s.creditBalance || 0)})
        </option>
      `).join('');
    }

    const modal = document.getElementById('schoolMealCreditModal');
    if (!modal) return;

    const targetSchoolId = schoolId || (schools[0] ? schools[0].id : null);
    document.getElementById('mealCreditSchoolId').value = targetSchoolId || '';
    document.getElementById('mealCreditParentName').value = '';
    document.getElementById('mealCreditParentPhone').value = '';
    document.getElementById('mealCreditDate').value = new Date().toISOString().slice(0, 10);
    document.getElementById('mealCreditRefNo').value = 'SCH-MEAL-' + Date.now().toString().slice(-4);
    document.getElementById('mealCreditItemsDesc').value = '';
    document.getElementById('mealCreditAmount').value = '';
    const printCheck = document.getElementById('mealCreditPrintSlip');
    if (printCheck) printCheck.checked = true;

    modal.classList.remove('hidden');
    setTimeout(() => {
      document.getElementById('mealCreditParentName')?.focus();
    }, 100);
  },

  appendQuickVeg(vegName) {
    const el = document.getElementById('mealCreditItemsDesc');
    if (!el) return;
    const current = el.value.trim();
    if (!current) {
      el.value = `${vegName} `;
    } else {
      el.value = `${current}, ${vegName} `;
    }
    el.focus();
  },

  async saveSchoolMealCredit(e) {
    if (e) e.preventDefault();
    const schoolSelect = document.getElementById('mealCreditSchoolSelect');
    const schoolId = parseInt(schoolSelect?.value || document.getElementById('mealCreditSchoolId')?.value);
    if (!schoolId || isNaN(schoolId)) {
      alert('කරුණාකර පාසලක් තෝරන්න (Please select a School).');
      return;
    }

    const school = await db.customers.get(schoolId);
    if (!school) {
      alert('පාසල් ගිණුම සොයාගත නොහැක (School not found in database).');
      return;
    }

    const parentName = document.getElementById('mealCreditParentName')?.value.trim();
    if (!parentName) {
      alert('කරුණාකර එළවළු බාරගත් දෙමාපියන්ගේ නම ඇතුළත් කරන්න.');
      document.getElementById('mealCreditParentName')?.focus();
      return;
    }

    const parentPhone = document.getElementById('mealCreditParentPhone')?.value.trim() || '';
    const date = document.getElementById('mealCreditDate')?.value || new Date().toISOString().slice(0, 10);
    const refNo = document.getElementById('mealCreditRefNo')?.value.trim() || ('SCH-M-' + Date.now().toString().slice(-4));
    const itemsDesc = document.getElementById('mealCreditItemsDesc')?.value.trim();
    if (!itemsDesc) {
      alert('කරුණාකර ලබාගත් එළවළු සහ බර විස්තරය ඇතුළත් කරන්න.');
      document.getElementById('mealCreditItemsDesc')?.focus();
      return;
    }

    const amount = parseFloat(document.getElementById('mealCreditAmount')?.value) || 0;
    if (amount <= 0) {
      alert('කරුණාකර වලංගු ණය මුදලක් ඇතුළත් කරන්න (Amount > 0).');
      document.getElementById('mealCreditAmount')?.focus();
      return;
    }

    const shouldPrint = document.getElementById('mealCreditPrintSlip')?.checked !== false;
    const currentUser = (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'Staff';

    // 1. Save to manualCredits
    const creditRecord = {
      customerId: school.id,
      customerName: school.name,
      amount: Math.round(amount * 100) / 100,
      date: date,
      time: new Date().toTimeString().slice(0, 5),
      refNo: refNo,
      parentName: parentName,
      parentPhone: parentPhone,
      itemsDescription: itemsDesc,
      notes: `දෙමාපියන්: ${parentName}${parentPhone ? ' (' + parentPhone + ')' : ''} | එළවළු: ${itemsDesc}`,
      isSchoolMeal: true,
      type: 'school_meal_credit',
      recordedBy: currentUser,
      timestamp: new Date().toISOString()
    };

    if (db.manualCredits) {
      await db.manualCredits.add(creditRecord);
    }

    // 2. Update School credit balance
    const currentBal = Number(school.creditBalance || 0);
    const newBal = Math.round((currentBal + amount) * 100) / 100;
    await db.customers.update(school.id, {
      creditBalance: newBal,
      totalSpent: Math.round(((school.totalSpent || 0) + amount) * 100) / 100
    });

    document.getElementById('schoolMealCreditModal')?.classList.add('hidden');
    await this.init();
    if (window.CustomerManager) CustomerManager.init();
    if (window.SoundManager) SoundManager.playSuccessChime();

    // 3. Print Slip if checked
    if (shouldPrint) {
      this.printSchoolMealSlip(creditRecord, newBal, school);
    }

    alert(`පාසල් එළවළු ණය සටහන් කිරීම සාර්ථකයි!\n\n- පාසල: ${school.name}\n- බාරගත් දෙමාපියන්: ${parentName}\n- එළවළු: ${itemsDesc}\n- ණය මුදල: Rs. ${formatLKR(amount)}\n- සමස්ත හිඟ ශේෂය: Rs. ${formatLKR(newBal)}`);
  },

  async printSchoolMealSlip(creditRecord, remainingBal = 0, schoolObj = null) {
    const storeName = (await getSetting('store_name', '')) || 'LANKA MEGA SUPERMARKET';
    const storeAddress = (await getSetting('store_address', '')) || 'Main Street, Sri Lanka';
    const storePhone = (await getSetting('store_phone', '')) || '07X XXXXXXX';
    const school = schoolObj || (await db.customers.get(creditRecord.customerId));

    const html = `
      <div style="text-align: center; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans Sinhala', Arial, sans-serif; font-size: 11px; line-height: 1.35; color: #000; padding: 4px;">
        <h2 style="font-size: 15px; margin: 0; font-weight: 900; text-transform: uppercase;">${storeName}</h2>
        <div style="font-size: 10px; color: #333;">${storeAddress}</div>
        ${storePhone ? `<div style="font-size: 10px; font-weight: bold;">Tel: ${storePhone}</div>` : ''}

        <div style="border-top: 1.5px dashed #000; border-bottom: 1.5px dashed #000; margin: 6px 0; padding: 5px 0; font-weight: 900; font-size: 12px;">
          SCHOOL MEAL VEGETABLE CREDIT<br>
          <span style="font-size: 10.5px; font-weight: bold;">(පාසල් දිවා ආහාර එළවළු ණය පත්‍රිකාව)</span>
        </div>

        <div style="text-align: left; font-size: 10px; margin-bottom: 8px; line-height: 1.45;">
          <div>පාසල (School): <strong>${school?.name || creditRecord.customerName}</strong></div>
          <div>කේතය (Code): <strong>${school?.schoolCode || 'SCH'}</strong></div>
          <div>බිල්පත් අංකය (Slip No): <strong>${creditRecord.refNo}</strong></div>
          <div>දිනය / වේලාව: <strong>${creditRecord.date} ${creditRecord.time || ''}</strong></div>
          <div>නිකුත් කළේ: @${creditRecord.recordedBy || 'Staff'}</div>
        </div>

        <div style="border-top: 1px solid #000; border-bottom: 1px solid #000; padding: 5px 0; margin: 6px 0; text-align: left; background: #f9f9f9;">
          <div style="font-size: 10px; font-weight: bold; color: #444;">බාරගත් දෙමාපියන් (Parent / Cook):</div>
          <div style="font-size: 12px; font-weight: 900; color: #000;">${creditRecord.parentName}</div>
          ${creditRecord.parentPhone ? `<div style="font-size: 10px; font-family: monospace;">📞 ${creditRecord.parentPhone}</div>` : ''}
        </div>

        <div style="border: 1px solid #000; padding: 6px; margin: 6px 0; text-align: left; background: #fff;">
          <div style="font-size: 10px; font-weight: bold; margin-bottom: 3px;">ලබාගත් එළවළු සහ බර විස්තරය:</div>
          <div style="font-size: 11px; font-weight: 600; line-height: 1.4; color: #000;">
            ${creditRecord.itemsDescription}
          </div>
        </div>

        <div style="border-top: 1.5px dashed #000; margin-top: 8px; padding-top: 6px; font-size: 11px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
            <span>අද ණය වටිනාකම:</span>
            <strong style="font-size: 13px; font-family: monospace;">Rs. ${formatLKR(creditRecord.amount)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #000; padding-top: 4px; font-weight: 900;">
            <span>සමස්ත හිඟ පාසල් ණය:</span>
            <span style="font-size: 13px; font-family: monospace;">Rs. ${formatLKR(remainingBal)}</span>
          </div>
        </div>

        <div style="margin-top: 25px; padding-top: 5px; font-size: 9.5px; text-align: center; border-top: 1px dotted #888;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 15px;">
            <div>...........................<br>බාරදුන් අය (Store)</div>
            <div>...........................<br>බාරගත් අය (Parent)</div>
          </div>
          <div>පාසල් ප්‍රධානී / ආහාර කමිටුව වෙත ඉදිරිපත් කිරීමට</div>
          <div style="font-size: 8px; color: #666; margin-top: 4px;">LankaPOS School Module &bull; ${new Date().toLocaleDateString()}</div>
        </div>
      </div>
    `;

    const printArea = document.getElementById('thermalReceiptPrintArea');
    if (printArea) {
      printArea.innerHTML = html;
    }

    const printWin = window.open('', '_blank', 'width=380,height=600,top=100,left=100');
    if (!printWin) {
      document.body.classList.add('printing-receipt');
      window.print();
      setTimeout(() => document.body.classList.remove('printing-receipt'), 1000);
      return;
    }

    printWin.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>School Meal Credit - ${creditRecord.refNo}</title>
        <style>
          @page { size: 80mm auto; margin: 0; }
          body { margin: 0; padding: 4mm 3mm; background: #fff; width: 78mm; }
        </style>
      </head>
      <body>
        ${html}
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
              setTimeout(function() { window.close(); }, 500);
            }, 250);
          };
        <\/script>
      </body>
      </html>
    `);
    printWin.document.close();
  },

  // Direct Credit (Day Credit Charge) without POS Invoice
  async openDirectSchoolCreditModal(id) {
    const cust = await db.customers.get(id);
    if (!cust) return;
    this.selectedSchoolIdForAction = cust.id;

    const modal = document.getElementById('directCreditModal');
    if (!modal) return;
    document.getElementById('directCreditCustName').textContent = `[${cust.schoolCode || 'SCH'}] ${cust.name}`;
    document.getElementById('directCreditCustId').value = cust.id;
    document.getElementById('directCreditAmountInput').value = '';
    document.getElementById('directCreditDateInput').value = new Date().toISOString().slice(0, 10);
    document.getElementById('directCreditRefInput').value = '';
    document.getElementById('directCreditNotesInput').value = 'Daily School Canteen / Refreshment Credit';
    modal.classList.remove('hidden');
  },

  async openSchoolSettlementModal(id) {
    const cust = await db.customers.get(id);
    if (!cust) return;
    this.selectedSchoolIdForAction = cust.id;

    if (window.CustomerManager && typeof CustomerManager.openCollectCreditModal === 'function') {
      await CustomerManager.openCollectCreditModal(cust.id);
    }
  },

  // Comprehensive Statement Ledger for School
  async openSchoolStatementModal(id) {
    const cust = await db.customers.get(id);
    if (!cust) return;

    this.selectedSchoolIdForAction = cust.id;
    const modal = document.getElementById('schoolStatementModal');
    if (!modal) return;

    document.getElementById('stmtSchoolName').textContent = cust.name;
    document.getElementById('stmtSchoolCode').textContent = cust.schoolCode || ('SCH-' + cust.id);
    document.getElementById('stmtSchoolPhone').textContent = cust.phone || '---';
    document.getElementById('stmtSchoolDue').textContent = formatLKR(cust.creditBalance || 0);

    const tbody = document.getElementById('schoolStatementTableBody');
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-slate-400">Loading ledger records...</td></tr>`;

      // 1. Gather POS Credit Sales
      const allSales = await db.sales.where('customerId').equals(cust.id).toArray();
      // 2. Gather Direct Manual Credits
      const manualCredits = db.manualCredits ? await db.manualCredits.where('customerId').equals(cust.id).toArray() : [];
      // 3. Gather Settlement Payments
      const payments = db.creditPayments ? await db.creditPayments.where('customerId').equals(cust.id).toArray() : [];

      const ledger = [];

      // Opening balance
      if (Number(cust.openingBalance || 0) > 0) {
        ledger.push({
          date: cust.createdAt ? cust.createdAt.slice(0, 10) : 'Opening',
          type: 'OPENING',
          ref: 'START',
          notes: 'Opening Credit Balance',
          debit: Number(cust.openingBalance),
          credit: 0
        });
      }

      allSales.forEach(s => {
        if (s.paymentMethod === 'credit' || Number(s.creditAmount) > 0) {
          ledger.push({
            date: s.timestamp ? s.timestamp.slice(0, 10) : s.date,
            type: 'POS_INVOICE',
            ref: s.invoiceNo,
            notes: `POS Bill (${s.items?.length || 0} items)`,
            debit: Number(s.creditAmount || s.grandTotal || 0),
            credit: 0
          });
        }
      });

      manualCredits.forEach(m => {
        ledger.push({
          date: m.date,
          type: 'MANUAL_CREDIT',
          ref: m.refNo || 'CREDIT',
          notes: m.isSchoolMeal
            ? `🥕 [දෙමාපියන්: ${m.parentName || 'දෙමාපියන්'}] ${m.itemsDescription || m.notes}`
            : (m.notes || 'Direct Day Credit'),
          debit: Number(m.amount || 0),
          credit: 0
        });
      });

      payments.forEach(p => {
        ledger.push({
          date: p.date ? p.date.slice(0, 10) : '---',
          type: 'SETTLEMENT',
          ref: p.receiptNo || 'REC',
          notes: `${p.paymentMethod || 'Cash'} Settlement`,
          debit: 0,
          credit: Number(p.amount || 0)
        });
      });

      // Sort chronological
      ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      let runningBal = 0;
      tbody.innerHTML = ledger.map(entry => {
        runningBal += (entry.debit - entry.credit);
        return `
          <tr class="border-b border-slate-800 text-xs font-mono">
            <td class="p-2.5 text-slate-400">${entry.date}</td>
            <td class="p-2.5 text-sky-400 font-bold">${entry.ref}</td>
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

  // Print A4 Statement for School
  async printSchoolStatementA4(id) {
    const custId = id || this.selectedSchoolIdForAction;
    const cust = await db.customers.get(custId);
    if (!cust) return;

    const storeName = (await getSetting('store_name', '')) || 'LANKA MEGA SUPERMARKET';
    const storeAddress = (await getSetting('store_address', '')) || 'Main Street, Sri Lanka';
    const storePhone = (await getSetting('store_phone', '')) || '011-2345678';

    // Gather records
    const allSales = await db.sales.where('customerId').equals(cust.id).toArray();
    const manualCredits = db.manualCredits ? await db.manualCredits.where('customerId').equals(cust.id).toArray() : [];
    const payments = db.creditPayments ? await db.creditPayments.where('customerId').equals(cust.id).toArray() : [];

    const ledger = [];
    if (Number(cust.openingBalance || 0) > 0) {
      ledger.push({ date: cust.createdAt?.slice(0, 10) || 'Opening', ref: 'START', desc: 'Opening Balance', debit: Number(cust.openingBalance), credit: 0 });
    }
    allSales.forEach(s => {
      if (s.paymentMethod === 'credit' || Number(s.creditAmount) > 0) {
        ledger.push({ date: s.timestamp?.slice(0, 10) || s.date, ref: s.invoiceNo, desc: 'POS Store Invoice', debit: Number(s.creditAmount || s.grandTotal || 0), credit: 0 });
      }
    });
    manualCredits.forEach(m => {
      const desc = m.isSchoolMeal
        ? `🥕 [දෙමාපියන්: ${m.parentName || 'දෙමාපියන්'}] ${m.itemsDescription || m.notes}`
        : (m.notes || 'Day Credit Charge');
      ledger.push({ date: m.date, ref: m.refNo || 'CREDIT', desc: desc, debit: Number(m.amount || 0), credit: 0 });
    });
    payments.forEach(p => {
      ledger.push({ date: p.date?.slice(0, 10) || '---', ref: p.receiptNo || 'REC', desc: 'Settlement Payment', debit: 0, credit: Number(p.amount || 0) });
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
        <title>School Account Statement - ${cust.name}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Inter', Arial, sans-serif; font-size: 11px; color: #0f172a; margin: 0; padding: 15px; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0284c7; padding-bottom: 10px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 800; color: #0284c7; }
          .school-info { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px; margin-bottom: 15px; display: grid; grid-template-columns: 2fr 1fr; }
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
            <div style="font-weight: bold; margin-top: 4px; color: #475569;">OFFICIAL SCHOOL CREDIT STATEMENT (පාසල් ණය ප්‍රකාශනය)</div>
          </div>
          <div style="text-align: right; font-size: 10px;">
            <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
            <div>Status: <strong style="color: #dc2626;">OUTSTANDING</strong></div>
          </div>
        </div>

        <div class="school-info">
          <div>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a;">🏫 ${cust.name}</div>
            <div>Code: <strong>${cust.schoolCode || ('SCH-' + cust.id)}</strong> &bull; Phone: ${cust.phone || '---'}</div>
            <div>Address: ${cust.address || '---'}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 10px; color: #64748b;">CURRENT BALANCE DUE:</div>
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
          <div>Authorized Signature: _______________________</div>
          <div>School / Canteen In-charge: _______________________</div>
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

window.SchoolCreditManager = SchoolCreditManager;
