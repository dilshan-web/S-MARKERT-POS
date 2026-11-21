# rebuild_all.ps1 - Perfectly build index.html, index_dev.html, and index_standalone.html
param()

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

Write-Host "[*] Reading index.html base..." -ForegroundColor Cyan
$indexPath = Join-Path $rootDir "index.html"
$fullIndex = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)

# Extract HTML before script tags
$markers = @(
    "<!-- All-in-one Standalone Application Bundle",
    "<!-- Clean Modular PWA Scripts",
    "<!-- Production & GitHub Pages",
    "<!-- Development Mode: Direct Modular Scripts",
    "<script src=""./dexie.min.js"">"
)
$markerIdx = -1
foreach ($m in $markers) {
    $idx = $fullIndex.IndexOf($m)
    if ($idx -gt 0 -and ($markerIdx -lt 0 -or $idx -lt $markerIdx)) {
        $markerIdx = $idx
    }
}

if ($markerIdx -lt 0) {
    Write-Host "[X] Could not find script marker in index.html!" -ForegroundColor Red
    exit 1
}

$baseHtml = $fullIndex.Substring(0, $markerIdx).TrimEnd()

# =========================================================================
# 1. Enhance School Credit tab with "දෙමාපියන් එළවළු ණයට ගැනීම" button
#    & Rename "Add School" to "පාසල් පාරිභෝගිකයෙකු එක් කරන්න"
# =========================================================================
$oldSchoolBtns = '<button onclick="SchoolCreditManager.openAddSchoolModal()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">'
$newSchoolBtns = @'
<button onclick="SchoolCreditManager.openSchoolMealCreditModal()" class="px-4 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl text-xs font-black shadow-lg shadow-amber-600/30 transition flex items-center gap-1.5 cursor-pointer">
                <span>🥕</span> <span>දෙමාපියන් එළවළු ණයට ගැනීම (School Meal Credit)</span>
              </button>
              <button onclick="SchoolCreditManager.openAddSchoolModal()" class="px-3.5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer">
'@

if (-not $baseHtml.Contains("SchoolCreditManager.openSchoolMealCreditModal()")) {
    $baseHtml = $baseHtml.Replace($oldSchoolBtns, $newSchoolBtns)
    Write-Host "  [+] Added School Meal Credit button in School Credit tab" -ForegroundColor Green
}

$oldAddSchoolSpan = '<span>➕</span> <span>Add School</span>'
$newAddSchoolSpan = '<span>➕</span> <span>පාසල් පාරිභෝගිකයෙකු එක් කරන්න (Add Customer)</span>'
if ($baseHtml.Contains($oldAddSchoolSpan)) {
    $baseHtml = $baseHtml.Replace($oldAddSchoolSpan, $newAddSchoolSpan)
    Write-Host "  [+] Renamed School Credit button to 'පාසල් පාරිභෝගිකයෙකු එක් කරන්න'" -ForegroundColor Green
}

# =========================================================================
# 2. Enhance Farmer History with Vegetable Items Ledger
# =========================================================================
$oldFarmerHistoryMarker = '<div id="farmerView_history" class="farmer-sub-view hidden space-y-4">'
$newFarmerHistoryHeader = @'
<div id="farmerView_history" class="farmer-sub-view hidden space-y-4">
            
            <!-- Sub-tab Toggle Bar: Slips vs Vegetable Ledger -->
            <div class="p-2.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 flex-wrap">
              <div class="flex items-center gap-2">
                <button type="button" id="farmerHistTab_slips" onclick="FarmerManager.switchHistoryView('slips')"
                        class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 bg-sky-600 text-white shadow-md shadow-sky-600/30">
                  <span>📋</span> <span>බිල්පත් අනුව (By Intake Slips)</span>
                </button>
                <button type="button" id="farmerHistTab_veg" onclick="FarmerManager.switchHistoryView('vegetables')"
                        class="px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 text-slate-400 hover:text-white hover:bg-slate-800">
                  <span>🥕</span> <span>එළවළු අනුව සවිස්තර මිල හා බර ඉතිහාසය (Vegetables Price &amp; Weight Ledger)</span>
                </button>
              </div>
              <div class="text-[11px] text-slate-400 font-medium">
                <span>🌾 ගොවීන්ගෙන් ගත් එළවළු, එදා ගත් මිල, බර සහ දින ඉතිහාසය</span>
              </div>
            </div>

            <!-- VIEW 3.1: INTAKE SLIPS TABLE -->
            <div id="farmerHistorySlipsView" class="space-y-4">
