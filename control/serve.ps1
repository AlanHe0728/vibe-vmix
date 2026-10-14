# Windows PowerShell 5.1 and PowerShell 7 compatible fallback server.
$ErrorActionPreference = 'Stop'
$port = if ($env:PORT) { [int]$env:PORT } else { 8123 }
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$root = Split-Path $scriptDir -Parent
$stateFile = if ($env:FBP_STATE_FILE) { $env:FBP_STATE_FILE } else { Join-Path $scriptDir 'state.json' }
function Convert-Map($value) {
    if ($null -eq $value) { return $null }
    if ($value -is [System.Management.Automation.PSCustomObject]) {
        $map = @{}
        foreach ($p in $value.PSObject.Properties) { $map[$p.Name] = Convert-Map $p.Value }
        return $map
    }
    if ($value -is [System.Array]) {
        $items = @($value | ForEach-Object { Convert-Map $_ })
        return ,$items
    }
    return $value
}
function Read-Object($text) {
    $obj = ConvertFrom-Json -InputObject $text
    if ($null -eq $obj -or $obj -isnot [System.Management.Automation.PSCustomObject]) { throw 'expected JSON object' }
    return (Convert-Map $obj)
}
function Now-Ms { return [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() }
function Number-Value($value) {
    $n = 0.0
    if ([double]::TryParse([string]$value, [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$n) -and -not [double]::IsInfinity($n) -and -not [double]::IsNaN($n)) { return [Math]::Max([double]0,$n) }
    return 0.0
}
function Clock-Value($c,$now) {
    $elapsed = if ($c.running) { [Math]::Max([double]0,$now - $c.base) } else { 0 }
    $sign = if ($c.mode -eq 'down') { -1 } else { 1 }
    return [Math]::Max([double]0,$c.accMs + $sign*$elapsed)
}
function Migrate-Clocks($s,$now) {
    foreach ($prefix in @('sb_clock','clock')) {
        $key = $prefix+'_state'
        if ($s[$key] -is [hashtable] -and $s[$key].ContainsKey('accMs') -and $s[$key].ContainsKey('base')) { continue }
        if ($prefix -eq 'clock') {
            $mode = $s.clock_mode; $run = $s.clock_run
            $mm = if ($s.ContainsKey('clock_mm')) { Number-Value $s.clock_mm } else { 15 }
            $acc = ($mm*60+(Number-Value $s.clock_ss))*1000
        } else { $mode = $s.sb_clockmode; $run = $s.sb_clockrun; $acc = Number-Value $s.sb_clockacc }
        $s[$key] = @{ mode=$(if ($mode -eq 'down') { 'down' } else { 'up' }); running=($run -eq 1); accMs=$acc; base=$now }
    }
}
function Apply-Command($s,$patch,$prefix,$now) {
    $cmdKey = if ($prefix -eq 'clock') { 'clock_cmd' } else { 'sb_clockcmd' }
    if (-not $patch.ContainsKey($cmdKey)) { return }
    $key = $prefix+'_state'; $c = $s[$key].Clone(); $cmd = $patch[$cmdKey]
    $ms = Clock-Value $c $now
    switch ($cmd) {
        'set' {
            if ($prefix -eq 'clock') { $mode = $s.clock_mode; $ms = ((Number-Value $s.clock_mm)*60+(Number-Value $s.clock_ss))*1000 }
            else { $mode = $s.sb_clockmode; $ms = Number-Value $s.sb_clockacc }
            $c.mode = if ($mode -eq 'down') { 'down' } else { 'up' }; $c.running = $false
        }
        'start' { $c.running = $true }
        'pause' { $c.running = $false }
        'reset' { $ms = 0; $c.running = $false }
        'plus' { $ms += 60000 }
        'minus' { $ms = [Math]::Max([double]0,$ms-60000) }
        'up' { $c.mode = 'up'; $ms = 0; $c.running = $false }
        'down' { $c.mode = 'down'; $ms = 0; $c.running = $false }
        default { throw 'invalid clock command' }
    }
    $c.accMs = $ms; $c.base = $now; $s[$key] = $c
    if ($prefix -eq 'clock') {
        $s.clock_mode = $c.mode; $s.clock_run = [int][bool]$c.running
        $s.clock_mm = [Math]::Floor($ms/60000); $s.clock_ss = [Math]::Floor($ms/1000)%60
    } else { $s.sb_clockmode = $c.mode; $s.sb_clockrun = [int][bool]$c.running; $s.sb_clockacc = $ms }
}
$positions = @{ sb=@(423,96); clk=@(960,400); rst=@(960,918); card=@(960,500); ply=@(390,918); goal=@(960,500); sub=@(960,500); logo=@(1760,96); lineup=@(960,540); lineup_all=@(960,580) }
function Merge-State($current,$patch) {
    $next = $current.Clone(); $now = Now-Ms
    foreach ($key in $patch.Keys) {
        if ($key -in @('__proto__','constructor','prototype','clock_state','sb_clock_state','scoreHome_delta','scoreAway_delta')) { continue }
        if ($key.EndsWith('_tick')) { $next[$key] = [Math]::Max([double]$now,(Number-Value $next[$key])+1) }
        else { $next[$key] = $patch[$key] }
    }
    foreach ($key in @('scoreHome','scoreAway','goal_scoreHome','goal_scoreAway')) {
        if ($patch.ContainsKey($key)) { $next[$key] = [Math]::Floor((Number-Value $patch[$key])) }
    }
    foreach ($key in @('scoreHome','scoreAway')) {
        if ($patch.ContainsKey($key+'_delta')) {
            $delta = 0.0
            if (-not [double]::TryParse([string]$patch[$key+'_delta'],[ref]$delta) -or [double]::IsInfinity($delta) -or [double]::IsNaN($delta) -or $delta -ne [Math]::Floor($delta) -or [Math]::Abs($delta) -gt 9007199254740991) { throw 'invalid score delta' }
            $next[$key] = [Math]::Max([double]0,[Math]::Floor((Number-Value $current[$key]))+$delta)
        }
    }
    if ($patch.ContainsKey('scoreHome') -or $patch.ContainsKey('scoreAway') -or $patch.ContainsKey('scoreHome_delta') -or $patch.ContainsKey('scoreAway_delta')) {
        $next.goal_scoreHome = [Math]::Floor((Number-Value $next.scoreHome));$next.goal_scoreAway = [Math]::Floor((Number-Value $next.scoreAway))
    }
    Apply-Roster $current $next $patch
    Apply-Command $next $patch 'sb_clock' $now
    Apply-Command $next $patch 'clock' $now
    if ($patch.ContainsKey('posreset_tick')) {
        foreach ($key in $positions.Keys) { $next[$key+'_pos'] = @{x=$positions[$key][0];y=$positions[$key][1]}; $next[$key+'_scale'] = 1 }
    }
    return $next
}
. (Join-Path $scriptDir 'match-roster.ps1')
$script:State = if (Test-Path -LiteralPath $stateFile) { Read-Object ([IO.File]::ReadAllText($stateFile,[Text.Encoding]::UTF8)) } else { @{} }
Migrate-Clocks $script:State (Now-Ms)
Migrate-Roster $script:State
function Cache-State {
    $script:StateBytes = [Text.Encoding]::UTF8.GetBytes(($script:State | ConvertTo-Json -Depth 50 -Compress))
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $script:ETag = '"'+([BitConverter]::ToString($hash.ComputeHash($script:StateBytes)).Replace('-','').ToLower())+'"' }
    finally { $hash.Dispose() }
}
Cache-State
function Save-State($next) {
    $temp = $stateFile+'.tmp'
    try {
        [IO.File]::WriteAllText($temp,($next | ConvertTo-Json -Depth 50),[Text.UTF8Encoding]::new($false))
        if (Test-Path -LiteralPath $stateFile) { [IO.File]::Replace($temp,$stateFile,[System.Management.Automation.Language.NullString]::Value) }
        else { [IO.File]::Move($temp,$stateFile) }
    } catch {
        if (Test-Path -LiteralPath $temp -PathType Leaf) { [IO.File]::Delete($temp) }
        throw
    }
    $script:State = $next; Cache-State
}
function Write-Json($res,$obj,$status) {
    $bytes = [Text.Encoding]::UTF8.GetBytes(($obj | ConvertTo-Json -Depth 50 -Compress))
    $res.StatusCode = $status; $res.ContentType = 'application/json; charset=utf-8'
    $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes,0,$bytes.Length); $res.Close()
}
. (Join-Path $scriptDir 'd200.ps1')
$listener = [Net.HttpListener]::new()
$listener.Prefixes.Add("http://localhost:$port/")
try { $listener.Start() }
catch { Write-Host "端口 $port 无法监听：$($_.Exception.Message)"; exit 1 }
Write-Host "足球包装服务器已启动: http://localhost:$port/control/panel.html"
if ($env:FBP_NO_BROWSER -ne '1') { try { Start-Process "http://localhost:$port/control/panel.html" } catch {} }
try {
    while ($listener.IsListening) {
        $ctx = $listener.GetContext(); $req = $ctx.Request; $res = $ctx.Response
        try {
            $res.AppendHeader('Access-Control-Allow-Origin','*')
            $res.AppendHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
            $res.AppendHeader('Access-Control-Allow-Headers','Content-Type, If-None-Match')
            $res.AppendHeader('Access-Control-Expose-Headers','ETag')
            $urlPath = $req.Url.AbsolutePath
            if ($req.HttpMethod -eq 'OPTIONS') { $res.StatusCode = 204; $res.Close(); continue }
            if ($urlPath.StartsWith('/api/d200/')) {
                $res.AppendHeader('Cache-Control','no-store')
                if ($urlPath -ceq '/api/d200/actions' -or $urlPath -ceq '/api/d200/status') {
                    if ($req.HttpMethod -ne 'GET') { Write-Json $res @{ok=$false;error='use GET for status or actions'} 405; continue }
                    if ($urlPath -ceq '/api/d200/status') { Write-Json $res (Get-D200Status $script:State) 200 }
                    else { $response = $script:D200Catalog.Clone(); $response.ok = $true; Write-Json $res $response 200 }
                    continue
                }
                if ($urlPath -notmatch '^/api/d200/action/([A-Za-z0-9_]+)$') { Write-Json $res @{ok=$false;error='unknown D200 action'} 404; continue }
                $actionId = $Matches[1]
                if (-not (Get-D200Action $actionId)) { Write-Json $res @{ok=$false;error='unknown D200 action'} 404; continue }
                if ($req.HttpMethod -ne 'POST') { Write-Json $res @{ok=$false;error='按键动作使用 POST，状态轮询使用 GET /api/d200/status'} 405; continue }
                $reader = [IO.StreamReader]::new($req.InputStream,[Text.Encoding]::UTF8)
                try { $null = $reader.ReadToEnd() } finally { $reader.Dispose() }
                try { $next = Merge-State $script:State (Get-D200Patch $actionId $script:State) }
                catch { Write-Json $res @{ok=$false;error=$_.Exception.Message} 400; continue }
                try { Save-State $next }
                catch { Write-Json $res @{ok=$false;error='保存失败，请检查文件权限和磁盘空间'} 500; continue }
                Write-Json $res @{ok=$true;action=$actionId;status=(Get-D200Status $script:State)} 200
                continue
            }
            if ($urlPath -match '^/state(\.json)?/?$') {
                if ($req.HttpMethod -eq 'GET') {
                    $res.AppendHeader('ETag',$script:ETag); $res.AppendHeader('Cache-Control','no-cache')
                    if ($req.Headers['If-None-Match'] -eq $script:ETag) { $res.StatusCode = 304; $res.Close() }
                    else {
                        $res.ContentType = 'application/json; charset=utf-8'; $res.ContentLength64 = $script:StateBytes.Length
                        $res.OutputStream.Write($script:StateBytes,0,$script:StateBytes.Length); $res.Close()
                    }
                } elseif ($req.HttpMethod -eq 'POST') {
                    $reader = [IO.StreamReader]::new($req.InputStream,[Text.Encoding]::UTF8)
                    try { $body = $reader.ReadToEnd() } finally { $reader.Dispose() }
                    if ([Text.Encoding]::UTF8.GetByteCount($body) -gt 32MB) { Write-Json $res @{ok=$false;error='upload exceeds 32 MB'} 413; continue }
                    try { $patch = Read-Object $body; $next = Merge-State $script:State $patch }
                    catch { Write-Json $res @{ok=$false;error=$_.Exception.Message} 400; continue }
                    try { Save-State $next }
                    catch { [Console]::Error.WriteLine($_.Exception.Message); Write-Json $res @{ok=$false;error='保存失败，请检查文件权限和磁盘空间'} 500; continue }
                    $status=Get-D200Status $script:State
                    Write-Json $res @{ok=$true;score=$status.score;onfield=$status.onfield;controls=$status.controls} 200
                } else { Write-Json $res @{ok=$false;error='method not allowed'} 405 }
                continue
            }
            if ($urlPath -eq '/') { $res.StatusCode = 302; $res.AppendHeader('Location','/control/panel.html'); $res.Close(); continue }
            $rel = [Uri]::UnescapeDataString($urlPath).TrimStart('/').Replace('/',[IO.Path]::DirectorySeparatorChar)
            $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
            if (-not $file.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
                $res.StatusCode = 404; $res.Close(); continue
            }
            $ext = [IO.Path]::GetExtension($file).ToLower()
            $mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.json'='application/json; charset=utf-8'; '.png'='image/png'; '.jpg'='image/jpeg'; '.svg'='image/svg+xml'; '.md'='text/plain; charset=utf-8' }
            $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
            $res.AppendHeader('Cache-Control','no-cache')
            $bytes = [IO.File]::ReadAllBytes($file); $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes,0,$bytes.Length); $res.Close()
        } catch {
            try { Write-Json $res @{ok=$false;error='request failed'} 500 } catch { $res.Abort() }
        }
    }
} finally { $listener.Stop(); $listener.Close() }
