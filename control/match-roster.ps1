# UTF-8 BOM is retained for Windows PowerShell 5.1.
function Get-RosterPlayers($state,$side,$startingOnly=$false) {
    $suffix = if ($side -eq 'away') {'A'} else {'H'}
    $prefixes = if ($startingOnly) {@('xi')} else {@('xi','sub')}
    $seen = @{}
    foreach ($prefix in $prefixes) {
        $key=$prefix+$suffix+'_players';$text=$state[$key]
        if (-not $state.ContainsKey($key) -and $prefix -eq 'xi' -and $suffix -eq 'H') {$text=$state.lineup_players}
        foreach ($line in ([string]$text -split '\r\n|\n|\r')) {
            $normalized=[regex]::Replace($line.Trim().TrimStart([char]0xFEFF),'[０-９]',{param($m) [string]([int][char]$m.Value-65296)})
            if ($normalized -notmatch '^(?:#\s*|no\.?\s*|号码\s*[:：]?\s*)?(\d{1,3})(?!\d)([^\r\n]*)$') {continue}
            $num=$Matches[1];$name=$Matches[2].Trim() -creplace '^号(?:球员)?','' -replace '^[\s+＋\-－—–:：,，;；.．、·|/]+',''
            $name=$name -replace '\s*[*#]+\s*$','' -replace '\s*[（(](?:c|队长)[）)]\s*$','';$name=$name.Trim()
            if (-not $name -or $name -notmatch '[A-Za-z\u00c0-\uffff]' -or $name -match '^[\d\s+\-:：,，;；.．、|/]') {continue};$id=$side+'|'+[int]$num+'|'+$name
            if ($seen.ContainsKey($id)) {continue};$seen[$id]=$true
            @{id=$id;num=$num;name=$name}
        }
    }
}
function Get-Onfield($state,$side) {
    $key='onfield_'+$side
    if ($state[$key] -is [array]) {
        $valid=@((Get-RosterPlayers $state $side) | ForEach-Object {$_.id})
        $state[$key] | Where-Object {$valid -ccontains $_}
    } else {(Get-RosterPlayers $state $side $true) | ForEach-Object {$_.id}}
}
function Migrate-Roster($state) {
    foreach ($side in @('home','away')) {
        if ($state['onfield_'+$side] -is [array]) {continue}
        $active=@(Get-Onfield $state $side);$valid=@((Get-RosterPlayers $state $side) | ForEach-Object {$_.id})
        if ($state.sub_side -ceq $side -and $state.sub_trigger -ceq 'show' -and $state.sub_tick -and $active -ccontains $state.sub_off_id -and $active -cnotcontains $state.sub_on_id -and $valid -ccontains $state.sub_on_id) {
            $active=@($active | ForEach-Object {if ($_ -ceq $state.sub_off_id) {$state.sub_on_id} else {$_}})
        }
        $state['onfield_'+$side]=$active
    }
}
function Apply-Roster($current,$next,$patch) {
    foreach ($side in @('home','away')) {
        $key=if ($side -eq 'home') {'xiH_players'} else {'xiA_players'}
        if ($patch.ContainsKey($key) -and $patch[$key] -cne $current[$key]) {
            $next['onfield_'+$side]=@((Get-RosterPlayers $next $side $true) | ForEach-Object {$_.id})
        }
    }
    if ($patch.sub_trigger -cne 'show' -or -not $patch.ContainsKey('sub_tick')) {return}
    $side=if ($next.sub_side -eq 'away') {'away'} else {'home'}
    $all=@(Get-RosterPlayers $next $side);$active=@(Get-Onfield $next $side)
    $off=$all | Where-Object {$_.id -ceq $next.sub_off_id} | Select-Object -First 1
    $incoming=$all | Where-Object {$_.id -ceq $next.sub_on_id} | Select-Object -First 1
    if (-not $off -or -not $incoming -or $off.id -ceq $incoming.id -or $active -cnotcontains $off.id -or $active -ccontains $incoming.id) {throw '换人无效：请选择场内下场球员与场外上场球员'}
    $next['onfield_'+$side]=@($active | ForEach-Object {if ($_ -ceq $off.id) {$incoming.id} else {$_}})
    $next.sub_off_num=$off.num;$next.sub_off_name=$off.name;$next.sub_on_num=$incoming.num;$next.sub_on_name=$incoming.name
    $teamKey=if ($side -eq 'home') {'teamHome'} else {'teamAway'};$colorKey=if ($side -eq 'home') {'colorHome'} else {'colorAway'}
    $next.sub_team=if ($next[$teamKey]) {$next[$teamKey]} elseif ($side -eq 'home') {'主队'} else {'客队'}
    $next.sub_color=if ($next[$colorKey]) {$next[$colorKey]} elseif ($side -eq 'home') {'#c8102e'} else {'#00529f'}
}
