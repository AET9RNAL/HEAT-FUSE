-- premake5.lua — rive_plugin DLL build script
--
-- Prerequisites:
--   1. Visual Studio 2022 with "Desktop development with C++" workload
--   2. rive-runtime built (see below)
--
-- Build rive-runtime first:
--   git clone https://github.com/rive-app/rive-runtime D:\rive-runtime
--   cd D:\rive-runtime
--   premake5 vs2022
--   msbuild build\vs2022\rive.sln /p:Configuration=Release /p:Platform=x64
--
-- Then build this DLL:
--   cd native\rive_plugin
--   premake5 vs2026 --rive-dir=D:\rive-runtime   (or vs2022 if premake doesn't know vs2026 yet)
--   msbuild build\vs2026\rive_plugin.sln /p:Configuration=Release /p:Platform=x64
--
-- Output: native/bin/rive_plugin.dll

newoption {
    trigger     = "rive-dir",
    value       = "PATH",
    description = "Path to rive-runtime checkout (can also set RIVE_RUNTIME_DIR env var)",
}

local riveDir = _OPTIONS["rive-dir"] or os.getenv("RIVE_RUNTIME_DIR") or ""
if riveDir == "" then
    error("Provide rive-runtime path: premake5 vs2022 --rive-dir=D:\\rive-runtime")
end

workspace "rive_plugin"
    configurations { "Release", "Debug" }
    architecture   "x64"
    location       ("build/" .. _ACTION)

project "rive_plugin"
    kind        "SharedLib"
    language    "C++"
    cppdialect  "C++17"

    files { "rive_plugin.cpp", "rive_plugin.h" }

    defines { "RIVE_PLUGIN_EXPORTS" }

    includedirs {
        riveDir .. "/include",
    }

    libdirs {
        riveDir .. "/build/lib/%{cfg.buildcfg}",
    }

    links {
        "rive",
        "rive_renderer",
        "rive_decoders",
        "d3d11",
        "dxgi",
        "dxguid",
    }

    -- Drop DLL directly into native/bin/
    targetdir  "../../bin"
    implibdir  ("build/" .. _ACTION .. "/%{cfg.buildcfg}")
    objdir     ("build/" .. _ACTION .. "/obj/%{cfg.buildcfg}")

    filter "configurations:Release"
        optimize "On"
        symbols  "Off"

    filter "configurations:Debug"
        optimize "Off"
        symbols  "On"
        defines  { "_DEBUG" }
