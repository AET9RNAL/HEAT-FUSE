-- premake5.lua — game_memory DLL build script
--
-- Prerequisites:
--   Visual Studio 2022 with "Desktop development with C++" workload
--
-- 1. Generate the chain table (once per pointer_chains.json change):
--      python scripts/gen_chains.py
--
-- 2. Generate VS solution:
--      cd native/game_memory
--      premake5 vs2022
--
-- 3. Build:
--      msbuild build/vs2022/game_memory.sln /p:Configuration=Release /p:Platform=x64
--
-- Output: native/bin/game_memory.dll

workspace "game_memory"
    configurations { "Release", "Debug" }
    architecture   "x64"
    location       ("build/" .. _ACTION)

project "game_memory"
    kind        "SharedLib"
    language    "C"
    cdialect    "C17"

    files       { "game_memory.h", "game_memory.c", "generated_chains.h" }

    defines       { "GM_EXPORTS", "WIN32_LEAN_AND_MEAN", "NOMINMAX" }
    characterset  "MBCS"

    links         { "kernel32" }

    targetdir   "../bin"
    implibdir   ("build/" .. _ACTION .. "/%{cfg.buildcfg}")
    objdir      ("build/" .. _ACTION .. "/obj/%{cfg.buildcfg}")

    filter "configurations:Release"
        optimize    "On"
        symbols     "Off"

    filter "configurations:Debug"
        optimize    "Off"
        symbols     "On"
        defines     { "_DEBUG" }
