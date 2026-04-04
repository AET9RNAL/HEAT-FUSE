@echo off
color 0A
mode con cols=70 lines=35
:: -------------------------------------------------------
::  Self-elevate to Administrator if not already
:: -------------------------------------------------------
net session >nul 2>&1
if errorlevel 1 (
    echo Requesting administrator privileges ...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -Verb RunAs -FilePath '%~f0' -ArgumentList '%~dp0'"
    exit /b
)
:: Restore working directory (lost after UAC re-launch)
cd /d "%~dp0"

setlocal

set ENV_NAME=heat_saclos
set PYTHON_VER=3.14

:: -------------------------------------------------------
::  Check conda is available
:: -------------------------------------------------------
where conda >nul 2>&1
if errorlevel 1 (
    echo [ERROR] conda not found on PATH.
    echo         Install Miniconda or Anaconda first:
    echo         https://docs.anaconda.com/miniconda/
    pause
    exit /b 1
)

:: -------------------------------------------------------
::  Create environment if it doesn't exist
:: -------------------------------------------------------
conda info --envs | findstr /b /c:"%ENV_NAME%" >nul 2>&1
if errorlevel 1 (
    echo Creating conda environment "%ENV_NAME%" with Python %PYTHON_VER% ...
    conda create -n %ENV_NAME% python=%PYTHON_VER% tk -y
    if errorlevel 1 (
        echo [ERROR] Failed to create conda environment.
        pause
        exit /b 1
    )
) else (
    echo Environment "%ENV_NAME%" already exists. Skipping creation.
)

:: -------------------------------------------------------
::  Activate environment
:: -------------------------------------------------------
call conda activate %ENV_NAME%
if errorlevel 1 (
    echo [ERROR] Failed to activate environment "%ENV_NAME%".
    pause
    exit /b 1
)

:: -------------------------------------------------------
::  Install / update pip dependencies
:: -------------------------------------------------------
echo Installing pip dependencies ...
pip install -r "%~dp0requirements.txt"
if errorlevel 1 (
    echo [ERROR] pip install failed.
    pause
    exit /b 1
)

:: -------------------------------------------------------
::  Interactive menu
:: -------------------------------------------------------
:menu
echo.
echo ======================================================
echo   HEAT SACLOS - Environment "%ENV_NAME%" is ready
echo ======================================================
echo.
echo   [1] Run Predictor   (run_predictor.py)
echo   [2] Run Trainer     (run_trainer.py)
echo   [3] Run Refiner     (run_refiner.py)
echo   [4] Open shell in environment
echo   [5] Exit
echo.
echo   NOTE: For OCR features, install Tesseract separately:
echo         https://github.com/tesseract-ocr/tesseract
echo ======================================================
echo.
choice /c 12345 /n /m "Select option [1-5]: "
if errorlevel 5 goto quit
if errorlevel 4 goto open_shell
if errorlevel 3 goto run_refiner
if errorlevel 2 goto run_trainer
if errorlevel 1 goto run_predictor
goto menu

:run_predictor
echo.
echo Starting Predictor ...
python "%~dp0run_predictor.py"
echo.
echo Predictor exited.
goto menu

:run_trainer
echo.
echo Starting Trainer ...
python "%~dp0run_trainer.py"
echo.
echo Trainer exited.
goto menu

:run_refiner
echo.
echo Starting Refiner ...
python "%~dp0run_refiner.py"
echo.
echo Refiner exited.
goto menu

:open_shell
echo.
echo Opening shell with "%ENV_NAME%" active.
echo Type "exit" to return to the menu.
cmd /k "cd /d %~dp0"
goto menu

:quit
endlocal
