# inject_dev.ps1 - Inject all new HTML + script tags into index_dev.html
param()
$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }
$devPath = Join-Path $rootDir "index_dev.html"

Write-Host "[*] Reading index_dev.html..." -ForegroundColor Cyan
$html = [System.IO.File]::ReadAllText($devPath, [System.Text.Encoding]::UTF8)

$changed = 0

# =========================================================
# 1. Add schoolcredit.js script tag after farmers.js
# =========================================================
$farmersScript = '<script src="./farmers.js"></script>'
$farmersAndSchool = '<script src="./farmers.js"></script>
  <script src="./schoolcredit.js"></script>'

if ($html.Contains('<script src="./schoolcredit.js">')) {
    Write-Host "  [~] schoolcredit.js already included" -ForegroundColor Yellow
} elseif ($html.Contains($farmersScript)) {
    $html = $html.Replace($farmersScript, $farmersAndSchool)
    Write-Host "  [+] schoolcredit.js script tag added" -ForegroundColor Green
    $changed++
} else {
    Write-Host "  [-] farmers.js script tag not found!" -ForegroundColor Red
}

# =========================================================
# 2. Add School Credit nav tab after Farmers nav button
# =========================================================
$schoolNavBtn = @'

          <!-- School Credit Tab -->
          <button onclick="App.switchTab('schoolcredit')" data-tab="schoolcredit" data-permission="schoolcredit" class="nav-tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-slate-400 hover:bg-slate-800 cursor-pointer">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l9-5-9-5-9 5 9 5z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
            <span class="hidden md:inline">School Credit (පාසල් ණය)</span>
          </button>
'@

if ($html.Contains('data-tab="schoolcredit"')) {
    Write-Host "  [~] School nav tab already exists" -ForegroundColor Yellow
} else {
    # Insert after the closing </button> of the farmers nav button
    $marker = '            <span class="hidden md:inline" data-i18n="farmersNav">Farmer Produce (ගොවීන්)</span>
          </button>'
    if ($html.Contains($marker)) {
        $html = $html.Replace($marker, $marker + $schoolNavBtn)
        Write-Host "  [+] School Credit nav tab added" -ForegroundColor Green
        $changed++
    } else {
        # Fallback: insert before Expenses comment
        $expensesMarker = '          <!-- Expenses -->'
        if ($html.Contains($expensesMarker)) {
            $html = $html.Replace($expensesMarker, $schoolNavBtn + '          <!-- Expenses -->')
            Write-Host "  [+] School Credit nav tab added (fallback)" -ForegroundColor Green
            $changed++
        } else {
            Write-Host "  [-] Could not find farmers nav end marker" -ForegroundColor Red
        }
    }
}

