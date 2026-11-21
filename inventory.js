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

      const minThreshold = Number(p.minStock) || 0;
      if (minThreshold > 0 && stock <= minThreshold && stock > 0) {
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
      products = products.filter(p => {
        const min = Number(p.minStock) || 0;
        return min > 0 && p.currentStock <= min && p.currentStock > 0;
      });
    } else if (this.currentFilter === 'out') {
      products = products.filter(p => p.currentStock <= 0);
    } else if (this.currentFilter === 'nearExpiry') {
      products = products.filter(p => p.expiryDate && new Date(p.expiryDate) <= thirtyDaysAhead && new Date(p.expiryDate) >= today);
    } else if (this.currentFilter === 'expired') {
      products = products.filter(p => p.expiryDate && new Date(p.expiryDate) < today);
    }

    // Apply Search strictly matching SKU, Name, Sinhala Name, or Barcodes
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      products = products.filter(p =>
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
        (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
      );

      // Sort: exact SKU first, startsWith next, contains last
      products.sort((a, b) => {
        const aSkuExact = a.sku && a.sku.toLowerCase() === q;
        const bSkuExact = b.sku && b.sku.toLowerCase() === q;
        if (aSkuExact && !bSkuExact) return -1;
        if (!aSkuExact && bSkuExact) return 1;

        const aSkuStart = a.sku && a.sku.toLowerCase().startsWith(q);
        const bSkuStart = b.sku && b.sku.toLowerCase().startsWith(q);
        if (aSkuStart && !bSkuStart) return -1;
        if (!aSkuStart && bSkuStart) return 1;

        const aNameStart = a.name && a.name.toLowerCase().startsWith(q);
        const bNameStart = b.name && b.name.toLowerCase().startsWith(q);
        if (aNameStart && !bNameStart) return -1;
        if (!aNameStart && bNameStart) return 1;

        return 0;
      });
    }

    if (products.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-slate-400 font-semibold">${I18n.currentLang === 'si' ? 'ගැලපෙන භාණ්ඩ හමු නොවීය.' : (I18n.currentLang === 'bi' ? 'ගැලපෙන භාණ්ඩ හමු නොවීය (No products found)' : 'No products match current criteria.')}</td></tr>`;
      return;
    }

    tableBody.innerHTML = products.map(p => {
      const isOut = p.currentStock <= 0;
      const minThreshold = Number(p.minStock) || 0;
      const isLow = minThreshold > 0 && p.currentStock <= minThreshold && !isOut;
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
            ${Number(p.markedPrice || 0) > 0 ? `<div class="font-bold text-emerald-400 text-xs">MRP: ${formatLKR(p.markedPrice)}</div>` : ''}
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
            <button onclick="InventoryManager.openBulkStockModal(${p.id})" class="p-1.5 bg-slate-800 hover:bg-violet-600 text-violet-300 hover:text-white rounded-lg transition" title="Bulk Stock & Price Update">📋</button>
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

  onAddStockChange() {
    const currentVal = parseFloat(document.getElementById('prodCurrentStockInput')?.value) || 0;
    const addedInput = document.getElementById('prodAddStockInput');
    const addedVal = parseFloat(addedInput?.value) || 0;
    const previewContainer = document.getElementById('newTotalStockPreview');
    const previewVal = document.getElementById('previewTotalStockVal');

    if (addedInput && addedInput.value.trim() !== '' && !isNaN(addedVal)) {
      const total = Math.round((currentVal + addedVal) * 100) / 100;
      if (previewVal) previewVal.textContent = total.toFixed(2);
      if (previewContainer) previewContainer.classList.remove('hidden');
    } else {
      if (previewContainer) previewContainer.classList.add('hidden');
    }
  },

  openAddProductModal() {
    document.getElementById('productModalTitle').textContent = I18n.currentLang === 'si' ? 'අලුත් භාණ්ඩයක් ඇතුළත් කිරීම' : (I18n.currentLang === 'bi' ? 'අලුත් භාණ්ඩයක් (Add New Product)' : 'Add New Product');
    document.getElementById('productForm').reset();
    document.getElementById('prodIdInput').value = '';
    document.getElementById('prodNameSiInput').value = '';
    const minStockInput = document.getElementById('prodMinStockInput');
    if (minStockInput) minStockInput.value = '0';
    const currentStockInput = document.getElementById('prodCurrentStockInput');
    if (currentStockInput) currentStockInput.value = '0';
    const addStockInput = document.getElementById('prodAddStockInput');
    if (addStockInput) addStockInput.value = '';
    const previewContainer = document.getElementById('newTotalStockPreview');
    if (previewContainer) previewContainer.classList.add('hidden');
    const markedPriceInput = document.getElementById('prodMarkedPriceInput');
    if (markedPriceInput) markedPriceInput.value = '0';
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
    if (markedPriceInput) markedPriceInput.value = (product.markedPrice !== undefined && product.markedPrice !== null) ? product.markedPrice : 0;
    document.getElementById('prodSellingPriceInput').value = product.sellingPrice || 0;
    document.getElementById('prodWholesalePriceInput').value = (product.wholesalePrice !== undefined && product.wholesalePrice !== null && product.wholesalePrice !== '') ? product.wholesalePrice : '';
    document.getElementById('prodMinStockInput').value = (product.minStock !== undefined && product.minStock !== null) ? product.minStock : 0;
    document.getElementById('prodCurrentStockInput').value = product.currentStock || 0;
    const addStockInput = document.getElementById('prodAddStockInput');
    if (addStockInput) addStockInput.value = '';
    const previewContainer = document.getElementById('newTotalStockPreview');
    if (previewContainer) previewContainer.classList.add('hidden');
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
    const rawMarked = document.getElementById('prodMarkedPriceInput')?.value;
    const markedPriceVal = (rawMarked !== undefined && rawMarked !== '' && !isNaN(parseFloat(rawMarked))) ? parseFloat(rawMarked) : 0;

    const baseStock = parseFloat(document.getElementById('prodCurrentStockInput').value) || 0;
    const addedStock = parseFloat(document.getElementById('prodAddStockInput')?.value) || 0;
    const finalStock = Math.round((baseStock + addedStock) * 100) / 100;

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
      wholesalePrice: (function() {
        const wsField = document.getElementById('prodWholesalePriceInput');
        const wsRaw = wsField ? wsField.value.trim() : '';
        if (wsRaw !== '' && !isNaN(parseFloat(wsRaw))) {
          return parseFloat(wsRaw);
        }
        // Auto-calculate: if MRP(markedPrice) > 0 → wholesale = MRP * 0.90; else = sellingPrice
        return markedPriceVal > 0 ? Math.round(markedPriceVal * 0.90 * 100) / 100 : sellingPriceVal;
      })(),
      minStock: parseFloat(document.getElementById('prodMinStockInput').value) || 0,
      currentStock: finalStock,
      expiryDate: document.getElementById('prodExpiryDateInput').value || null,
      batchNumber: document.getElementById('prodBatchInput').value.trim(),
      supplierId: parseInt(document.getElementById('prodSupplierInput').value) || null
    };

    const performSave = async () => {
      if (id) {
        await db.products.update(parseInt(id), productData);
        if (addedStock !== 0) {
          try {
            await db.stockAdjustments.add({
              productId: parseInt(id),
              productName: nameVal,
              type: addedStock > 0 ? 'in' : 'out',
              quantity: Math.abs(addedStock),
              reason: `Manual Stock Intake (+${addedStock})`,
              adjustedBy: AuthManager.currentUser?.name || 'Staff',
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            console.warn('Failed to log stock adjustment audit:', e);
          }
        }
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
        oldProd.markedPrice !== productData.markedPrice
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
  },
  // ============================================================
  // BULK STOCK UPDATE (BATCH STAGING WORKFLOW)
  // SKU / Barcode / Name Search -> Add to Batch -> Staged Table -> Save All
  // ============================================================
  _bulkStagedItems: [],
  _bulkActiveProduct: null,

  async openBulkStockModal(presetProductId = null) {
    const modal = document.getElementById('bulkStockModal');
    if (!modal) return;
    this._bulkStagedItems = [];
    this._bulkActiveProduct = null;
    this._renderBulkStagedTable();
    this._resetBulkProductForm();

    const searchInput = document.getElementById('bulkStockSearchInput');
    if (searchInput) searchInput.value = '';
    const resultsBox = document.getElementById('bulkStockSearchResults');
    if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.classList.add('hidden'); }

    modal.classList.remove('hidden');

    if (presetProductId) {
      const p = await db.products.get(presetProductId);
      if (p) this.selectProductForBulk(p);
    } else {
      setTimeout(() => { if (searchInput) searchInput.focus(); }, 120);
    }
  },

  // Backward compatibility alias for any remaining references
  async openQuickStockModal(productId) {
    await this.openBulkStockModal(productId);
  },

  _bulkHighlightedIndex: -1,
  _bulkCurrentMatches: [],

  async searchBulkProducts(query) {
    const resultsBox = document.getElementById('bulkStockSearchResults');
    if (!resultsBox) return;
    const q = (query || '').trim().toLowerCase();
    if (!q) {
      this._bulkCurrentMatches = [];
      this._bulkHighlightedIndex = -1;
      resultsBox.innerHTML = '';
      resultsBox.classList.add('hidden');
      return;
    }

    const all = await db.products.toArray();
    let matches = all.filter(p =>
      (p.sku && p.sku.toLowerCase().includes(q)) ||
      (p.name && p.name.toLowerCase().includes(q)) ||
      (p.nameSi && p.nameSi.toLowerCase().includes(q)) ||
      (p.barcodes && p.barcodes.some(b => b.toLowerCase().includes(q)))
    );

    // Sort: exact SKU first, startsWith next, contains last
    matches.sort((a, b) => {
      const aSkuExact = a.sku && a.sku.toLowerCase() === q;
      const bSkuExact = b.sku && b.sku.toLowerCase() === q;
      if (aSkuExact && !bSkuExact) return -1;
      if (!aSkuExact && bSkuExact) return 1;

      const aSkuStart = a.sku && a.sku.toLowerCase().startsWith(q);
      const bSkuStart = b.sku && b.sku.toLowerCase().startsWith(q);
      if (aSkuStart && !bSkuStart) return -1;
      if (!aSkuStart && bSkuStart) return 1;

      const aNameStart = a.name && a.name.toLowerCase().startsWith(q);
      const bNameStart = b.name && b.name.toLowerCase().startsWith(q);
      if (aNameStart && !bNameStart) return -1;
      if (!aNameStart && bNameStart) return 1;

      return 0;
    });

    matches = matches.slice(0, 10);
    this._bulkCurrentMatches = matches;
    this._bulkHighlightedIndex = matches.length > 0 ? 0 : -1;

    if (matches.length === 0) {
      resultsBox.innerHTML = `<div class="p-3 text-center text-slate-400 text-xs">ගැලපෙන භාණ්ඩයක් හමු නොවීය (No matching product)</div>`;
      resultsBox.classList.remove('hidden');
      return;
    }

    resultsBox.innerHTML = matches.map((p, idx) => `
      <div id="bulk-result-item-${idx}" onclick="InventoryManager.selectProductForBulkById(${p.id})" class="bulk-search-row p-2.5 hover:bg-slate-800 rounded-xl cursor-pointer flex items-center justify-between text-xs border-b border-slate-800/80 last:border-none transition ${idx === 0 ? 'bg-violet-900/60 ring-1 ring-violet-500' : ''}">
        <div>
          <div class="font-bold text-white">${p.name}</div>
          <div class="text-[11px] text-sky-400 font-mono mt-0.5">${p.sku} ${p.nameSi ? '• ' + p.nameSi : ''}</div>
        </div>
        <div class="text-right">
          <div class="text-xs font-mono text-emerald-400 font-bold">තොග: ${p.currentStock || 0} ${p.unit || ''}</div>
          <div class="text-[11px] text-slate-400 font-mono">Retail: ${formatLKR(p.sellingPrice)}</div>
        </div>
      </div>
    `).join('');
    resultsBox.classList.remove('hidden');
  },

  handleBulkSearchKeydown(event) {
    if (!this._bulkCurrentMatches || this._bulkCurrentMatches.length === 0) return;
    const total = this._bulkCurrentMatches.length;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault();
      this._bulkHighlightedIndex = (this._bulkHighlightedIndex + 1) % total;
      this._updateBulkSearchHighlight();
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault();
      this._bulkHighlightedIndex = (this._bulkHighlightedIndex - 1 + total) % total;
      this._updateBulkSearchHighlight();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (this._bulkHighlightedIndex >= 0 && this._bulkCurrentMatches[this._bulkHighlightedIndex]) {
        this.selectProductForBulk(this._bulkCurrentMatches[this._bulkHighlightedIndex]);
      }
    }
  },

  _updateBulkSearchHighlight() {
    const resultsBox = document.getElementById('bulkStockSearchResults');
    if (!resultsBox) return;

    resultsBox.querySelectorAll('.bulk-search-row').forEach(row => {
      row.classList.remove('bg-violet-900/60', 'ring-1', 'ring-violet-500');
    });

    const activeRow = document.getElementById(`bulk-result-item-${this._bulkHighlightedIndex}`);
    if (activeRow) {
      activeRow.classList.add('bg-violet-900/60', 'ring-1', 'ring-violet-500');
      activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  },

  handleBulkFieldKeydown(event, currentField) {
    // Arrow Navigation horizontally between the 4 active fields
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (currentField === 'addStock') document.getElementById('bulkActiveRetail')?.focus();
      else if (currentField === 'retail') document.getElementById('bulkActiveWholesale')?.focus();
      else if (currentField === 'wholesale') document.getElementById('bulkActiveCost')?.focus();
      return;
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (currentField === 'cost') document.getElementById('bulkActiveWholesale')?.focus();
      else if (currentField === 'wholesale') document.getElementById('bulkActiveRetail')?.focus();
      else if (currentField === 'retail') document.getElementById('bulkActiveAddStock')?.focus();
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addActiveProductToBatch();
    }
  },

  async selectProductForBulkById(id) {
    const p = await db.products.get(id);
    if (p) this.selectProductForBulk(p);
  },

  selectProductForBulk(product) {
    this._bulkActiveProduct = product;

    // Hide search results dropdown
    const resultsBox = document.getElementById('bulkStockSearchResults');
    if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.classList.add('hidden'); }

    const searchInput = document.getElementById('bulkStockSearchInput');
    if (searchInput) searchInput.value = `${product.name} [${product.sku}]`;

    // Show active item panel
    const activePanel = document.getElementById('bulkActiveProductPanel');
    if (activePanel) activePanel.classList.remove('hidden');

    // Fill current display labels
    const nameEl = document.getElementById('bulkActiveName');
    const skuEl = document.getElementById('bulkActiveSku');
    const stockEl = document.getElementById('bulkActiveCurrentStock');

    if (nameEl) nameEl.textContent = product.name;
    if (skuEl) skuEl.textContent = `SKU: ${product.sku} | Unit: ${product.unit || 'unit'}`;
    if (stockEl) stockEl.textContent = `${product.currentStock || 0} ${product.unit || 'unit'}`;

    // Fill input fields
    const addInput = document.getElementById('bulkActiveAddStock');
    const retailInput = document.getElementById('bulkActiveRetail');
    const wholesaleInput = document.getElementById('bulkActiveWholesale');
    const costInput = document.getElementById('bulkActiveCost');
    const previewEl = document.getElementById('bulkActiveNewStockPreview');

    if (addInput) addInput.value = '';
    if (retailInput) retailInput.value = product.sellingPrice || '';
    if (wholesaleInput) wholesaleInput.value = product.wholesalePrice || product.sellingPrice || '';
    if (costInput) costInput.value = product.costPrice || '';
    if (previewEl) {
      previewEl.textContent = `${product.currentStock || 0} ${product.unit || ''}`;
      previewEl.className = 'font-mono font-bold text-slate-300 text-sm';
    }

    if (addInput) {
      addInput.focus();
      addInput.select();
    }
  },

  onBulkActiveAddStockChange() {
    if (!this._bulkActiveProduct) return;
    const addInput = document.getElementById('bulkActiveAddStock');
    const previewEl = document.getElementById('bulkActiveNewStockPreview');
    const addVal = parseFloat(addInput?.value) || 0;
    const curVal = Number(this._bulkActiveProduct.currentStock || 0);
    const newTotal = Math.round((curVal + addVal) * 100) / 100;
    if (previewEl) {
      previewEl.textContent = `${newTotal} ${this._bulkActiveProduct.unit || ''}`;
      previewEl.className = addVal > 0 ? 'font-mono font-black text-emerald-400 text-sm' : (addVal < 0 ? 'font-mono font-black text-rose-400 text-sm' : 'font-mono font-bold text-slate-300 text-sm');
    }
  },

  addActiveProductToBatch() {
    if (!this._bulkActiveProduct) {
      alert('කරුණාකර පළමුව භාණ්ඩයක් තෝරන්න (Please select a product first).');
      return;
    }

    const p = this._bulkActiveProduct;
    const addStockVal = parseFloat(document.getElementById('bulkActiveAddStock')?.value) || 0;
    const retailRaw = document.getElementById('bulkActiveRetail')?.value?.trim();
    const wholesaleRaw = document.getElementById('bulkActiveWholesale')?.value?.trim();
    const costRaw = document.getElementById('bulkActiveCost')?.value?.trim();

    const retailVal = retailRaw !== '' ? (parseFloat(retailRaw) || 0) : (p.sellingPrice || 0);
    const wholesaleVal = wholesaleRaw !== '' ? (parseFloat(wholesaleRaw) || 0) : (p.wholesalePrice || p.sellingPrice || 0);
    const costVal = costRaw !== '' ? (parseFloat(costRaw) || 0) : (p.costPrice || 0);

    const oldStock = Number(p.currentStock || 0);
    const newStock = Math.round((oldStock + addStockVal) * 100) / 100;

    // Check if already in batch
    const existingIndex = this._bulkStagedItems.findIndex(i => i.productId === p.id);
    const stagedItem = {
      productId: p.id,
      name: p.name,
      nameSi: p.nameSi || '',
      sku: p.sku,
      unit: p.unit || 'unit',
      oldStock,
      addStock: addStockVal,
      newStock,
      oldRetail: p.sellingPrice || 0,
      retailPrice: retailVal,
      oldWholesale: p.wholesalePrice || p.sellingPrice || 0,
      wholesalePrice: wholesaleVal,
      oldCost: p.costPrice || 0,
      costPrice: costVal
    };

    if (existingIndex >= 0) {
      this._bulkStagedItems[existingIndex] = stagedItem;
    } else {
      this._bulkStagedItems.push(stagedItem);
    }

    if (window.SoundManager) SoundManager.playScanBeep();

    this._renderBulkStagedTable();
    this._resetBulkProductForm();

    // Focus back on search input for next item!
    const searchInput = document.getElementById('bulkStockSearchInput');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
  },

  removeStagedItem(index) {
    if (index >= 0 && index < this._bulkStagedItems.length) {
      this._bulkStagedItems.splice(index, 1);
      this._renderBulkStagedTable();
    }
  },

  clearAllStagedItems() {
    if (this._bulkStagedItems.length === 0) return;
    if (confirm('ලැයිස්තුවේ ඇති සියලුම භාණ්ඩ ඉවත් කරන්නද? (Clear all staged items?)')) {
      this._bulkStagedItems = [];
      this._renderBulkStagedTable();
      this._resetBulkProductForm();
    }
  },

  _resetBulkProductForm() {
    this._bulkActiveProduct = null;
    const activePanel = document.getElementById('bulkActiveProductPanel');
    if (activePanel) activePanel.classList.add('hidden');
    const searchInput = document.getElementById('bulkStockSearchInput');
    if (searchInput) searchInput.value = '';
    const resultsBox = document.getElementById('bulkStockSearchResults');
    if (resultsBox) { resultsBox.innerHTML = ''; resultsBox.classList.add('hidden'); }
  },

  _renderBulkStagedTable() {
    const tbody = document.getElementById('bulkStockStagedTableBody');
    const mobileContainer = document.getElementById('bulkStockStagedMobileList');
    const emptyState = document.getElementById('bulkStockStagedEmpty');
    const countBadge = document.getElementById('bulkStagedCountBadge');
    const saveBtn = document.getElementById('bulkStockSaveAllBtn');

    const count = this._bulkStagedItems.length;
    if (countBadge) countBadge.textContent = `${count} Items in Batch`;
    if (saveBtn) {
      saveBtn.disabled = count === 0;
      saveBtn.className = count === 0
        ? 'w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-slate-800 text-slate-500 rounded-xl font-extrabold text-xs sm:text-sm transition cursor-not-allowed text-center'
        : 'w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-gradient-to-r from-violet-600 to-emerald-600 hover:from-violet-500 hover:to-emerald-500 text-white rounded-xl font-extrabold text-xs sm:text-sm transition shadow-lg shadow-emerald-700/40 flex items-center justify-center gap-2 cursor-pointer active:scale-95';
    }

    if (count === 0) {
      if (tbody) tbody.innerHTML = '';
      if (mobileContainer) mobileContainer.innerHTML = '';
      if (emptyState) emptyState.classList.remove('hidden');
      return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    // 1. Desktop Detailed Table
    if (tbody) {
      tbody.innerHTML = this._bulkStagedItems.map((item, index) => {
        const stockDiffText = item.addStock > 0 ? `+${item.addStock}` : (item.addStock < 0 ? `${item.addStock}` : '0');
        const stockDiffColor = item.addStock > 0 ? 'text-emerald-400' : (item.addStock < 0 ? 'text-rose-400' : 'text-slate-400');

        return `
          <tr class="border-b border-slate-800 hover:bg-slate-800/40 text-xs transition">
            <td class="p-2.5 font-mono text-slate-500 text-center font-bold">${index + 1}</td>
            <td class="p-2.5">
              <div class="font-bold text-slate-100">${item.name}</div>
              <div class="text-[10px] text-sky-400 font-mono mt-0.5">${item.sku}</div>
            </td>
            <td class="p-2.5 text-center font-mono text-slate-400">${item.oldStock} ${item.unit}</td>
            <td class="p-2.5 text-center font-mono font-bold ${stockDiffColor}">${stockDiffText}</td>
            <td class="p-2.5 text-center font-mono font-extrabold text-sky-300 bg-sky-950/30 rounded-lg">${item.newStock} ${item.unit}</td>
            <td class="p-2.5 text-right font-mono font-bold text-emerald-400">${formatLKR(item.retailPrice)}</td>
            <td class="p-2.5 text-right font-mono font-bold text-violet-400">${formatLKR(item.wholesalePrice)}</td>
            <td class="p-2.5 text-right font-mono text-amber-400">${formatLKR(item.costPrice)}</td>
            <td class="p-2.5 text-center">
              <button onclick="InventoryManager.removeStagedItem(${index})" class="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-lg transition" title="ඉවත් කරන්න (Remove)">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

    // 2. Mobile Phone Touch Cards
    if (mobileContainer) {
      mobileContainer.innerHTML = this._bulkStagedItems.map((item, index) => {
        const stockDiffText = item.addStock > 0 ? `+${item.addStock}` : (item.addStock < 0 ? `${item.addStock}` : '0');
        const stockDiffColor = item.addStock > 0 ? 'text-emerald-400' : (item.addStock < 0 ? 'text-rose-400' : 'text-slate-400');

        return `
          <div class="p-3 bg-slate-900 border border-slate-800/80 rounded-2xl flex flex-col gap-2 shadow-sm">
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0 flex-1">
                <div class="font-bold text-white text-xs sm:text-sm leading-snug">${index + 1}. ${item.name}</div>
                <div class="text-[10px] text-sky-400 font-mono mt-0.5">${item.sku} &bull; ${item.unit}</div>
              </div>
              <button onclick="InventoryManager.removeStagedItem(${index})" class="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-950/60 rounded-xl transition shrink-0" title="ඉවත් කරන්න">
                🗑️
              </button>
            </div>
            <div class="grid grid-cols-3 gap-1.5 text-center text-xs">
              <div class="p-1.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <div class="text-[9px] text-slate-400 font-medium">තොගය (Stock)</div>
                <div class="font-mono text-[11px] font-bold text-slate-200 mt-0.5">${item.oldStock} <span class="${stockDiffColor}">(${stockDiffText})</span> &rarr; <strong class="text-sky-300 font-extrabold">${item.newStock}</strong></div>
              </div>
              <div class="p-1.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <div class="text-[9px] text-slate-400 font-medium">Retail මිල</div>
                <div class="font-mono text-[11px] font-bold text-emerald-400 mt-0.5">${formatLKR(item.retailPrice)}</div>
              </div>
              <div class="p-1.5 bg-slate-950/80 rounded-xl border border-slate-800">
                <div class="text-[9px] text-slate-400 font-medium">Cost මිල</div>
                <div class="font-mono text-[11px] font-bold text-amber-400 mt-0.5">${formatLKR(item.costPrice)}</div>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  },

  async saveBulkStockUpdate() {
    if (this._bulkStagedItems.length === 0) {
      alert('කරුණාකර පළමුව භාණ්ඩ ලැයිස්තුවට එක් කරන්න (Please add items to batch first).');
      return;
    }

    const items = [...this._bulkStagedItems];
    let updatedCount = 0;
    const staffName = (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.name : 'Staff';

    for (const item of items) {
      try {
        const product = await db.products.get(item.productId);
        if (!product) continue;

        const updates = {
          currentStock: item.newStock,
          sellingPrice: item.retailPrice,
          wholesalePrice: item.wholesalePrice,
          costPrice: item.costPrice
        };

        await db.products.update(item.productId, updates);

        if (item.addStock !== 0) {
          try {
            await db.stockAdjustments.add({
              productId: item.productId,
              productName: item.name,
              type: item.addStock > 0 ? 'in' : 'out',
              quantity: Math.abs(item.addStock),
              reason: `Bulk Batch Update (${item.addStock > 0 ? '+' : ''}${item.addStock} ${item.unit})`,
              adjustedBy: staffName,
              timestamp: new Date().toISOString()
            });
          } catch (e) {}
        }

        updatedCount++;
      } catch (err) {
        console.error('Error saving item:', item, err);
      }
    }

    this._bulkStagedItems = [];
    this._resetBulkProductForm();
    document.getElementById('bulkStockModal')?.classList.add('hidden');

    await this.renderInventoryTable();
    await this.renderValuationCards();
    if (window.SoundManager) SoundManager.playSuccessChime();

    alert(`✅ භාණ්ඩ ${updatedCount} ක තොග සහ මිල ගණන් සාර්ථකව Save විය! (${updatedCount} products updated successfully)`);
  },
};

window.InventoryManager = InventoryManager;
