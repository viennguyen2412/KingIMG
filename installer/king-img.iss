; King Img — Inno Setup script
; Build: dotnet publish -c Release  (must run before compiling this script)
; Compile: mở file này bằng Inno Setup Compiler, hoặc
;   "%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe" installer\king-img.iss

#define MyAppName "King Img"
#define MyAppVersion "1.1.3"
#define MyAppPublisher "Vien Nguyen"
#define MyAppURL "https://github.com/viennguyen2412/KingIMG"
#define MyAppExeName "KingImg.exe"
#define MySourceDir "..\bin\Release\net8.0-windows\win-x64\publish"

[Setup]
AppId={{30DB360E-9EA9-45EF-85F1-05E4FE2A4B15}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}/releases
DefaultDirName={localappdata}\Programs\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=Output
OutputBaseFilename=KingImgSetup-{#MyAppVersion}
SetupIconFile=..\build\icon.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Tạo shortcut ngoài Desktop"; GroupDescription: "Shortcut bổ sung:"; Flags: unchecked

[Files]
; Chỉ đóng gói file exe self-contained (không kèm .pdb, không kèm KingImg.portable.json —
; thiếu file marker này thì AppPaths.ResolvePortableRoot() sẽ tự rơi về thư mục cạnh exe,
; tức đúng thư mục cài per-user ghi được — xem AppPaths trong MainForm.cs).
Source: "{#MySourceDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Mở {#MyAppName} ngay"; Flags: nowait postinstall skipifsilent

; Không khai báo [UninstallDelete] cho thư mục Data\ — gỡ cài đặt chỉ xoá file chương trình,
; giữ nguyên preset/mẫu/font người dùng đã lưu trong {app}\Data\.
