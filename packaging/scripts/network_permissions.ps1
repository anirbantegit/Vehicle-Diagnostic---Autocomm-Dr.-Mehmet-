Set-StrictMode -Version Latest

$script:MobileRuleGroup = "Diagnostic Engine Console - Managed Mobile LAN"
$script:MobileInboundRuleName = "Diagnostic Engine Console - Mobile LAN Inbound"
$script:MobileOutboundRuleName = "Diagnostic Engine Console - Mobile LAN Outbound"
$script:LegacyRuleNames = @(
    "Diagnostic Engine Console - Mobile LAN Access",
    "Diagnostic Engine Console - Mobile LAN Inbound",
    "Diagnostic Engine Console - Mobile LAN Outbound"
)

function Get-EnvValueFromInstalledFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Name,
        [string]$Default = ""
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return $Default
    }

    $Pattern = "^\s*$([regex]::Escape($Name))\s*=\s*(.*)\s*$"
    $Match = Select-String -LiteralPath $Path -Pattern $Pattern | Select-Object -First 1
    if (-not $Match) {
        return $Default
    }

    return $Match.Matches[0].Groups[1].Value.Trim().Trim("'").Trim('"')
}

function Get-MobileNetworkContext {
    param([Parameter(Mandatory = $true)][string]$InstallDir)

    $EnvFile = Join-Path $InstallDir ".env"
    $BridgeExe = Join-Path $InstallDir "AutocomBridgeService\AutocomBridgeService.exe"
    $FallbackDataDir = Join-Path $env:ProgramData "AutocomBridge"
    $DataDir = Get-EnvValueFromInstalledFile -Path $EnvFile -Name "AUTOCOM_BRIDGE_DATA_DIR" -Default $FallbackDataDir
    if ([string]::IsNullOrWhiteSpace($DataDir)) {
        $DataDir = $FallbackDataDir
    }
    $DataDir = [Environment]::ExpandEnvironmentVariables($DataDir)
    $LogDir = Join-Path $DataDir "logs"

    $PortText = Get-EnvValueFromInstalledFile -Path $EnvFile -Name "BRIDGE_PORT" -Default "8090"
    $BridgePort = 0
    if (-not [int]::TryParse($PortText, [ref]$BridgePort) -or $BridgePort -lt 1 -or $BridgePort -gt 65535) {
        throw "BRIDGE_PORT must contain a valid TCP port number. Received: $PortText"
    }

    $BridgeHost = Get-EnvValueFromInstalledFile -Path $EnvFile -Name "BRIDGE_HOST" -Default "0.0.0.0"

    return [PSCustomObject]@{
        InstallDir = $InstallDir
        EnvFile = $EnvFile
        BridgeExe = $BridgeExe
        BridgeHost = $BridgeHost
        BridgePort = $BridgePort
        DataDir = $DataDir
        LogDir = $LogDir
        LogFile = Join-Path $LogDir "network-permissions-install.log"
        StateFile = Join-Path $LogDir "network-permissions-state.json"
    }
}

function Write-MobileNetworkLog {
    param(
        [Parameter(Mandatory = $true)]$Context,
        [Parameter(Mandatory = $true)][ValidateSet("INFO", "WARN", "ERROR")][string]$Level,
        [Parameter(Mandatory = $true)][string]$Message
    )

    New-Item -ItemType Directory -Path $Context.LogDir -Force | Out-Null
    $Line = "$(Get-Date -Format o) [$Level] $Message"
    Add-Content -LiteralPath $Context.LogFile -Value $Line
    if ($Level -eq "WARN") {
        Write-Warning $Message
    }
    else {
        Write-Host $Line
    }
}

function Assert-MobileNetworkPrerequisites {
    param([Parameter(Mandatory = $true)]$Context)

    Import-Module NetSecurity -ErrorAction Stop
    Import-Module NetTCPIP -ErrorAction Stop
    Import-Module NetConnection -ErrorAction SilentlyContinue

    if (-not (Test-Path -LiteralPath $Context.EnvFile)) {
        throw "Installed runtime configuration is missing: $($Context.EnvFile)"
    }
    if (-not (Test-Path -LiteralPath $Context.BridgeExe)) {
        throw "Bridge executable is missing, so firewall permissions cannot be safely bound: $($Context.BridgeExe)"
    }

    $LoopbackHosts = @("127.0.0.1", "localhost", "::1")
    if ($LoopbackHosts -contains $Context.BridgeHost.Trim().ToLowerInvariant()) {
        throw "Mobile LAN access is enabled, but BRIDGE_HOST=$($Context.BridgeHost) listens only on this PC. Configure BRIDGE_HOST=0.0.0.0 or a LAN address before installing mobile access."
    }
}

