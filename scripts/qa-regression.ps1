param(
  [string]$BaseUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"

function Invoke-QaPost {
  param(
    [string]$Path,
    [hashtable]$Body
  )

  $uri = "$BaseUrl$Path"
  Write-Host "POST $uri"
  return Invoke-RestMethod -Method Post -Uri $uri -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 10)
}

Write-Host "Running QA regression checks against $BaseUrl" -ForegroundColor Yellow

$textResult = Invoke-QaPost -Path "/api/qa-chat" -Body @{
  prompt = "Return exactly: qa-ok"
  model = "llama-3-70b"
}
Write-Host "qa-chat model: $($textResult.model)"
Write-Host "qa-chat response: $($textResult.response)"

$imageResult = Invoke-QaPost -Path "/api/generate/image" -Body @{
  prompt = "minimalist leopard logo, monochrome"
  model = "sd-3.5-large"
  userId = "qa-script"
}
Write-Host "image url: $($imageResult.url)"

$videoJob = Invoke-QaPost -Path "/api/generate/video" -Body @{
  prompt = "A sphere falls and bounces on a soft surface"
  model = "cosmos-reason2-8b"
  userId = "qa-script"
}
Write-Host "video job status url: $($videoJob.statusUrl)"

Write-Host "QA regression script finished." -ForegroundColor Green
