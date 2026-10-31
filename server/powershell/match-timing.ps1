# Same anchors and validation as match-timing.js; UTF-8 BOM for Windows PowerShell.
function Get-MatchTiming($value) {
    if ($null -eq $value) {$value=@{}}
    if ($value -isnot [hashtable]) {throw 'Invalid match timing settings'}
    $result=@{enabled=$false;halfMinutes=45;breakMinutes=15;autoResume=$true}
    foreach ($key in @('enabled','autoResume')) {if ($value.ContainsKey($key)) {if ($value[$key] -isnot [bool]) {throw "Invalid $key"};$result[$key]=$value[$key]}}
    foreach ($key in @('halfMinutes','breakMinutes')) {
        if (-not $value.ContainsKey($key)) {continue}
        $n=0.0;$min=if ($key -eq 'halfMinutes') {1} else {0};$max=if ($key -eq 'halfMinutes') {180} else {120}
        if (-not [double]::TryParse([string]$value[$key],[ref]$n) -or $n -ne [Math]::Floor($n) -or $n -lt $min -or $n -gt $max) {throw "Invalid $key"}
        $result[$key]=$n
    }
    return $result
}
function Reconcile-MatchTiming($state,$patch,$current,$now) {
    if ($patch.ContainsKey('match_timing')) {$state.match_timing=Get-MatchTiming $patch.match_timing}
    foreach ($key in @('sb_clockcmd','match_timing','match_timing_suspend')) {if ($patch.ContainsKey($key)) {$state.match_break_until=0;break}}
    foreach ($key in @('period','status')) {if ($patch.ContainsKey($key) -and $patch[$key] -cne $current[$key]) {$state.match_break_until=0;break}}
    if ($patch.ContainsKey('match_timing') -and $state.period -ceq '中场休息' -and -not $state.sb_clock_state.running) {
        $cfg=$state.match_timing;$start=if ($current.match_break_until -gt 0) {$current.match_break_until-(Get-MatchTiming $current.match_timing).breakMinutes*60000} else {$now}
        $state.match_break_until=if ($cfg.enabled -and $cfg.autoResume) {$start+$cfg.breakMinutes*60000} else {0}
    }
}
function Advance-MatchTiming($state,$now) {
    $cfg=Get-MatchTiming $state.match_timing;if (-not $cfg.enabled) {return $null}
    $next=$state.Clone();$half=$cfg.halfMinutes*60000;$changed=$false
    for ($i=0;$i -lt 3;$i++) {
        $c=$next.sb_clock_state;if (-not $c) {break}
        $period=if ($next.period) {$next.period} else {'上半场'}
        if ($period -ceq '中场休息' -and $next.match_break_until -gt 0 -and $now -ge $next.match_break_until) {
            $c=$c.Clone();$c.accMs=$half;$c.base=$next.match_break_until;$c.running=$true
            $next.sb_clock_state=$c;$next.sb_clockacc=$half;$next.sb_clockrun=1;$next.period='下半场';$next.status='running';$next.match_break_until=0;$changed=$true;continue
        }
        if (-not $c.running -or $period -cnotin @('上半场','下半场')) {break}
        $target=if ($c.mode -ceq 'down') {0} elseif ($period -ceq '上半场') {$half} else {$half*2}
        $remaining=if ($c.mode -ceq 'down') {$c.accMs} else {$target-$c.accMs}
        $due=$c.base+[Math]::Max([double]0,[double]$remaining);if ($now -lt $due) {break}
        $c=$c.Clone();$c.accMs=$target;$c.base=$due;$c.running=$false;$next.sb_clock_state=$c;$next.sb_clockacc=$target;$next.sb_clockrun=0;$next.match_break_until=0
        if ($period -ceq '上半场') {$next.period='中场休息';$next.status='half';if ($cfg.autoResume) {$next.match_break_until=$due+$cfg.breakMinutes*60000}}
        else {$next.period='比赛结束';$next.status='over'}
        $changed=$true
    }
    if ($changed) {return $next};return $null
}
