@echo off
setlocal EnableExtensions DisableDelayedExpansion

rem BLE Bot one-click setup and launch script for Windows.
rem It intentionally never writes secrets or overwrites existing .env values.

set "EXIT_CODE=1"
set "DEPLOY_TEST_COMMANDS=0"
set "REDEPLOY_TEST_COMMANDS=0"
set "SHOW_HELP=0"
set "NO_PAUSE=0"

for %%A in (%*) do (
  if /I "%%~A"=="--deploy-test-commands" set "DEPLOY_TEST_COMMANDS=1"
  if /I "%%~A"=="--redeploy-test-commands" (
    set "DEPLOY_TEST_COMMANDS=1"
    set "REDEPLOY_TEST_COMMANDS=1"
  )
  if /I "%%~A"=="--help" set "SHOW_HELP=1"
  if /I "%%~A"=="-h" set "SHOW_HELP=1"
)

set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%" || (
  echo ERROR: Cannot open the directory containing this script.
  goto :finish
)

if "%SHOW_HELP%"=="1" goto :usage

call :header
call :check_windows || goto :failed
call :check_project_root || goto :failed
call :ensure_git || goto :failed
call :ensure_node || goto :failed
call :ensure_corepack_and_pnpm || goto :failed
call :ensure_docker || goto :failed
call :install_dependencies || goto :failed
call :create_env || goto :failed
call :sync_optional_emoji_defaults || goto :failed
call :validate_environment || goto :failed
call :build_project || goto :failed
call :start_dependencies || goto :failed
call :wait_for_service postgres || goto :failed
call :wait_for_service redis || goto :failed
call :wait_for_service lavalink || goto :failed
call :build_container_images || goto :failed
call :run_migrations || goto :failed
call :generate_database_client_if_configured || goto :failed
call :deploy_test_commands_if_requested || goto :failed
call :start_application || goto :failed

echo.
echo BLE Bot and the background worker are running.
echo Press Ctrl+C to stop viewing logs. The Docker services will keep running.
echo Run "%~nx0 --deploy-test-commands" once to deploy test-guild commands.
echo.
%COMPOSE% logs --follow --tail=100 bot worker
set "EXIT_CODE=%ERRORLEVEL%"
if not "%EXIT_CODE%"=="0" (
  echo.
  echo ERROR: Log streaming stopped unexpectedly. Inspect service logs with:
  echo        %COMPOSE% logs --tail=100 bot worker
  goto :finish
)

set "EXIT_CODE=0"
goto :finish

:usage
call :header
echo Usage: %~nx0 [--deploy-test-commands^|--redeploy-test-commands]
set "EXIT_CODE=0"
set "NO_PAUSE=1"
goto :finish

:header
echo.
echo ================================================================
echo                         BLE BOT STARTUP
echo ================================================================
echo Operating system: Windows (%OS%)
echo Repository directory: %CD%
echo.
exit /b 0

:check_windows
if /I not "%OS%"=="Windows_NT" (
  echo ERROR: setup-and-run.bat must be run on Windows.
  exit /b 1
)
exit /b 0

:check_project_root
set "COMPOSE_FILE="
for %%F in (package.json pnpm-lock.yaml .env.example) do (
  if not exist "%%F" (
    echo ERROR: Missing %%F. Run this script from the BLE Bot project root.
    exit /b 1
  )
)
if exist "docker-compose.yml" set "COMPOSE_FILE=docker-compose.yml"
if not defined COMPOSE_FILE if exist "compose.yaml" set "COMPOSE_FILE=compose.yaml"
if not defined COMPOSE_FILE (
  echo ERROR: Missing docker-compose.yml or compose.yaml. Run this script from the BLE Bot project root.
  exit /b 1
)
set "COMPOSE=docker compose -f "%COMPOSE_FILE%""
echo Project root verified. Compose file: %COMPOSE_FILE%
exit /b 0

:ensure_git
where git >nul 2>nul
if not errorlevel 1 (
  for /f "tokens=*" %%V in ('git --version') do echo Git: %%V
  exit /b 0
)

