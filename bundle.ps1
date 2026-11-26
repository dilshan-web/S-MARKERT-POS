# LankaPOS Bundle Generator
# Merges individual JS files and styles.css into index.html and test_bundle.js
param()

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

$indexPath = Join-Path $rootDir "index.html"
if (-not (Test-Path $indexPath)) {
    Write-Host "[X] index.html not found in $rootDir" -ForegroundColor Red
    exit 1
}

$jsFiles = @(
    'db.js',
    'auth.js',
    'i18n.js',
    'audio.js',
    'scale.js',
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

Write-Host "[*] Reading separate JavaScript files..." -ForegroundColor Cyan
$bundleBuilder = [System.Text.StringBuilder]::new()

foreach ($f in $jsFiles) {
    $filePath = Join-Path $rootDir $f
    if (Test-Path $filePath) {
        $content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
        [void]$bundleBuilder.AppendLine("// ==================== js\$f ====================")
        [void]$bundleBuilder.AppendLine("")
        [void]$bundleBuilder.AppendLine($content)
        [void]$bundleBuilder.AppendLine("")
        Write-Host "  [+] Included $f" -ForegroundColor Green
    } else {
        Write-Host "  [-] Warning: $f not found!" -ForegroundColor Yellow
    }
}

$bundledJs = $bundleBuilder.ToString()

# Save to test_bundle.js as well
$testBundlePath = Join-Path $rootDir "test_bundle.js"
[System.IO.File]::WriteAllText($testBundlePath, $bundledJs, [System.Text.Encoding]::UTF8)
Write-Host "[+] Saved test_bundle.js" -ForegroundColor Green

# Read index.html
$indexContent = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)

# Update styles.css if present
$stylesPath = Join-Path $rootDir "styles.css"
if (Test-Path $stylesPath) {
    $css = [System.IO.File]::ReadAllText($stylesPath, [System.Text.Encoding]::UTF8)
    $stylePattern = '(?s)<style id="bundled-styles">.*?</style>'
    $styleReplacement = "<style id=`"bundled-styles`">`n$css`n</style>"
    $indexContent = [System.Text.RegularExpressions.Regex]::Replace($indexContent, $stylePattern, $styleReplacement)
    Write-Host "[+] Updated bundled CSS styles in index.html" -ForegroundColor Green
}

# Replace the giant script block
$scriptPattern = '(?s)<!-- All-in-one Standalone Application Bundle for Cloud & Offline Cross-device Support -->\s*<script>.*?</script>\s*</body>'
$scriptReplacement = "<!-- All-in-one Standalone Application Bundle for Cloud & Offline Cross-device Support -->`n  <script>`n$bundledJs`n  </script>`n</body>"

if ([System.Text.RegularExpressions.Regex]::IsMatch($indexContent, $scriptPattern)) {
    $indexContent = [System.Text.RegularExpressions.Regex]::Replace($indexContent, $scriptPattern, $scriptReplacement)
    [System.IO.File]::WriteAllText($indexPath, $indexContent, [System.Text.Encoding]::UTF8)
    Write-Host "[OK] index.html successfully updated with latest changes!" -ForegroundColor Green
} else {
    Write-Host "[!] Could not match the bundle marker in index.html. Checking fallback..." -ForegroundColor Yellow
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Bundle build complete! You can now run start_pos.bat" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
