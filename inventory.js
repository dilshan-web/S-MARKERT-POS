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

  openAddProductModal() {
    document.getElementById('productModalTitle').textContent = I18n.currentLang === 'si' ? 'අලුත් භාණ්ඩයක් ඇතුළත් කිරීම' : (I18n.currentLang === 'bi' ? 'අලුත් භාණ්ඩයක් (Add New Product)' : 'Add New Product');
    document.getElementById('productForm').reset();
    document.getElementById('prodIdInput').value = '';
    document.getElementById('prodNameSiInput').value = '';
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
      currentStock: parseFloat(document.getElementById('prodCurrentStockInput').value) || 0,
      expiryDate: document.getElementById('prodExpiryDateInput').value || null,
      batchNumber: document.getElementById('prodBatchInput').value.trim(),
      supplierId: parseInt(document.getElementById('prodSupplierInput').value) || null
    };

    const performSave = async () => {
      if (id) {
        await db.products.update(parseInt(id), productData);
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
};

window.InventoryManager = InventoryManager;