# =========================================================
# 3. Add School Credit Tab Body before Settings view
# =========================================================
$schoolTabBody = @'

        <!-- =====================================================================
             VIEW: SCHOOL CREDIT (පාසල් ණය කළමනාකරණය)
             ===================================================================== -->
        <div id="tabView_schoolcredit" class="tab-view hidden flex-1 min-h-0 overflow-y-auto space-y-4">
          <!-- Header -->
          <div class="p-4 sm:p-5 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <span class="text-2xl">🏫</span>
                <h3 class="text-base sm:text-lg font-black text-slate-100">School Credit Management (පාසල් ණය කළමනාකරණය)</h3>
                <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-sky-950 text-sky-400 border border-sky-800">පාසල් ගිනුම්</span>
              </div>
              <p class="text-xs text-slate-400">Manage school accounts, credit balances, and generate A4 statements.</p>
            </div>
            <div class="flex flex-wrap gap-2">
              <button onclick="SchoolCreditManager.openAddSchoolModal()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
                <span>➕</span> <span>Add School</span>
              </button>
            </div>
          </div>
          <!-- KPI Cards -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div class="text-xs text-slate-400 mb-1">Total Outstanding (සමස්ත ණය)</div>
              <div id="schoolTotalDueKpi" class="text-2xl font-black text-rose-400">Rs. 0.00</div>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div class="text-xs text-slate-400 mb-1">Active Schools (පාසල් ගණන)</div>
              <div id="schoolActiveCountKpi" class="text-2xl font-black text-sky-400">0</div>
            </div>
            <div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl">
              <div class="text-xs text-slate-400 mb-1">Today Collected (අද එකතු)</div>
              <div id="schoolTodayCollectedKpi" class="text-2xl font-black text-emerald-400">Rs. 0.00</div>
            </div>
          </div>
          <!-- Sub-tabs -->
          <div class="p-3 bg-slate-900 border border-slate-800 rounded-2xl flex gap-2 flex-wrap">
            <button type="button" id="schoolSubTabDebtorsBtn" onclick="SchoolCreditManager.setSubTab('debtors')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-sky-600 text-white shadow-md">
              <span>🏫</span> <span>School Accounts</span>
            </button>
            <button type="button" id="schoolSubTabHistoryBtn" onclick="SchoolCreditManager.setSubTab('history')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800">
              <span>📋</span> <span>Transaction History</span>
            </button>
          </div>
          <!-- School Accounts Table -->
          <div id="schoolCreditDebtorsView" class="space-y-3">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div class="p-3 border-b border-slate-800">
                <input type="text" oninput="SchoolCreditManager.searchQuery = this.value; SchoolCreditManager.renderSchoolDebtorsTable()" placeholder="🔍 Search school name or code..." class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500">
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-800/60 text-slate-400 text-[11px]">
                    <tr>
                      <th class="px-3 py-2.5 text-left">School / Code</th>
                      <th class="px-3 py-2.5 text-left">Phone</th>
                      <th class="px-3 py-2.5 text-right">Credit Limit</th>
                      <th class="px-3 py-2.5 text-right">Balance Due</th>
                      <th class="px-3 py-2.5 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="schoolDebtorsTableBody" class="divide-y divide-slate-800/60">
                    <tr><td colspan="5" class="text-center py-8 text-slate-500">Loading...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <!-- School History Table -->
          <div id="schoolCreditHistoryView" class="space-y-3 hidden">
            <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <div class="p-3 border-b border-slate-800 flex gap-2 items-center flex-wrap">
                <input type="date" id="schoolHistoryFromDate" class="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-sky-500">
                <span class="text-slate-500 text-xs">to</span>
                <input type="date" id="schoolHistoryToDate" class="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs text-slate-200 outline-none focus:border-sky-500">
                <button onclick="SchoolCreditManager.renderSchoolHistoryTable()" class="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-xs font-bold transition">Filter</button>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead class="bg-slate-800/60 text-slate-400 text-[11px]">
                    <tr>
                      <th class="px-3 py-2.5 text-left">Date</th>
                      <th class="px-3 py-2.5 text-left">School</th>
                      <th class="px-3 py-2.5 text-left">Type</th>
                      <th class="px-3 py-2.5 text-right">Amount</th>
                      <th class="px-3 py-2.5 text-left">Reference</th>
                    </tr>
                  </thead>
                  <tbody id="schoolHistoryTableBody" class="divide-y divide-slate-800/60">
                    <tr><td colspan="5" class="text-center py-8 text-slate-500">Select date range and filter</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

'@

if ($html.Contains('tabView_schoolcredit')) {
    Write-Host "  [~] School tab body already exists" -ForegroundColor Yellow
} else {
    $settingsMarker = '        <!-- =====================================================================
             VIEW 9: SETTINGS & BACKUP'
    if ($html.Contains($settingsMarker)) {
        $html = $html.Replace($settingsMarker, $schoolTabBody + $settingsMarker)
        Write-Host "  [+] School Credit tab body added" -ForegroundColor Green
        $changed++
    } else {
        $altMarker = '<div id="tabView_settings"'
        if ($html.Contains($altMarker)) {
            $html = $html.Replace($altMarker, $schoolTabBody + '        ' + $altMarker)
            Write-Host "  [+] School Credit tab body added (alt)" -ForegroundColor Green
            $changed++
        } else {
            Write-Host "  [-] Could not find settings view marker" -ForegroundColor Red
        }
    }
}

