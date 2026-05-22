#define MyAppName "Autocom Bridge"
#define MyAppVersion "0.1.0"
#define MyAppPublisher "Autocom Bridge"
#define MyAppExeName "AutocomBridgeService.exe"

[Setup]
AppId={{A7D5B6CB-7B8C-4BC6-A2A9-9C6E0DF182E1}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\AutocomBridge
DefaultGroupName=Autocom Bridge
DisableProgramGroupPage=yes
OutputDir=..\..\dist\installer
OutputBaseFilename=AutocomBridgeSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64
UninstallDisplayName=Autocom Bridge

[Dirs]
Name: "{commonappdata}\AutocomBridge"
Name: "{commonappdata}\AutocomBridge\logs"
Name: "{commonappdata}\AutocomBridge\outputs"
Name: "{commonappdata}\AutocomBridge\screenshots"

[Files]
Source: "..\..\dist\AutocomBridgeService\*"; DestDir: "{app}\AutocomBridgeService"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\dist\AutocomDesktopAgent\*"; DestDir: "{app}\AutocomDesktopAgent"; Flags: recursesubdirs createallsubdirs ignoreversion
Source: "..\..\dist\installer_payload\scripts\*"; DestDir: "{app}\scripts"; Flags: ignoreversion
Source: "..\..\dist\installer_payload\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion

[Icons]
Name: "{group}\Open Autocom Bridge Admin"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""
Name: "{commondesktop}\Autocom Bridge Admin"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Run]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\create_env.ps1"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_service.ps1"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\install_agent_task.ps1"""; Flags: runhidden waituntilterminated
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\open_admin.ps1"""; Description: "Open Autocom Bridge Admin"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall_agent_task.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallAgentTask"
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\scripts\uninstall_service.ps1"""; Flags: runhidden waituntilterminated; RunOnceId: "UninstallBridgeService"