'@

if (-not $baseHtml.Contains("farmerHistTab_slips")) {
    $baseHtml = $baseHtml.Replace($oldFarmerHistoryMarker, $newFarmerHistoryHeader)
    
    $paymentsMarker = '<!-- =====================================================================
               SUB-VIEW 4: PAYMENTS LEDGER (ගෙවීම් ලෙජරය)'
    
    $vegLedgerViewHtml = @'
            </div>

            <!-- VIEW 3.2: VEGETABLE ITEMS PRICE & WEIGHT LEDGER -->
            <div id="farmerHistoryVegView" class="hidden space-y-4">
              <!-- KPI Summary Cards -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div class="text-[11px] text-slate-400 mb-0.5">මුළු එළවළු බර (Total Weight)</div>
                  <div id="vegLedgerTotalWeight" class="text-xl font-black text-sky-400 font-mono">0.00 kg</div>
                </div>
                <div class="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div class="text-[11px] text-slate-400 mb-0.5">සාමාන්‍ය ගත් මිල (Avg Buying Rate)</div>
                  <div id="vegLedgerAvgPrice" class="text-xl font-black text-amber-400 font-mono">Rs. 0.00 / kg</div>
                </div>
                <div class="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div class="text-[11px] text-slate-400 mb-0.5">මුළු වටිනාකම (Total Cost)</div>
                  <div id="vegLedgerTotalCost" class="text-xl font-black text-emerald-400 font-mono">Rs. 0.00</div>
                </div>
                <div class="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl">
                  <div class="text-[11px] text-slate-400 mb-0.5">සටහන් ගණන (Records)</div>
                  <div id="vegLedgerRowCount" class="text-xl font-black text-slate-200 font-mono">0</div>
                </div>
              </div>

              <!-- Filter Bar -->
              <div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="flex-1 max-w-sm">
                  <input type="text" oninput="FarmerManager.vegSearchQuery = this.value; FarmerManager.renderVegetablesLedgerTable()"
                         placeholder="🔍 එළවළු නම සොයන්න (උදා: කැරට්, බෝංචි, ලීක්ස්)..."
                         class="w-full p-2.5 bg-slate-950 border border-slate-700 rounded-xl text-slate-100 text-xs font-bold outline-none focus:border-amber-500" />
                </div>
                <div class="flex flex-wrap items-center gap-2">
                  <div class="flex items-center gap-1 text-xs text-slate-400">
                    <span>සිට:</span>
                    <input type="date" onchange="FarmerManager.vegFilterFromDate = this.value; FarmerManager.renderVegetablesLedgerTable()"
                           class="p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono" />
                  </div>
                  <div class="flex items-center gap-1 text-xs text-slate-400">
                    <span>දක්වා:</span>
                    <input type="date" onchange="FarmerManager.vegFilterToDate = this.value; FarmerManager.renderVegetablesLedgerTable()"
                           class="p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono" />
                  </div>
                  <select id="vegHistoryFarmerFilter" onchange="FarmerManager.vegFilterFarmerId = this.value; FarmerManager.renderVegetablesLedgerTable()"
                          class="p-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-bold max-w-[180px]">
                    <option value="all">සියලුම ගොවීන් (All Farmers)</option>
                  </select>
                </div>
              </div>

              <!-- Vegetable Ledger Table -->
              <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div class="overflow-x-auto">
                  <table class="w-full text-left text-xs">
                    <thead class="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800">
                      <tr>
                        <th class="p-3">දිනය / වේලාව</th>
                        <th class="p-3">ගොවියා (Farmer)</th>
                        <th class="p-3">එළවළු වර්ගය (Item)</th>
                        <th class="p-3 text-right">බර (Weight)</th>
                        <th class="p-3 text-right">එදා ගත් මිල (Buying Rate)</th>
                        <th class="p-3 text-right">මුළු වටිනාකම</th>
                        <th class="p-3">ස්ලිප් අංකය</th>
                        <th class="p-3 text-right">ක්‍රියාකාරකම්</th>
                      </tr>
                    </thead>
                    <tbody id="farmerVegLedgerTableBody" class="divide-y divide-slate-800/60 font-mono">
                      <tr>
                        <td colspan="8" class="text-center py-8 text-slate-500 font-sans">දත්ත පූරණය වෙමින් පවතී (Loading)...</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>

          <!-- =====================================================================
               SUB-VIEW 4: PAYMENTS LEDGER (ගෙවීම් ලෙජරය)
'@

    $payIdx = $baseHtml.IndexOf($paymentsMarker)
    if ($payIdx -gt 0) {
        $subStr = $baseHtml.Substring(0, $payIdx)
        $lastDivIdx = $subStr.LastIndexOf('</div>')
        if ($lastDivIdx -gt 0) {
            $baseHtml = $baseHtml.Substring(0, $lastDivIdx) + $vegLedgerViewHtml + $baseHtml.Substring($payIdx + $paymentsMarker.Length)
            Write-Host "  [+] Added Vegetable Items Price & Weight Ledger in Farmer History" -ForegroundColor Green
        }
    }
}

