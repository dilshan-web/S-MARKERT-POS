/**
 * Supplier Directory & Balance Tracking
 */

const SupplierManager = {
  searchQuery: '',

  async init() {
    await this.renderSupplierTable();
  },

  async renderSupplierTable() {
    const tbody = document.getElementById('suppliersTableBody');
    if (!tbody) return;

    let suppliers = await db.suppliers.toArray();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase().trim();
      suppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.address && s.address.toLowerCase().includes(q))
      );
    }

    if (suppliers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No suppliers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = suppliers.map(s => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3">
          <div class="font-bold text-slate-100 text-sm">${s.name}</div>
          <div class="text-slate-400 text-[11px]">${s.email || 'No email'}</div>
        </td>
        <td class="p-3 font-mono text-slate-300">${s.phone}</td>
        <td class="p-3 text-slate-400">${s.address || '-'}</td>
        <td class="p-3 text-right font-mono font-bold ${(s.outstandingBalance || 0) > 0 ? 'text-rose-400' : 'text-emerald-400'}">
          ${formatLKR(s.outstandingBalance || 0)}
        </td>
        <td class="p-3 text-right space-x-1 whitespace-nowrap">
          ${(s.outstandingBalance || 0) > 0 ? `
            <button onclick="SupplierManager.openSettleBalanceModal(${s.id})" class="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold transition" title="Pay Supplier">
              Pay Supplier
            </button>
          ` : ''}
          <button onclick="SupplierManager.openEditSupplierModal(${s.id})" class="p-1.5 bg-slate-800 hover:bg-sky-600 text-slate-300 hover:text-white rounded-lg transition" title="Edit">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
          </button>
          <button onclick="SupplierManager.deleteSupplier(${s.id})" class="p-1.5 bg-slate-800 hover:bg-rose-600 text-slate-300 hover:text-white rounded-lg transition" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  openAddSupplierModal() {
    document.getElementById('supplierModalTitle').textContent = 'Add Supplier';
    document.getElementById('supplierForm').reset();
    document.getElementById('suppIdInput').value = '';
    document.getElementById('supplierModal').classList.remove('hidden');
  },

  async openEditSupplierModal(id) {
    const supp = await db.suppliers.get(id);
    if (!supp) return;

    document.getElementById('supplierModalTitle').textContent = 'Edit Supplier';
    document.getElementById('suppIdInput').value = supp.id;
    document.getElementById('suppNameInput').value = supp.name;
    document.getElementById('suppPhoneInput').value = supp.phone;
    document.getElementById('suppEmailInput').value = supp.email || '';
    document.getElementById('suppAddressInput').value = supp.address || '';
    document.getElementById('suppBalanceInput').value = supp.outstandingBalance || 0;

    document.getElementById('supplierModal').classList.remove('hidden');
  },

  async saveSupplier(event) {
    event.preventDefault();
    const id = document.getElementById('suppIdInput').value;
    const name = document.getElementById('suppNameInput').value.trim();
    const phone = document.getElementById('suppPhoneInput').value.trim();
    const email = document.getElementById('suppEmailInput').value.trim();
    const address = document.getElementById('suppAddressInput').value.trim();
    const balance = parseFloat(document.getElementById('suppBalanceInput').value) || 0;

    const suppData = { name, phone, email, address, outstandingBalance: balance };

    if (id) {
      await db.suppliers.update(parseInt(id), suppData);
    } else {
      await db.suppliers.add(suppData);
    }

    document.getElementById('supplierModal').classList.add('hidden');
    await this.renderSupplierTable();
    await InventoryManager.populateSupplierDropdown();
    await GRNManager.populateSupplierOptions();
    SoundManager.playSuccessChime();
  },

  async openSettleBalanceModal(id) {
    const supp = await db.suppliers.get(id);
    if (!supp) return;

    const amountStr = prompt(`Pay Supplier: ${supp.name}\nCurrent Balance Payable: ${formatLKR(supp.outstandingBalance)}\nEnter payment amount:`, supp.outstandingBalance);
    if (amountStr !== null) {
      const amount = parseFloat(amountStr);
      if (!isNaN(amount) && amount > 0) {
        const newBal = Math.max(0, (supp.outstandingBalance || 0) - amount);
        await db.suppliers.update(supp.id, { outstandingBalance: newBal });
        await this.renderSupplierTable();
        SoundManager.playSuccessChime();
        alert(`Payment of ${formatLKR(amount)} paid to ${supp.name}. Remaining Payable: ${formatLKR(newBal)}`);
      }
    }
  },

  async deleteSupplier(id) {
    const supp = await db.suppliers.get(id);
    const suppName = supp ? supp.name : 'Supplier';

    AuthManager.requireAdminAuth({
      actionName: 'Delete Supplier Record',
      actionDesc: `Permanently delete supplier profile "${suppName}"`,
      requiredPerm: 'allowDelete',
      onAuthorized: async () => {
        if (confirm(`Delete supplier record "${suppName}"?`)) {
          await db.suppliers.delete(id);
          await this.renderSupplierTable();
          await InventoryManager.populateSupplierDropdown();
          await GRNManager.populateSupplierOptions();
          SoundManager.playSuccessChime();
        }
      }
    });
  }
};

window.SupplierManager = SupplierManager;
