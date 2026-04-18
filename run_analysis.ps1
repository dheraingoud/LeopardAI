$p = 'C:\Users\HP\AppData\Roaming\Code\User\workspaceStorage\9379645041711122175be5f074120737\GitHub.copilot-chat\transcripts\bf34e5a9-6743-4da5-8d76-8562760d285c.jsonl'
$repo = (Get-Location).Path
$allStrings = New-Object System.Collections.Generic.List[string]
function Add-Strings([object]$v) {
  if ($null -eq $v) { return }
  if ($v -is [string]) { $allStrings.Add($v); return }
  if ($v -is [System.Collections.IDictionary]) {
    foreach ($k in $v.Keys) { Add-Strings $v[$k] }
    return
  }
  if ($v -is [System.Collections.IEnumerable] -and -not ($v -is [string])) {
    foreach ($i in $v) { Add-Strings $i }
  }
}
Get-Content -LiteralPath $p | ForEach-Object {
  try {
    $obj = $_ | ConvertFrom-Json -Depth 100
    Add-Strings $obj
  } catch {}
}
$diffTexts = $allStrings | Where-Object { $_ -match 'diff --git a/' }
$latestByFile = @{}
$order = 0
foreach ($txt in $diffTexts) {
  $sections = [regex]::Split($txt, '(?=diff --git a/)')
  foreach ($sec in $sections) {
    if ($sec -notmatch '^diff --git a/(.+?) b/(.+?)') { continue }
    $rawFile = $matches[2]
    $file = ($rawFile -replace '\\','/').Trim()
    $latestByFile[$file] = [pscustomobject]@{ order = $order; section = $sec; file = $file }
    $order++
  }
}
$skipPatterns = @('package-lock.json','bun.lock','.next/','node_modules/')
$results = New-Object System.Collections.Generic.List[object]
$sortedValues = $latestByFile.Values | Sort-Object order
foreach ($val in $sortedValues) {
  $file = $val.file
  $skip = $false
  foreach ($sp in $skipPatterns) { if ($file -like "*$sp*") { $skip = $true; break } }
  if ($skip) { continue }
  $sigLines = @()
  $lines = $val.section -split "\r?\n"
  foreach ($ln in $lines) {
    if ($ln.StartsWith('+++')) { continue }
    if ($ln.StartsWith('+')) {
      $s = $ln.Substring(1).Trim()
      if ([string]::IsNullOrWhiteSpace($s)) { continue }
      if ($s.Length -lt 8) { continue }
      if ($s -match '^//|^/\*|^\*|^\}$|^\{$') { continue }
      $sigLines += $s
    }
  }
  if ($sigLines.Count -eq 0) { continue }
  $uniqueSigs = $sigLines | Select-Object -Unique | Select-Object -First 8
  $abs = Join-Path $repo ($file -replace '/','\')
  $exists = Test-Path -LiteralPath $abs
  $found = 0
  if ($exists) {
    $content = Get-Content -LiteralPath $abs -Raw
    foreach ($sig in $uniqueSigs) {
      if ($content.Contains($sig)) { $found++ }
    }
  }
  $sigCount = ($uniqueSigs | Measure-Object).Count
  $miss = $sigCount - $found
  if ((-not $exists) -or ($miss -gt 0)) {
    $results.Add([pscustomobject]@{
      file = $file
      signaturesChecked = $sigCount
      foundCount = $found
      missingCount = $miss
      exists = $exists
    })
  }
}
$results | Sort-Object -Property @{Expression='missingCount';Descending=$true}, @{Expression='file';Descending=$false} | Select-Object -First 60 | Format-Table -AutoSize
