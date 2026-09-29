/**
 * Goods Received Note (GRN) & Supplier Purchasing Module
 */

const GRNManager = {
  activeGrnItems: [],

  async init() {
    await this.renderPurchasesTable();
    await this.populateSupplierOptions();
    await this.populateProductOptions();
  },

  async populateSupplierOptions() {
    const suppliers = await db.suppliers.toArray();
    const select = document.getElementById('grnSupplierSelect');
    if (select) {
      select.innerHTML = `<option value="">-- Choose Supplier --</option>` +
        suppliers.map(s => `<option value="${s.id}">${s.name} (Bal: ${formatLKR(s.outstandingBalance || 0)})</option>`).join('');
    }
  },

  async populateProductOptions() {
    const products = await db.products.toArray();
    const select = document.getElementById('grnProductSelect');
    if (select) {
      select.innerHTML = `<option value="">-- Choose Product to Add --</option>` +
        products.map(p => `<option value="${p.id}" data-cost="${p.costPrice}" data-unit="${p.unit}">${p.name} (${p.sku})</option>`).join('');
    }
  },

  openNewGRNModal() {
    this.activeGrnItems = [];
    document.getElementById('grnForm').reset();
    document.getElementById('grnDateInput').value = new Date().toISOString().slice(0, 10);
    this.renderGrnItems();
    document.getElementById('grnModal').classList.remove('hidden');
  },

  onProductSelectChange() {
    const select = document.getElementById('grnProductSelect');
    const selectedOpt = select.options[select.selectedIndex];
    if (selectedOpt && selectedOpt.value) {
      const cost = selectedOpt.getAttribute('data-cost') || 0;
      document.getElementById('grnCostPriceInput').value = cost;
      document.getElementById('grnQtyInput').value = 10;
    }
  },

  addItemToGRN() {
    const select = document.getElementById('grnProductSelect');
    const prodId = parseInt(select.value);
    if (!prodId) {
      alert('Please choose a product to add to the GRN.');
      return;
    }

    const selectedOpt = select.options[select.selectedIndex];
    const prodName = selectedOpt.text;
    const unit = selectedOpt.getAttribute('data-unit') || 'pcs';
    const cost = parseFloat(document.getElementById('grnCostPriceInput').value) || 0;
    const qty = parseFloat(document.getElementById('grnQtyInput').value) || 1;
    const batch = document.getElementById('grnBatchInput').value.trim() || `BCH-${Date.now().toString().slice(-4)}`;
    const expiry = document.getElementById('grnExpiryInput').value || null;

    this.activeGrnItems.push({
      productId: prodId,
      name: prodName,
      unit: unit,
      costPrice: cost,
      qty: qty,
      batchNumber: batch,
      expiryDate: expiry,
      total: cost * qty
    });

    this.renderGrnItems();
    // Reset item inputs
    select.value = '';
    document.getElementById('grnCostPriceInput').value = '';
    document.getElementById('grnQtyInput').value = '';
  },

  removeGrnItem(index) {
    this.activeGrnItems.splice(index, 1);
    this.renderGrnItems();
  },

  renderGrnItems() {
    const tbody = document.getElementById('grnItemsTableBody');
    const totalEl = document.getElementById('grnTotalCostDisplay');
    if (!tbody) return;

    let grandTotal = 0;
    tbody.innerHTML = this.activeGrnItems.map((item, idx) => {
      grandTotal += item.total;
      return `
        <tr class="border-b border-slate-800 text-xs">
          <td class="p-2 font-semibold text-slate-100">${item.name}</td>
          <td class="p-2 font-mono text-center">${item.batchNumber}</td>
          <td class="p-2 font-mono text-center">${item.expiryDate || '-'}</td>
          <td class="p-2 font-mono text-right">${formatLKR(item.costPrice)}</td>
          <td class="p-2 font-mono text-center font-bold text-sky-400">${item.qty} ${item.unit}</td>
          <td class="p-2 font-mono text-right font-bold text-slate-100">${formatLKR(item.total)}</td>
          <td class="p-2 text-center">
            <button onclick="GRNManager.removeGrnItem(${idx})" class="text-rose-400 hover:text-rose-300">&times;</button>
          </td>
        </tr>
      `;
    }).join('');

    if (totalEl) totalEl.textContent = formatLKR(grandTotal);
  },

  async saveGRN(event) {
    event.preventDefault();
    if (this.activeGrnItems.length === 0) {
      alert('Please add at least one product item to the GRN.');
      return;
    }

    const supplierId = parseInt(document.getElementById('grnSupplierSelect').value) || null;
    const invoiceNo = document.getElementById('grnInvoiceNoInput').value.trim() || await generateGRNNo();
    const date = document.getElementById('grnDateInput').value;
    const paymentStatus = document.getElementById('grnPaymentStatus').value; // 'paid', 'credit', 'partial'
    const paidAmount = parseFloat(document.getElementById('grnPaidAmount').value) || 0;

    let grandTotal = 0;
    this.activeGrnItems.forEach(i => grandTotal += i.total);

    let supplierName = 'Direct Purchase';
    if (supplierId) {
      const supplier = await db.suppliers.get(supplierId);
      if (supplier) {
        supplierName = supplier.name;
        // Update supplier balance if credit
        const unpaid = Math.max(0, grandTotal - paidAmount);
        if (unpaid > 0) {
          await db.suppliers.update(supplierId, {
            outstandingBalance: (supplier.outstandingBalance || 0) + unpaid
          });
        }
      }
    }

    // 1. Record Purchase
    await db.purchases.add({
      invoiceNo,
      supplierId,
      supplierName,
      date,
      grandTotal,
      paymentStatus,
      paidAmount,
      items: this.activeGrnItems,
      timestamp: new Date().toISOString()
    });

    // 2. Update stock & cost price in products store
    for (const item of this.activeGrnItems) {
      const prod = await db.products.get(item.productId);
      if (prod) {
        await db.products.update(item.productId, {
          currentStock: prod.currentStock + item.qty,
          costPrice: item.costPrice,
          batchNumber: item.batchNumber || prod.batchNumber,
          expiryDate: item.expiryDate || prod.expiryDate
        });
      }
    }

    document.getElementById('grnModal').classList.add('hidden');
    await this.renderPurchasesTable();
    await InventoryManager.renderInventoryTable();
    await InventoryManager.renderValuationCards();
    await POSManager.renderProductGrid();
    SoundManager.playSuccessChime();
    alert('Goods Received Note (GRN) processed and stock successfully updated!');
  },

  async renderPurchasesTable() {
    const tbody = document.getElementById('purchasesTableBody');
    if (!tbody) return;

    const purchases = await db.purchases.reverse().toArray();
    if (purchases.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No GRN records logged yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = purchases.map(p => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono font-bold text-sky-400">${p.invoiceNo}</td>
        <td class="p-3 font-semibold text-slate-100">${p.supplierName}</td>
        <td class="p-3 font-mono text-slate-400">${p.date}</td>
        <td class="p-3 text-center font-mono">${(p.items || []).length} items</td>
        <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR(p.grandTotal)}</td>
        <td class="p-3 text-center">
          <span class="px-2 py-0.5 rounded-full font-bold text-[10px] ${
            p.paymentStatus === 'paid' ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' :
            p.paymentStatus === 'partial' ? 'bg-amber-950 text-amber-300 border border-amber-800' :
            'bg-rose-950 text-rose-300 border border-rose-800'
          }">
            ${(p.paymentStatus || 'paid').toUpperCase()}
          </span>
        </td>
      </tr>
    `).join('');
  }
};

window.GRNManager = GRNManager;
