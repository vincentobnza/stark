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

Dim sh, fso, repo, uv, exe, svcRunning
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' This script lives in <repo>\scripts, so the repo is its parent.
repo = fso.GetParentFolderName(fso.GetParentFolderName(WScript.ScriptFullName))
exe  = repo & "\apps\desktop\src-tauri\target\release\stark.exe"

uv = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & _
     "\Microsoft\WinGet\Packages\astral-sh.uv_Microsoft.Winget.Source_8wekyb3d8bbwe\uv.exe"
If Not fso.FileExists(uv) Then uv = "uv"   ' fall back to PATH

If Not fso.FileExists(exe) Then
    MsgBox "STARK is not built yet." & vbCrLf & vbCrLf & _
           "Missing: " & exe & vbCrLf & vbCrLf & _
           "Build it with:  pnpm build", vbExclamation, "STARK"
    WScript.Quit 1
End If

' Skip the service if something is already serving :8756.
svcRunning = False
On Error Resume Next
Dim http
Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
http.SetTimeouts 800, 800, 800, 800
http.Open "GET", "http://127.0.0.1:8756/health", False
http.Send
If Err.Number = 0 And http.Status = 200 Then svcRunning = True
Err.Clear
On Error GoTo 0

If Not svcRunning Then
    sh.CurrentDirectory = repo
    ' 0 = hidden window, False = do not wait for it to exit.
    sh.Run """" & uv & """ run --project services\ai uvicorn stark_ai.main:app " & _
           "--host 127.0.0.1 --port 8756", 0, False
End If

sh.Run """" & exe & """", 0, False
