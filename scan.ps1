$RootPath = "C:\dev\app_fray\src\app"

$results = @()
Get-ChildItem -Path $RootPath -Filter "*.ts" -Recurse | ForEach-Object {
    $filePath = $_.FullName
    $relativePath = $filePath.Replace("C:\dev\app_fray\src\app\", "")
    $content = Get-Content -Path $filePath -Raw

    if ($content -match "\.from\(") {
        $results += $relativePath
        Write-Host "ENCONTRADO: $relativePath" -ForegroundColor Green

        $lines = @(Get-Content -Path $filePath)
        $lineNum = 0
        $lines | ForEach-Object {
            $lineNum++
            if ($_ -match "\.from\(") {
                $codeLine = $_.Trim()
                if ($codeLine.Length -gt 80) { $codeLine = $codeLine.Substring(0, 80) + "..." }
                Write-Host "  L$lineNum : $codeLine" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host "`nTotal archivos con .from(): $($results.Count)`n" -ForegroundColor Cyan
