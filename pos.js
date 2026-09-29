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
      if (!query) return;

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

      // 1. Exact Barcode or SKU match
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

      // 2. Partial Search Match (Name, Sinhala Name, SKU, Barcode, Brand)
      const q = query.toLowerCase();
      const allProducts = await db.products.toArray();
      const match = allProducts.find(p =>
        p.name.toLowerCase().includes(q) ||
        (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
        p.sku.toLowerCase().includes(q) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
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
    const item = this.cart[index];

    AuthManager.requireAdminAuth({
      actionName: 'Override Cart Item Price',
      actionDesc: `Change price for "${item.name}" (Current: ${formatLKR(item.price)})`,
      requiredPerm: 'allowPriceEdit',
      onAuthorized: () => {
        const newPriceStr = prompt(`Edit Unit Price for:\n${item.name}\nCurrent Price: ${formatLKR(item.price)}`, item.price);
        if (newPriceStr !== null) {
          const newPrice = parseFloat(newPriceStr);
          if (!isNaN(newPrice) && newPrice >= 0) {
            item.price = newPrice;
            this.recalculateItemTotal(item);
            this.renderCart();
            SoundManager.playScanBeep();
          }
        }
      }
    });
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

        return `
        <tr class="border-b border-slate-800/90 hover:bg-slate-800/50 transition-colors">
          <!-- 1. Item Details -->
          <td class="p-2.5 align-middle">
            <div class="font-bold text-slate-100 text-xs leading-snug">
              <span>${index + 1}. ${item.name}</span>
              ${item.nameSi && item.nameSi !== item.name ? `<span class="text-[11px] text-sky-400 font-normal block font-sans">(${item.nameSi})</span>` : ''}
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

          <!-- 2. Unit Price -->
          <td class="p-2 text-right align-middle whitespace-nowrap">
            <button onclick="POSManager.editItemPrice(${index})" 
                    class="font-mono font-bold text-sky-300 hover:text-sky-200 underline decoration-dotted decoration-sky-500/50 text-xs" 
                    title="Click to edit unit price">
              ${formatLKR(item.price)}
            </button>
            <div class="text-[10px] text-slate-500 font-mono">per ${item.unit}</div>
            ${mrp > item.price ? `
              <div class="text-[9px] text-slate-500 line-through font-mono">MRP ${formatLKR(mrp)}</div>
            ` : ''}
          </td>

          <!-- 3. Quantity Stepper -->
          <td class="p-2 text-center align-middle whitespace-nowrap">
            <div class="inline-flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden shadow-inner">
              <button onclick="POSManager.updateItemQty(${index}, ${item.qty - (item.unit === 'kg' ? 0.25 : 1)}); POSManager.focusSearchInput();" 
                      class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs active:bg-slate-600 font-bold select-none" title="Decrease Qty">-</button>
              <input type="number" step="${item.unit === 'kg' ? '0.05' : '1'}" min="0.01" value="${item.qty}"
                     onchange="POSManager.updateItemQty(${index}, this.value); POSManager.focusSearchInput();"
                     onkeydown="if(event.key==='Enter'){ event.preventDefault(); POSManager.updateItemQty(${index}, this.value); POSManager.focusSearchInput(); }"
                     class="w-12 text-center bg-transparent text-slate-100 font-mono text-xs py-1 font-bold focus:outline-none focus:bg-slate-800" title="Edit quantity and press Enter to return to search" />
              <button onclick="POSManager.updateItemQty(${index}, ${item.qty + (item.unit === 'kg' ? 0.25 : 1)}); POSManager.focusSearchInput();" 
                      class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs active:bg-slate-600 font-bold select-none" title="Increase Qty">+</button>
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

    if (bills.length === 0) {
      container.innerHTML = `<div class="p-8 text-center text-slate-400">No held bills found.</div>`;
    } else {
      container.innerHTML = bills.map(b => `
        <div class="p-4 bg-slate-900 border border-slate-700 rounded-xl flex items-center justify-between hover:border-sky-500 transition">
          <div>
            <div class="font-bold text-slate-100">${b.customerName} <span class="text-xs font-normal text-slate-400">(${b.cartItems.length} items)</span></div>
            <div class="text-xs text-slate-400">${new Date(b.timestamp).toLocaleTimeString()} &bull; <strong class="text-sky-400 font-mono">${formatLKR(b.grandTotal)}</strong></div>
            ${b.note ? `<div class="text-xs text-amber-300 italic mt-0.5">"${b.note}"</div>` : ''}
          </div>
          <div class="flex items-center gap-2">
            <button onclick="POSManager.recallBill(${b.id})" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition">
              Recall & Load
            </button>
            <button onclick="POSManager.deleteHoldBill(${b.id})" class="p-1.5 text-rose-400 hover:bg-rose-950 rounded-lg transition" title="Delete">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
          </div>
        </div>
      `).join('');
    }

    document.getElementById('recallBillsModal').classList.remove('hidden');
  },

  async recallBill(holdBillId) {
    const bill = await db.holdBills.get(holdBillId);
    if (!bill) return;

    if (this.cart.length > 0 && !confirm('Active cart has items. Overwrite with held bill?')) {
      return;
    }

    this.cart = bill.cartItems;
    this.pricingMode = bill.pricingMode || 'retail';
    this.billDiscountType = bill.billDiscountType || 'fixed';
    this.billDiscountValue = bill.billDiscountValue || 0;
    this.updatePricingModeUI();

    if (bill.customerId) {
      this.selectedCustomer = await db.customers.get(bill.customerId);
    } else {
      this.selectedCustomer = null;
    }

    await db.holdBills.delete(holdBillId);
    document.getElementById('recallBillsModal').classList.add('hidden');
    this.renderCart();
    await this.updateHoldBillsBadge();
    SoundManager.playSuccessChime();
  },

  async deleteHoldBill(id) {
    if (confirm('Delete this held bill permanently?')) {
      await db.holdBills.delete(id);
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
      return;
    }

    grid.innerHTML = items.map(p => {
      const isLow = p.currentStock <= p.minStock && p.currentStock > 0;
      const isOut = p.currentStock <= 0;
      const wsPrice = p.wholesalePrice || p.sellingPrice;

      return `
        <div onclick="POSManager.addProductById(${p.id})"
             class="group relative bg-slate-800/80 hover:bg-slate-750 border border-slate-700/80 hover:border-sky-500 rounded-2xl p-3 flex flex-col justify-between cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-sky-950/40 select-none">
          <div>
            <div class="flex items-start justify-between gap-1 mb-1">
              <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-700/80 text-slate-300">
                ${p.unit || 'pcs'}
              </span>
              <span class="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                isOut ? 'bg-rose-900/80 text-rose-300 border border-rose-700' :
                isLow ? 'bg-amber-900/80 text-amber-300 border border-amber-700' :
                'bg-emerald-950/80 text-emerald-300'
              }">
                ${isOut ? 'Out of Stock' : `${p.currentStock} ${p.unit}`}
              </span>
            </div>
            <h4 class="font-bold text-slate-100 text-xs leading-snug group-hover:text-sky-300 transition line-clamp-2">
              ${p.name}
              ${p.nameSi && p.nameSi !== p.name ? `<span class="text-[11px] text-sky-400 font-normal block mt-0.5 font-sans">(${p.nameSi})</span>` : ''}
            </h4>
            <div class="text-[10px] text-slate-400 font-mono mt-0.5">${p.sku}</div>
          </div>
          
          <!-- Dual Price Box (Retail vs Wholesale) -->
          <div class="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center justify-between text-[11px] font-mono">
            <div>
              <span class="text-[10px] text-slate-400 block">${window.I18n ? I18n.t('retailTag') : 'Retail'}</span>
              <span class="font-bold text-sky-400">${formatLKR(p.sellingPrice)}</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-amber-400/80 block">${window.I18n ? I18n.t('wholesaleTag') : 'Wholesale'}</span>
              <span class="font-bold text-amber-300">${formatLKR(wsPrice)}</span>
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
      tender = totals.grandTotal;
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
  async showReceiptModal(sale) {
    if (!sale) return;

    const storeLogo = await getSetting('store_logo', null);
    const storeName = await getSetting('store_name', '');
    const storeNameSi = await getSetting('store_name_si', '');
    const storeBranch = await getSetting('store_branch', '');
    const storeAddress = await getSetting('store_address', '');
    const storePhone = await getSetting('store_phone', '');
    const storeVat = await getSetting('store_vat_no', '');
    const receiptFooterRaw = await getSetting('receipt_footer', '');
    const isLankaPOSFooter = receiptFooterRaw && (
      receiptFooterRaw.includes('LankaPOS') || 
      receiptFooterRaw.includes('Retail Suite') || 
      receiptFooterRaw.includes('retail suite') ||
      receiptFooterRaw.includes('Offline Retail')
    );
    const receiptFooter = isLankaPOSFooter ? 'Thank you for shopping with us!' : receiptFooterRaw;
    const thermalWidth = await getSetting('thermal_width', '80mm');

    const htmlContent = `
      <div class="text-center pb-2 border-b border-dashed border-slate-700 font-mono">
        ${storeLogo ? `<img src="${storeLogo}" class="max-h-12 mx-auto mb-1.5 object-contain" alt="Logo" />` : ''}
        ${storeName ? `<h2 class="text-base font-extrabold tracking-tight text-slate-900 uppercase">${storeName}</h2>` : ''}
        ${storeNameSi && storeNameSi !== 'ලංකා මෙගා සුපර්මාර්කට්' ? `<div class="text-xs text-slate-800 font-bold">${storeNameSi}</div>` : ''}
        ${storeBranch ? `<div class="text-[11px] text-slate-600">${storeBranch}</div>` : ''}
        ${storeAddress ? `<div class="text-[11px] text-slate-600 leading-tight">${storeAddress}</div>` : ''}
        ${storePhone ? `<div class="text-[11px] text-slate-600">Tel: ${storePhone}</div>` : ''}
        ${storeVat ? `<div class="text-[11px] text-slate-600 font-bold">VAT Reg: ${storeVat}</div>` : ''}
      </div>

      <div class="py-2 text-[11px] font-mono border-b border-dashed border-slate-700 space-y-0.5">
        <div class="flex justify-between">
          <span>Invoice No:</span>
          <strong>${sale.invoiceNo}</strong>
        </div>
        <div class="flex justify-between">
          <span>Date/Time:</span>
          <span>${new Date(sale.timestamp).toLocaleString()}</span>
        </div>
        <div class="flex justify-between">
          <span>Cashier:</span>
          <span>${sale.cashierName}</span>
        </div>
        <div class="flex justify-between">
          <span>Customer:</span>
          <span>${sale.customerName}</span>
        </div>
      </div>

      <div class="py-2 border-b border-dashed border-slate-900 font-mono text-[11px]">
        <table class="w-full border-collapse">
          <thead>
            <tr class="border-t border-b border-slate-900 font-bold uppercase text-[10px]">
              <th class="py-1 text-left" style="width: 46%;"># ITEM</th>
              <th class="py-1 text-center" style="width: 16%;">QTY</th>
              <th class="py-1 text-right" style="width: 19%;">PRICE</th>
              <th class="py-1 text-right" style="width: 19%;">TOTAL</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-dotted divide-slate-300">
            ${sale.items.map((item, idx) => {
              const mrp = Number(item.markedPrice) || Number(item.retailPrice) || Number(item.price);
              const isDiscounted = mrp > item.price;
              return `
              <tr>
                <td class="py-1.5 pr-1 align-top">
                  <div class="font-bold text-slate-900 leading-snug">${idx + 1}. ${item.name}</div>
                  ${item.nameSi && item.nameSi !== item.name ? `<div class="text-[10px] text-slate-600 font-sans">${item.nameSi}</div>` : ''}
                  ${isDiscounted ? `<div class="text-[9px] text-slate-400 line-through font-mono">MRP: ${mrp.toFixed(2)}</div>` : ''}
                </td>
                <td class="py-1.5 text-center align-top whitespace-nowrap font-semibold text-slate-800">
                  ${item.qty} <span class="text-[9px] text-slate-500">${item.unit}</span>
                </td>
                <td class="py-1.5 text-right align-top whitespace-nowrap text-slate-700">
                  <div>${item.price.toFixed(2)}</div>
                  ${item.itemDiscountAmount > 0 ? `<div class="text-[9px] text-emerald-700 font-bold">-${item.itemDiscountAmount.toFixed(2)}</div>` : ''}
                </td>
                <td class="py-1.5 text-right align-top whitespace-nowrap font-black text-slate-900">
                  ${item.total.toFixed(2)}
                </td>
              </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>

      <div class="pt-2 border-t-2 border-slate-900 text-xs font-mono space-y-1">
        ${sale.subtotalMRP && sale.subtotalMRP > sale.grandTotal ? `
          <div class="flex justify-between text-slate-600">
            <span>Subtotal (MRP Value):</span>
            <span class="line-through">${formatLKR(sale.subtotalMRP)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between">
          <span>Subtotal:</span>
          <span>${formatLKR(sale.subtotal)}</span>
        </div>
        ${sale.totalDiscount > 0 ? `
          <div class="flex justify-between text-emerald-700 font-semibold">
            <span>Total Discount:</span>
            <span>-${formatLKR(sale.totalDiscount)}</span>
          </div>
        ` : ''}
        ${sale.tax > 0 ? `
          <div class="flex justify-between">
            <span>Tax / VAT:</span>
            <span>${formatLKR(sale.tax)}</span>
          </div>
        ` : ''}
        <div class="flex justify-between text-sm font-black border-t border-b border-slate-900 py-1">
          <span>GRAND TOTAL:</span>
          <span>${formatLKR(sale.grandTotal)}</span>
        </div>

        ${sale.totalSavings && sale.totalSavings > 0 ? `
          <div class="flex justify-between font-bold text-emerald-800 bg-emerald-50 border border-dashed border-emerald-600 p-1.5 rounded my-1 text-center">
            <span class="text-[11px]">🎉 ඔබට ලැබුණු මුළු ලාභය / YOU SAVED:</span>
            <span class="text-xs font-black text-emerald-700">${formatLKR(sale.totalSavings)}</span>
          </div>
        ` : ''}
        
        ${sale.paymentMethod === 'split' || (sale.creditAmount && sale.creditAmount > 0) ? `
          <div class="flex justify-between pt-1">
            <span class="uppercase">Method:</span>
            <strong>SPLIT (Cash + Credit)</strong>
          </div>
          <div class="flex justify-between text-emerald-800 font-bold">
            <span>Cash Paid:</span>
            <span>${formatLKR(sale.paidCash || sale.tenderedAmount || 0)}</span>
          </div>
          <div class="flex justify-between text-rose-800 font-bold">
            <span>Added to Credit:</span>
            <span>${formatLKR(sale.creditAmount || 0)}</span>
          </div>
          ${sale.customerNewBalance !== undefined ? `
            <div class="flex justify-between text-slate-700 text-[10px] pt-1 border-t border-dotted border-slate-400">
              <span>Customer Total Due:</span>
              <strong>${formatLKR(sale.customerNewBalance)}</strong>
            </div>
          ` : ''}
        ` : `
          <div class="flex justify-between pt-1">
            <span class="uppercase">Payment (${sale.paymentMethod}):</span>
            <span>${formatLKR(sale.tenderedAmount)}</span>
          </div>
          ${sale.paymentMethod === 'cash' ? `
            <div class="flex justify-between">
              <span>Change Returned:</span>
              <span class="font-bold">${formatLKR(sale.changeAmount)}</span>
            </div>
          ` : ''}
        `}
      </div>

      <div class="text-center pt-3 mt-2 border-t border-dashed border-slate-700 text-xs font-mono space-y-1">
        ${receiptFooter ? `<div>${receiptFooter}</div>` : ''}
        <div class="pt-1 flex justify-center">
          <svg id="receiptBarcodeCanvas" class="h-10"></svg>
        </div>
      </div>
    `;

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

    if (window.JsBarcode) {
      setTimeout(() => {
        try {
          JsBarcode('#receiptBarcodeCanvas', sale.invoiceNo, {
            format: 'CODE128',
            width: 1.2,
            height: 32,
            displayValue: true,
            fontSize: 9
          });
        } catch (e) {
          console.warn('Barcode error on receipt:', e);
        }
      }, 50);
    }

    document.getElementById('receiptModal').classList.remove('hidden');

    const autoPrint = await getSetting('auto_print_receipt', false);
    if (autoPrint === true || autoPrint === 'true') {
      this.printThermalReceipt();
    }
  },

  printThermalReceipt() {
    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 1000);
  },

  // ==========================================
  // SALES HISTORY, REPRINT & RETURNS / REFUNDS
  // ==========================================

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
        <div onclick="POSManager.showSaleDetailsForReturn(${s.id})" class="p-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-sky-500/60 rounded-xl cursor-pointer transition">
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
          <button onclick="POSManager.reprintPastReceipt(${sale.id})" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-sky-600/30">
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
                    <button onclick="POSManager.promptReturnItem(${sale.id}, ${item.id})" class="px-2 py-1 bg-amber-950/80 hover:bg-amber-900 border border-amber-700 text-amber-300 rounded-lg text-[11px] font-bold transition">
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