# =========================================================================
# 3. Add the 2 new modals before thermalReceiptPrintArea
# =========================================================================
$newModalsHtml = @'

  <!-- ================================================================
       MODAL: School Meal Vegetable Credit (කෑම උයන දෙමාපියන් එළවළු ණයට ගැනීම)
       ================================================================ -->
  <div id="schoolMealCreditModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-md bg-slate-900 border border-amber-600/70 rounded-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <div>
          <h3 class="text-sm font-black text-amber-300 flex items-center gap-1.5">
            <span>🥕</span> <span>පාසල් දිවා ආහාර එළවළු ණය (School Meal Credit)</span>
          </h3>
          <p class="text-[11px] text-slate-400 mt-0.5">කෑම උයන දෙමාපියන් ණයට ගෙනියන එළවළු සටහන් කිරීම</p>
        </div>
        <button onclick="document.getElementById('schoolMealCreditModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <form id="schoolMealCreditForm" onsubmit="SchoolCreditManager.saveSchoolMealCredit(event); return false;" class="space-y-3.5 text-xs">
        <input type="hidden" id="mealCreditSchoolId" value="">
        
        <div>
          <label class="block text-slate-300 font-bold mb-1">පාසල (School Account) *</label>
          <select id="mealCreditSchoolSelect" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-amber-500 font-bold">
            <option value="">-- පාසලක් තෝරන්න (Select School) --</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="block text-slate-300 font-bold mb-1">බාරගත් දෙමාපියන්ගේ නම *</label>
            <input type="text" id="mealCreditParentName" required placeholder="උදා: කමලා මෑණියන්"
                   class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 font-bold outline-none focus:border-amber-500">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">දුරකථන අංකය</label>
            <input type="tel" id="mealCreditParentPhone" placeholder="07X XXXXXXX"
                   class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-amber-500">
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2.5">
          <div>
            <label class="block text-slate-300 font-bold mb-1">දිනය (Date) *</label>
            <input type="date" id="mealCreditDate" required
                   class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-amber-500 font-mono">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">රිසිට්පත් / Slip අංකය</label>
            <input type="text" id="mealCreditRefNo" placeholder="SCH-MEAL-001"
                   class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-amber-500 font-mono text-[11px]">
          </div>
        </div>

        <div>
          <label class="block text-slate-300 font-bold mb-1">ගෙනියන එළවළු සහ බර විස්තරය *</label>
          <textarea id="mealCreditItemsDesc" rows="3" required placeholder="උදා: කැරට් 5kg, ලීක්ස් 3kg, අල 10kg, බෝංචි 2kg, වම්බටු 3kg"
                    class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-amber-500 resize-none font-medium leading-relaxed"></textarea>
          <div class="flex gap-1.5 mt-1 flex-wrap text-[10px]">
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('කැරට්')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ කැරට්</button>
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('ලීක්ස්')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ ලීක්ස්</button>
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('අල')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ අල</button>
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('බෝංචි')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ බෝංචි</button>
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('වට්ටක්කා')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ වට්ටක්කා</button>
            <button type="button" onclick="SchoolCreditManager.appendQuickVeg('ගෝවා')" class="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-amber-300 rounded border border-slate-700 cursor-pointer">+ ගෝවා</button>
          </div>
        </div>

        <div>
          <label class="block text-slate-300 font-bold mb-1">මුළු ණය මුදල (Total Credit Amount Rs.) *</label>
          <div class="relative">
            <span class="absolute left-3 top-2.5 text-amber-400 font-bold font-mono">Rs.</span>
            <input type="number" id="mealCreditAmount" min="0.01" step="0.01" required placeholder="0.00"
                   class="w-full pl-10 pr-3 py-2.5 bg-slate-800 border-2 border-amber-600/70 rounded-xl text-amber-300 font-mono font-black text-base outline-none focus:border-amber-400">
          </div>
        </div>

        <div class="flex items-center gap-2 pt-1">
          <input type="checkbox" id="mealCreditPrintSlip" checked class="w-4 h-4 rounded text-amber-600 bg-slate-800 border-slate-700">
          <label for="mealCreditPrintSlip" class="text-xs text-slate-300 font-bold cursor-pointer">
            🖨️ දෙමාපියන්ට දීමට රිසිට්පත මුද්‍රණය කරන්න (Print Receipt Slip)
          </label>
        </div>

        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-xl font-extrabold shadow-lg shadow-amber-600/30 transition cursor-pointer text-xs">
            💾 ණය සටහන් කරන්න (Save Credit)
          </button>
          <button type="button" onclick="document.getElementById('schoolMealCreditModal').classList.add('hidden')" class="w-1/3 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs cursor-pointer">
            අවලංගුයි
          </button>
        </div>
      </form>
    </div>
  </div>

  <!-- ================================================================
       MODAL: Farmer Intake Slip Details (ගොවි එළවළු බාරගැනීමේ සවිස්තර පත්‍රිකාව)
       ================================================================ -->
  <div id="farmerIntakeDetailModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-2xl bg-slate-900 border border-slate-700/60 rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
      <div class="flex items-center justify-between p-5 border-b border-slate-800">
        <div>
          <h3 class="text-sm font-black text-slate-100 flex items-center gap-1.5">
            <span>🌾</span> <span>ගොවි එළවළු බාරගැනීමේ විස්තරය (Farmer Intake Details)</span>
          </h3>
          <div class="flex flex-wrap gap-3 mt-1 text-xs text-slate-400">
            <span>ස්ලිප් අංකය: <strong id="intakeDetailSlipNo" class="text-sky-400 font-mono"></strong></span>
            <span>දිනය: <strong id="intakeDetailDate" class="text-slate-200 font-mono"></strong></span>
            <span>ගොවියා: <strong id="intakeDetailFarmer" class="text-amber-300 font-bold"></strong></span>
            <span>කැෂියර්: <strong id="intakeDetailStaff" class="text-slate-400 font-mono"></strong></span>
          </div>
        </div>
        <button onclick="document.getElementById('farmerIntakeDetailModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4">
        <table class="w-full text-xs border-collapse">
          <thead class="bg-slate-800 text-slate-400 text-[11px] sticky top-0">
            <tr>
              <th class="p-2.5 text-left">#</th>
              <th class="p-2.5 text-left">එළවළු වර්ගය (Item Name)</th>
              <th class="p-2.5 text-right">බර (Weight)</th>
              <th class="p-2.5 text-right">ගත් මිල / kg (Buying Rate)</th>
              <th class="p-2.5 text-right">මුළු මුදල (Line Total)</th>
              <th class="p-2.5 text-right">විකුණුම් මිල (Retail)</th>
            </tr>
          </thead>
          <tbody id="intakeDetailItemsTableBody" class="divide-y divide-slate-800/60 text-slate-200 font-mono">
            <tr><td colspan="6" class="text-center py-6 text-slate-500">Loading...</td></tr>
          </tbody>
        </table>

        <!-- Summary Totals Card -->
        <div class="mt-4 p-3 bg-slate-950/70 border border-slate-800 rounded-2xl flex items-center justify-between flex-wrap gap-3 text-xs">
          <div>
            <span class="text-slate-400">මුළු බිල්පත් වටිනාකම:</span>
            <span id="intakeDetailGrandTotal" class="font-mono font-black text-slate-100 text-sm ml-1"></span>
          </div>
          <div>
            <span class="text-slate-400">ගෙවූ මුදල (Paid):</span>
            <span id="intakeDetailPaid" class="font-mono font-bold text-emerald-400 ml-1"></span>
          </div>
          <div>
            <span class="text-slate-400">හිඟ ශේෂය (Balance Due):</span>
            <span id="intakeDetailBalance" class="font-mono font-black text-amber-400 text-sm ml-1"></span>
          </div>
        </div>
      </div>

      <div class="p-4 border-t border-slate-800 flex gap-2 justify-end">
        <button type="button" id="intakeDetailPrintBtn" class="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold text-xs flex items-center gap-1.5 transition cursor-pointer">
          <span>🖨️</span> <span>රිසිට්පත මුද්‍රණය (Print Slip)</span>
        </button>
        <button type="button" onclick="document.getElementById('farmerIntakeDetailModal').classList.add('hidden')" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs">
          වසන්න (Close)
        </button>
      </div>
    </div>
  </div>