echo Git was not found. Attempting a supported installation through winget...
call :install_with_winget Git.Git "Git"
exit /b %ERRORLEVEL%

:ensure_node
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Attempting a supported LTS installation through winget...
  call :install_with_winget OpenJS.NodeJS.LTS "Node.js LTS"
  exit /b %ERRORLEVEL%
)

for /f "tokens=*" %%V in ('node -p "process.version"') do set "CURRENT_NODE_VERSION=%%V"
for /f "tokens=*" %%V in ('node -p "require('./package.json').engines && require('./package.json').engines.node || 'not declared'"') do set "REQUIRED_NODE_VERSION=%%V"
rem Avoid shell redirection characters inside this inline JavaScript command.
node -e "const r=require('./package.json').engines?.node||'';const p=process.versions.node.split('.').map(Number);const c=String.fromCharCode;const v=function(t){return t?t.replace(/[^0-9.]/g,'').split('.').map(Number):null};const f=function(t){return r.split(/\s+/).find(function(x){return x.startsWith(t)})};const lo=v(f(c(62,61))),hi=v(f(c(60)));const q=function(a,b){return a.reduce(function(z,x,i){return z||Math.sign(x-b[i])},0)};process.exit((!lo||q(p,lo)!==-1)&&(!hi||q(p,hi)===-1)?0:1)"
if errorlevel 1 (
  echo ERROR: Installed Node.js version is not supported by this project.
  echo Current version: %CURRENT_NODE_VERSION%
  echo Required version: %REQUIRED_NODE_VERSION%
  echo Upgrade instruction: winget install --id OpenJS.NodeJS.LTS --exact
  echo Then close and reopen this terminal, and run this script again.
  exit /b 1
)
echo Node.js: %CURRENT_NODE_VERSION% ^(required: %REQUIRED_NODE_VERSION%^)
exit /b 0

:ensure_corepack_and_pnpm
for /f "tokens=*" %%V in ('node -p "require('./package.json').packageManager || ''"') do set "PACKAGE_MANAGER=%%V"
echo %PACKAGE_MANAGER% | findstr /R /C:"^pnpm@" >nul
if errorlevel 1 (
  echo ERROR: package.json must declare a pnpm packageManager version.
  exit /b 1
)

where corepack >nul 2>nul
if errorlevel 1 (
  echo Corepack was not found. Installing Corepack with the installed Node.js runtime...
  call npm install --global corepack@latest
  if errorlevel 1 (
    echo ERROR: Corepack installation failed. Run "npm install --global corepack@latest" and retry.
    exit /b 1
  )
)

rem Do not run "corepack enable" here. It rewrites shims in Node's install
rem directory, which is commonly protected by Windows. Invoking Corepack
rem directly still installs and uses the packageManager-pinned pnpm safely.
set "PNPM=corepack pnpm"
call %PNPM% --version >nul 2>nul
if errorlevel 1 (
  echo ERROR: Corepack could not provision the pnpm version declared in package.json: %PACKAGE_MANAGER%
  echo Check your internet connection, then run "corepack pnpm --version" and retry.
  exit /b 1
)
for /f "tokens=*" %%V in ('corepack pnpm --version') do echo pnpm: %%V ^(managed by Corepack^)
exit /b 0

:ensure_docker
where docker >nul 2>nul
if errorlevel 1 (
  echo Docker was not found. Attempting a supported Docker Desktop installation through winget...
  call :install_with_winget Docker.DockerDesktop "Docker Desktop"
  exit /b %ERRORLEVEL%
)
docker compose version >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker Compose v2 is required.
  echo Install or update Docker Desktop, then run this script again:
  echo docker desktop install --accept-license
  exit /b 1
)
docker info >nul 2>nul
if errorlevel 1 (
  echo ERROR: Docker is installed but its engine is not ready.
  echo Start Docker Desktop, wait until it reports "Engine running", then run this script again.
  exit /b 1
)
for /f "tokens=*" %%V in ('docker compose version') do echo Docker Compose: %%V
exit /b 0

