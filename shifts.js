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
