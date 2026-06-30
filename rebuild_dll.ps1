$env:PATH = "C:\Program Files\Microsoft Visual Studio\18\Community\MSBuild\Current\Bin;" +
            "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Tools\Llvm\x64\bin;" +
            $env:PATH

# Kill any process holding the DLL
Get-Process python* -ErrorAction SilentlyContinue | Stop-Process -Force

msbuild "$PSScriptRoot\backend\native\rive_plugin\build\vs2022\rive_plugin.sln" `
    /p:Configuration=Release /p:Platform=x64 /m /nologo