:install_with_winget
set "WINGET_ID=%~1"
set "WINGET_NAME=%~2"
where winget >nul 2>nul
if errorlevel 1 (
  echo ERROR: %WINGET_NAME% is required and winget is unavailable.
  echo Install it, then run this script again.
  exit /b 1
)
winget install --id %WINGET_ID% --exact --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
  echo ERROR: The %WINGET_NAME% installation did not complete.
  exit /b 1
)
echo %WINGET_NAME% was installed. Close and reopen this terminal so PATH updates, then run this script again.
exit /b 1

:install_dependencies
echo.
echo Installing project dependencies from pnpm-lock.yaml...
call %PNPM% install --frozen-lockfile
if errorlevel 1 (
  echo ERROR: Dependency installation failed. Check pnpm's output above.
  exit /b 1
)
exit /b 0

:create_env
if exist ".env" (
  echo .env already exists; leaving it unchanged.
  exit /b 0
)
copy /Y ".env.example" ".env" >nul
if errorlevel 1 (
  echo ERROR: Unable to create .env from .env.example.
  exit /b 1
)
echo Created .env from .env.example. Add your Discord credentials and rerun this script.
exit /b 0

:sync_optional_emoji_defaults
node -e "const fs=require('fs');const {parse}=require('dotenv');const example=parse(fs.readFileSync('.env.example'));const current=parse(fs.readFileSync('.env'));const additions=Object.entries(example).filter(function(entry){return entry[0].startsWith('BLE_EMOJI_') && !(entry[0] in current)});if(additions.length){fs.appendFileSync('.env','\r\n# Optional BLE application emoji defaults\r\n'+additions.map(function(entry){return entry[0]+'='+entry[1]}).join('\r\n')+'\r\n');console.log('Added '+additions.length+' missing optional BLE emoji setting(s) without changing existing .env values.')}"
if errorlevel 1 (
  echo ERROR: Unable to add optional BLE emoji settings from .env.example.
  exit /b 1
)
exit /b 0

:validate_environment
node -e "const fs=require('fs'); const {parse}=require('dotenv'); const env=parse(fs.readFileSync('.env')); const required=['DISCORD_TOKEN','DISCORD_CLIENT_ID','DATABASE_URL','REDIS_URL']; const missing=required.filter(function(key){return !env[key]?.trim()}); if(missing.length){console.error('Required .env values are missing: '+missing.join(', ')+'. Edit .env without committing it, then retry.'); process.exit(1)}"
if errorlevel 1 exit /b 1
call %PNPM% env:validate
if errorlevel 1 (
  echo ERROR: Environment validation failed. Correct .env and retry; values were not displayed.
  exit /b 1
)
echo Environment validation passed. Secret values were not displayed.
exit /b 0

:build_project
echo.
echo Building the TypeScript project...
call %PNPM% build
if errorlevel 1 (
  echo ERROR: TypeScript build failed. Fix the reported errors before starting BLE Bot.
  exit /b 1
)
exit /b 0

:start_dependencies
echo.
echo Starting PostgreSQL, Redis, and Lavalink...
%COMPOSE% up --detach postgres redis lavalink
if errorlevel 1 (
  echo ERROR: Could not start the required Docker services.
  exit /b 1
)
exit /b 0

:wait_for_service
setlocal EnableDelayedExpansion
set "SERVICE=%~1"
set "CONTAINER_ID="
set "SERVICE_STATUS="
echo Waiting for %SERVICE% to become healthy...
for /L %%N in (1,1,90) do (
  set "CONTAINER_ID="
  set "SERVICE_STATUS="
  for /f "tokens=*" %%C in ('%COMPOSE% ps -q %SERVICE%') do set "CONTAINER_ID=%%C"
  if defined CONTAINER_ID (
    for /f "tokens=*" %%H in ('docker inspect --format "{{.State.Health.Status}}" "!CONTAINER_ID!" 2^>nul') do set "SERVICE_STATUS=%%H"
    if /I "!SERVICE_STATUS!"=="healthy" (
      echo %SERVICE% is healthy.
      endlocal & exit /b 0
    )
    if /I "!SERVICE_STATUS!"=="unhealthy" goto :service_unhealthy
  )
  timeout /t 2 /nobreak >nul
)
:service_unhealthy
echo ERROR: %SERVICE% did not become healthy within 180 seconds.
echo Recent %SERVICE% logs:
%COMPOSE% logs --tail=50 %SERVICE%
echo Correct the service issue above, then rerun this script. Existing volumes were not changed.
endlocal & exit /b 1