'@

$printAreaMarker = '<div id="thermalReceiptPrintArea"'
if (-not $baseHtml.Contains("schoolMealCreditModal")) {
    $baseHtml = $baseHtml.Replace($printAreaMarker, $newModalsHtml + "`n  " + $printAreaMarker)
    Write-Host "  [+] Injected schoolMealCreditModal & farmerIntakeDetailModal" -ForegroundColor Green
}

# =========================================================================
# 4. Clean Login Form (Remove 3 quick buttons as requested & ensure pure white input text)
# =========================================================================
$quickLoginButtonsBlock = @'
        <!-- Quick One-Click Role Login Shortcuts -->
        <div class="w-full mt-3 pt-3 border-t border-slate-800 text-center">
          <div class="text-[11px] text-slate-400 mb-2 font-medium">ක්ෂණිකව ඇතුල් වන්න (Quick One-Click Login):</div>
          <div class="grid grid-cols-3 gap-1.5 text-xs">
            <button type="button" onclick="quickFillLogin('admin', 'admin')" class="py-1.5 px-2 bg-slate-800 hover:bg-sky-600 text-sky-300 hover:text-white rounded-lg font-bold border border-slate-700 transition cursor-pointer">
              👑 Admin
            </button>
            <button type="button" onclick="quickFillLogin('manager', 'manager123')" class="py-1.5 px-2 bg-slate-800 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg font-bold border border-slate-700 transition cursor-pointer">
              💼 Manager
            </button>
            <button type="button" onclick="quickFillLogin('cashier1', 'cashier123')" class="py-1.5 px-2 bg-slate-800 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg font-bold border border-slate-700 transition cursor-pointer">
              🛒 Cashier
            </button>
          </div>
          <div class="text-[10px] text-slate-500 mt-2">
            PIN: Admin <strong>9999</strong> &bull; Manager <strong>4321</strong> &bull; Cashier <strong>1234</strong>
          </div>
        </div>
