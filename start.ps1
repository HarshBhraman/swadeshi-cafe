$port = 3000

Write-Host "Cleaning up old server..."

Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
  Select-Object OwningProcess -Unique |
  ForEach-Object {
    if ($_.OwningProcess -gt 0) {
      Write-Host "  Stopping process on port $port (PID $($_.OwningProcess))"
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }

Get-CimInstance Win32_Process -Filter "name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*server.js*' } |
  ForEach-Object {
    Write-Host "  Stopping node server (PID $($_.ProcessId))"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Get-CimInstance Win32_Process -Filter "name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*wwebjs_auth*' } |
  ForEach-Object {
    Write-Host "  Stopping stuck WhatsApp Chrome (PID $($_.ProcessId))"
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

Start-Sleep -Seconds 2

Write-Host ""
Write-Host "Starting Swadeshii server..."
Write-Host "  Website:  http://localhost:$port"
Write-Host "  WhatsApp: http://localhost:$port/whatsapp-setup.html"
Write-Host ""

node server.js
