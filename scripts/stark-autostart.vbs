' Launches STARK and its speech service at login, with no console windows.
'
' Stark is voice-only, so the Python service on :8756 is not optional — without
' it there is no way to talk to the assistant at all. This starts the service
' first, then the app. The app also retries the health check for ~20s, so the
' order here is a nicety rather than a requirement.
'
' Install: put a shortcut to this file in
'   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
' Remove: delete that shortcut.

Option Explicit

Dim sh, fso, repo, uv, exe
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' This script lives in <repo>\scripts, so the repo is its parent.
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
' Prefer the installed app — that is what the Desktop and Start Menu shortcuts
' run, so login and a manual launch always start the same build. Fall back to
' the repo build when Stark has not been installed yet.
exe = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Stark\stark.exe"
If Not fso.FileExists(exe) Then
    exe = repo & "\apps\desktop\src-tauri\target\release\stark.exe"
End If

uv = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & _
     "\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\uv.exe"
If Not fso.FileExists(uv) Then uv = "uv"   ' fall back to PATH

If Not fso.FileExists(exe) Then
    MsgBox "STARK is not built yet." & vbCrLf & vbCrLf & _
           "Missing: " & exe & vbCrLf & vbCrLf & _
           "Build it with:  pnpm build", vbExclamation, "STARK"
    WScript.Quit 1
End If

' Start the speech service. No "is it already running" probe on purpose: if
' something already holds :8756 this second uvicorn simply fails to bind and
' exits, which is harmless and self-correcting. A probe would only add a
' failure mode of its own.
sh.CurrentDirectory = repo
' 0 = hidden window, False = do not wait for it to exit.
sh.Run """" & uv & """ run --project services\ai uvicorn stark_ai.main:app " & _
       "--host 127.0.0.1 --port 8756", 0, False

' The app polls /health for ~20s, so it does not matter that the service is
' still importing when this returns.
sh.Run """" & exe & """", 0, False
