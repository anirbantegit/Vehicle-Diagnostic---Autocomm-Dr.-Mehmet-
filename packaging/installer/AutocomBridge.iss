#define MyAppName "Diagnostic Engine Console"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Diagnostic Engine Console"
#define MyAppExeName "AutocomBridgeService.exe"

[Setup]
AppId={{A7D5B6CB-7B8C-4BC6-A2A9-9C6E0DF182E1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\DiagnosticEngineConsole
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\..\dist\installer
OutputBaseFilename=DiagnosticEngineConsoleSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayName={#MyAppName}

; Runtime data folders are created by create_env.ps1 from AUTOCOM_BRIDGE_DATA_DIR.
; This prevents the installer from creating a second hardcoded ProgramData root.

[InstallDelete]
Type: files; Name: "{app}\.env.prod"
Type: files; Name: "{app}\.env.fallback"

[Files]
Source: "..\..\dist\AutocomBridgeService\*"; DestDir: "{app}\AutocomBridgeService"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\dist\AutocomDesktopAgent\*"; DestDir: "{app}\AutocomDesktopAgent"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\dist\installer_payload\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\dist\installer_payload\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion
Source: "..\..\dist\installer_payload\config\.env.prod"; DestDir: "{app}"; DestName: ".env.prod"; Flags: ignoreversion skipifsourcedoesntexist
Source: "..\..\dist\installer_payload\config\.env.fallback"; DestDir: "{app}"; DestName: ".env.fallback"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\Open {#MyAppName}"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""
Name: "{commondesktop}\{#MyAppName}"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional shortcuts:"
Name: "lanaccess"; Description: "Allow paired mobile devices on trusted local networks (Windows Defender Firewall)"; GroupDescription: "Mobile connection:"; Flags: checkedonce
Name: "lanaccess\public"; Description: "Also allow mobile access while Windows marks the network as Public (less secure)"; GroupDescription: "Mobile connection:"; Flags: unchecked

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\create_env.ps1"""; Flags: runhidden waituntilterminated logoutput
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_service.ps1"""; Flags: runhidden waituntilterminated logoutput
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\configure_firewall.ps1"""; Flags: runhidden waituntilterminated logoutput; Tasks: lanaccess and not lanaccess\public
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\configure_firewall.ps1"" -AllowPublicProfile"; Flags: runhidden waituntilterminated logoutput; Tasks: lanaccess\public
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\remove_firewall.ps1"""; Flags: runhidden waituntilterminated logoutput; Tasks: not lanaccess
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_agent_task.ps1"""; Flags: runhidden waituntilterminated logoutput
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""; Description: "Open {#MyAppName}"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\remove_firewall.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallMobileLanFirewallRule"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall_agent_task.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallAgentTask"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall_service.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallBridgeService"
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\uninstall_cleanup.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallGeneratedData"

[UninstallDelete]
; Generated runtime configuration and any remaining installed files must not leave an orphan application folder.
Type: files; Name: "{app}\.env"
Type: filesandordirs; Name: "{app}"