# Uses the same action catalog as the Node server. Compatible with PowerShell 5.1.
$script:D200Catalog = Read-Object ([IO.File]::ReadAllText((Join-Path $projectRoot 'modules\football\d200-actions.json'),[Text.Encoding]::UTF8))
function D200-True($v) { return ($v -eq $true -or $v -ceq '1' -or $v -ceq 'true') }
function Get-D200Action($id) { return ($script:D200Catalog.actions | Where-Object { $_.id -ceq $id } | Select-Object -First 1) }
function Get-D200Patch($id,$s) {
    $a = Get-D200Action $id
    if (-not $a) { throw 'unknown action' }
    switch ($a.kind) {
        'score' { return @{ $a.key = [Math]::Max([double]0,[Math]::Floor((Number-Value $s[$a.key]))+$a.delta) } }
        'goal' {
            $isHomeSide = $a.side -eq 'home'
            $sh = [Math]::Floor((Number-Value $s.scoreHome)); $sa = [Math]::Floor((Number-Value $s.scoreAway))
            if ($isHomeSide) { $sh++; $team = $s.teamHome; $color = $s.colorHome } else { $sa++; $team = $s.teamAway; $color = $s.colorAway }
            if (-not $team) { $team = if ($isHomeSide) { '主队' } else { '客队' } }
            if (-not $color) { $color = '#FFD400' }
            return @{ scoreHome=$sh;scoreAway=$sa;goal_scoreHome=$sh;goal_scoreAway=$sa;goal_team=$team;goal_color=$color;
                goal_name=$(if ($s.goal_name) { $s.goal_name } else { '进球' });goal_num=$(if ($s.goal_num) { $s.goal_num } else { '' });
                goal_trigger='goal';goal_tick=0;score_trigger='flash';score_tick=0 }
        }
        'clock' {
            $cmd = $a.command
            if ($cmd -eq 'toggle') { $cmd = if ($s[$a.prefix+'_state'].running) { 'pause' } else { 'start' } }
            if ($a.prefix -eq 'clock') { return @{clock_cmd=$cmd;clock_tick=0;clock_show=$true} }
            return @{sb_clockcmd=$cmd;sb_clock_tick=0}
        }
        'visibility' {
            $v = $a.value
            if ($v -eq 'toggle') {
                $old = if ($s.ContainsKey($a.key)) { D200-True $s[$a.key] } else { $a.key -eq 'scoreboard_show' }
                $v = -not $old
            }
            return @{ $a.key=$v }
        }
        'lineup' { if ($a.prefix -eq 'all') { return @{lineup_mode='all';lineup_show=$true;lineup_tick=0} }; return @{lineup_mode='single';lineup_active=$a.prefix;lineup_show=$true;lineup_tick=0} }
        'patch' { return $a.patch.Clone() }
        default { throw 'unknown action type' }
    }
}
function Get-D200Status($s) {
    $visible = @{scoreboard=$(if ($s.ContainsKey('scoreboard_show')) {D200-True $s.scoreboard_show} else {$true});
        clock=(D200-True $s.clock_show);lineup=(D200-True $s.lineup_show);logo=(D200-True $s.logo_show)}
    $result = @{ok=$true;onfield=@{home=@(Get-Onfield $s 'home');away=@(Get-Onfield $s 'away')};score=@{home=[Math]::Floor((Number-Value $s.scoreHome));away=[Math]::Floor((Number-Value $s.scoreAway))};
        visible=$visible;lineup=$(if ($s.lineup_mode -ne 'single') {'all'} elseif ($s.lineup_active) {$s.lineup_active} else {'xiH'});buttons=@{}}
    $result.controls=@{status=$(if ($s.status) {$s.status} else {'running'});restart_type=[string]$s.restart_type;card_type=[string]$s.card_type;scoreboard_show=$visible.scoreboard;clock_show=$visible.clock;lineup_show=$visible.lineup;logo_show=$visible.logo;lineup=$result.lineup;sb_clockrun=[bool]$s.sb_clock_state.running;clock_run=[bool]$s.clock_state.running}
    $now = Now-Ms
    $result.controls.timing_version=1;$result.controls.period=if ($s.period) {$s.period} else {'上半场'}
    $result.controls.match_timing=Get-MatchTiming $s.match_timing;$result.controls.match_break_until=$s.match_break_until;$result.controls.match_clock=$s.sb_clock_state
    foreach ($prefix in @('sb_clock','clock')) {
        $c = $s[$prefix+'_state'];$result[$prefix] = @{running=$c.running;mode=$c.mode;milliseconds=[Math]::Round((Clock-Value $c $now))}
    }
    foreach ($a in $script:D200Catalog.actions) {
        $active = $true
        if ($a.kind -eq 'visibility') {
            $on = $visible[$a.key.Replace('_show','')]
            $active = if ($a.value -eq $false) { -not $on } else { $on }
        } elseif ($a.kind -eq 'clock') {
            $on = $result[$a.prefix].running
            $active = if ($a.command -eq 'pause') { -not $on } else { $on }
        } elseif ($a.kind -eq 'lineup') { $active = $visible.lineup -and $result.lineup -ceq $a.prefix }
        elseif ($a.id -eq 'hide_all') { $active = -not ($visible.Values -contains $true) }
        $result.buttons[$a.id] = @{active=$(if ($active) {'on'} else {'off'})}
    }
    return $result
}
