# Samples the app process's memory at a fixed interval and appends to a CSV,
# for correlating against a soak-test run to spot upward (leak) trends.
#
# Usage (run in a separate terminal, alongside soak-test.js):
#   .\load-testing\monitor-memory.ps1 -Port 4000 -IntervalSeconds 30 -OutFile load-testing\memory-log.csv
#
# Stop with Ctrl+C when the soak test finishes.

param(
    [int]$Port = 4000,
    [int]$IntervalSeconds = 30,
    [string]$OutFile = "load-testing\memory-log.csv"
)

if (-not (Test-Path $OutFile)) {
    "timestamp,pid,rss_mb,private_mb" | Out-File -FilePath $OutFile -Encoding utf8
}

Write-Output "Monitoring memory for process on port $Port every $IntervalSeconds s -> $OutFile"

while ($true) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
        if ($proc) {
            $timestamp = [DateTimeOffset]::UtcNow.ToString("o")
            $rssMb = [math]::Round($proc.WorkingSet64 / 1MB, 2)
            $privMb = [math]::Round($proc.PrivateMemorySize64 / 1MB, 2)
            "$timestamp,$($proc.Id),$rssMb,$privMb" | Out-File -FilePath $OutFile -Append -Encoding utf8
            Write-Output "$timestamp  pid=$($proc.Id)  rss=${rssMb}MB  private=${privMb}MB"
        } else {
            Write-Output "No process found for port $Port"
        }
    } else {
        Write-Output "Nothing listening on port $Port"
    }
    Start-Sleep -Seconds $IntervalSeconds
}
