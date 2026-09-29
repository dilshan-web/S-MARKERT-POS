/**
 * Comprehensive Supermarket Reports, Financial Analytics, Visual Charts & A4 PDF Printing Engine
 */

const ReportsManager = {
  currentReportType: 'daily_sales',
  currentRange: 'today', // 'today', 'yesterday', '7days', '30days', 'month', 'all', 'custom'
  startDate: null,
  endDate: null,
  charts: {},

  async init() {
    this.setupDateFilters();
    await this.generateReports();
  },

  setupDateFilters() {
    const fromInput = document.getElementById('reportDateFrom');
    const toInput = document.getElementById('reportDateTo');
    const today = new Date().toISOString().slice(0, 10);

    if (fromInput && !fromInput.value) fromInput.value = today;
    if (toInput && !toInput.value) toInput.value = today;
  },

  setReportType(type) {
    this.currentReportType = type;
    document.querySelectorAll('.report-type-btn').forEach(btn => {
      if (btn.getAttribute('data-type') === type) {
        btn.classList.add('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white', 'shadow-md');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });
    this.generateReports();
  },

  setRange(range) {
    this.currentRange = range;
    document.querySelectorAll('.report-range-btn').forEach(btn => {
      if (btn.getAttribute('data-range') === range) {
        btn.classList.add('bg-sky-600', 'text-white');
        btn.classList.remove('bg-slate-800', 'text-slate-300');
      } else {
        btn.classList.remove('bg-sky-600', 'text-white');
        btn.classList.add('bg-slate-800', 'text-slate-300');
      }
    });

    const now = new Date();
    const fromInput = document.getElementById('reportDateFrom');
    const toInput = document.getElementById('reportDateTo');

    if (range === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      if (fromInput) fromInput.value = todayStr;
      if (toInput) toInput.value = todayStr;
    } else if (range === 'yesterday') {
      const yest = new Date(now.getTime() - 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = yest;
      if (toInput) toInput.value = yest;
    } else if (range === '7days') {
      const past7 = new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = past7;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === '30days') {
      const past30 = new Date(now.getTime() - 30 * 86400000).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = past30;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === 'month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
      if (fromInput) fromInput.value = firstDay;
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    } else if (range === 'all') {
      if (fromInput) fromInput.value = '2020-01-01';
      if (toInput) toInput.value = now.toISOString().slice(0, 10);
    }

    this.generateReports();
  },

  getDateBounds() {
    const fromVal = document.getElementById('reportDateFrom')?.value;
    const toVal = document.getElementById('reportDateTo')?.value;

    let start = fromVal ? new Date(`${fromVal}T00:00:00`) : new Date(0);
    let end = toVal ? new Date(`${toVal}T23:59:59`) : new Date();

    return { start, end, fromStr: fromVal || 'Beginning', toStr: toVal || 'Today' };
  },

  async generateReports() {
    const { start, end } = this.getDateBounds();
    const allSales = await db.sales.toArray();
    const allSaleItems = await db.saleItems.toArray();
    const allExpenses = await db.expenses.toArray();
    const allProducts = await db.products.toArray();
    const allCustomers = await db.customers.toArray();
    const allSuppliers = await db.suppliers.toArray();
    const allPurchases = await db.purchases.toArray();
    const allReturns = await db.returns.toArray();

    // Filter by Date
    const filteredSales = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });

    const saleIds = new Set(filteredSales.map(s => s.id));
    const filteredItems = allSaleItems.filter(i => saleIds.has(i.saleId));
    const filteredExpenses = allExpenses.filter(e => {
      const d = new Date(`${e.date}T00:00:00`);
      return d >= start && d <= end;
    });
    const filteredPurchases = allPurchases.filter(p => {
      const d = new Date(`${p.date}T00:00:00`);
      return d >= start && d <= end;
    });
    const filteredReturns = allReturns.filter(r => {
      const d = new Date(`${r.date}T00:00:00`);
      return d >= start && d <= end;
    });

    // KPI Calculations
    const totalRevenue = filteredSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    const totalTransactions = filteredSales.length;
    const avgBasket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    let totalCOGS = 0;
    filteredItems.forEach(i => {
      totalCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });

    const grossProfit = totalRevenue - totalCOGS;
    const grossMarginPct = totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(1) : 0;

    const totalExpenses = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const netProfit = grossProfit - totalExpenses;
    const netMarginPct = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : 0;

    // Update KPI UI
    const elRev = document.getElementById('repTotalRevenue');
    const elTxns = document.getElementById('repTotalTransactions');
    const elAvg = document.getElementById('repAvgBasket');
    const elCOGS = document.getElementById('repTotalCOGS');
    const elGrossProfit = document.getElementById('repGrossProfit');
    const elExpenses = document.getElementById('repTotalExpenses');
    const elNetProfit = document.getElementById('repNetProfit');

    if (elRev) elRev.textContent = formatLKR(totalRevenue);
    if (elTxns) elTxns.textContent = totalTransactions.toLocaleString();
    if (elAvg) elAvg.textContent = formatLKR(avgBasket);
    if (elCOGS) elCOGS.textContent = formatLKR(totalCOGS);
    if (elGrossProfit) elGrossProfit.textContent = `${formatLKR(grossProfit)} (${grossMarginPct}%)`;
    if (elExpenses) elExpenses.textContent = formatLKR(totalExpenses);
    if (elNetProfit) {
      elNetProfit.textContent = `${formatLKR(netProfit)} (${netMarginPct}%)`;
      elNetProfit.className = `text-2xl sm:text-3xl font-black font-mono ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    }

    // Render Active Report Table View
    this.renderSelectedReportTable({
      sales: filteredSales,
      items: filteredItems,
      expenses: filteredExpenses,
      products: allProducts,
      customers: allCustomers,
      suppliers: allSuppliers,
      purchases: filteredPurchases,
      returns: filteredReturns,
      totalRevenue,
      totalCOGS,
      grossProfit,
      totalExpenses,
      netProfit
    });

    // Render Visual Charts
    this.renderCharts(filteredSales, filteredItems);
  },

  renderSelectedReportTable(data) {
    const container = document.getElementById('reportDetailTableContainer');
    const titleEl = document.getElementById('activeReportTitle');
    if (!container) return;

    let html = '';
    const type = this.currentReportType;

    if (type === 'daily_sales') {
      if (titleEl) titleEl.textContent = 'Sales Invoices & Transactions Summary';
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Invoice No</th>
              <th class="p-3">Date / Time</th>
              <th class="p-3">Cashier</th>
              <th class="p-3">Customer</th>
              <th class="p-3">Payment</th>
              <th class="p-3 text-right">Discounts</th>
              <th class="p-3 text-right">Total (LKR)</th>
            </tr>
          </thead>
          <tbody>
            ${data.sales.length === 0 ? `<tr><td colspan="7" class="text-center py-6 text-slate-500">No sales transactions in this period.</td></tr>` :
              data.sales.map(s => `
                <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                  <td class="p-3 font-mono font-bold text-sky-400">${s.invoiceNo}</td>
                  <td class="p-3 font-mono text-slate-400 text-[11px]">${new Date(s.timestamp).toLocaleString()}</td>
                  <td class="p-3 text-slate-200">${s.cashierName}</td>
                  <td class="p-3 text-slate-300">${s.customerName || 'Walk-in'}</td>
                  <td class="p-3 uppercase font-bold text-[10px] text-emerald-400">${s.paymentMethod}</td>
                  <td class="p-3 text-right font-mono text-amber-300">-${formatLKR(s.totalDiscount || 0)}</td>
                  <td class="p-3 text-right font-mono font-black text-slate-100">${formatLKR(s.grandTotal)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'company_sales') {
      if (titleEl) titleEl.textContent = 'Company / Brand Daily Sales & Performance';
      
      const prodLookup = {};
      data.products.forEach(p => {
        prodLookup[p.id] = p;
      });

      const suppLookup = {};
      data.suppliers.forEach(s => {
        suppLookup[s.id] = s.name;
      });

      const companyMap = {};
      data.items.forEach(i => {
        const prod = prodLookup[i.productId];
        let companyName = prod?.brand || (prod?.supplierId && suppLookup[prod.supplierId]) || 'General / Other Brands';
        if (!companyMap[companyName]) {
          companyMap[companyName] = { name: companyName, qty: 0, revenue: 0, cost: 0, distinctItems: new Set() };
        }
        companyMap[companyName].qty += Number(i.qty) || 0;
        companyMap[companyName].revenue += Number(i.total) || 0;
        companyMap[companyName].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
        companyMap[companyName].distinctItems.add(i.productName);
      });

      const sorted = Object.values(companyMap).sort((a, b) => b.revenue - a.revenue);
      const totalCompanyRev = sorted.reduce((acc, c) => acc + c.revenue, 0);

      html = `
        <div class="p-3 bg-slate-850 border-b border-slate-800 flex flex-wrap justify-between items-center text-xs font-mono px-4 gap-2">
          <div>Total Companies / Brands Sold: <strong class="text-sky-400">${sorted.length}</strong></div>
          <div>Total Brand Revenue: <strong class="text-emerald-400">${formatLKR(totalCompanyRev)}</strong></div>
          <div class="text-[11px] text-slate-400 font-sans">📅 Defaults to Today, automatically refreshes daily</div>
        </div>
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Company / Brand Name</th>
              <th class="p-3 text-center">Product Variety</th>
              <th class="p-3 text-center">Total Qty Sold</th>
              <th class="p-3 text-right">Sales Revenue</th>
              <th class="p-3 text-right">COGS Cost</th>
              <th class="p-3 text-right">Gross Profit</th>
              <th class="p-3 text-right">Contribution %</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length === 0 ? `<tr><td colspan="7" class="text-center py-6 text-slate-500">No company sales recorded in this period.</td></tr>` :
              sorted.map(c => {
                const profit = c.revenue - c.cost;
                const contribPct = totalCompanyRev > 0 ? ((c.revenue / totalCompanyRev) * 100).toFixed(1) : 0;
                return `
                  <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                    <td class="p-3">
                      <div class="font-extrabold text-slate-100 text-sm flex items-center gap-2">
                        <span class="p-1 rounded bg-sky-950 text-sky-400 border border-sky-800 text-[10px]">🏢</span>
                        <span>${c.name}</span>
                      </div>
                    </td>
                    <td class="p-3 text-center font-mono text-slate-400">${c.distinctItems.size} items</td>
                    <td class="p-3 text-center font-mono font-bold text-sky-300">${c.qty}</td>
                    <td class="p-3 text-right font-mono font-black text-slate-100 text-sm">${formatLKR(c.revenue)}</td>
                    <td class="p-3 text-right font-mono text-slate-400">${formatLKR(c.cost)}</td>
                    <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(profit)}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-300">${contribPct}%</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'product_sales') {
      if (titleEl) titleEl.textContent = 'Product Sales & Best Sellers Analysis';
      const prodMap = {};
      data.items.forEach(i => {
        if (!prodMap[i.productId]) {
          prodMap[i.productId] = { name: i.productName, sku: i.sku, qty: 0, revenue: 0, cost: 0 };
        }
        prodMap[i.productId].qty += Number(i.qty) || 0;
        prodMap[i.productId].revenue += Number(i.total) || 0;
        prodMap[i.productId].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
      });

      const sorted = Object.values(prodMap).sort((a, b) => b.revenue - a.revenue);
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Product Name / SKU</th>
              <th class="p-3 text-center">Qty Sold</th>
              <th class="p-3 text-right">Sales Revenue</th>
              <th class="p-3 text-right">COGS Cost</th>
              <th class="p-3 text-right">Gross Profit</th>
              <th class="p-3 text-right">Margin %</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.length === 0 ? `<tr><td colspan="6" class="text-center py-6 text-slate-500">No product sales in this period.</td></tr>` :
              sorted.map(p => {
                const profit = p.revenue - p.cost;
                const margin = p.revenue > 0 ? ((profit / p.revenue) * 100).toFixed(1) : 0;
                return `
                  <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                    <td class="p-3">
                      <div class="font-bold text-slate-100">${p.name}</div>
                      <div class="text-[11px] font-mono text-slate-400">SKU: ${p.sku}</div>
                    </td>
                    <td class="p-3 text-center font-mono font-bold text-sky-300">${p.qty}</td>
                    <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR(p.revenue)}</td>
                    <td class="p-3 text-right font-mono text-slate-400">${formatLKR(p.cost)}</td>
                    <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(profit)}</td>
                    <td class="p-3 text-right font-mono font-bold text-amber-300">${margin}%</td>
                  </tr>
                `;
              }).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'monthly_profit') {
      if (titleEl) titleEl.textContent = 'Profit & Loss (P&L) Financial Statement';
      html = `
        <div class="p-6 bg-slate-900 rounded-2xl space-y-4 max-w-2xl mx-auto font-mono text-xs">
          <div class="text-center pb-3 border-b border-slate-800">
            <h3 class="text-lg font-black text-slate-100">PROFIT & LOSS STATEMENT</h3>
            <p class="text-slate-400 text-xs">Period: ${this.getDateBounds().fromStr} to ${this.getDateBounds().toStr}</p>
          </div>
          <div class="space-y-2 text-sm">
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-300">1. Gross Sales Revenue</span><strong class="text-sky-400">${formatLKR(data.totalRevenue)}</strong></div>
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-400">2. Less: Cost of Goods Sold (COGS)</span><span class="text-rose-300">-${formatLKR(data.totalCOGS)}</span></div>
            <div class="flex justify-between py-2 bg-slate-850 px-3 rounded-xl"><span class="font-bold text-slate-200">3. GROSS PROFIT</span><strong class="text-emerald-400">${formatLKR(data.grossProfit)}</strong></div>
            <div class="flex justify-between py-1.5 border-b border-slate-800"><span class="text-slate-400">4. Less: Operating Expenses</span><span class="text-rose-400">-${formatLKR(data.totalExpenses)}</span></div>
            <div class="flex justify-between py-3 bg-slate-950 px-3 rounded-xl border border-slate-700 text-base font-black">
              <span class="text-slate-100">5. NET PROFIT (ලාභය)</span>
              <span class="${data.netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}">${formatLKR(data.netProfit)}</span>
            </div>
          </div>
        </div>
      `;
    } else if (type === 'stock_valuation') {
      if (titleEl) titleEl.textContent = 'Stock Valuation & Inventory Summary';
      let totalStockCost = 0;
      let totalStockRetail = 0;
      data.products.forEach(p => {
        const qty = Number(p.currentStock) || 0;
        totalStockCost += (Number(p.costPrice) || 0) * qty;
        totalStockRetail += (Number(p.sellingPrice) || 0) * qty;
      });

      html = `
        <div class="p-3 bg-slate-850 border-b border-slate-800 flex justify-between items-center text-xs font-mono px-4">
          <div>Total Items: <strong>${data.products.length}</strong></div>
          <div>Total Cost Valuation: <strong class="text-slate-200">${formatLKR(totalStockCost)}</strong></div>
          <div>Total Retail Valuation: <strong class="text-sky-400">${formatLKR(totalStockRetail)}</strong></div>
        </div>
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Product Name</th>
              <th class="p-3">SKU</th>
              <th class="p-3 text-center">Stock</th>
              <th class="p-3 text-right">Cost Price</th>
              <th class="p-3 text-right">Selling Price</th>
              <th class="p-3 text-right">Total Cost Value</th>
            </tr>
          </thead>
          <tbody>
            ${data.products.map(p => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-semibold text-slate-100">${p.name}</td>
                <td class="p-3 font-mono text-slate-400">${p.sku}</td>
                <td class="p-3 text-center font-mono font-bold text-sky-300">${p.currentStock} ${p.unit}</td>
                <td class="p-3 text-right font-mono text-slate-300">${formatLKR(p.costPrice)}</td>
                <td class="p-3 text-right font-mono font-bold text-emerald-400">${formatLKR(p.sellingPrice)}</td>
                <td class="p-3 text-right font-mono font-bold text-slate-100">${formatLKR((p.costPrice || 0) * (p.currentStock || 0))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else if (type === 'customer_credit') {
      if (titleEl) titleEl.textContent = 'Customer Credit Accounts & Balances Report';
      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Customer Name</th>
              <th class="p-3">Phone</th>
              <th class="p-3 text-right">Credit Balance</th>
              <th class="p-3 text-right">Lifetime Spent</th>
            </tr>
          </thead>
          <tbody>
            ${data.customers.map(c => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-bold text-slate-100">${c.name}</td>
                <td class="p-3 font-mono text-sky-400">${c.phone}</td>
                <td class="p-3 text-right font-mono font-bold ${(c.creditBalance || 0) > 0 ? 'text-rose-400 font-black' : 'text-emerald-400'}">${formatLKR(c.creditBalance || 0)}</td>
                <td class="p-3 text-right font-mono text-slate-200">${formatLKR(c.totalSpent || 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    } else {
      // Default: Cashier Sales & Expenses
      if (titleEl) titleEl.textContent = 'Cashier Performance & Shift Sales';
      const cashierMap = {};
      data.sales.forEach(s => {
        const name = s.cashierName || 'Unknown';
        if (!cashierMap[name]) cashierMap[name] = { count: 0, total: 0 };
        cashierMap[name].count += 1;
        cashierMap[name].total += (Number(s.grandTotal) || 0);
      });

      html = `
        <table class="w-full text-left">
          <thead class="bg-slate-850 text-slate-400 uppercase text-[11px] font-bold border-b border-slate-800">
            <tr>
              <th class="p-3">Cashier Name</th>
              <th class="p-3 text-center">Bills Issued</th>
              <th class="p-3 text-right">Total Revenue (LKR)</th>
              <th class="p-3 text-right">Average Bill</th>
            </tr>
          </thead>
          <tbody>
            ${Object.entries(cashierMap).map(([name, d]) => `
              <tr class="border-b border-slate-800/80 hover:bg-slate-800/40 text-xs">
                <td class="p-3 font-bold text-slate-100">${name}</td>
                <td class="p-3 text-center font-mono font-bold text-sky-300">${d.count}</td>
                <td class="p-3 text-right font-mono font-black text-emerald-400">${formatLKR(d.total)}</td>
                <td class="p-3 text-right font-mono text-slate-300">${formatLKR(d.count > 0 ? d.total / d.count : 0)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    container.innerHTML = html;
  },

  renderCharts(sales, saleItems) {
    if (!window.Chart) return;

    // 1. Sales Trend
    const salesCtx = document.getElementById('repSalesTrendChart');
    if (salesCtx) {
      if (this.charts.salesTrend) this.charts.salesTrend.destroy();
      const dayMap = {};
      const dayLabels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        dayLabels.push(d);
        dayMap[d] = 0;
      }
      sales.forEach(s => {
        const d = s.timestamp.slice(0, 10);
        if (dayMap[d] !== undefined) dayMap[d] += Number(s.grandTotal) || 0;
      });

      this.charts.salesTrend = new Chart(salesCtx, {
        type: 'line',
        data: {
          labels: dayLabels.map(d => d.slice(5)),
          datasets: [{
            label: 'Sales Revenue (LKR)',
            data: dayLabels.map(d => dayMap[d]),
            borderColor: '#0284c7',
            backgroundColor: 'rgba(2, 132, 199, 0.15)',
            borderWidth: 2.5,
            tension: 0.35,
            fill: true,
            pointBackgroundColor: '#38bdf8'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }

    // 2. Top 5 Products
    const topProdCtx = document.getElementById('repTopProductsChart');
    if (topProdCtx) {
      if (this.charts.topProducts) this.charts.topProducts.destroy();
      const prodMap = {};
      saleItems.forEach(i => {
        prodMap[i.productName] = (prodMap[i.productName] || 0) + (Number(i.qty) || 0);
      });
      const sorted = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

      this.charts.topProducts = new Chart(topProdCtx, {
        type: 'bar',
        data: {
          labels: sorted.map(s => s[0].slice(0, 16) + (s[0].length > 16 ? '..' : '')),
          datasets: [{
            label: 'Qty Sold',
            data: sorted.map(s => s[1]),
            backgroundColor: ['#38bdf8', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
            borderRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } }
          }
        }
      });
    }
  },

  // ==========================================
  // PROFESSIONAL A4 PDF & REPORT PRINT GENERATOR
  // ==========================================

  async printA4Report() {
    const { fromStr, toStr, start, end } = this.getDateBounds();
    const storeName = await getSetting('store_name', 'SUPERMARKET');
    const storeAddress = await getSetting('store_address', '');
    const storePhone = await getSetting('store_phone', '');
    const storeLogo = await getSetting('store_logo', null);

    const allSales = await db.sales.toArray();
    const allSaleItems = await db.saleItems.toArray();
    const allExpenses = await db.expenses.toArray();
    const allProducts = await db.products.toArray();

    const filteredSales = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });
    const saleIds = new Set(filteredSales.map(s => s.id));
    const filteredItems = allSaleItems.filter(i => saleIds.has(i.saleId));
    const filteredExpenses = allExpenses.filter(e => {
      const d = new Date(`${e.date}T00:00:00`);
      return d >= start && d <= end;
    });

    const totalSales = filteredSales.reduce((acc, s) => acc + (Number(s.grandTotal) || 0), 0);
    let totalCOGS = 0;
    filteredItems.forEach(i => totalCOGS += (Number(i.costPrice) || 0) * (Number(i.qty) || 0));
    const grossProfit = totalSales - totalCOGS;
    const totalExp = filteredExpenses.reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
    const netProfit = grossProfit - totalExp;

    const reportTypeNameMap = {
      daily_sales: 'DAILY SALES & TRANSACTION REPORT',
      company_sales: 'COMPANY / BRAND SALES PERFORMANCE REPORT',
      product_sales: 'PRODUCT SALES & FAST MOVING ITEMS REPORT',
      monthly_profit: 'PROFIT & LOSS (P&L) FINANCIAL STATEMENT',
      stock_valuation: 'STOCK VALUATION & INVENTORY AUDIT REPORT',
      customer_credit: 'CUSTOMER CREDIT ACCOUNTS & BALANCES REPORT',
      cashier_sales: 'CASHIER PERFORMANCE & SHIFT CLOSING REPORT'
    };

    // Prepare company map if needed for A4
    const prodLookup = {};
    allProducts.forEach(p => { prodLookup[p.id] = p; });
    const companyMap = {};
    filteredItems.forEach(i => {
      const prod = prodLookup[i.productId];
      let companyName = prod?.brand || 'General / Other Brands';
      if (!companyMap[companyName]) {
        companyMap[companyName] = { name: companyName, qty: 0, revenue: 0, cost: 0 };
      }
      companyMap[companyName].qty += Number(i.qty) || 0;
      companyMap[companyName].revenue += Number(i.total) || 0;
      companyMap[companyName].cost += (Number(i.costPrice) || 0) * (Number(i.qty) || 0);
    });
    const sortedCompanies = Object.values(companyMap).sort((a, b) => b.revenue - a.revenue);

    const htmlContent = `
      <div class="a4-report-sheet">
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 15px;">
          <div>
            ${storeLogo ? `<img src="${storeLogo}" style="max-height: 45px; margin-bottom: 5px;" />` : ''}
            <h1 style="font-size: 18px; font-weight: 800; margin: 0; text-transform: uppercase; color: #0f172a;">${storeName}</h1>
            <div style="font-size: 10px; color: #475569;">${storeAddress} &bull; Tel: ${storePhone}</div>
          </div>
          <div style="text-align: right; font-size: 10px; color: #475569;">
            <div style="font-size: 13px; font-weight: 800; color: #0284c7; text-transform: uppercase;">${reportTypeNameMap[this.currentReportType] || 'BUSINESS REPORT'}</div>
            <div>Period: <strong>${fromStr}</strong> to <strong>${toStr}</strong></div>
            <div>Generated: <strong>${new Date().toLocaleString()}</strong></div>
          </div>
        </div>

        <!-- Summary KPIs Banner -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 15px;">
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">TOTAL REVENUE</div>
            <div style="font-size: 13px; font-weight: 800; color: #0f172a; font-family: monospace;">${formatLKR(totalSales)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">GROSS PROFIT</div>
            <div style="font-size: 13px; font-weight: 800; color: #16a34a; font-family: monospace;">${formatLKR(grossProfit)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">TOTAL EXPENSES</div>
            <div style="font-size: 13px; font-weight: 800; color: #dc2626; font-family: monospace;">${formatLKR(totalExp)}</div>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px;">
            <div style="font-size: 9px; color: #64748b; font-weight: 600;">NET PROFIT</div>
            <div style="font-size: 13px; font-weight: 800; color: #0284c7; font-family: monospace;">${formatLKR(netProfit)}</div>
          </div>
        </div>

        <!-- Report Table -->
        <table class="a4-table">
          ${this.currentReportType === 'company_sales' ? `
            <thead>
              <tr>
                <th>Company / Brand</th>
                <th style="text-align: center;">Total Qty Sold</th>
                <th style="text-align: right;">Sales Revenue</th>
                <th style="text-align: right;">Cost Value</th>
                <th style="text-align: right;">Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              ${sortedCompanies.map(c => `
                <tr>
                  <td><strong>${c.name}</strong></td>
                  <td style="text-align: center;">${c.qty}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(c.revenue)}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(c.cost)}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold; color: #16a34a;">${formatLKR(c.revenue - c.cost)}</td>
                </tr>
              `).join('')}
            </tbody>
          ` : this.currentReportType === 'product_sales' ? `
            <thead>
              <tr>
                <th>Product Name / SKU</th>
                <th style="text-align: center;">Qty Sold</th>
                <th style="text-align: right;">Sales Revenue</th>
                <th style="text-align: right;">COGS Cost</th>
                <th style="text-align: right;">Gross Profit</th>
              </tr>
            </thead>
            <tbody>
              ${filteredItems.slice(0, 30).map(item => `
                <tr>
                  <td><strong>${item.productName}</strong> <span style="font-size: 9px; color: #64748b;">(${item.sku})</span></td>
                  <td style="text-align: center;">${item.qty}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR(item.total)}</td>
                  <td style="text-align: right; font-family: monospace;">${formatLKR((item.costPrice || 0) * (item.qty || 0))}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold; color: #16a34a;">${formatLKR(item.total - ((item.costPrice || 0) * (item.qty || 0)))}</td>
                </tr>
              `).join('')}
            </tbody>
          ` : `
            <thead>
              <tr>
                <th>Invoice No</th>
                <th>Date / Time</th>
                <th>Cashier</th>
                <th>Payment</th>
                <th style="text-align: right;">Discount</th>
                <th style="text-align: right;">Grand Total</th>
              </tr>
            </thead>
            <tbody>
              ${filteredSales.slice(0, 40).map(s => `
                <tr>
                  <td style="font-family: monospace; font-weight: bold;">${s.invoiceNo}</td>
                  <td style="font-size: 9.5px;">${new Date(s.timestamp).toLocaleString()}</td>
                  <td>${s.cashierName}</td>
                  <td style="text-transform: uppercase; font-size: 9px; font-weight: bold;">${s.paymentMethod}</td>
                  <td style="text-align: right; font-family: monospace; color: #d97706;">-${formatLKR(s.totalDiscount || 0)}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold;">${formatLKR(s.grandTotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          `}
        </table>

        <!-- Signatures & Footer -->
        <div style="display: flex; justify-content: space-between; margin-top: 40px; padding-top: 15px; border-top: 1px solid #cbd5e1; font-size: 10px;">
          <div>Prepared By: __________________________</div>
          <div>Audited & Checked By: __________________________</div>
          <div>Authorized Manager: __________________________</div>
        </div>
      </div>
    `;

    const printArea = document.getElementById('a4ReportPrintArea');
    if (printArea) {
      printArea.innerHTML = htmlContent;
      document.body.classList.add('printing-a4-report');
      window.print();
      setTimeout(() => {
        document.body.classList.remove('printing-a4-report');
      }, 1000);
    }
  },

  // Export CSV
  async exportSalesCSV() {
    const { start, end, fromStr, toStr } = this.getDateBounds();
    const allSales = await db.sales.toArray();
    const filtered = allSales.filter(s => {
      const t = new Date(s.timestamp);
      return t >= start && t <= end;
    });

    let csv = 'Invoice No,Date,Cashier,Customer,Payment Method,Subtotal,Discount,Tax,Grand Total\n';
    filtered.forEach(s => {
      csv += `"${s.invoiceNo}","${s.timestamp}","${s.cashierName}","${s.customerName || 'Walk-in'}","${s.paymentMethod}",${s.subtotal || 0},${s.totalDiscount || 0},${s.tax || 0},${s.grandTotal || 0}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Sales_Report_${fromStr}_to_${toStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async exportInventoryCSV() {
    const products = await db.products.toArray();
    let csv = 'SKU,Product Name,Sinhala Name,Category,Brand,Unit,Cost Price,Retail Price,Wholesale Price,Current Stock,Min Stock,Expiry Date\n';
    products.forEach(p => {
      csv += `"${p.sku}","${p.name.replace(/"/g, '""')}","${(p.nameSi || '').replace(/"/g, '""')}","${p.category || ''}","${p.brand || ''}","${p.unit || 'pcs'}",${p.costPrice || 0},${p.sellingPrice || 0},${p.wholesalePrice || 0},${p.currentStock || 0},${p.minStock || 0},"${p.expiryDate || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Inventory_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
};

window.ReportsManager = ReportsManager;
