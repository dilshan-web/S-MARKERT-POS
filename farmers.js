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