:build_container_images
echo.
echo Building Docker images (Docker will reuse unchanged layers)...
%COMPOSE% build bot worker
if errorlevel 1 (
  echo ERROR: Docker image build failed.
  exit /b 1
)
exit /b 0

:run_migrations
echo Applying database migrations without resetting existing data...
%COMPOSE% run --rm --no-deps bot node dist/scripts/migrate.js
if errorlevel 1 (
  echo ERROR: Database migration failed. Inspect the migration output; no database reset was attempted.
  exit /b 1
)
exit /b 0

:generate_database_client_if_configured
node -e "process.exit(require('./package.json').scripts?.['prisma:generate'] ? 0 : 1)"
if errorlevel 1 (
  echo Database client generation is not configured; this project uses Drizzle's runtime client.
  exit /b 0
)
echo Generating the configured database client...
call %PNPM% run prisma:generate
if errorlevel 1 (
  echo ERROR: Database client generation failed.
  exit /b 1
)
exit /b 0

:deploy_test_commands_if_requested
if "%DEPLOY_TEST_COMMANDS%"=="0" (
  echo Test-guild command deployment skipped. Use --deploy-test-commands when ready.
  exit /b 0
)
set "COMMAND_DEPLOYMENT_KEY="
for /f "tokens=*" %%K in ('node -e "const fs=require('fs'); const {parse}=require('dotenv'); const e=parse(fs.readFileSync('.env')); if(!e.DISCORD_TEST_GUILD_ID){process.exit(1)} console.log((e.DISCORD_CLIENT_ID||'')+'-'+e.DISCORD_TEST_GUILD_ID)"') do set "COMMAND_DEPLOYMENT_KEY=%%K"
if not defined COMMAND_DEPLOYMENT_KEY (
  echo ERROR: DISCORD_TEST_GUILD_ID is required to deploy test-guild commands.
  exit /b 1
)
if not exist ".ble-bot-setup" mkdir ".ble-bot-setup"
set "COMMAND_MARKER=.ble-bot-setup\test-guild-commands-%COMMAND_DEPLOYMENT_KEY%.deployed"
if exist "%COMMAND_MARKER%" if "%REDEPLOY_TEST_COMMANDS%"=="0" (
  echo Test-guild commands were already deployed for this application and guild; skipping.
  exit /b 0
)
echo Deploying test-guild commands...
call %PNPM% commands:deploy:test
if errorlevel 1 (
  echo ERROR: Test-guild command deployment failed; no deployment marker was written.
  exit /b 1
)
> "%COMMAND_MARKER%" echo Deployed successfully on %DATE% %TIME%.
echo Test-guild command deployment completed.
exit /b 0

:start_application
echo Starting BLE Bot and its background worker...
%COMPOSE% up --detach --no-deps bot worker
if errorlevel 1 (
  echo ERROR: Could not start the BLE Bot or worker containers.
  exit /b 1
)
exit /b 0

:failed
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo.
echo BLE Bot setup did not complete. Resolve the message above and rerun this script.

:finish
if "%EXIT_CODE%"=="0" (
  echo.
  echo BLE Bot setup completed successfully.
) else (
  echo.
  echo Exiting with code %EXIT_CODE%.
)
if not "%NO_PAUSE%"=="1" (
  echo Press any key to close this window.
  pause >nul
)
endlocal & exit /b %EXIT_CODE%
