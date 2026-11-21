# LankaPOS Local Development Server (Native Windows PowerShell)
param(
    [int]$Port = 8080
)

$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }

# Check if port is already in use
$conn = Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[!] Port $Port is in use. Trying port 8081..." -ForegroundColor Yellow
    $Port = 8081
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$Port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[X] Failed to start HTTP listener: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Make sure you run as normal user and no firewall blocks localhost."
    pause
    exit 1
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  LankaPOS Local Server is RUNNING!" -ForegroundColor Green
Write-Host "  URL: $prefix" -ForegroundColor Yellow
Write-Host "  Root: $rootDir"
Write-Host "  Press Ctrl+C in this window to stop the server." -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# Open in default browser or Chrome
$url = "$($prefix)index_dev.html"
$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $chromePath) {
    Start-Process $chromePath $url
} else {
    Start-Process $url
}

try {
    while ($listener.IsListening) {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $relPath = [System.Uri]::UnescapeDataString($request.Url.LocalPath.TrimStart('/'))
        if ([string]::IsNullOrEmpty($relPath)) { $relPath = "index_dev.html" }
        $targetFile = Join-Path $rootDir $relPath

        if (Test-Path $targetFile -PathType Leaf) {
            try {
                $bytes = [System.IO.File]::ReadAllBytes($targetFile)
                $ext = [System.IO.Path]::GetExtension($targetFile).ToLower()
                $mime = switch ($ext) {
                    ".html" { "text/html; charset=utf-8" }
                    ".htm"  { "text/html; charset=utf-8" }
                    ".js"   { "application/javascript; charset=utf-8" }
                    ".css"  { "text/css; charset=utf-8" }
                    ".json" { "application/json; charset=utf-8" }
                    ".svg"  { "image/svg+xml" }
                    ".png"  { "image/png" }
                    ".jpg"  { "image/jpeg" }
                    ".ico"  { "image/x-icon" }
                    default { "application/octet-stream" }
                }
                $response.ContentType = $mime
                $response.ContentLength64 = $bytes.Length
                $response.Headers.Add("Access-Control-Allow-Origin", "*")
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
            } catch {
                $response.StatusCode = 500
            }
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $relPath")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }
        $response.Close()
    }
} finally {
    $listener.Stop()
    Write-Host "[*] LankaPOS Local Server stopped." -ForegroundColor Yellow
}