# =========================================================
# 4. Add all new Modals before thermalReceiptPrintArea
# =========================================================
$modalsHtml = @'

  <!-- MODAL: Direct Credit Entry -->
  <div id="directCreditModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-sm bg-slate-900 border border-sky-700/60 rounded-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div>
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5"><span>➕</span> <span>Direct Credit Entry (ඍජු ණය)</span></h3>
          <div id="directCreditCustName" class="text-xs text-sky-400 font-mono mt-0.5"></div>
        </div>
        <button onclick="document.getElementById('directCreditModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <form id="directCreditForm" onsubmit="CustomerManager.saveDirectCredit(event); return false;" class="space-y-3 text-xs">
        <input type="hidden" id="directCreditCustId" value="">
        <div>
          <label class="block text-slate-400 mb-1">Amount (මුදල) *</label>
          <input type="number" id="directCreditAmountInput" min="0.01" step="0.01" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 text-sm font-bold" placeholder="0.00">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Date (දිනය)</label>
          <input type="date" id="directCreditDateInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Reference (යොමු)</label>
          <input type="text" id="directCreditRefInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="Invoice ref, note...">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Notes (විස්තර)</label>
          <textarea id="directCreditNotesInput" rows="2" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 resize-none" placeholder="Additional notes..."></textarea>
        </div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition cursor-pointer">ණය දමන්න (Add Credit)</button>
          <button type="button" onclick="document.getElementById('directCreditModal').classList.add('hidden')" class="w-1/3 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Customer Statement -->
  <div id="customerStatementModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-3xl bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5"><span>📋</span> <span>Customer Statement (ගනුදෙනුකරු ලෙජරය)</span></h3>
          <div class="flex gap-4 mt-1 text-xs text-slate-400">
            <span>Name: <strong id="stmtCustName" class="text-slate-200"></strong></span>
            <span>Phone: <strong id="stmtCustPhone" class="text-sky-400"></strong></span>
            <span>Balance Due: <strong id="stmtCustDue" class="text-rose-400"></strong></span>
          </div>
        </div>
        <button onclick="document.getElementById('customerStatementModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <table class="w-full text-xs border-collapse">
          <thead class="bg-slate-800 text-slate-400 text-[11px] sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Ref No</th>
              <th class="px-3 py-2 text-left">Description</th>
              <th class="px-3 py-2 text-right">Charges</th>
              <th class="px-3 py-2 text-right">Payments</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody id="customerStatementTableBody" class="divide-y divide-slate-800/60 text-slate-300">
            <tr><td colspan="6" class="text-center py-6 text-slate-500">Loading...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-slate-800 flex gap-2 justify-end">
        <button type="button" onclick="CustomerManager.printCustomerStatementA4()" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"><span>🖨️</span> <span>Print A4 PDF</span></button>
        <button type="button" onclick="document.getElementById('customerStatementModal').classList.add('hidden')" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs">Close</button>
      </div>
    </div>
  </div>

  <!-- MODAL: School Statement -->
  <div id="schoolStatementModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-3xl bg-slate-900 border border-sky-700/60 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5"><span>🏫</span> <span>School Account Statement</span></h3>
          <div class="flex flex-wrap gap-4 mt-1 text-xs text-slate-400">
            <span>School: <strong id="stmtSchoolName" class="text-slate-200"></strong></span>
            <span>Code: <strong id="stmtSchoolCode" class="text-sky-400 font-mono"></strong></span>
            <span>Phone: <strong id="stmtSchoolPhone" class="text-slate-300"></strong></span>
            <span>Balance Due: <strong id="stmtSchoolDue" class="text-rose-400"></strong></span>
          </div>
        </div>
        <button onclick="document.getElementById('schoolStatementModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        <table class="w-full text-xs border-collapse">
          <thead class="bg-slate-800 text-slate-400 text-[11px] sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left">Date</th>
              <th class="px-3 py-2 text-left">Ref No</th>
              <th class="px-3 py-2 text-left">Description</th>
              <th class="px-3 py-2 text-right">Charges</th>
              <th class="px-3 py-2 text-right">Payments</th>
              <th class="px-3 py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody id="schoolStatementTableBody" class="divide-y divide-slate-800/60 text-slate-300">
            <tr><td colspan="6" class="text-center py-6 text-slate-500">Loading...</td></tr>
          </tbody>
        </table>
      </div>
      <div class="p-4 border-t border-slate-800 flex gap-2 justify-end">
        <button type="button" onclick="SchoolCreditManager.printSchoolStatementA4()" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"><span>🖨️</span> <span>Print A4 PDF</span></button>
        <button type="button" onclick="document.getElementById('schoolStatementModal').classList.add('hidden')" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs">Close</button>
      </div>
    </div>
  </div>

  <!-- MODAL: Add/Edit School Customer -->
  <div id="schoolCustomerModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-sm bg-slate-900 border border-sky-700/60 rounded-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <h3 id="schoolCustomerModalTitle" class="text-sm font-bold text-slate-100 flex items-center gap-1.5"><span>🏫</span> <span>Add School</span></h3>
        <button onclick="document.getElementById('schoolCustomerModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <form id="schoolCustomerForm" onsubmit="SchoolCreditManager.saveSchoolCustomer(event); return false;" class="space-y-3 text-xs">
        <input type="hidden" id="schoolCustIdInput" value="">
        <div>
          <label class="block text-slate-400 mb-1">School Name *</label>
          <input type="text" id="schoolCustNameInput" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="e.g. Richmond College">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">School Code (SKY Code) *</label>
          <input type="text" id="schoolCustCodeInput" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 font-mono uppercase" placeholder="e.g. SKY001">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Phone</label>
          <input type="tel" id="schoolCustPhoneInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="07X XXXXXXX">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Address</label>
          <input type="text" id="schoolCustAddressInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Credit Limit (Rs.)</label>
          <input type="number" id="schoolCustLimitInput" min="0" step="1" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="0 = no limit">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Opening Balance (Rs.)</label>
          <input type="number" id="schoolCustOpeningBalInput" min="0" step="0.01" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="0.00">
        </div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition cursor-pointer">Save School</button>
          <button type="button" onclick="document.getElementById('schoolCustomerModal').classList.add('hidden')" class="w-1/3 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold">Cancel</button>
        </div>
      </form>
    </div>
  </div>

  <!-- MODAL: Farmer Return -->
  <div id="farmerReturnModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-sm bg-slate-900 border border-emerald-700/60 rounded-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div>
          <h3 class="text-sm font-bold text-slate-100 flex items-center gap-1.5"><span>⬅️</span> <span>Farmer Return (ගොවි ආපසු)</span></h3>
          <div id="farmerReturnFarmerName" class="text-xs text-emerald-400 font-mono mt-0.5"></div>
        </div>
        <button onclick="document.getElementById('farmerReturnModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <form id="farmerReturnForm" onsubmit="FarmerManager.saveFarmerReturn(event); return false;" class="space-y-3 text-xs">
        <input type="hidden" id="farmerReturnFarmerId" value="">
        <input type="hidden" id="farmerReturnIntakeId" value="">
        <div>
          <label class="block text-slate-400 mb-1">Item / Vegetable (එළවළු)</label>
          <select id="farmerReturnVegSelect" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-emerald-500">
            <option value="">-- Select Item --</option>
          </select>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Weight / Qty *</label>
          <input type="number" id="farmerReturnWeightInput" min="0.01" step="0.01" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-emerald-500" placeholder="kg or units">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Rate per unit (Rs.) *</label>
          <input type="number" id="farmerReturnRateInput" min="0" step="0.01" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-emerald-500" placeholder="0.00">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Return Date</label>
          <input type="date" id="farmerReturnDateInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-emerald-500">
        </div>
        <div>
          <label class="block text-slate-400 mb-1">Reason (හේතුව)</label>
          <input type="text" id="farmerReturnReasonInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-emerald-500" placeholder="Damaged, excess...">
        </div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold transition cursor-pointer">ආපසු දෙන්න (Return)</button>
          <button type="button" onclick="document.getElementById('farmerReturnModal').classList.add('hidden')" class="w-1/3 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold">Cancel</button>
        </div>
      </form>
    </div>
  </div>

