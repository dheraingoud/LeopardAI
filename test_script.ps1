function Test-VideoJob {
    param($baseUrl)
    $headers = @{"Content-Type" = "application/json"}
    $payload = @{
        prompt = "A sphere falls and bounces on a soft surface"
        model = "cosmos-reason2-8b"
        userId = "qa-video"
    } | ConvertTo-Json

    Write-Host "1) POST /api/generate/video"
    $found404 = $false
    try {
        $genResponse = Invoke-WebRequest -Uri "$baseUrl/api/generate/video" -Method Post -Body $payload -Headers $headers -UseBasicParsing
        $genBody = $genResponse.Content | ConvertFrom-Json
        Write-Host "Status: $($genResponse.StatusCode)"
        Write-Host "Body: $($genResponse.Content)"

        if ($genBody.jobId) {
            $jobId = $genBody.jobId
            Write-Host "`nPolling /api/video-jobs/$jobId"
            for ($i = 1; $i -le 8; $i++) {
                Write-Host "Attempt $i..."
                try {
                    $pollResponse = Invoke-WebRequest -Uri "$baseUrl/api/video-jobs/$jobId" -Method Get -UseBasicParsing
                    $pollBody = $pollResponse.Content | ConvertFrom-Json
                    Write-Host "Status: $($pollResponse.StatusCode)"
                    Write-Host "StatusField: $($pollBody.status) | ErrorField: $($pollBody.error)"
                } catch {
                    $statusCode = $_.Exception.Response.StatusCode.value__
                    Write-Host "Status: $statusCode"
                    if ($statusCode -eq 404) { $found404 = $true }
                }
                Start-Sleep -Seconds 3
            }
        }
    } catch {
        Write-Host "POST Generate Failed"
        if ($_.Exception.Response) { Write-Host "Status: $($_.Exception.Response.StatusCode.value__)" }
    }

    Write-Host "`n4) POST /api/analyze/video"
    try {
        $anaResponse = Invoke-WebRequest -Uri "$baseUrl/api/analyze/video" -Method Post -Body $payload -Headers $headers -UseBasicParsing
        Write-Host "Status: $($anaResponse.StatusCode)"
        Write-Host "Body: $($anaResponse.Content)"
    } catch {
        Write-Host "POST Analyze Failed"
    }
    
    if ($found404) { Write-Host "`nSummary: 404 Job not found occurred." } else { Write-Host "`nSummary: No 404 Job not found." }
}

Test-VideoJob -baseUrl "http://localhost:3000"
