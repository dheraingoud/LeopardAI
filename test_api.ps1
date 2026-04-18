$chatPayload = @{
    prompt = "Hello, who are you?"
    model = "llama-3.2-11b-vision"
}
$chatResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/qa-chat" -Method Post -ContentType "application/json" -Body ($chatPayload | ConvertTo-Json) -SkipHttpErrorCheck
Write-Host "QA-CHAT STATUS: $($chatResponse.StatusCode)"
Write-Host "QA-CHAT BODY: $($chatResponse.Content)"

$analyzePayload = @{
    prompt = "Describe this image briefly"
    model = "llama-3.2-11b-vision"
    imageUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO6XJYcAAAAASUVORK5CYII="
}
$analyzeResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/generate/analyze" -Method Post -ContentType "application/json" -Body ($analyzePayload | ConvertTo-Json) -SkipHttpErrorCheck
Write-Host "ANALYZE STATUS: $($analyzeResponse.StatusCode)"
Write-Host "ANALYZE BODY: $($analyzeResponse.Content)"
