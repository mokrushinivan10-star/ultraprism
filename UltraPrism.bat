@echo off
setlocal EnableExtensions
chcp 65001 >nul
title UltraPrism
echo Запуск UltraPrism...

where node >nul 2>&1
if errorlevel 1 goto WSL

pushd "%~dp0" 2>nul
if errorlevel 1 goto WSL
if not exist "package.json" (
  popd
  goto WSL
)

if not exist "node_modules\" (
  echo Первая установка, подождите...
  call npm install
  if errorlevel 1 (
    echo npm install не прошёл.
    popd
    pause
    exit /b 1
  )
)

curl.exe -sf -o NUL --max-time 2 http://127.0.0.1:43123
if errorlevel 1 (
  echo Поднимаю интерфейс...
  if exist ".next\BUILD_ID" (
    start "UltraPrism server" /min cmd /c "npm run start"
  ) else (
    start "UltraPrism server" /min cmd /c "npm run dev"
  )
)

set /a N=0
:WAITWIN
curl.exe -sf -o NUL --max-time 2 http://127.0.0.1:43123
if not errorlevel 1 goto OPEN
set /a N+=1
if %N% GEQ 60 goto FAILWIN
timeout /t 1 /nobreak >nul
goto WAITWIN

:FAILWIN
echo Сервер не ответил за минуту.
popd
pause
exit /b 1

:OPEN
popd
start "" "http://127.0.0.1:43123"
exit /b 0

:WSL
echo Подключаюсь к Ubuntu...
echo Если окно остаётся черным больше 20 секунд, закройте его и в PowerShell выполните: wsl --shutdown
wsl.exe -d Ubuntu -e bash -lc "echo UltraPrism: Ubuntu ответила. && bash $HOME/ultraprism/scripts/start-ultraprism.sh"
if errorlevel 1 (
  echo.
  echo Ubuntu не ответила. Черный экран значит, что окно открылось, а оболочка зависла.
  echo Откройте PowerShell и выполните по очереди:
  echo   wsl --shutdown
  echo   wsl -l -v
  echo   wsl --set-default Ubuntu
  echo   wsl -d Ubuntu -e echo OK
  pause
  exit /b 1
)
start "" "http://127.0.0.1:43123"
exit /b 0
