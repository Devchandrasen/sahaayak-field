$ErrorActionPreference = "Stop"

$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (-not (Test-Path $ollama)) {
  winget install --id Ollama.Ollama --exact --silent --accept-package-agreements --accept-source-agreements
}

$ollama = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
if (-not (Test-Path $ollama)) {
  throw "Ollama was not found after install."
}

try {
  Invoke-RestMethod "http://127.0.0.1:11434/api/version" | Out-Null
} catch {
  Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

& $ollama pull gemma4:e2b
& $ollama list