'@

if ($baseHtml.Contains($quickLoginButtonsBlock)) {
    $baseHtml = $baseHtml.Replace($quickLoginButtonsBlock, '')
    Write-Host "  [-] Removed 3 Quick One-Click Login buttons from Login Form as requested" -ForegroundColor Yellow
}

# Ensure input text is bright white and crystal clear
$oldLoginU = 'id="loginUsernameInput" type="text" data-i18n-placeholder="usernamePlaceholder" placeholder="Username / PIN"'
$newLoginU = 'id="loginUsernameInput" type="text" data-i18n-placeholder="usernamePlaceholder" placeholder="Username / PIN" style="color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; background-color: #020617 !important; font-size: 13px !important;"'
if ($baseHtml.Contains($oldLoginU)) {
    $baseHtml = $baseHtml.Replace($oldLoginU, $newLoginU)
}

$oldLoginP = 'id="loginPasswordInput" type="password" placeholder="••••••••"'
$newLoginP = 'id="loginPasswordInput" type="password" placeholder="••••••••" style="color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; background-color: #020617 !important; font-size: 13px !important;"'
if ($baseHtml.Contains($oldLoginP)) {
    $baseHtml = $baseHtml.Replace($oldLoginP, $newLoginP)
}

# Add autofill fix in <head>
$autofillCss = @'
<style>
input#loginUsernameInput, input#loginPasswordInput {
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  background-color: #020617 !important;
}
input#loginUsernameInput:-webkit-autofill,
input#loginPasswordInput:-webkit-autofill {
  -webkit-text-fill-color: #ffffff !important;
  -webkit-box-shadow: 0 0 0px 1000px #020617 inset !important;
  transition: background-color 5000s ease-in-out 0s;
}
</style>
</head>
'@

if (-not $baseHtml.Contains("input#loginUsernameInput:-webkit-autofill")) {
    $baseHtml = $baseHtml.Replace('</head>', $autofillCss)
    Write-Host "  [+] Injected login input autofill & high-contrast styling" -ForegroundColor Green
}