function Remove-MobileNetworkRules {
    param([Parameter(Mandatory = $true)]$Context)

    $Candidates = @()
    $Candidates += Get-NetFirewallRule -Group $script:MobileRuleGroup -ErrorAction SilentlyContinue
    foreach ($Name in $script:LegacyRuleNames) {
        $Candidates += Get-NetFirewallRule -DisplayName $Name -ErrorAction SilentlyContinue
    }

    $UniqueRules = $Candidates | Where-Object { $null -ne $_ } | Sort-Object -Property Name -Unique
    if ($UniqueRules) {
        $Names = ($UniqueRules | ForEach-Object { $_.DisplayName } | Select-Object -Unique) -join ", "
        $UniqueRules | Remove-NetFirewallRule -ErrorAction Stop
        Write-MobileNetworkLog -Context $Context -Level INFO -Message "Removed managed/legacy mobile firewall rules: $Names"
    }
    else {
        Write-MobileNetworkLog -Context $Context -Level INFO -Message "No managed mobile firewall rules were present."
    }
}

function Get-RuleSnapshot {
    param([Parameter(Mandatory = $true)][string]$DisplayName)

    $Rule = Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Rule) {
        return $null
    }
    $Port = $Rule | Get-NetFirewallPortFilter
    $Application = $Rule | Get-NetFirewallApplicationFilter
    $Address = $Rule | Get-NetFirewallAddressFilter
    return [PSCustomObject]@{
        DisplayName = $Rule.DisplayName
        Enabled = [string]$Rule.Enabled
        Direction = [string]$Rule.Direction
        Action = [string]$Rule.Action
        Profile = [string]$Rule.Profile
        Program = [string]$Application.Program
        Protocol = [string]$Port.Protocol
        LocalPort = [string]$Port.LocalPort
        RemoteAddress = [string]$Address.RemoteAddress
    }
}

function New-MobileFirewallRules {
    param(
        [Parameter(Mandatory = $true)]$Context,
        [Parameter(Mandatory = $true)][string[]]$Profiles
    )

    New-NetFirewallRule `
        -DisplayName $script:MobileInboundRuleName `
        -Group $script:MobileRuleGroup `
        -Description "Allow paired mobile devices on the selected trusted local network profiles to connect to Diagnostic Engine Console." `
        -Enabled True `
        -Direction Inbound `
        -Action Allow `
        -Profile $Profiles `
        -Program $Context.BridgeExe `
        -Protocol TCP `
        -LocalPort $Context.BridgePort `
        -RemoteAddress LocalSubnet `
        -PolicyStore PersistentStore | Out-Null

    New-NetFirewallRule `
        -DisplayName $script:MobileOutboundRuleName `
        -Group $script:MobileRuleGroup `
        -Description "Allow Diagnostic Engine Console responses to paired mobile devices on the selected trusted local network profiles." `
        -Enabled True `
        -Direction Outbound `
        -Action Allow `
        -Profile $Profiles `
        -Program $Context.BridgeExe `
        -Protocol TCP `
        -LocalPort $Context.BridgePort `
        -RemoteAddress LocalSubnet `
        -PolicyStore PersistentStore | Out-Null
}

function Test-BridgeListenerForMobileAccess {
    param([Parameter(Mandatory = $true)]$Context)

    $Listeners = Get-NetTCPConnection -State Listen -LocalPort $Context.BridgePort -ErrorAction SilentlyContinue
    if (-not $Listeners) {
        throw "The Bridge service is not listening on TCP $($Context.BridgePort) after installation. Check the bridge-service logs before pairing a phone."
    }

    $Addresses = @($Listeners | ForEach-Object { $_.LocalAddress } | Select-Object -Unique)
    $HasLanCapableListener = $Addresses | Where-Object { $_ -notin @("127.0.0.1", "::1") }
    if (-not $HasLanCapableListener) {
        throw "The Bridge service is listening only on loopback ($($Addresses -join ', ')) at TCP $($Context.BridgePort). A phone cannot connect until BRIDGE_HOST is set to 0.0.0.0 or a LAN address."
    }

    return $Addresses
}

