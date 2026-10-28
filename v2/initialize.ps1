# V2 first-start seed. Reads the source once; never writes the original match.
function Initialize-V2State([string]$sourceFile,[string]$target) {
    if (Test-Path -LiteralPath $target) {return}
    $seed=Get-Content -LiteralPath $sourceFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $seed | Add-Member -Force NoteProperty v2_initialized $true
    foreach ($name in @('sb_clock_state','clock_state')) {
        if ($seed.$name) {
            $clock=$seed.$name
            if ($clock.running) {
                $elapsed=[Math]::Max([double]0,[double]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()-$clock.base))
                $sign=if ($clock.mode -eq 'down') {-1} else {1}
                $clock.accMs=[Math]::Max([double]0,[double]($clock.accMs+$sign*$elapsed))
            }
            $clock.running=$false
        }
    }
    foreach ($name in @('sb_clockrun','clock_run','match_break_until')) {$seed | Add-Member -Force NoteProperty $name 0}
    $seed | Add-Member -Force NoteProperty status 'paused'
    $seed | Add-Member -Force -NotePropertyName sub_batch -NotePropertyValue @()
    $seed | Add-Member -Force NoteProperty theme_bg ''
    $seed | Add-Member -Force NoteProperty theme_skin 'dark'
    $seed | Add-Member -Force NoteProperty theme_accent '#008c6b'
    $seed | Add-Member -Force NoteProperty theme_font 'Outfit, Microsoft YaHei, sans-serif'
    $seed | Add-Member -Force NoteProperty wipe_in 0.56
    $seed | Add-Member -Force NoteProperty wipe_out 0.32
    $seed | Add-Member -Force NoteProperty animdur 1
    $seed | Add-Member -Force NoteProperty match_timing_suspend $true
    $positions=@{sb=@(430,120);clk=@(960,430);rst=@(440,910);card=@(440,910);ply=@(440,910);goal=@(960,890);sub=@(490,820);logo=@(1760,96);lineup=@(960,540);lineup_all=@(960,600)}
    foreach ($name in $positions.Keys) {
        $seed | Add-Member -Force NoteProperty ($name+'_pos') @{x=$positions[$name][0];y=$positions[$name][1]}
        $seed | Add-Member -Force NoteProperty ($name+'_scale') 1
    }
    $json=$seed | ConvertTo-Json -Depth 100
    $temporary=$target+'.tmp'
    [IO.File]::WriteAllText($temporary,$json,(New-Object Text.UTF8Encoding($false)))
    [IO.File]::Move($temporary,$target)
}
