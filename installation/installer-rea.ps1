# installer-rea.ps1 - installe tout ce qu'il faut pour FREE (REA + Ghidra + Java + Claude Code)
# Lance automatiquement par FREE.exe quand un composant manque. Aucun droit administrateur requis.
# Le script peut etre relance sans risque : ce qui est deja installe est garde.
#   -Auto           : pas de questions (FREE.exe a deja demande l'accord dans sa fenetre)
#   -Java temurin   : Eclipse Temurin 25 LTS (gratuit, open source) - par defaut
#   -Java oracle    : Oracle JDK 25 LTS (gratuit sous licence Oracle NFTC)
#   -NoClaude       : ne pas installer Claude Code
param([switch]$Auto, [ValidateSet('temurin', 'oracle')][string]$Java = 'temurin', [switch]$NoClaude)

$ErrorActionPreference = 'Stop'
$here = $PSScriptRoot
$root = Split-Path $here -Parent
$log = Join-Path $root 'installation-rapport.txt'

function Step($t) { Write-Host ""; Write-Host "=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  [OK] $t" -ForegroundColor Green }
function Warn($t) { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Fail($t) { Write-Host "  [X]  $t" -ForegroundColor Red; if (-not $Auto) { Read-Host "Appuyez sur Entree pour quitter" }; exit 1 }
function AskYes($q) { if ($Auto) { Write-Host "  $q -> oui"; return $true }; $r = Read-Host "$q (O/N)"; return ($r -match '^[OoYy]') }
$wingetFlags = @('-e', '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity')
function HasCmd($c) { [bool](Get-Command $c -ErrorAction SilentlyContinue) }
function RefreshPath {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
}

Write-Host ""
Write-Host "  FREE - French Reverse Engineer Everything : installation" -ForegroundColor White
Write-Host "  Comptez 5 a 15 minutes (telechargements compris)." -ForegroundColor Gray

# ---------------------------------------------------------------- 1. Node.js
Step "1/6 Node.js"
function NodeOk {
    if (-not (HasCmd node)) { return $false }
    $p = (& node -v).TrimStart('v').Split('.') | ForEach-Object { [int]$_ }
    return ($p[0] -eq 22 -and ($p[1] -gt 23 -or ($p[1] -eq 23 -and $p[2] -ge 4))) -or
           ($p[0] -eq 24 -and ($p[1] -gt 22 -or ($p[1] -eq 22 -and $p[2] -ge 1))) -or
           ($p[0] -eq 26 -and ($p[1] -gt 12 -or ($p[1] -eq 12 -and $p[2] -ge 1))) -or ($p[0] -gt 26)
}
if (-not (NodeOk)) {
    Warn "Node.js absent ou trop ancien (il faut 22.23.4+, 24.22.1+ ou 26.12.1+)."
    if ((HasCmd winget) -and (AskYes "Installer Node.js LTS avec winget ?")) {
        winget install --id OpenJS.NodeJS.LTS @wingetFlags
        RefreshPath
    }
    if (-not (NodeOk)) { Fail "Installez Node.js LTS depuis https://nodejs.org (bouton LTS), puis relancez FREE." }
}
Ok "Node $(& node -v)"

# ---------------------------------------------------------------- 2. Java (JDK 25+)
Step "2/6 Java (JDK 25 ou plus, exige par Ghidra 12.2+)"
function Get-JdkMajor($homeDir) {
    $rel = Join-Path $homeDir 'release'
    if (-not (Test-Path $rel) -or -not (Test-Path (Join-Path $homeDir 'bin\javac.exe'))) { return 0 }
    $line = Select-String -Path $rel -Pattern '^JAVA_VERSION="?([0-9]+)' | Select-Object -First 1
    if ($line) { return [int]$line.Matches[0].Groups[1].Value } else { return 0 }
}
function Find-Jdk {
    $cands = @()
    if ($env:JAVA_HOME) { $cands += $env:JAVA_HOME }
    $u = [Environment]::GetEnvironmentVariable('JAVA_HOME', 'User'); if ($u) { $cands += $u }
    foreach ($r in @("$env:ProgramFiles\Eclipse Adoptium", "$env:ProgramFiles\Java", "$env:ProgramFiles\Microsoft", "$env:ProgramFiles\Zulu", "$env:LOCALAPPDATA\Programs\Eclipse Adoptium")) {
        if (Test-Path $r) { $cands += (Get-ChildItem $r -Directory | Sort-Object Name -Descending | ForEach-Object FullName) }
    }
    foreach ($c in $cands) { if ((Get-JdkMajor $c) -ge 25) { return $c } }
    return $null
}
$jdk = Find-Jdk
if (-not $jdk) {
    Warn "Aucun JDK 25+ trouve."
    if ($Java -eq 'oracle') { $jdkId = 'Oracle.JDK.25'; $jdkName = 'Oracle JDK 25 (gratuit, licence Oracle NFTC)' }
    else { $jdkId = 'EclipseAdoptium.Temurin.25.JDK'; $jdkName = 'Eclipse Temurin JDK 25 (gratuit, open source)' }
    if ((HasCmd winget) -and (AskYes "Installer $jdkName avec winget ?")) {
        winget install --id $jdkId @wingetFlags
        $jdk = Find-Jdk
    }
    if (-not $jdk) {
        if ($Java -eq 'oracle') { Fail "Installez Oracle JDK 25 : https://www.oracle.com/java/technologies/downloads/ (JDK 25, Windows, x64 MSI Installer), puis relancez FREE." }
        Fail "Installez un JDK 25 : https://adoptium.net (Temurin 25, JDK, Windows x64, .msi), puis relancez FREE."
    }
}
Ok "JDK $(Get-JdkMajor $jdk) : $jdk"

# ---------------------------------------------------------------- 3. Ghidra 12.2+
Step "3/6 Ghidra (12.2 ou plus)"
$programs = Join-Path $env:LOCALAPPDATA 'Programs'
New-Item -ItemType Directory -Force -Path $programs | Out-Null
function GhidraVersion($dir) {
    $props = Join-Path $dir 'Ghidra\application.properties'
    if (-not (Test-Path $props) -or -not (Test-Path (Join-Path $dir 'support\analyzeHeadless.bat'))) { return $null }
    $l = Select-String -Path $props -Pattern '^application\.version=(.+)$' | Select-Object -First 1
    if ($l) { return [version]($l.Matches[0].Groups[1].Value.Trim() -replace '[^0-9.].*$', '') } else { return $null }
}
function GoodGhidra($dir) { $v = GhidraVersion $dir; return ($v -and $v -ge [version]'12.2') }
$ghidra = $null
$cands = @()
$g = [Environment]::GetEnvironmentVariable('GHIDRA_INSTALL_DIR', 'User'); if ($g) { $cands += $g }
$cands += (Get-ChildItem $programs -Directory -Filter 'ghidra_*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending | ForEach-Object FullName)
$cands += (Get-ChildItem $root -Directory -Filter 'ghidra_*' -ErrorAction SilentlyContinue | ForEach-Object FullName)
foreach ($c in $cands) { if (GoodGhidra $c) { $ghidra = $c; break } }
# Un Ghidra fourni a cote (dans OneDrive par ex.) est recopie en local : REA refuse les dossiers OneDrive.
if ($ghidra -and $ghidra.StartsWith($root)) {
    $dest = Join-Path $programs (Split-Path $ghidra -Leaf)
    Write-Host "  Copie de Ghidra vers $dest ..."
    robocopy $ghidra $dest /E /NFL /NDL /NJH /NJS /NP | Out-Null
    $ghidra = $dest
}
function Get-LatestGhidra {
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $rels = Invoke-RestMethod 'https://api.github.com/repos/NationalSecurityAgency/ghidra/releases?per_page=20' -Headers @{ 'User-Agent' = 'FREE-installer' }
        $pick = $null
        foreach ($r in $rels) {
            if ($r.draft -or $r.prerelease) { continue }
            $asset = $r.assets | Where-Object { $_.name -match '^ghidra_(\d+\.\d+(\.\d+)?)_PUBLIC_\d+\.zip$' } | Select-Object -First 1
            if (-not $asset) { continue }
            $v = [version]([regex]::Match($asset.name, '^ghidra_(\d+\.\d+(\.\d+)?)_').Groups[1].Value)
            if ($v -ge [version]'12.2' -and (-not $pick -or $v -gt $pick.v)) { $pick = @{ v = $v; asset = $asset } }
        }
        return $pick
    } catch { Warn "GitHub injoignable : $($_.Exception.Message)"; return $null }
}
function Install-Ghidra($pick) {
    $zip = Join-Path $env:TEMP $pick.asset.name
    Write-Host "  Telechargement en cours (quelques minutes)..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest $pick.asset.browser_download_url -OutFile $zip -UseBasicParsing
    Write-Host "  Decompression..."
    Expand-Archive -Path $zip -DestinationPath $programs -Force
    Remove-Item $zip -Force
    $found = Get-ChildItem $programs -Directory -Filter 'ghidra_*' | Where-Object { (GhidraVersion $_.FullName) -eq $pick.v } | Select-Object -First 1
    if (-not $found) { $found = Get-ChildItem $programs -Directory -Filter 'ghidra_*' | Where-Object { GoodGhidra $_.FullName } | Sort-Object { GhidraVersion $_.FullName } -Descending | Select-Object -First 1 }
    return $found.FullName
}
Write-Host "  Recherche de la derniere version de Ghidra sur GitHub..."
$latest = Get-LatestGhidra
if (-not $ghidra) {
    if (-not $latest) { Fail "Pas de Ghidra 12.2+ trouve automatiquement. Telechargez-le sur https://github.com/NationalSecurityAgency/ghidra/releases (fichier ghidra_..._PUBLIC_....zip), dezippez-le dans $programs, puis relancez FREE." }
    $sizeMb = [math]::Round($latest.asset.size / 1MB)
    if (-not (AskYes "Telecharger Ghidra $($latest.v) ($sizeMb Mo) depuis GitHub ?")) { Fail "Installation de Ghidra annulee." }
    $ghidra = Install-Ghidra $latest
    if (-not $ghidra) { Fail "Ghidra telecharge mais introuvable apres decompression dans $programs." }
} elseif ($latest -and $latest.v -gt (GhidraVersion $ghidra) -and $Auto) {
    Ok "Ghidra $($latest.v) est disponible : FREE vous proposera la mise a jour."
} elseif ($latest -and $latest.v -gt (GhidraVersion $ghidra)) {
    $sizeMb = [math]::Round($latest.asset.size / 1MB)
    Warn "Une nouvelle version de Ghidra existe : $(GhidraVersion $ghidra) -> $($latest.v)"
    if (AskYes "Telecharger et utiliser Ghidra $($latest.v) ($sizeMb Mo) ? (l'ancienne version reste en place)") {
        $new = Install-Ghidra $latest
        if ($new) { $ghidra = $new } else { Warn "Mise a jour de Ghidra echouee : l'ancienne version est gardee." }
    }
} elseif ($latest) { Ok "Ghidra est a jour." }
Ok "Ghidra $(GhidraVersion $ghidra) : $ghidra"

# ---------------------------------------------------------------- 4. Variables d'environnement
Step "4/6 Reglages Windows (variables d'environnement du compte)"
$vars = [ordered]@{ GHIDRA_INSTALL_DIR = $ghidra; JAVA_HOME = $jdk; REA_ANALYSIS_PROVIDER = 'ghidra' }
foreach ($k in $vars.Keys) {
    [Environment]::SetEnvironmentVariable($k, $vars[$k], 'User')
    Set-Item -Path "Env:$k" -Value $vars[$k]
    Ok "$k = $($vars[$k])"
}

# ---------------------------------------------------------------- 5. REA
Step "5/6 REA (Reverse Engineer Anything)"
& npm.cmd install --global rea-agents@latest --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { Fail "L'installation de REA (npm) a echoue." }
$rea = Join-Path (& npm.cmd prefix -g).Trim() 'rea.cmd'
if (-not (Test-Path $rea)) { Fail "Commande rea introuvable apres installation ($rea)." }
Ok "REA $(& $rea --version)"
Write-Host "  Verification de Ghidra par REA..."
& $rea doctor --provider ghidra 2>&1 | Out-File -FilePath $log -Encoding utf8
if ($LASTEXITCODE -eq 0) { Ok "REA trouve Ghidra et Java." } else { Warn "REA signale un probleme : voir installation-rapport.txt (a envoyer si vous demandez de l'aide)." }

# ---------------------------------------------------------------- 6. Claude Code
Step "6/6 Claude Code (pour le plan, la reconstruction et l'enquete)"
RefreshPath
$hasClaude = (HasCmd claude) -or (Test-Path (Join-Path $env:USERPROFILE '.local\bin\claude.exe'))
if (-not $hasClaude -and -not $NoClaude) {
    if (AskYes "Installer Claude Code ? (necessite un abonnement Claude Pro, Max, Team ou Enterprise)") {
        & npm.cmd install --global @anthropic-ai/claude-code --no-audit --no-fund
        RefreshPath
        $hasClaude = HasCmd claude
    }
}
if ($hasClaude) {
    Ok "Claude Code installe. FREE vous guidera pour le connecter a votre compte."
} else {
    Warn "Claude Code non installe : l'analyse marchera, mais pas les enquetes, le plan ni la reconstruction. FREE vous proposera de l'installer."
}

Write-Host ""
Write-Host "=== Installation terminee ===" -ForegroundColor Green
if (-not $Auto) {
    Write-Host "FREE va demarrer des que vous fermez cette fenetre." -ForegroundColor Green
    Read-Host "Appuyez sur Entree pour fermer"
}
exit 0