'@

if ($html.Contains('id="directCreditModal"')) {
    Write-Host "  [~] Modals already exist" -ForegroundColor Yellow
} else {
    $printMarker = '  <div id="thermalReceiptPrintArea"'
    if ($html.Contains($printMarker)) {
        $html = $html.Replace($printMarker, $modalsHtml + $printMarker)
        Write-Host "  [+] All modals injected" -ForegroundColor Green
        $changed++
    } else {
        Write-Host "  [-] Could not find thermalReceiptPrintArea marker" -ForegroundColor Red
    }
}

# =========================================================
# 5. Add schoolcredit permission row in settings
# =========================================================
$farmersPermRow = 'data-perm="farmers" class="perm-checkbox rounded bg-slate-900 border-slate-700 text-sky-500" />'
if ($html.Contains('data-perm="schoolcredit"')) {
    Write-Host "  [~] schoolcredit perm already exists" -ForegroundColor Yellow
} elseif ($html.Contains($farmersPermRow)) {
    $newRow = $farmersPermRow + '
              </td></tr>
              <tr class="border-t border-slate-800/60">
                <td class="px-3 py-2.5 text-slate-300 font-bold">🏫 School Credit</td>
                <td class="px-3 py-2.5 text-slate-400 text-[11px]">Manage school accounts and credit</td>
                <td class="px-3 py-2.5 text-center">
                  <input type="checkbox" data-perm="schoolcredit" class="perm-checkbox rounded bg-slate-900 border-slate-700 text-sky-500" />'
    # Only replace first occurrence (farmers perm checkbox in the perms table)
    $idx = $html.IndexOf($farmersPermRow)
    if ($idx -ge 0) {
        $html = $html.Substring(0, $idx) + $newRow + $html.Substring($idx + $farmersPermRow.Length)
        Write-Host "  [+] schoolcredit permission row added" -ForegroundColor Green
        $changed++
    }
} else {
    Write-Host "  [-] farmers perm row not found" -ForegroundColor Yellow
}

# =========================================================
# 6. Save updated index_dev.html
# =========================================================
[System.IO.File]::WriteAllText($devPath, $html, [System.Text.Encoding]::UTF8)
Write-Host ""
if ($changed -gt 0) {
    Write-Host "==========================================" -ForegroundColor Cyan
    Write-Host "  index_dev.html updated! ($changed changes)" -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Cyan
} else {
    Write-Host "  [!] No changes were needed (all already present)" -ForegroundColor Yellow
}