# =========================================================================
# 5. Customer-centric School Customer Modal & POS Filter
# =========================================================================
# 5.1 Replace old schoolCustomerModal with customer-centric modal
$oldSchoolModalMarker = '<div id="schoolCustomerModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">'
$newSchoolModalHtml = @'
  <div id="schoolCustomerModal" class="app-modal fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="w-full max-w-sm bg-slate-900 border border-sky-700/60 rounded-3xl p-6 shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
        <h3 id="schoolCustomerModalTitle" class="text-sm font-bold text-slate-100 flex items-center gap-1.5">
          <span>🏫</span> <span>පාසල් පාරිභෝගිකයෙකු එක් කිරීම (Add School Customer)</span>
        </h3>
        <button onclick="document.getElementById('schoolCustomerModal').classList.add('hidden')" class="text-slate-400 hover:text-white text-lg">&times;</button>
      </div>
      <form id="schoolCustomerForm" onsubmit="SchoolCreditManager.saveSchoolCustomer(event); return false;" class="space-y-3 text-xs">
        <input type="hidden" id="schoolCustIdInput" value="">
        <div>
          <label class="block text-slate-300 font-bold mb-1">පාරිභෝගිකයාගේ / බාරකරුගේ නම (Customer / Guardian Name) *</label>
          <input type="text" id="schoolCustNameInput" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 font-bold outline-none focus:border-sky-500" placeholder="උදා: කමලා පෙරේරා / සුනිල් ශාන්ත">
        </div>
        <div>
          <label class="block text-slate-300 font-bold mb-1">අදාළ පාසලේ නම (School / Meal Program) *</label>
          <input type="text" id="schoolCustSchoolNameInput" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-100 outline-none focus:border-sky-500" placeholder="උදා: රිච්මන්ඩ් විද්‍යාලය - දිවා ආහාර වැඩසටහන">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-slate-400 mb-1">කේතය (Code)</label>
            <input type="text" id="schoolCustCodeInput" required class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 font-mono uppercase" placeholder="SCH-001">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">දුරකථන අංකය</label>
            <input type="tel" id="schoolCustPhoneInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500" placeholder="07X XXXXXXX">
          </div>
        </div>
        <div>
          <label class="block text-slate-400 mb-1">ලිපිනය / විස්තර (Address)</label>
          <input type="text" id="schoolCustAddressInput" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500">
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <label class="block text-slate-400 mb-1">ණය සීමාව (Credit Limit Rs.)</label>
            <input type="number" id="schoolCustLimitInput" min="0" step="1" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 font-mono" placeholder="50000">
          </div>
          <div>
            <label class="block text-slate-400 mb-1">ආරම්භක ණය (Opening Bal Rs.)</label>
            <input type="number" id="schoolCustOpeningBalInput" min="0" step="0.01" class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-slate-200 outline-none focus:border-sky-500 font-mono" placeholder="0.00">
          </div>
        </div>
        <div class="flex gap-2 pt-2">
          <button type="submit" class="flex-1 py-2.5 bg-sky-600 hover:bg-sky-500 text-white rounded-xl font-bold transition cursor-pointer">
            💾 පාරිභෝගිකයා සුරකින්න (Save Customer)
          </button>
          <button type="button" onclick="document.getElementById('schoolCustomerModal').classList.add('hidden')" class="w-1/3 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold">
            අවලංගුයි
          </button>
        </div>
      </form>
    </div>
  </div>
'@

$oldSchoolModalFull = $baseHtml.IndexOf($oldSchoolModalMarker)
if ($oldSchoolModalFull -gt 0 -and -not $baseHtml.Contains('id="schoolCustSchoolNameInput"')) {
    $nextModalMarker = '<!-- ================================================================'
    $endIdx = $baseHtml.IndexOf($nextModalMarker, $oldSchoolModalFull + 10)
    if ($endIdx -gt 0) {
        $baseHtml = $baseHtml.Substring(0, $oldSchoolModalFull) + $newSchoolModalHtml + "`n`n  " + $baseHtml.Substring($endIdx)
        Write-Host "  [+] Updated schoolCustomerModal to Customer/School layout" -ForegroundColor Green
    }
}

# 5.2 Add Filter Pills inside posCustomerModal
$oldPosCustSelectMarker = '<div id="posCustomerSelectList" class="flex-1 overflow-y-auto space-y-2"></div>'
$newPosCustSelectWithPills = @'
      <!-- Quick Filter Pills: All vs School Customers -->
      <div class="flex items-center gap-1.5 pb-2 shrink-0 text-xs">
        <button type="button" id="posCustFilter_all" onclick="CustomerManager.openCustomerSelectModal('all')" class="px-3 py-1 bg-sky-600 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer">සියල්ල (All)</button>
        <button type="button" id="posCustFilter_school" onclick="CustomerManager.openCustomerSelectModal('school')" class="px-3 py-1 bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"><span>🏫</span> <span>පාසල් ණය (School Meals)</span></button>
      </div>

      <div id="posCustomerSelectList" class="flex-1 overflow-y-auto space-y-2"></div>
