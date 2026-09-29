/**
 * Expense Management & Categorized Cost Logging
 */

const ExpenseManager = {
  currentCategoryFilter: 'all',

  async init() {
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
  },

  async renderExpenseSummary() {
    const expenses = await db.expenses.toArray();
    let total = 0;
    const catMap = {};

    expenses.forEach(e => {
      const amt = Number(e.amount) || 0;
      total += amt;
      catMap[e.category] = (catMap[e.category] || 0) + amt;
    });

    const totalEl = document.getElementById('expenseTotalDisplay');
    if (totalEl) totalEl.textContent = formatLKR(total);
  },

  async renderExpensesTable() {
    const tbody = document.getElementById('expensesTableBody');
    if (!tbody) return;

    let expenses = await db.expenses.reverse().toArray();

    if (this.currentCategoryFilter !== 'all') {
      expenses = expenses.filter(e => e.category === this.currentCategoryFilter);
    }

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">No expenses recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
        <td class="p-3 font-mono text-slate-400">${e.date}</td>
        <td class="p-3 font-semibold text-slate-100">${e.title}</td>
        <td class="p-3">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-sky-300 border border-slate-700">
            ${e.category}
          </span>
        </td>
        <td class="p-3 font-mono font-bold text-rose-400 text-right">${formatLKR(e.amount)}</td>
        <td class="p-3 text-slate-400 text-[11px]">${e.notes || '-'}</td>
        <td class="p-3 text-right">
          <button onclick="ExpenseManager.deleteExpense(${e.id})" class="p-1.5 text-rose-400 hover:bg-rose-950 rounded transition" title="Delete">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
          </button>
        </td>
      </tr>
    `).join('');
  },

  openAddExpenseModal() {
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseDateInput').value = new Date().toISOString().slice(0, 10);
    document.getElementById('expenseModal').classList.remove('hidden');
  },

  async saveExpense(event) {
    event.preventDefault();
    const title = document.getElementById('expenseTitleInput').value.trim();
    const category = document.getElementById('expenseCategoryInput').value;
    const amount = parseFloat(document.getElementById('expenseAmountInput').value) || 0;
    const date = document.getElementById('expenseDateInput').value;
    const notes = document.getElementById('expenseNotesInput').value.trim();

    if (!amount || amount <= 0) {
      alert('Please enter a valid expense amount.');
      return;
    }

    await db.expenses.add({
      title,
      category,
      amount,
      date,
      notes,
      user: AuthManager.currentUser?.username || 'admin',
      timestamp: new Date().toISOString()
    });

    document.getElementById('expenseModal').classList.add('hidden');
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
    SoundManager.playSuccessChime();
  },

  async deleteExpense(id) {
    if (confirm('Delete this expense entry?')) {
      await db.expenses.delete(id);
      await this.renderExpensesTable();
      await this.renderExpenseSummary();
    }
  }
};

window.ExpenseManager = ExpenseManager;
