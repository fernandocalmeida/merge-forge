' Abre o Merge Forge: liga o app se ele estiver desligado e abre no navegador.
' E o que o atalho "Merge Forge" (area de trabalho e menu Iniciar) executa.
Option Explicit
Dim fso, sh, pasta, porta, i, arq, linha
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)

' porta: a do .env (PORT=...), ou 8798
porta = "8798"
If fso.FileExists(pasta & "\.env") Then
  Set arq = fso.OpenTextFile(pasta & "\.env", 1)
  Do Until arq.AtEndOfStream
    linha = Trim(arq.ReadLine)
    If Left(linha, 5) = "PORT=" Then porta = Trim(Mid(linha, 6))
  Loop
  arq.Close
End If

If Not Responde() Then
  If fso.FileExists(pasta & "\iniciar.cmd") Then
    sh.Run "cmd /c """ & pasta & "\iniciar.cmd""", 0, False
    For i = 1 To 60
      WScript.Sleep 500
      If Responde() Then Exit For
    Next
  End If
End If
sh.Run "http://localhost:" & porta & "/"

Function Responde()
  Dim h
  On Error Resume Next
  Set h = CreateObject("MSXML2.ServerXMLHTTP.6.0")
  h.setTimeouts 1000, 1000, 1000, 1000
  h.Open "GET", "http://127.0.0.1:" & porta & "/api/sessao", False
  h.Send
  Responde = (Err.Number = 0)
  If Responde Then Responde = (h.Status > 0)
  On Error GoTo 0
End Function