'@

if (-not $baseHtml.Contains("posCustFilter_school")) {
    $baseHtml = $baseHtml.Replace($oldPosCustSelectMarker, $newPosCustSelectWithPills)
    Write-Host "  [+] Added School Customer filter pills to POS Customer selection modal" -ForegroundColor Green
}

# =========================================================================
# 6. Prominent "බිල්පත් (Invoices)" Buttons:
#    - Left Sidebar (Direct Nav Button under POS Terminal)
#    - POS Cart Toolbar (Renamed from Returns to "බිල්පත් (Invoices) [F7]")
#    - Top Header Bar (Quick Access next to Language Toggle)
# =========================================================================

# 6.1 Sidebar Button under POS Terminal
$oldPosNavBtn = @'
          <!-- POS Terminal -->
          <button onclick="App.switchTab('pos')" data-tab="pos" class="nav-tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition bg-sky-600 text-white shadow-md shadow-sky-600/30 cursor-pointer">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <span class="hidden md:inline" data-i18n="posTerminal">POS Terminal</span>
          </button>
'@

$newPosNavWithInvoices = @'
          <!-- POS Terminal -->
          <button onclick="App.switchTab('pos')" data-tab="pos" class="nav-tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition bg-sky-600 text-white shadow-md shadow-sky-600/30 cursor-pointer">
            <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"/></svg>
            <span class="hidden md:inline" data-i18n="posTerminal">POS Terminal</span>
          </button>

          <!-- Quick Invoices View Button -->
          <button onclick="POSManager.openSalesHistoryModal()" class="nav-tab-btn w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer" title="නිකුත් කළ සියලුම බිල්පත් බලන්න (View All Past Invoices)">
            <svg class="w-5 h-5 shrink-0 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
            <span class="hidden md:inline">🧾 බිල්පත් (Invoices)</span>
          </button>
'@

if (-not $baseHtml.Contains("🧾 බිල්පත් (Invoices)")) {
    $baseHtml = $baseHtml.Replace($oldPosNavBtn, $newPosNavWithInvoices)
    Write-Host "  [+] Added Sidebar '🧾 බිල්පත් (Invoices)' button under POS Terminal" -ForegroundColor Green
}

# 6.2 Cart Toolbar Button rename
$oldCartReturnBtn = @'
                  <button onclick="POSManager.openSalesHistoryModal()" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] sm:text-xs font-semibold transition flex items-center gap-1">
                    <span>🔄</span> <span>Returns</span><span class="hidden md:inline"> (F7)</span>
                  </button>
'@

$newCartReturnBtn = @'
                  <button onclick="POSManager.openSalesHistoryModal()" class="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 border border-sky-700/80 text-sky-300 rounded-lg text-[11px] sm:text-xs font-bold transition flex items-center gap-1 shadow-sm" title="නිකුත් කළ සියලුම බිල්පත් බැලීම (View All Invoices [F7])">
                    <span>🧾</span> <span>බිල්පත් (Invoices)</span><span class="hidden md:inline"> (F7)</span>
                  </button>
'@

if ($baseHtml.Contains("<span>Returns</span><span class=""hidden md:inline""> (F7)</span>")) {
    $baseHtml = $baseHtml.Replace($oldCartReturnBtn, $newCartReturnBtn)
    Write-Host "  [+] Renamed Cart Toolbar button to '🧾 බිල්පත් (Invoices) (F7)'" -ForegroundColor Green
}

# 6.3 Top Header Bar Invoices Button
$oldHeaderLangBtn = '<!-- Language Switcher Button (English / සිංහල / Dual) -->'
$newHeaderInvoicesBtn = @'
<!-- Quick Invoices History Button -->
        <button onclick="POSManager.openSalesHistoryModal()" class="px-2.5 py-1 bg-sky-950 hover:bg-sky-900 border border-sky-700/80 text-sky-300 hover:text-white rounded-xl text-xs font-bold transition flex items-center gap-1 shadow-sm cursor-pointer" title="නිකුත් කළ සියලුම බිල්පත් බැලීම (View All Invoices [F7])">
          <span>🧾</span>
          <span class="hidden sm:inline">බිල්පත් (Invoices)</span>
        </button>

        <!-- Language Switcher Button (English / සිංහල / Dual) -->
'@

