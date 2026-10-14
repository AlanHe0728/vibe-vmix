@echo off
setlocal
pushd "%~dp0"
set "archive=足球转播控制台-1.0.0-Windows-x64.zip"
if not exist "%archive%.001" goto missing
if not exist "%archive%.002" goto missing
if exist "%archive%" (
  echo The combined ZIP already exists. Move it first if you want to rebuild it.
  popd
  exit /b 1
)
copy /b "%archive%.001"+"%archive%.002" "%archive%.joining" >nul
if errorlevel 1 goto failed
move "%archive%.joining" "%archive%" >nul
if errorlevel 1 goto failed
echo Combined archive created: %archive%
echo Verify the SHA256 value shown on the Gitee Release page before extracting.
certutil -hashfile "%archive%" SHA256
popd
pause
exit /b 0
:missing
echo Download both .001 and .002 parts to this folder first.
popd
pause
exit /b 1
:failed
echo Could not combine the release parts.
del /q "%archive%.joining" 2>nul
popd
pause
exit /b 1
