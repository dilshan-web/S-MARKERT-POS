/**
 * Expense Management & Categorized Cost Logging
 * Supports customizable expense categories (Daily/Weekly/Monthly Salaries, Rent, Utilities, etc.)
 */

const ExpenseManager = {
  currentCategoryFilter: 'all',

  defaultCategories: [
    'Staff Salary - Daily (දෛනික වැටුප්)',
    'Staff Salary - Weekly (සතිපතා වැටුප්)',
    'Staff Salary - Monthly (මාසික වැටුප්)',
    'Electricity (විදුලි බිල්)',
    'Water (ජල බිල්)',
    'Shop Rent (කුලී)',
    'Transport & Fuel (ප්‍රවාහන සහ ඉන්ධන)',
    'Maintenance & Repairs (නඩත්තු සහ අලුත්වැඩියා)',
    'Tea & Staff Meals (තේ සහ ආහාර)',
    'Packaging & Bags (ඇසුරුම් / බෑග්)',
    'Other Expenses (වෙනත් වියදම්)'
  ],

  async init() {
    await this.populateCategoryDropdown();
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
  },

  async getCategories() {
    try {
      const stored = localStorage.getItem('pos_custom_expense_categories');
      let cats = stored ? JSON.parse(stored) : [];
      if (!Array.isArray(cats) || cats.length === 0) {
        cats = [...this.defaultCategories];
        localStorage.setItem('pos_custom_expense_categories', JSON.stringify(cats));
      }

      // Filter out any farmer categories
      cats = cats.filter(c => !c.toLowerCase().includes('farmer'));

      // Also gather any categories found in existing non-farmer expenses
      const allExpenses = await db.expenses.toArray();
      allExpenses.forEach(e => {
        if (e.category && !e.category.toLowerCase().includes('farmer') && !cats.includes(e.category)) {
          cats.push(e.category);
        }
      });

      return cats;
    } catch (e) {
      return [...this.defaultCategories];
    }
  },

  async saveCategory(newCat) {
    const trimmed = (newCat || '').trim();
    if (!trimmed) return null;

    const cats = await this.getCategories();
    if (!cats.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
      cats.push(trimmed);
      localStorage.setItem('pos_custom_expense_categories', JSON.stringify(cats));
    }
    return trimmed;
  },

  async populateCategoryDropdown(selectedVal = '') {
    const select = document.getElementById('expenseCategoryInput');
    if (!select) return;

    const categories = await this.getCategories();
    select.innerHTML = categories.map(c => `<option value="${c}">${c}</option>`).join('') +
      `<option value="__new__" class="font-bold text-sky-400">➕ + නව වර්ගයක් එක් කරන්න (Add New Category)...</option>`;

    if (selectedVal && categories.includes(selectedVal)) {
      select.value = selectedVal;
    } else if (categories.length > 0) {
      select.value = categories[0];
    }
  },

  async onCategorySelectChange(selectEl) {
    if (selectEl && selectEl.value === '__new__') {
      await this.promptAddNewCategory();
    }
  },

  async promptAddNewCategory() {
    const catName = prompt('නව වියදම් වර්ගයේ නම ඇතුළත් කරන්න (Enter New Expense Category):\nඋදා: Salary - Kasun, Daily Wages, Cleaning, Generator Fuel...');
    if (catName && catName.trim()) {
      const saved = await this.saveCategory(catName.trim());
      await this.populateCategoryDropdown(saved);
      await this.renderCategoryFilterBar();
      if (window.SoundManager) SoundManager.playSuccessChime();
    } else {
      // Revert select away from __new__
      const select = document.getElementById('expenseCategoryInput');
      if (select && select.value === '__new__') {
        const cats = await this.getCategories();
        select.value = cats[0] || '';
      }
    }
  },

  async renderCategoryFilterBar() {
    const bar = document.getElementById('expenseCategoryFilterBar');
    if (!bar) return;

    const categories = await this.getCategories();
    const active = this.currentCategoryFilter;

    let html = `
      <button onclick="ExpenseManager.setCategoryFilter('all')" class="exp-filter-btn px-3 py-1.5 ${active === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-xl text-xs font-bold transition shrink-0" data-cat="all">
        All (සියල්ල)
      </button>
    `;

    categories.forEach(cat => {
      const isSelected = active === cat;
      html += `
        <button onclick="ExpenseManager.setCategoryFilter('${cat.replace(/'/g, "\\'")}')" class="exp-filter-btn px-3 py-1.5 ${isSelected ? 'bg-sky-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'} rounded-xl text-xs font-bold transition shrink-0 whitespace-nowrap" data-cat="${cat}">
          ${cat}
        </button>
      `;
    });

    bar.innerHTML = html;
  },

  async setCategoryFilter(category) {
    this.currentCategoryFilter = category;
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
  },

  async renderExpenseSummary() {
    let expenses = await db.expenses.toArray();
    // Strictly isolate: Farmers liabilities are never in operational expenses
    expenses = expenses.filter(e => !e.category || !e.category.toLowerCase().includes('farmer'));

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
    // Strictly isolate: Farmers liabilities are never in operational expenses
    expenses = expenses.filter(e => !e.category || !e.category.toLowerCase().includes('farmer'));

    if (this.currentCategoryFilter !== 'all') {
      expenses = expenses.filter(e => e.category === this.currentCategoryFilter);
    }

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-slate-400">වියදම් සටහන් කර නැත (No expenses recorded yet).</td></tr>`;
      return;
    }

    tbody.innerHTML = expenses.map(e => `
      <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs transition">
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

  async openAddExpenseModal() {
    const form = document.getElementById('expenseForm');
    if (form) form.reset();
    const dateInput = document.getElementById('expenseDateInput');
    if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);
    await this.populateCategoryDropdown();
    document.getElementById('expenseModal')?.classList.remove('hidden');
  },

  async saveExpense(event) {
    if (event) event.preventDefault();
    const title = document.getElementById('expenseTitleInput')?.value.trim();
    let category = document.getElementById('expenseCategoryInput')?.value;
    const amount = parseFloat(document.getElementById('expenseAmountInput')?.value) || 0;
    const date = document.getElementById('expenseDateInput')?.value || new Date().toISOString().slice(0, 10);
    const notes = document.getElementById('expenseNotesInput')?.value.trim() || '';

    if (!amount || amount <= 0) {
      alert('කරුණාකර වලංගු මුදලක් ඇතුළත් කරන්න (Please enter valid amount).');
      return;
    }

    if (!category || category === '__new__') {
      category = 'Other Expenses (වෙනත් වියදම්)';
    }

    await db.expenses.add({
      title,
      category,
      amount,
      date,
      notes,
      user: (window.AuthManager && AuthManager.currentUser) ? AuthManager.currentUser.username : 'admin',
      timestamp: new Date().toISOString()
    });

    document.getElementById('expenseModal')?.classList.add('hidden');
    await this.renderCategoryFilterBar();
    await this.renderExpensesTable();
    await this.renderExpenseSummary();
    if (window.SoundManager) SoundManager.playSuccessChime();
  },

  async deleteExpense(id) {
    if (confirm('මෙම වියදම් සටහන මැකීමට ඔබට සහතිකද? (Delete this expense entry?)')) {
      await db.expenses.delete(id);
      await this.renderExpensesTable();
      await this.renderExpenseSummary();
    }
  }
};

window.ExpenseManager = ExpenseManager;