if (-not $baseHtml.Contains("title=""නිකුත් කළ සියලුම බිල්පත් බැලීම (View All Invoices [F7])""")) {
    $baseHtml = $baseHtml.Replace($oldHeaderLangBtn, $newHeaderInvoicesBtn)
    Write-Host "  [+] Added Top Header '🧾 බිල්පත් (Invoices)' button" -ForegroundColor Green
}

# =========================================================================
# 7. Clean Modular Scripts Block (For BOTH index.html and index_dev.html)
#    This makes GitHub Pages work 100% reliably without inline script parsing breaks!
# =========================================================================
$modularScripts = @'

  <!-- Clean Modular PWA Scripts (Works offline, on localhost and on GitHub Pages!) -->
  <script src="./dexie.min.js"></script>
  <script src="./db.js"></script>
  <script src="./auth.js"></script>
  <script src="./i18n.js"></script>
  <script src="./audio.js"></script>
  <script src="./pos.js"></script>
  <script src="./inventory.js"></script>
  <script src="./grn.js"></script>
  <script src="./customers.js"></script>
  <script src="./suppliers.js"></script>
  <script src="./farmers.js"></script>
  <script src="./schoolcredit.js"></script>
  <script src="./expenses.js"></script>
  <script src="./shifts.js"></script>
  <script src="./reports.js"></script>
  <script src="./backup.js"></script>
  <script src="./dashboard.js"></script>
  <script src="./app.js"></script>
</body>
</html>
'@

# Generate index.html (Primary entry for GitHub Pages & Web hosting)
$indexHtml = $baseHtml + "`n" + $modularScripts
[System.IO.File]::WriteAllText($indexPath, $indexHtml, [System.Text.Encoding]::UTF8)
Write-Host "[OK] index.html generated cleanly for GitHub Pages!" -ForegroundColor Green

# Generate index_dev.html (Identical development entry)
$devPath = Join-Path $rootDir "index_dev.html"
[System.IO.File]::WriteAllText($devPath, $indexHtml, [System.Text.Encoding]::UTF8)
Write-Host "[OK] index_dev.html generated cleanly!" -ForegroundColor Green

# =========================================================================
# 8. Generate test_bundle.js & index_standalone.html (Self-contained offline bundle)
# =========================================================================
$jsFiles = @(
    'db.js',
    'auth.js',
    'i18n.js',
    'audio.js',
    'pos.js',
    'inventory.js',
    'grn.js',
    'customers.js',
    'suppliers.js',
    'farmers.js',
    'schoolcredit.js',
    'expenses.js',
    'shifts.js',
    'reports.js',
    'backup.js',
    'dashboard.js',
    'app.js'
)

Write-Host "[*] Bundling all 17 JavaScript files for standalone mode..." -ForegroundColor Cyan
$bundleBuilder = [System.Text.StringBuilder]::new()

foreach ($f in $jsFiles) {
    $filePath = Join-Path $rootDir $f
    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
        # CRITICAL SAFETY: Escape any </script in strings so HTML parser never prematurely terminates
        $content = $content.Replace('</script', '<\/script')
        [void]$bundleBuilder.AppendLine("// ==================== js\$f ====================")
        [void]$bundleBuilder.AppendLine("")
        [void]$bundleBuilder.AppendLine($content)
        [void]$bundleBuilder.AppendLine("")
    }
}

$bundledJs = $bundleBuilder.ToString()

# Save test_bundle.js
$testBundlePath = Join-Path $rootDir "test_bundle.js"
[System.IO.File]::WriteAllText($testBundlePath, $bundledJs, [System.Text.Encoding]::UTF8)
Write-Host "[OK] test_bundle.js written cleanly!" -ForegroundColor Green

# Save index_standalone.html
$standalonePath = Join-Path $rootDir "index_standalone.html"
$standaloneHtml = $baseHtml + "`n" + @"

  <!-- Standalone All-in-one Single File Version -->
  <script>
$bundledJs
  </script>
</body>
</html>
"@
[System.IO.File]::WriteAllText($standalonePath, $standaloneHtml, [System.Text.Encoding]::UTF8)
Write-Host "[OK] index_standalone.html generated cleanly!" -ForegroundColor Green

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ALL BUILDS COMPLETE!" -ForegroundColor Green
Write-Host "  1. index.html          -> GitHub Pages & Production PWA (Clean Modular)" -ForegroundColor Yellow
Write-Host "  2. index_dev.html      -> Local Development" -ForegroundColor Yellow
Write-Host "  3. index_standalone.html -> Single File Offline Portable" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Cyan
