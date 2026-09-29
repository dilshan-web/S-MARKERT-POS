/**
 * Lightweight Offline Internationalization (i18n) Module
 * Supports:
 *  - English (EN)
 *  - Sinhala (SI / සිංහල)
 *  - Bilingual (BI / සිංහල + English)
 */

const I18n = {
  currentLang: 'en', // 'en', 'si', or 'bi'

  translations: {
    en: {
      // Nav Tabs
      dashboard: 'Dashboard',
      posTerminal: 'POS Terminal',
      inventory: 'Inventory & Stock',
      grn: 'GRN Purchases',
      credit: 'Credit Management',
      customers: 'Customers Directory',
      suppliers: 'Suppliers',
      expenses: 'Expenses',
      shifts: 'Cash Drawer / Shift',
      reports: 'Reports & Analytics',
      settings: 'Settings & Backup',
      offlineActive: '100% Offline Active',

      // Dashboard
      dashTitle: 'Executive Business Dashboard',
      dashSubtitle: 'Real-time sales, net profit, inventory valuation & business KPIs',
      dayTotal: 'Today Sales',
      dayProfit: 'Today Net Profit',
      fullTotal: 'Lifetime Sales',
      fullProfit: 'Lifetime Net Profit',
      stockValuationCard: 'Stock Valuation (Cost)',
      recentSalesTitle: 'Recent Sales Transactions',
      quickShortcuts: 'Quick Shortcuts',
      customerCreditCard: 'Customer Credit Due',
      supplierPayablesCard: 'Supplier Payables',

      // Header & Auth
      appName: 'LANKA MEGA POS',
      appSubname: '100% Offline Supermarket System • LKR',
      loginSupermarket: 'LANKA MEGA SUPERMARKET',
      loginTagline: 'Supermarket POS & Inventory System',
      loginSubtitle: 'Login with Username & Password',
      usernameLabel: 'Username',
      passwordLabel: 'Password',
      usernamePlaceholder: 'Username',
      loginBtn: 'LOGIN',
      demoLoginsTitle: '1-Click Demo Logins:',
      logOut: 'Log Out',

      // POS Terminal
      pricingMode: 'Pricing Mode:',
      retail: '🛒 Retail',
      wholesale: '🏢 Wholesale',
      attachCustomer: 'Attach Customer for Loyalty (F3)',
      searchProduct: 'Scan Barcode or Search (F1)...',
      camera: 'Camera',
      allItems: '🔥 All Items',
      discount: '🏷️ Discount (F4)',
      hold: '⏸️ Hold (F8)',
      recall: '▶️ Recall (F9)',
      clearCart: 'Clear',
      subtotal: 'Subtotal:',
      discounts: 'Discounts:',
      taxes: 'Taxes / VAT:',
      netPayable: 'Net Payable',
      payNow: 'PAY NOW (F10)',
      emptyCart: 'Cart is empty',
      scanOrClick: 'Scan barcode or click products to add',
      itemHeader: 'Item',
      priceHeader: 'Price',
      qtyHeader: 'Qty',
      amountHeader: 'Total (LKR)',
      retailTag: 'Retail',
      wholesaleTag: 'WS',

      // Inventory View
      costValuation: 'Cost Valuation',
      retailValuation: 'Retail Valuation',
      grossMargin: 'Gross Margin',
      lowStock: 'Low Stock',
      nearExpiry: 'Near Expiry',
      filterAll: 'All Items',
      filterLow: '⚠️ Low Stock',
      filterOut: '🚫 Out of Stock',
      filterNearExpiry: '⏳ Near Expiry',
      filterExpired: '❌ Expired',
      searchInventory: 'Search inventory...',
      exportCSV: '📥 CSV',
      addProduct: '+ Add Product',
      colProdName: 'Product Name / SKU',
      colBarcode: 'Barcode',
      colCategory: 'Category',
      colPrices: 'Retail / WS Price',
      colStock: 'Current Stock',
      colExpiry: 'Expiry Date',
      colActions: 'Actions',

      // GRN View
      grnTitle: 'Purchasing & GRN',
      grnSubtitle: 'Record supplier goods received and stock entry',
      newGRN: '+ New GRN Purchase',
      colGrnNo: 'GRN No',
      colSupplier: 'Supplier',
      colDate: 'Date',
      colItems: 'Items',
      colTotalCost: 'Total Cost',
      colPaymentStatus: 'Payment Status',

      // Customers View
      customersTitle: 'Customers & Loyalty Points',
      customersSubtitle: 'Manage customer loyalty points and store credit',
      searchCustomer: 'Search phone or name...',
      registerCustomer: '+ Register Customer',
      colCustomerName: 'Name',
      colCustomerPhone: 'Phone Number',
      colCustomerPoints: 'Loyalty Points',
      colCustomerCredit: 'Credit Balance',
      colCustomerTotalPurchases: 'Total Purchases',

      // Suppliers View
      suppliersTitle: 'Suppliers Directory',
      suppliersSubtitle: 'Distributors, contacts and outstanding payables',
      addSupplier: '+ Add Supplier',
      colSuppCompany: 'Company / Name',
      colSuppPhone: 'Phone',
      colSuppAddress: 'Address',
      colSuppBalance: 'Payable Balance',

      // Expenses View
      expensesTitle: 'Operational Expenses',
      expensesSubtitle: 'Record utilities, rent, wages and general overheads',
      totalExpenses: 'Total Expenses',
      logExpense: '+ Log Expense',
      colExpDate: 'Date',
      colExpDesc: 'Description',
      colExpCategory: 'Category',
      colExpAmount: 'Amount (LKR)',
      colExpNotes: 'Notes',

      // Shifts View
      shiftsHistoryTitle: 'Shift History & Z-Reports',
      colShiftId: 'Shift ID',
      colCashier: 'Cashier',
      colShiftDate: 'Date / Time',
      colStartFloat: 'Opening Float',
      colTotalSales: 'Total Sales',
      colVariance: 'Variance',
      colStatus: 'Status',
      openingFloat: 'Opening Float',
      cashSales: 'Cash Sales',
      cardQrSales: 'Card / QR Sales',
      expectedInDrawer: 'Expected In Drawer',
      endShiftReconcile: 'End Shift & Reconcile',
      noShiftOpen: 'No Shift Currently Open',
      startShiftPrompt: 'Start a new cashier shift with an opening cash float to begin tracking drawer cash.',
      openNewShiftBtn: 'Open New Shift',

      // Reports View
      reportsTitle: 'Analytics & Net Profit',
      reportsSubtitle: 'Offline reports with interactive visual charts',
      rangeToday: 'Today',
      range7Days: '7 Days',
      range30Days: '30 Days',
      rangeAll: 'All Time',
      exportSalesCSV: '📥 Export CSV',
      grossSales: 'Gross Sales',
      cogs: 'Cost of Goods (COGS)',
      grossProfit: 'Gross Profit',
      netProfit: 'True Net Profit',
      totalBills: 'Total Bills:',
      avgBasket: 'Avg Basket:',
      salesTrendTitle: 'Daily Sales Trend',
      topProductsTitle: 'Top 5 Best Sellers',
      hourlyTrafficTitle: 'Hourly Customer Traffic',
      cashierPerformanceTitle: 'Cashier Performance',
      colCashierName: 'Cashier Name',
      colReceiptsIssued: 'Bills Issued',
      colCollectedAmt: 'Total Collected (LKR)',
      colAvgBill: 'Average Bill',

      // Settings View
      brandingTitle: 'Store Logo & Custom Branding',
      brandingSubtitle: 'Choose a store logo from device gallery or files. Displays on header, login and thermal receipts.',
      selectLogoLabel: 'Select Store Logo Image (PNG / JPG / WEBP, Max 2MB):',
      chooseLogo: 'Choose Logo from Gallery / File',
      removeLogo: 'Remove Logo',
      storeSettingsTitle: 'Store Settings & Receipt Configuration',
      storeSettingsSubtitle: 'Store contact details, VAT tax rates, thermal printer width, and loyalty points',
      saveSettings: 'Save Settings',
      storeNameLabel: 'Store Name',
      storeNameSiLabel: 'Store Name (Sinhala / Optional)',
      branchLabel: 'Branch',
      phoneLabel: 'Phone Number',
      addressLabel: 'Address',
      vatNoLabel: 'VAT Registration No',
      printerWidthLabel: 'Thermal Paper Width',
      loyaltyRateLabel: 'Loyalty Earn Rate (1 pt per LKR spent)',
      receiptFooterLabel: 'Receipt Footer Note',
      enableBeepLabel: 'Enable scanner sound effects (Beep)',
      autoPrintLabel: 'Auto print receipt after checkout',
      backupTitle: 'Offline Database Backup & USB Wizard',
      backupSubtitle: 'Your data is stored 100% offline in browser storage. Save JSON backups daily to USB.',
      exportJSONTitle: '💾 Export Database Backup (JSON)',
      exportJSONDesc: 'Download full products, sales, customers and accounts file.',
      exportJSON: 'Export JSON Backup',
      restoreJSONTitle: '📂 Restore Database Backup (JSON)',
      restoreJSONDesc: 'Restore your database from a previously exported JSON backup.',
      restoreJSON: 'Restore JSON File',
      resetDBTitle: '⚠️ Reset & Restart System',
      resetDBDesc: 'Safely backup current data and restart fresh supermarket system or clear sales history.',
      resetDB: 'Reset & Restart System',

      // Modals
      checkoutTitle: 'Checkout & Payment',
      checkoutSubtitle: 'Select payment method & enter cash received',
      grandTotalLabel: 'Grand Total',
      payCash: '💵 Cash',
      payCard: '💳 Card',
      payQR: '📱 QR / Bank',
      payCredit: '📋 Credit',
      cashReceivedLabel: 'Cash Received (LKR)',
      changeDueLabel: 'Change Due:',
      cancelBtn: 'Cancel (Esc)',
      completeSaleBtn: 'Complete Sale & Print Receipt →',
      receiptPreviewTitle: 'Thermal Receipt Preview',
      closeBtn: 'Close',
      printReceiptBtn: 'Print Receipt',
      heldBillsTitle: 'Held Bills',
      selectCustomerTitle: 'Select Customer',
      customerSearchPlaceholder: 'Phone (07XXXXXXXX) or name...',
      newCustomerShort: '+ New',
      productModalTitle: 'Product Management',
      prodNameEnLabel: 'Product Name (English / Main) *',
      prodNameSiLabel: 'Sinhala Name (Optional)',
      skuLabel: 'SKU / Item Code *',
      barcodeLabel: 'Barcodes (Comma-separated)',
      categoryLabel: 'Category',
      brandLabel: 'Brand',
      unitLabel: 'Unit',
      costPriceLabel: 'Cost Price (LKR) *',
      markedPriceLabel: 'Marked Price / MRP (LKR) *',
      retailPriceLabel: 'Retail Price (LKR) *',
      wholesalePriceLabel: 'Wholesale Price (LKR) *',
      youSaved: '🎉 You Saved:',
      minStockLabel: 'Min Stock Alert',
      currentStockLabel: 'Current Stock Qty',
      expiryDateLabel: 'Expiry Date',
      batchNoLabel: 'Batch No',
      supplierLabel: 'Supplier',
      saveProductBtn: 'Save Product',
      stockAdjTitle: 'Stock Adjustment',
      adjTypeLabel: 'Adjustment Type',
      adjQtyLabel: 'Quantity',
      adjReasonLabel: 'Reason / Note',
      updateStockBtn: 'Update Stock',
      barcodeStickerTitle: 'Barcode Stickers Generator',
      barcodeNumberLabel: 'Barcode Number',
      copiesLabel: 'Copies',
      labelSizeLabel: 'Label Size',
      previewLabel: 'Preview',
      printStickersBtn: 'Print Stickers',
      newGrnModalTitle: 'New GRN Purchase Entry',
      invoiceNoLabel: 'Invoice / GRN No',
      addItemsSection: 'Add Products',
      costPlaceholder: 'Cost (LKR)',
      qtyPlaceholder: 'Qty',
      addItemBtn: '+ Add Item',
      paymentModeLabel: 'Payment Mode',
      amountPaidLabel: 'Amount Paid (LKR)',
      totalGrnCostLabel: 'Total GRN Amount:',
      addToStockBtn: 'Add to Inventory Stock',
      custModalTitle: 'Customer Registration',
      custPhoneLabel: 'Phone Number (07XXXXXXXX) *',
      custFullNameLabel: 'Full Name *',
      custEmailLabel: 'Email Address',
      custPointsLabel: 'Opening Points',
      custCreditLabel: 'Credit Balance (LKR)',
      saveCustomerBtn: 'Save Customer',
      suppModalTitle: 'Supplier Details',
      suppNameLabel: 'Company / Supplier Name *',
      suppBalanceLabel: 'Opening Payable Balance (LKR)',
      saveSupplierBtn: 'Save Supplier',
      expModalTitle: 'Log Operational Expense',
      expTitleLabel: 'Expense Description *',
      expAmountLabel: 'Amount (LKR) *',
      saveExpenseBtn: 'Record Expense',
      startShiftTitle: 'Open Cashier Shift',
      startShiftSubtitle: 'Enter opening cash drawer float amount',
      startFloatLabel: 'Opening Float (LKR)',
      startShiftBtn: 'Start Shift',
      endShiftTitle: 'Close Shift & Drawer Reconciliation',
      expectedCashLabel: 'Expected In Drawer:',
      actualCashLabel: 'Actual Counted Cash (LKR) *',
      varianceLabel: 'Cash Variance:',
      confirmCloseShiftBtn: 'Close Shift & Print Z-Report',
      cameraModalTitle: 'Camera Barcode Scanner',
      cameraInstructions: 'Point camera at barcode label.'
    },

    si: {
      // Nav Tabs
      dashboard: 'මුල් පුවරුව (Dashboard)',
      posTerminal: 'බිල්පත් පර්යන්තය',
      inventory: 'තොග පාලනය',
      grn: 'මිලදී ගැනීම් (GRN)',
      credit: 'ණය කළමනාකරණය',
      customers: 'පාරිභෝගික ලේඛනය',
      suppliers: 'සැපයුම්කරුවන්',
      expenses: 'වියදම්',
      shifts: 'මුදල් ලාච්චුව සහ මුර',
      reports: 'වාර්තා සහ විශ්ලේෂණ',
      settings: 'සැකසුම් සහ උපස්ථ',
      offlineActive: '100% නොබැඳිව ක්‍රියාත්මකයි',

      // Dashboard
      dashTitle: 'ව්‍යාපාරික මුල් පුවරුව (Dashboard)',
      dashSubtitle: 'දෛනික සහ සම්පූර්ණ විකුණුම්, ශුද්ධ ලාභය සහ ව්‍යාපාරික දත්ත',
      dayTotal: 'අද මුළු විකුණුම්',
      dayProfit: 'අද ශුද්ධ ලාභය',
      fullTotal: 'සම්පූර්ණ විකුණුම්',
      fullProfit: 'සම්පූර්ණ ශුද්ධ ලාභය',
      stockValuationCard: 'තොගයේ පිරිවැය වටිනාකම',
      recentSalesTitle: 'මෑත විකුණුම් ගනුදෙනු',
      quickShortcuts: 'ක්ෂණික කෙටිමං',
      customerCreditCard: 'පාරිභෝගික ණය ශේෂය',
      supplierPayablesCard: 'සැපයුම්කරුවන්ට ගෙවිය යුතු මුදල',

      // Header & Auth
      appName: 'ලංකා මෙගා POS',
      appSubname: '100% නොබැඳි සුපිරි වෙළඳසැල් පද්ධතිය • LKR',
      loginSupermarket: 'ලංකා මෙගා සුපිරි වෙළඳසැල',
      loginTagline: 'සුපිරි වෙළඳසැල් POS සහ තොග පද්ධතිය',
      loginSubtitle: 'පරිශීලක නම සහ මුරපදය මඟින් ඇතුල් වන්න',
      usernameLabel: 'පරිශීලක නම',
      passwordLabel: 'මුරපදය',
      usernamePlaceholder: 'පරිශීලක නම (Username)',
      loginBtn: 'ඇතුල් වන්න',
      demoLoginsTitle: 'ක්ෂණික ආදර්ශ පිවිසුම්:',
      logOut: 'ඉවත් වන්න',

      // POS Terminal
      pricingMode: 'මිල ප්‍රකාරය:',
      retail: '🛒 සිල්ලර',
      wholesale: '🏢 තොග',
      attachCustomer: 'පාරිභෝගිකයා තෝරන්න (F3)',
      searchProduct: 'බාර්කෝඩ් / නම / SKU සොයන්න (F1)...',
      camera: 'කැමරාව',
      allItems: '🔥 සියල්ල',
      discount: '🏷️ වට්ටම (F4)',
      hold: '⏸️ රඳවන්න (F8)',
      recall: '▶️ නැවත (F9)',
      clearCart: 'හිස් කරන්න',
      subtotal: 'උප එකතුව:',
      discounts: 'වට්ටම්:',
      taxes: 'බදු (VAT):',
      netPayable: 'මුළු මුදල',
      payNow: 'ගෙවීම් කරන්න (F10)',
      emptyCart: 'බිල්පත හිස්ය',
      scanOrClick: 'බාර්කෝඩ් ස්කෑන් කරන්න හෝ භාණ්ඩ තෝරන්න',
      itemHeader: 'භාණ්ඩය',
      priceHeader: 'මිල',
      qtyHeader: 'ප්‍රමාණය',
      amountHeader: 'මුදල (LKR)',
      retailTag: 'සිල්ලර',
      wholesaleTag: 'තොග',

      // Inventory View
      costValuation: 'මුළු පිරිවැය',
      retailValuation: 'විකුණුම් අගය',
      grossMargin: 'දළ ලාභය',
      lowStock: 'අඩු තොග',
      nearExpiry: 'කල් ඉකුත්වන',
      filterAll: 'සියල්ල',
      filterLow: '⚠️ අඩු තොග',
      filterOut: '🚫 ඉවර වූ තොග',
      filterNearExpiry: '⏳ කල් ඉකුත්වන',
      filterExpired: '❌ කල් ඉකුත් වූ',
      searchInventory: 'තොග සොයන්න...',
      exportCSV: '📥 CSV',
      addProduct: '+ අලුත් භාණ්ඩයක්',
      colProdName: 'භාණ්ඩයේ නම / SKU',
      colBarcode: 'බාර්කෝඩ්',
      colCategory: 'වර්ගය',
      colPrices: 'සිල්ලර / තොග මිල',
      colStock: 'වත්මන් තොගය',
      colExpiry: 'කල් ඉකුත් වීම',
      colActions: 'ක්‍රියා',

      // GRN View
      grnTitle: 'මිලදී ගැනීම් සහ GRN',
      grnSubtitle: 'සැපයුම්කරුවන්ගෙන් ලැබෙන තොග ඇතුළත් කිරීම',
      newGRN: '+ නව GRN එකක්',
      colGrnNo: 'GRN අංකය',
      colSupplier: 'සැපයුම්කරු',
      colDate: 'දිනය',
      colItems: 'අයිතම',
      colTotalCost: 'මුළු පිරිවැය',
      colPaymentStatus: 'ගෙවීම් තත්ත්වය',

      // Customers View
      customersTitle: 'පාරිභෝගික නාමාවලිය සහ ලකුණු',
      customersSubtitle: 'ලෝයල්ටි ලකුණු සහ ණය ගිණුම් පාලනය',
      searchCustomer: 'දුරකථන අංකය හෝ නම සොයන්න...',
      registerCustomer: '+ පාරිභෝගිකයෙකු ලියාපදිංචි කරන්න',
      colCustomerName: 'නම',
      colCustomerPhone: 'දුරකථන අංකය',
      colCustomerPoints: 'ලෝයල්ටි ලකුණු',
      colCustomerCredit: 'ණය ශේෂය',
      colCustomerTotalPurchases: 'මුළු මිලදී ගැනීම්',

      // Suppliers View
      suppliersTitle: 'සැපයුම්කරුවන්ගේ නාමාවලිය',
      suppliersSubtitle: 'බෙදාහරින්නන් සහ ගෙවිය යුතු ශේෂයන්',
      addSupplier: '+ සැපයුම්කරුවෙකු එක් කරන්න',
      colSuppCompany: 'සමාගම / නම',
      colSuppPhone: 'දුරකථනය',
      colSuppAddress: 'ලිපිනය',
      colSuppBalance: 'ගෙවිය යුතු ශේෂය',

      // Expenses View
      expensesTitle: 'ව්‍යාපාරික වියදම්',
      expensesSubtitle: 'විදුලිය, වැටුප්, කුලී සහ අනෙකුත් වියදම් සටහන් කිරීම',
      totalExpenses: 'මුළු වියදම',
      logExpense: '+ වියදමක් එක් කරන්න',
      colExpDate: 'දිනය',
      colExpDesc: 'විස්තරය',
      colExpCategory: 'වර්ගය',
      colExpAmount: 'මුදල (LKR)',
      colExpNotes: 'සටහන්',

      // Shifts View
      shiftsHistoryTitle: 'පෙර මුර වාර්තා සහ Z-Reports',
      colShiftId: 'මුර අංකය',
      colCashier: 'කැෂියර්',
      colShiftDate: 'දිනය / වේලාව',
      colStartFloat: 'ආරම්භක මුදල',
      colTotalSales: 'මුළු විකුණුම්',
      colVariance: 'වෙනස',
      colStatus: 'තත්ත්වය',
      openingFloat: 'ආරම්භක මුදල',
      cashSales: 'මුදල් විකුණුම්',
      cardQrSales: 'කාඩ් / QR විකුණුම්',
      expectedInDrawer: 'ලාච්චුවේ තිබිය යුතු මුදල',
      endShiftReconcile: 'මුරය අවසන් කිරීම',
      noShiftOpen: 'ක්‍රියාකාරී මුරයක් නොමැත',
      startShiftPrompt: 'ලාච්චුවේ මුදල් පාලනය සඳහා ආරම්භක මුදලක් සමඟ නව මුරයක් අරඹන්න.',
      openNewShiftBtn: 'නව මුරයක් අරඹන්න',

      // Reports View
      reportsTitle: 'ව්‍යාපාරික විශ්ලේෂණ සහ ශුද්ධ ලාභය',
      reportsSubtitle: 'Chart.js ප්‍රස්ථාර සමඟ නොබැඳි වාර්තා',
      rangeToday: 'අද',
      range7Days: 'දින 7',
      range30Days: 'දින 30',
      rangeAll: 'සියල්ල',
      exportSalesCSV: '📥 CSV ලබාගන්න',
      grossSales: 'මුළු ආදායම',
      cogs: 'භාණ්ඩ පිරිවැය',
      grossProfit: 'දළ ලාභය',
      netProfit: 'සැබෑ ශුද්ධ ලාභය',
      totalBills: 'මුළු බිල්පත්:',
      avgBasket: 'සාමාන්‍ය බිල්පත:',
      salesTrendTitle: 'දෛනික විකුණුම් ප්‍රවණතාවය',
      topProductsTitle: 'වැඩිපුරම අලෙවි වූ භාණ්ඩ 5',
      hourlyTrafficTitle: 'පැය අනුව පාරිභෝගික පැමිණීම',
      cashierPerformanceTitle: 'කැෂියර් කාර්ය සාධනය',
      colCashierName: 'කැෂියර් නම',
      colReceiptsIssued: 'නිකුත් කළ බිල්පත්',
      colCollectedAmt: 'එකතු කළ මුදල (LKR)',
      colAvgBill: 'සාමාන්‍ය බිල්පත',

      // Settings View
      brandingTitle: 'වෙළඳසැල් ලාංඡනය සහ සන්නාමය',
      brandingSubtitle: 'ශීර්ෂකය, පිවිසුම් තිරය සහ මුද්‍රිත බිල්පත් සඳහා ලාංඡනයක් තෝරන්න.',
      selectLogoLabel: 'වෙළඳසැල් ලාංඡනය තෝරන්න (PNG / JPG / WEBP, උපරිම 2MB):',
      chooseLogo: 'ගොනුවකින් ලාංඡනය තෝරන්න',
      removeLogo: 'ලාංඡනය ඉවත් කරන්න',
      storeSettingsTitle: 'වෙළඳසැල් සැකසුම් සහ බිල්පත් වින්‍යාසය',
      storeSettingsSubtitle: 'ලිපිනය, දුරකථනය, VAT අංකය, මුද්‍රණ යන්ත්‍රය සහ ලෝයල්ටි සැකසුම්',
      saveSettings: 'සැකසුම් සුරකින්න',
      storeNameLabel: 'වෙළඳසැල් නම',
      storeNameSiLabel: 'වෙළඳසැල් නම (සිංහල / විකල්ප)',
      branchLabel: 'ශාඛාව',
      phoneLabel: 'දුරකථන අංකය',
      addressLabel: 'ලිපිනය',
      vatNoLabel: 'VAT ලියාපදිංචි අංකය',
      printerWidthLabel: 'මුද්‍රණ යන්ත්‍රයේ පළල',
      loyaltyRateLabel: 'ලෝයල්ටි අනුපාතය (රු. 1 ට ලැබෙන ලකුණු)',
      receiptFooterLabel: 'බිල්පතේ පහළ සටහන',
      enableBeepLabel: 'ශබ්ද සංඥා ක්‍රියාත්මක කරන්න (Beep)',
      autoPrintLabel: 'ගෙවීමෙන් පසු ස්වයංක්‍රීයව බිල්පත මුද්‍රණය කරන්න',
      backupTitle: 'දත්ත ආරක්ෂාව සහ නොබැඳි උපස්ථ',
      backupSubtitle: 'ඔබගේ දත්ත 100% නොබැඳිව බ්‍රවුසරයේ සුරැකේ. දිනපතා USB ධාවකයකට JSON උපස්ථයක් සුරකින්න.',
      exportJSONTitle: '💾 දත්ත පිටපතක් ලබාගන්න (Export JSON)',
      exportJSONDesc: 'සම්පූර්ණ භාණ්ඩ, විකුණුම් සහ ගිණුම් දත්ත ගොනුවක් බාගත කරන්න.',
      exportJSON: 'Export JSON උපස්ථය',
      restoreJSONTitle: '📂 දත්ත නැවත ලබාගන්න (Restore JSON)',
      restoreJSONDesc: 'කලින් ලබාගත් JSON උපස්ථ ගොනුවකින් දත්ත නැවත ප්‍රතිස්ථාපනය කරන්න.',
      restoreJSON: 'Restore JSON ගොනුව',
      resetDBTitle: '⚠️ පද්ධතිය නැවත ආරම්භ කිරීම (Reset & Restart)',
      resetDBDesc: 'දැනට ඇති දත්ත ආරක්ෂිතව Auto-Backup කර සම්පූර්ණ පද්ධතියම හෝ විකුණුම් වාර්තා පමණක් 0 දක්වා Reset කරන්න.',
      resetDB: 'පද්ධතිය Reset කරන්න',

      // Modals
      checkoutTitle: 'ගෙවීම් සම්පූර්ණ කිරීම',
      checkoutSubtitle: 'ගෙවීම් ක්‍රමය තෝරා ලැබුණු මුදල ඇතුළත් කරන්න',
      grandTotalLabel: 'මුළු එකතුව',
      payCash: '💵 මුදල්',
      payCard: '💳 කාඩ්පත්',
      payQR: '📱 QR / බැංකු',
      payCredit: '📋 ණයට',
      cashReceivedLabel: 'ලැබුණු මුදල (LKR)',
      changeDueLabel: 'ඉතිරි මුදල:',
      cancelBtn: 'අවලංගු කරන්න (Esc)',
      completeSaleBtn: 'බිල්පත නිකුත් කරන්න →',
      receiptPreviewTitle: 'බිල්පත් පෙරදසුන',
      closeBtn: 'වසන්න',
      printReceiptBtn: 'මුද්‍රණය කරන්න',
      heldBillsTitle: 'රඳවාගත් බිල්පත්',
      selectCustomerTitle: 'පාරිභෝගිකයා තෝරන්න',
      customerSearchPlaceholder: 'දුරකථනය (07XXXXXXXX) හෝ නම...',
      newCustomerShort: '+ අලුත්',
      productModalTitle: 'භාණ්ඩ කළමනාකරණය',
      prodNameEnLabel: 'භාණ්ඩයේ නම (ඉංග්‍රීසි / ප්‍රධාන) *',
      prodNameSiLabel: 'සිංහල නම (අවශ්‍ය නම්)',
      skuLabel: 'SKU / භාණ්ඩ අංකය *',
      barcodeLabel: 'බාර්කෝඩ් (කොමා මඟින් වෙන් කර)',
      categoryLabel: 'වර්ගය',
      brandLabel: 'වෙළඳ නාමය',
      unitLabel: 'ඒකකය',
      costPriceLabel: 'ගැනුම් මිල (LKR) *',
      markedPriceLabel: 'මුද්‍රිත මිල / MRP (LKR) *',
      retailPriceLabel: 'සිල්ලර මිල (LKR) *',
      wholesalePriceLabel: 'තොග මිල (LKR) *',
      youSaved: '🎉 ඔබට ලැබුණු ලාභය:',
      minStockLabel: 'අවම තොග මට්ටම',
      currentStockLabel: 'වත්මන් තොගය',
      expiryDateLabel: 'කල් ඉකුත්වන දිනය',
      batchNoLabel: 'කාණ්ඩ අංකය',
      supplierLabel: 'සැපයුම්කරු',
      saveProductBtn: 'භාණ්ඩය සුරකින්න',
      stockAdjTitle: 'තොග ගැලපීම්',
      adjTypeLabel: 'ගැලපුම් වර්ගය',
      adjQtyLabel: 'ප්‍රමාණය',
      adjReasonLabel: 'හේතුව / සටහන',
      updateStockBtn: 'යාවත්කාලීන කරන්න',
      barcodeStickerTitle: 'බාර්කෝඩ් ලේබල් මුද්‍රණය',
      barcodeNumberLabel: 'බාර්කෝඩ් අංකය',
      copiesLabel: 'පිටපත් ගණන',
      labelSizeLabel: 'ලේබල් ප්‍රමාණය',
      previewLabel: 'පෙරදසුන',
      printStickersBtn: 'ලේබල් මුද්‍රණය කරන්න',
      newGrnModalTitle: 'නව මිලදී ගැනීමක් / GRN ඇතුළත් කිරීම',
      invoiceNoLabel: 'ඉන්වොයිස් / GRN අංකය',
      addItemsSection: 'භාණ්ඩ එකතු කරන්න',
      costPlaceholder: 'පිරිවැය (LKR)',
      qtyPlaceholder: 'ප්‍රමාණය',
      addItemBtn: '+ එක් කරන්න',
      paymentModeLabel: 'ගෙවීම් ක්‍රමය',
      amountPaidLabel: 'ගෙවූ මුදල (LKR)',
      totalGrnCostLabel: 'මුළු GRN මුදල:',
      addToStockBtn: 'තොගයට එක් කරන්න',
      custModalTitle: 'පාරිභෝගික ලියාපදිංචිය',
      custPhoneLabel: 'දුරකථන අංකය (07XXXXXXXX) *',
      custFullNameLabel: 'සම්පූර්ණ නම *',
      custEmailLabel: 'ඊමේල් ලිපිනය',
      custPointsLabel: 'ආරම්භක ලකුණු',
      custCreditLabel: 'ණය ශේෂය (LKR)',
      saveCustomerBtn: 'පාරිභෝගිකයා සුරකින්න',
      suppModalTitle: 'සැපයුම්කරුගේ විස්තර',
      suppNameLabel: 'සමාගම / සැපයුම්කරුගේ නම *',
      suppBalanceLabel: 'ගෙවිය යුතු ආරම්භක ශේෂය (LKR)',
      saveSupplierBtn: 'සැපයුම්කරු සුරකින්න',
      expModalTitle: 'වියදම් සටහන් කිරීම',
      expTitleLabel: 'වියදමේ විස්තරය *',
      expAmountLabel: 'මුදල (LKR) *',
      saveExpenseBtn: 'වියදම සටහන් කරන්න',
      startShiftTitle: 'මුරය ආරම්භ කිරීම',
      startShiftSubtitle: 'මුදල් ලාච්චුවේ ඇති ආරම්භක මුදල ඇතුළත් කරන්න',
      startFloatLabel: 'ආරම්භක මුදල (LKR)',
      startShiftBtn: 'මුරය අරඹන්න',
      endShiftTitle: 'මුරය අවසන් කිරීම සහ ගිණුම් පියවීම',
      expectedCashLabel: 'ලාච්චුවේ තිබිය යුතු මුදල:',
      actualCashLabel: 'ලාච්චුවේ ගණන් කළ සැබෑ මුදල (LKR) *',
      varianceLabel: 'මුදල් වෙනස:',
      confirmCloseShiftBtn: 'මුරය වසා Z-Report එක ගන්න',
      cameraModalTitle: 'බාර්කෝඩ් ස්කෑන් කරන්න',
      cameraInstructions: 'බාර්කෝඩ් එක කැමරාවට ඉදිරියෙන් තබන්න.'
    },

    bi: {
      // Nav Tabs (Bilingual: සිංහල + English)
      dashboard: 'මුල් පුවරුව (Dashboard)',
      posTerminal: 'බිල්පත් (POS)',
      inventory: 'තොග පාලනය (Inventory)',
      grn: 'මිලදී ගැනීම් (GRN Purchases)',
      credit: 'ණය කළමනාකරණය (Credit)',
      customers: 'පාරිභෝගිකයින් (Customers)',
      suppliers: 'සැපයුම්කරුවන් (Suppliers)',
      expenses: 'වියදම් (Expenses)',
      shifts: 'මුදල් ලාච්චුව (Shifts)',
      reports: 'වාර්තා (Reports & Analytics)',
      settings: 'සැකසුම් (Settings & Backup)',
      offlineActive: '100% නොබැඳි (Offline Active)',

      // Dashboard
      dashTitle: 'ව්‍යාපාරික මුල් පුවරුව (Executive Dashboard)',
      dashSubtitle: 'දෛනික සහ සම්පූර්ණ විකුණුම්, ලාභය සහ දත්ත (Sales & Net Profit)',
      dayTotal: 'අද විකුණුම් (Today Sales)',
      dayProfit: 'අද ශුද්ධ ලාභය (Today Net Profit)',
      fullTotal: 'සම්පූර්ණ විකුණුම් (Lifetime Sales)',
      fullProfit: 'සම්පූර්ණ ශුද්ධ ලාභය (Lifetime Profit)',
      stockValuationCard: 'තොග වටිනාකම (Stock Valuation)',
      recentSalesTitle: 'මෑත විකුණුම් (Recent Sales)',
      quickShortcuts: 'ක්ෂණික කෙටිමං (Shortcuts)',
      customerCreditCard: 'පාරිභෝගික ණය (Customer Credit)',
      supplierPayablesCard: 'සැපයුම්කරු ගෙවීම් (Supplier Payables)',

      // Header & Auth
      appName: 'LANKA MEGA POS (ලංකා මෙගා)',
      appSubname: '100% Offline Supermarket System • LKR',
      loginSupermarket: 'LANKA MEGA SUPERMARKET (ලංකා මෙගා)',
      loginTagline: 'Supermarket POS & Inventory (තොග පද්ධතිය)',
      loginSubtitle: 'Username & Password / පරිශීලක පිවිසුම',
      usernameLabel: 'Username / පරිශීලක නම',
      passwordLabel: 'Password / මුරපදය',
      usernamePlaceholder: 'Username / පරිශීලක නම',
      loginBtn: 'LOGIN / ඇතුල් වන්න',
      demoLoginsTitle: '1-Click Demo Logins / ක්ෂණික පිවිසුම්:',
      logOut: 'Log Out (ඉවත් වන්න)',

      // POS Terminal
      pricingMode: 'මිල ප්‍රකාරය (Mode):',
      retail: '🛒 සිල්ලර (Retail)',
      wholesale: '🏢 තොග (Wholesale)',
      attachCustomer: 'පාරිභෝගිකයා (Customer - F3)',
      searchProduct: 'බාර්කෝඩ් / නම (Scan/Search - F1)...',
      camera: 'කැමරාව (Camera)',
      allItems: '🔥 සියල්ල (All Items)',
      discount: '🏷️ වට්ටම (Discount - F4)',
      hold: '⏸️ රඳවන්න (Hold - F8)',
      recall: '▶️ නැවත (Recall - F9)',
      clearCart: 'හිස් කරන්න (Clear)',
      subtotal: 'උප එකතුව (Subtotal):',
      discounts: 'වට්ටම් (Discounts):',
      taxes: 'බදු (Taxes/VAT):',
      netPayable: 'මුළු මුදල (Net Payable)',
      payNow: 'ගෙවීම් කරන්න (PAY NOW - F10)',
      emptyCart: 'බිල්පත හිස්ය (Cart is empty)',
      scanOrClick: 'බාර්කෝඩ් ස්කෑන් කරන්න (Scan / click items)',
      itemHeader: 'භාණ්ඩය (Item)',
      priceHeader: 'මිල (Price)',
      qtyHeader: 'ප්‍රමාණය (Qty)',
      amountHeader: 'මුදල (Total - LKR)',
      retailTag: 'සිල්ලර (Retail)',
      wholesaleTag: 'තොග (WS)',

      // Inventory View
      costValuation: 'මුළු පිරිවැය (Cost Valuation)',
      retailValuation: 'විකුණුම් අගය (Retail Valuation)',
      grossMargin: 'දළ ලාභය (Gross Margin)',
      lowStock: 'අඩු තොග (Low Stock)',
      nearExpiry: 'කල් ඉකුත්වන (Near Expiry)',
      filterAll: 'සියල්ල (All Items)',
      filterLow: '⚠️ අඩු තොග (Low Stock)',
      filterOut: '🚫 ඉවර වූ (Out of Stock)',
      filterNearExpiry: '⏳ කල් ඉකුත්වන (Near Expiry)',
      filterExpired: '❌ කල් ඉකුත් (Expired)',
      searchInventory: 'තොග සොයන්න (Search inventory)...',
      exportCSV: '📥 CSV',
      addProduct: '+ අලුත් භාණ්ඩයක් (Add Product)',
      colProdName: 'භාණ්ඩයේ නම (Product Name / SKU)',
      colBarcode: 'බාර්කෝඩ් (Barcode)',
      colCategory: 'වර්ගය (Category)',
      colPrices: 'සිල්ලර/තොග මිල (Prices)',
      colStock: 'වත්මන් තොගය (Stock)',
      colExpiry: 'කල් ඉකුත් වීම (Expiry)',
      colActions: 'ක්‍රියා (Actions)',

      // GRN View
      grnTitle: 'මිලදී ගැනීම් සහ GRN (Purchasing)',
      grnSubtitle: 'සැපයුම්කරුවන්ගෙන් ලැබෙන තොග (Goods Received)',
      newGRN: '+ නව GRN එකක් (New Purchase)',
      colGrnNo: 'GRN අංකය (GRN No)',
      colSupplier: 'සැපයුම්කරු (Supplier)',
      colDate: 'දිනය (Date)',
      colItems: 'අයිතම (Items)',
      colTotalCost: 'මුළු පිරිවැය (Total Cost)',
      colPaymentStatus: 'ගෙවීම් තත්ත්වය (Payment)',

      // Customers View
      customersTitle: 'පාරිභෝගිකයින් (Customers & Loyalty)',
      customersSubtitle: 'ලෝයල්ටි ලකුණු සහ ණය (Points & Credit)',
      searchCustomer: 'දුරකථනය හෝ නම සොයන්න...',
      registerCustomer: '+ පාරිභෝගිකයෙක් (Register Customer)',
      colCustomerName: 'නම (Name)',
      colCustomerPhone: 'දුරකථනය (Phone)',
      colCustomerPoints: 'ලකුණු (Points)',
      colCustomerCredit: 'ණය ශේෂය (Credit Balance)',
      colCustomerTotalPurchases: 'මිලදී ගැනීම් (Purchases)',

      // Suppliers View
      suppliersTitle: 'සැපයුම්කරුවන් (Suppliers Directory)',
      suppliersSubtitle: 'බෙදාහරින්නන් සහ ශේෂයන් (Payables)',
      addSupplier: '+ සැපයුම්කරුවෙක් (Add Supplier)',
      colSuppCompany: 'සමාගම/නම (Company/Name)',
      colSuppPhone: 'දුරකථනය (Phone)',
      colSuppAddress: 'ලිපිනය (Address)',
      colSuppBalance: 'ගෙවිය යුතු ශේෂය (Payable)',

      // Expenses View
      expensesTitle: 'ව්‍යාපාරික වියදම් (Operational Expenses)',
      expensesSubtitle: 'විදුලිය, කුලී, වැටුප් (Utilities & Overheads)',
      totalExpenses: 'මුළු වියදම (Total Expenses)',
      logExpense: '+ වියදමක් එක් කරන්න (Log Expense)',
      colExpDate: 'දිනය (Date)',
      colExpDesc: 'විස්තරය (Description)',
      colExpCategory: 'වර්ගය (Category)',
      colExpAmount: 'මුදල (Amount - LKR)',
      colExpNotes: 'සටහන් (Notes)',

      // Shifts View
      shiftsHistoryTitle: 'මුර වාර්තා සහ Z-Reports (Shift History)',
      colShiftId: 'මුර අංකය (Shift ID)',
      colCashier: 'කැෂියර් (Cashier)',
      colShiftDate: 'දිනය/වේලාව (Date/Time)',
      colStartFloat: 'ආරම්භක මුදල (Float)',
      colTotalSales: 'මුළු විකුණුම් (Sales)',
      colVariance: 'වෙනස (Variance)',
      colStatus: 'තත්ත්වය (Status)',
      openingFloat: 'ආරම්භක මුදල (Opening Float)',
      cashSales: 'මුදල් විකුණුම් (Cash Sales)',
      cardQrSales: 'කාඩ්/QR විකුණුම් (Card/QR Sales)',
      expectedInDrawer: 'තිබිය යුතු මුදල (Expected Cash)',
      endShiftReconcile: 'මුරය අවසන් කිරීම (End Shift)',
      noShiftOpen: 'ක්‍රියාකාරී මුරයක් නැත (No Shift Open)',
      startShiftPrompt: 'ආරම්භක මුදල සමඟ නව මුරයක් අරඹන්න (Open new shift)',
      openNewShiftBtn: 'නව මුරයක් අරඹන්න (Open Shift)',

      // Reports View
      reportsTitle: 'විශ්ලේෂණ සහ ශුද්ධ ලාභය (Analytics & Net Profit)',
      reportsSubtitle: 'නොබැඳි වාර්තා සහ ප්‍රස්ථාර (Offline Visual Charts)',
      rangeToday: 'අද (Today)',
      range7Days: 'දින 7 (7 Days)',
      range30Days: 'දින 30 (30 Days)',
      rangeAll: 'සියල්ල (All Time)',
      exportSalesCSV: '📥 Export CSV',
      grossSales: 'මුළු ආදායම (Gross Sales)',
      cogs: 'භාණ්ඩ පිරිවැය (COGS)',
      grossProfit: 'දළ ලාභය (Gross Profit)',
      netProfit: 'සැබෑ ශුද්ධ ලාභය (True Net Profit)',
      totalBills: 'මුළු බිල්පත් (Total Bills):',
      avgBasket: 'සාමාන්‍ය බිල්පත (Avg Bill):',
      salesTrendTitle: 'දෛනික විකුණුම් (Daily Sales Trend)',
      topProductsTitle: 'වැඩිපුරම අලෙවි වූ භාණ්ඩ (Top 5 Best Sellers)',
      hourlyTrafficTitle: 'පැය අනුව පැමිණීම (Hourly Traffic)',
      cashierPerformanceTitle: 'කැෂියර් කාර්ය සාධනය (Cashier Performance)',
      colCashierName: 'කැෂියර් නම (Cashier)',
      colReceiptsIssued: 'බිල්පත් ගණන (Bills)',
      colCollectedAmt: 'එකතු කළ මුදල (Collected - LKR)',
      colAvgBill: 'සාමාන්‍ය බිල්පත (Avg Bill)',

      // Settings View
      brandingTitle: 'වෙළඳසැල් ලාංඡනය (Store Logo & Branding)',
      brandingSubtitle: 'ශීර්ෂකය, පිවිසුම් සහ බිල්පත් ලාංඡනය (Header, Login & Receipts)',
      selectLogoLabel: 'ලාංඡනය තෝරන්න (Select Store Logo Image - Max 2MB):',
      chooseLogo: 'ලාංඡනයක් තෝරන්න (Choose Logo)',
      removeLogo: 'ලාංඡනය ඉවත් කරන්න (Remove Logo)',
      storeSettingsTitle: 'වෙළඳසැල් සැකසුම් (Store Settings & Receipt Config)',
      storeSettingsSubtitle: 'ලිපිනය, දුරකථනය, VAT අංකය සහ මුද්‍රණ යන්ත්‍ර සැකසුම්',
      saveSettings: 'සැකසුම් සුරකින්න (Save Settings)',
      storeNameLabel: 'වෙළඳසැල් නම (Store Name)',
      storeNameSiLabel: 'වෙළඳසැල් නම - සිංහල (Store Name Sinhala)',
      branchLabel: 'ශාඛාව (Branch)',
      phoneLabel: 'දුරකථන අංකය (Phone)',
      addressLabel: 'ලිපිනය (Address)',
      vatNoLabel: 'VAT අංකය (VAT Reg No)',
      printerWidthLabel: 'මුද්‍රණ පළල (Thermal Paper Width)',
      loyaltyRateLabel: 'ලෝයල්ටි අනුපාතය (Loyalty Earn Rate)',
      receiptFooterLabel: 'බිල්පතේ පහළ සටහන (Receipt Footer Note)',
      enableBeepLabel: 'ශබ්ද සංඥා (Beep Sound Effects)',
      autoPrintLabel: 'ස්වයංක්‍රීයව බිල්පත මුද්‍රණය (Auto Print Receipt)',
      backupTitle: 'දත්ත උපස්ථ සහ USB ආරක්ෂාව (Database Backup & USB)',
      backupSubtitle: '100% නොබැඳි බ්‍රවුසර දත්ත. දිනපතා USB වෙත උපස්ථ කරන්න.',
      exportJSONTitle: '💾 දත්ත පිටපතක් (Export JSON Backup)',
      exportJSONDesc: 'සම්පූර්ණ භාණ්ඩ, විකුණුම් ගොනුව බාගත කරන්න (Download full backup)',
      exportJSON: 'Export JSON Backup',
      restoreJSONTitle: '📂 දත්ත නැවත ලබාගන්න (Restore JSON Backup)',
      restoreJSONDesc: 'JSON උපස්ථයකින් දත්ත ප්‍රතිස්ථාපනය කරන්න (Restore database)',
      restoreJSON: 'Restore JSON File',
      resetDBTitle: '⚠️ Reset & Restart / නැවත ආරම්භ කිරීම',
      resetDBDesc: 'දත්ත Backup කර පද්ධතිය Reset කරන්න (Safely backup & reset)',
      resetDB: 'Reset & Restart System / පද්ධතිය Reset කරන්න',

      // Modals
      checkoutTitle: 'ගෙවීම් සම්පූර්ණ කිරීම (Checkout & Payment)',
      checkoutSubtitle: 'ගෙවීම් ක්‍රමය තෝරා මුදල් ලබාගන්න (Select method & cash received)',
      grandTotalLabel: 'මුළු එකතුව (Grand Total)',
      payCash: '💵 මුදල් (Cash)',
      payCard: '💳 කාඩ්පත් (Card)',
      payQR: '📱 QR / බැංකු (QR/Bank)',
      payCredit: '📋 ණයට (Credit)',
      cashReceivedLabel: 'ලැබුණු මුදල (Cash Received - LKR)',
      changeDueLabel: 'ඉතිරි මුදල (Change Due):',
      cancelBtn: 'අවලංගු කරන්න (Cancel - Esc)',
      completeSaleBtn: 'බිල්පත නිකුත් කරන්න (Complete Sale →)',
      receiptPreviewTitle: 'බිල්පත් පෙරදසුන (Thermal Receipt Preview)',
      closeBtn: 'වසන්න (Close)',
      printReceiptBtn: 'මුද්‍රණය කරන්න (Print Receipt)',
      heldBillsTitle: 'රඳවාගත් බිල්පත් (Held Bills)',
      selectCustomerTitle: 'පාරිභෝගිකයා තෝරන්න (Select Customer)',
      customerSearchPlaceholder: 'දුරකථනය / නම සොයන්න (Search phone/name)...',
      newCustomerShort: '+ අලුත් (+ New)',
      productModalTitle: 'භාණ්ඩ කළමනාකරණය (Product Management)',
      prodNameEnLabel: 'භාණ්ඩයේ නම (English / Main) *',
      prodNameSiLabel: 'සිංහල නම (Sinhala Name - Optional)',
      skuLabel: 'SKU / භාණ්ඩ අංකය (Item Code) *',
      barcodeLabel: 'බාර්කෝඩ් (Barcodes - Comma separated)',
      categoryLabel: 'වර්ගය (Category)',
      brandLabel: 'වෙළඳ නාමය (Brand)',
      unitLabel: 'ඒකකය (Unit)',
      costPriceLabel: 'ගැනුම් මිල (Cost Price - LKR) *',
      markedPriceLabel: 'මුද්‍රිත මිල (Marked Price / MRP - LKR) *',
      retailPriceLabel: 'සිල්ලර මිල (Retail Price - LKR) *',
      wholesalePriceLabel: 'තොග මිල (Wholesale Price - LKR) *',
      youSaved: '🎉 ඔබට ලැබුණු ලාභය (You Saved):',
      minStockLabel: 'අවම තොගය (Min Stock Alert)',
      currentStockLabel: 'වත්මන් තොගය (Current Qty)',
      expiryDateLabel: 'කල් ඉකුත්වන දිනය (Expiry Date)',
      batchNoLabel: 'කාණ්ඩ අංකය (Batch No)',
      supplierLabel: 'සැපයුම්කරු (Supplier)',
      saveProductBtn: 'සුරකින්න (Save Product)',
      stockAdjTitle: 'තොග ගැලපීම් (Stock Adjustment)',
      adjTypeLabel: 'ගැලපුම් වර්ගය (Adjustment Type)',
      adjQtyLabel: 'ප්‍රමාණය (Quantity)',
      adjReasonLabel: 'හේතුව / සටහන (Reason / Note)',
      updateStockBtn: 'යාවත්කාලීන කරන්න (Update Stock)',
      barcodeStickerTitle: 'බාර්කෝඩ් ලේබල් මුද්‍රණය (Barcode Stickers)',
      barcodeNumberLabel: 'බාර්කෝඩ් අංකය (Barcode No)',
      copiesLabel: 'පිටපත් ගණන (Copies)',
      labelSizeLabel: 'ලේබල් ප්‍රමාණය (Label Size)',
      previewLabel: 'පෙරදසුන (Preview)',
      printStickersBtn: 'ලේබල් මුද්‍රණය කරන්න (Print Stickers)',
      newGrnModalTitle: 'නව මිලදී ගැනීමක් (New GRN Purchase)',
      invoiceNoLabel: 'ඉන්වොයිස් අංකය (Invoice / GRN No)',
      addItemsSection: 'භාණ්ඩ එකතු කරන්න (Add Products)',
      costPlaceholder: 'පිරිවැය (Cost - LKR)',
      qtyPlaceholder: 'ප්‍රමාණය (Qty)',
      addItemBtn: '+ එක් කරන්න (+ Add Item)',
      paymentModeLabel: 'ගෙවීම් ක්‍රමය (Payment Mode)',
      amountPaidLabel: 'ගෙවූ මුදල (Amount Paid - LKR)',
      totalGrnCostLabel: 'මුළු GRN මුදල (Total GRN):',
      addToStockBtn: 'තොගයට එක් කරන්න (Add to Stock)',
      custModalTitle: 'පාරිභෝගික ලියාපදිංචිය (Customer Registration)',
      custPhoneLabel: 'දුරකථන අංකය (Phone 07XXXXXXXX) *',
      custFullNameLabel: 'සම්පූර්ණ නම (Full Name) *',
      custEmailLabel: 'ඊමේල් ලිපිනය (Email)',
      custPointsLabel: 'ආරම්භක ලකුණු (Opening Points)',
      custCreditLabel: 'ණය ශේෂය (Credit Balance - LKR)',
      saveCustomerBtn: 'සුරකින්න (Save Customer)',
      suppModalTitle: 'සැපයුම්කරු විස්තර (Supplier Details)',
      suppNameLabel: 'සමාගම / නම (Company / Name) *',
      suppBalanceLabel: 'ආරම්භක ශේෂය (Opening Balance - LKR)',
      saveSupplierBtn: 'සුරකින්න (Save Supplier)',
      expModalTitle: 'වියදම් සටහන් කිරීම (Log Expense)',
      expTitleLabel: 'විස්තරය (Expense Description) *',
      expAmountLabel: 'මුදල (Amount - LKR) *',
      saveExpenseBtn: 'සටහන් කරන්න (Record Expense)',
      startShiftTitle: 'මුරය ආරම්භ කිරීම (Open Shift)',
      startShiftSubtitle: 'ආරම්භක මුදල ඇතුළත් කරන්න (Enter opening cash float)',
      startFloatLabel: 'ආරම්භක මුදල (Opening Float - LKR)',
      startShiftBtn: 'මුරය අරඹන්න (Start Shift)',
      endShiftTitle: 'මුරය අවසන් කිරීම (Close Shift & Reconcile)',
      expectedCashLabel: 'තිබිය යුතු මුදල (Expected In Drawer):',
      actualCashLabel: 'සැබෑ මුදල (Actual Counted Cash - LKR) *',
      varianceLabel: 'මුදල් වෙනස (Cash Variance):',
      confirmCloseShiftBtn: 'මුරය වසා Z-Report එක ගන්න (Close Shift & Z-Report)',
      cameraModalTitle: 'බාර්කෝඩ් ස්කෑන් කරන්න (Camera Scanner)',
      cameraInstructions: 'බාර්කෝඩ් එක කැමරාවට පෙන්වන්න (Point camera at barcode)'
    }
  },

  async init() {
    const saved = localStorage.getItem('lankapos_lang');
    if (saved && (saved === 'en' || saved === 'si' || saved === 'bi')) {
      this.currentLang = saved;
    } else {
      this.currentLang = 'en'; // Default is English
    }
    this.updateUI();
  },

  setLanguage(lang) {
    if (lang === 'en' || lang === 'si' || lang === 'bi') {
      this.currentLang = lang;
      localStorage.setItem('lankapos_lang', this.currentLang);
      this.updateUI();
      this.refreshActiveViews();
    }
  },

  toggleLanguage() {
    // Cycle: en -> si -> bi -> en
    if (this.currentLang === 'en') {
      this.currentLang = 'si';
    } else if (this.currentLang === 'si') {
      this.currentLang = 'bi';
    } else {
      this.currentLang = 'en';
    }
    localStorage.setItem('lankapos_lang', this.currentLang);
    this.updateUI();
    this.refreshActiveViews();
  },

  refreshActiveViews() {
    if (window.POSManager) {
      POSManager.updatePricingModeUI();
      POSManager.renderCategoryFilter();
      POSManager.renderProductGrid();
      POSManager.renderCart();
    }
    if (window.ShiftManager) {
      ShiftManager.updateShiftStatusUI();
      ShiftManager.renderShiftsHistory();
    }
    if (window.ReportsManager) {
      ReportsManager.generateReports();
    }
    if (window.InventoryManager && window.App && App.currentTab === 'inventory') {
      InventoryManager.renderValuationCards();
      InventoryManager.renderInventoryTable();
    }
  },

  t(key) {
    const dict = this.translations[this.currentLang] || this.translations.en;
    return dict[key] || this.translations.en[key] || key;
  },

  getLangDisplayName() {
    if (this.currentLang === 'si') return 'සිංහල (SI)';
    if (this.currentLang === 'bi') return 'සිංහල / EN (Dual)';
    return 'English (EN)';
  },

  updateUI() {
    // Update language toggle button text in top header
    const langBtn = document.getElementById('langToggleBtn');
    if (langBtn) {
      langBtn.innerHTML = `
        <span class="text-sm">🌐</span>
        <span class="font-bold">${this.getLangDisplayName()}</span>
      `;
      langBtn.title = `Current Language: ${this.getLangDisplayName()} (Click to toggle English / සිංහල / Dual)`;
    }

    // Update all elements with data-i18n attribute
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.textContent = val;
        }
      }
    });

    // Update all elements with data-i18n-html attribute
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.innerHTML = val;
        }
      }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.placeholder = val;
        }
      }
    });

    // Update titles / tooltips
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (key) {
        const val = this.t(key);
        if (val) {
          el.title = val;
        }
      }
    });
  }
};

window.I18n = I18n;