function Install-MobileNetworkPermissions {
    param(
        [Parameter(Mandatory = $true)][string]$InstallDir,
        [switch]$AllowPublicProfile
    )

    $Context = Get-MobileNetworkContext -InstallDir $InstallDir
    New-Item -ItemType Directory -Path $Context.LogDir -Force | Out-Null
    try {
        Assert-MobileNetworkPrerequisites -Context $Context
        $Profiles = @("Private", "Domain")
        if ($AllowPublicProfile) {
            $Profiles += "Public"
        }

        Remove-MobileNetworkRules -Context $Context
        New-MobileFirewallRules -Context $Context -Profiles $Profiles

        $Inbound = Get-RuleSnapshot -DisplayName $script:MobileInboundRuleName
        $Outbound = Get-RuleSnapshot -DisplayName $script:MobileOutboundRuleName
        if (-not $Inbound -or -not $Outbound) {
            throw "Windows Defender Firewall did not retain both managed mobile-access rules after creation."
        }

        $ListenerAddresses = Test-BridgeListenerForMobileAccess -Context $Context
        $FirewallProfiles = @(Get-NetFirewallProfile -PolicyStore ActiveStore -ErrorAction Stop | Where-Object { $Profiles -contains [string]$_.Name } | ForEach-Object {
            [PSCustomObject]@{
                Name = [string]$_.Name
                Enabled = [string]$_.Enabled
                DefaultInboundAction = [string]$_.DefaultInboundAction
                DefaultOutboundAction = [string]$_.DefaultOutboundAction
                AllowLocalFirewallRules = [string]$_.AllowLocalFirewallRules
            }
        })
        $ProfilesBlockingLocalRules = @($FirewallProfiles | Where-Object { $_.AllowLocalFirewallRules -eq "False" })
        if ($ProfilesBlockingLocalRules.Count -gt 0) {
            $BlockedProfileNames = ($ProfilesBlockingLocalRules | ForEach-Object { $_.Name }) -join ", "
            throw "Windows policy blocks locally installed firewall rules for profile(s): $BlockedProfileNames. Contact the PC/network administrator or apply an enterprise policy rule."
        }

        $ActiveProfiles = @()
        try {
            $ActiveProfiles = @(Get-NetConnectionProfile -ErrorAction Stop | Where-Object { $_.IPv4Connectivity -ne "Disconnected" -or $_.IPv6Connectivity -ne "Disconnected" } | ForEach-Object {
                [PSCustomObject]@{ Name = $_.Name; InterfaceAlias = $_.InterfaceAlias; NetworkCategory = [string]$_.NetworkCategory }
            })
        }
        catch {
            Write-MobileNetworkLog -Context $Context -Level WARN -Message "Could not read active Windows connection profiles: $($_.Exception.Message)"
        }

        $PublicActive = @($ActiveProfiles | Where-Object { $_.NetworkCategory -eq "Public" })
        if ($PublicActive.Count -gt 0 -and -not $AllowPublicProfile) {
            Write-MobileNetworkLog -Context $Context -Level WARN -Message "At least one active network is Public. Mobile access remains intentionally blocked on Public networks. Mark your trusted Wi-Fi as Private or reinstall with the explicit Public-network option."
        }

        $State = [PSCustomObject]@{
            CapturedAt = (Get-Date).ToString("o")
            BridgeExe = $Context.BridgeExe
            BridgeHost = $Context.BridgeHost
            BridgePort = $Context.BridgePort
            AllowedProfiles = $Profiles
            AllowPublicProfile = [bool]$AllowPublicProfile
            ListenerAddresses = @($ListenerAddresses)
            ActiveConnectionProfiles = @($ActiveProfiles)
            EffectiveFirewallProfiles = @($FirewallProfiles)
            Rules = @($Inbound, $Outbound)
        }
        $State | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Context.StateFile -Encoding UTF8
        Write-MobileNetworkLog -Context $Context -Level INFO -Message "Mobile firewall permissions verified: TCP $($Context.BridgePort), profiles=$($Profiles -join ','), executable=$($Context.BridgeExe), listeners=$($ListenerAddresses -join ',')."
    }
    catch {
        Write-MobileNetworkLog -Context $Context -Level ERROR -Message ("Mobile firewall permission setup failed: " + ($_ | Out-String).Trim())
        throw
    }
}

function Uninstall-MobileNetworkPermissions {
    param([Parameter(Mandatory = $true)][string]$InstallDir)

    $Context = Get-MobileNetworkContext -InstallDir $InstallDir
    try {
        Import-Module NetSecurity -ErrorAction Stop
        Remove-MobileNetworkRules -Context $Context
        Remove-Item -LiteralPath $Context.StateFile -Force -ErrorAction SilentlyContinue
    }
    catch {
        Write-MobileNetworkLog -Context $Context -Level WARN -Message "Could not completely remove managed mobile firewall permissions during uninstall: $($_.Exception.Message)"
    }
}
