$reportPath = "c:\Users\HP\OneDrive\Desktop\leopard\next-frontend\tmp-transcript-applypatch-report.txt"
$transcriptPath = "C:\Users\HP\AppData\Roaming\Code\User\workspaceStorage\9379645041711122175be5f074120737\GitHub.copilot-chat\transcripts\bf34e5a9-6743-4da5-8d76-8562760d285c.jsonl"
$root = "C:\Users\HP\OneDrive\Desktop\leopard\next-frontend"

if (-not (Test-Path $reportPath)) { Write-Error "Report not found"; exit }
$report = Import-Csv $reportPath
$transcriptLines = Get-Content $transcriptPath

$results = foreach ($row in $report) {
    if (-not $row.file.Contains("next-frontend")) { continue }
    
    $json = $transcriptLines[[int]$row.latestLine - 1] | ConvertFrom-Json
    $input = $json.data.arguments.input
    if (!$input) { continue }

    $sections = [regex]::Split($input, "\*\*\* Update File: ")
    $relevantPatch = ""
    foreach ($section in $sections) {
        if ([string]::IsNullOrWhiteSpace($section)) { continue }
        $sLines = $section -split "`r?`n"
        if ($row.file.ToLower().EndsWith($sLines[0].Trim().ToLower())) {
            $relevantPatch = $section
            break
        }
    }
    if (!$relevantPatch) { continue }
    
    $adds = $relevantPatch -split "`r?`n" | Select-Object -Skip 1 | Where-Object { 
        $_.StartsWith("+") -and -not $_.StartsWith("+++") -and $_.Substring(1).Trim().Length -gt 5 -and -not ($_.Substring(1).Trim() -match "^(//|/\*|\*|\{?\}?;?$)")
    } | ForEach-Object { $_.Substring(1).Trim() } | Select-Object -Unique
    
    if (-not $adds) { continue }
    
    $rel = $row.file -replace ".*next-frontend[/\\]", ""
    $p = Join-Path $root $rel
    if (-not (Test-Path $p)) {
        [PSCustomObject]@{ File = $row.file; Checked = ($adds | Measure-Object).Count; Found = 0; Missing = ($adds | Measure-Object).Count; Sample = $adds | Select-Object -First 4 }
        continue
    }
    
    $txt = Get-Content $p -Raw
    $miss = $adds | Where-Object { -not $txt.Contains($_) }
    if (($miss | Measure-Object).Count -gt 0) {
        [PSCustomObject]@{ File = $row.file; Checked = ($adds | Measure-Object).Count; Found = ($adds | Measure-Object).Count - ($miss | Measure-Object).Count; Missing = ($miss | Measure-Object).Count; Sample = $miss | Select-Object -First 4 }
    }
}

if ($results) {
    $results | Format-Table File, Checked, Found, Missing
    foreach ($r in $results) {
        Write-Host "`nMissing: $($r.File)" -ForegroundColor Yellow
        $r.Sample | ForEach-Object { Write-Host "  - $_" }
    }
} else {
    Write-Host "All verified."
}
