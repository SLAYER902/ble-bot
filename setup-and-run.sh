#!/usr/bin/env bash
# BLE Bot one-click setup and launch script for Linux.
# It intentionally never writes secrets or overwrites an existing .env file.

set -Eeuo pipefail

SCRIPT_NAME="$(basename -- "${BASH_SOURCE[0]}")"
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
DEPLOY_TEST_COMMANDS=0
REDEPLOY_TEST_COMMANDS=0

for argument in "$@"; do
  case "$argument" in
    --deploy-test-commands)
      DEPLOY_TEST_COMMANDS=1
      ;;
    --redeploy-test-commands)
      DEPLOY_TEST_COMMANDS=1
      REDEPLOY_TEST_COMMANDS=1
      ;;
    --help|-h)
      printf 'Usage: ./%s [--deploy-test-commands|--redeploy-test-commands]\n' "$SCRIPT_NAME"
      exit 0
      ;;
    *)
      printf 'ERROR: Unknown option: %s\n' "$argument" >&2
      exit 2
      ;;
  esac
done

on_error() {
  local status=$?
  printf '\nBLE Bot setup did not complete (exit code %s). Resolve the message above and rerun this script.\n' "$status" >&2
  exit "$status"
}

trap on_error ERR

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

header() {
  printf '\n%s\n' '================================================================'
  printf '%s\n' '                        BLE BOT STARTUP'
  printf '%s\n' '================================================================'
  printf 'Operating system: %s\n' "$(uname -s)"
  printf 'Repository directory: %s\n\n' "$PWD"
}

check_linux() {
  [[ "$(uname -s)" == 'Linux' ]] || die 'setup-and-run.sh must be run on Linux with Bash.'
}

check_project_root() {
  local file
  for file in package.json pnpm-lock.yaml .env.example; do
    [[ -f "$file" ]] || die "Missing $file. Run this script from the BLE Bot project root."
  done

  if [[ -f docker-compose.yml ]]; then
    COMPOSE_FILE='docker-compose.yml'
  elif [[ -f compose.yaml ]]; then
    COMPOSE_FILE='compose.yaml'
  else
    die 'Missing docker-compose.yml or compose.yaml. Run this script from the BLE Bot project root.'
  fi

  COMPOSE=(docker compose -f "$COMPOSE_FILE")
  printf 'Project root verified. Compose file: %s\n' "$COMPOSE_FILE"
}

run_with_sudo() {
  if (( EUID == 0 )); then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo "$@"
  else
    die "Administrator access is needed to install $*. Install it manually, then rerun this script."
  fi
}

install_system_package() {
  local package_name=$1
  if command -v apt-get >/dev/null 2>&1; then
    run_with_sudo apt-get update
    run_with_sudo apt-get install -y "$package_name"
  elif command -v dnf >/dev/null 2>&1; then
    run_with_sudo dnf install -y "$package_name"
  elif command -v yum >/dev/null 2>&1; then
    run_with_sudo yum install -y "$package_name"
  elif command -v pacman >/dev/null 2>&1; then
    run_with_sudo pacman -Sy --noconfirm "$package_name"
  else
    die "No supported package manager was found to install $package_name. Install it manually, then retry."
  fi
}

node_engine_range() {
  if command -v node >/dev/null 2>&1; then
    node -p "require('./package.json').engines?.node ?? 'not declared'"
  else
    sed -nE 's/.*"node"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' package.json | head -n 1
  fi
}

node_install_major() {
  local range
  range=$(node_engine_range 2>/dev/null || true)
  local upper_bound_regex='<[[:space:]]*([0-9]+)'
  local lower_bound_regex='>=[[:space:]]*([0-9]+)'
  if [[ $range =~ $upper_bound_regex ]]; then
    printf '%s\n' "$((BASH_REMATCH[1] - 1))"
  elif [[ $range =~ $lower_bound_regex ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  else
    printf '%s\n' 'LTS'
  fi
}

print_node_upgrade_instruction() {
  local major=$1
  if [[ $major == 'LTS' ]]; then
    printf 'Upgrade instruction: nvm install --lts && nvm use --lts\n'
  else
    printf 'Upgrade instruction: nvm install %s && nvm use %s\n' "$major" "$major"
  fi
  printf 'Then run this script again.\n'
}

ensure_git() {
  if command -v git >/dev/null 2>&1; then
    printf 'Git: %s\n' "$(git --version)"
    return
  fi

  printf 'Git was not found. Attempting installation through the system package manager...\n'
  install_system_package git
  command -v git >/dev/null 2>&1 || die 'Git installation completed but git is not on PATH. Open a new terminal and retry.'
  printf 'Git: %s\n' "$(git --version)"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1; then
    local major
    # A locally installed nvm is safe to use because it installs only for this user.
    if command -v nvm >/dev/null 2>&1; then
      major=$(node_install_major)
      printf 'Node.js was not found. Installing the project-compatible Node.js %s with nvm...\n' "$major"
      if [[ $major == 'LTS' ]]; then
        nvm install --lts && nvm use --lts
      else
        nvm install "$major" && nvm use "$major"
      fi
    else
      printf 'ERROR: Node.js is required but was not found.\n' >&2
      printf 'Required version: see package.json engines.node\n' >&2
      print_node_upgrade_instruction 'LTS' >&2
      printf 'Install nvm from https://github.com/nvm-sh/nvm, or install a compatible Node.js from https://nodejs.org/.\n' >&2
      exit 1
    fi
  fi

  local current required major
  current=$(node -p 'process.version')
  required=$(node_engine_range)
  major=$(node_install_major)
  if ! node - <<'NODE'
const range = require('./package.json').engines?.node ?? '';
const version = process.versions.node.split('.').map(Number);
const parseBound = (operator) => {
  const match = range.match(new RegExp(`${operator}\\s*(\\d+)(?:\\.(\\d+))?(?:\\.(\\d+))?`));
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : undefined;
};
const compare = (left, right) => {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index] ? 1 : -1;
  }
  return 0;
};
const minimum = parseBound('>=');
const maximum = parseBound('<');
process.exit((!minimum || compare(version, minimum) >= 0) && (!maximum || compare(version, maximum) < 0) ? 0 : 1);
NODE
  then
    printf 'ERROR: Installed Node.js version is not supported by this project.\n' >&2
    printf 'Current version: %s\n' "$current" >&2
    printf 'Required version: %s\n' "$required" >&2
    print_node_upgrade_instruction "$major" >&2
    exit 1
  fi

  printf 'Node.js: %s (required: %s)\n' "$current" "$required"
}

ensure_corepack_and_pnpm() {
  local package_manager
  package_manager=$(node -p "require('./package.json').packageManager || ''")
  [[ $package_manager == pnpm@* ]] || die 'package.json must declare a pnpm packageManager version.'

  if ! command -v corepack >/dev/null 2>&1; then
    command -v npm >/dev/null 2>&1 || die 'Corepack is missing and npm is unavailable. Reinstall a supported Node.js LTS release.'
    printf 'Corepack was not found. Installing it with the installed Node.js runtime...\n'
    npm install --global corepack@latest || die 'Corepack installation failed. Run "npm install --global corepack@latest" and retry.'
  fi

  # Do not enable Corepack shims: managed Node installations can make their
  # install directory read-only. Direct invocation remains project-pinned.
  PNPM=(corepack pnpm)
  "${PNPM[@]}" --version >/dev/null || die "Corepack could not provision the pnpm version declared in package.json: $package_manager"
  printf 'pnpm: %s (managed by Corepack)\n' "$("${PNPM[@]}" --version)"
}

ensure_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    die 'Docker Engine is required. Install Docker Engine and the Docker Compose plugin from https://docs.docker.com/engine/install/, then rerun this script.'
  fi
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 is required. Install the Docker Compose plugin, then rerun this script.'

  if ! docker info >/dev/null 2>&1; then
    if command -v systemctl >/dev/null 2>&1 && command -v sudo >/dev/null 2>&1; then
      printf 'Docker is installed but not running. Attempting to start the Docker service...\n'
      sudo systemctl start docker || true
    fi
    docker info >/dev/null 2>&1 || die 'Docker is installed but its daemon is unavailable. Start Docker, ensure your user can access /var/run/docker.sock, then rerun this script.'
  fi
  printf 'Docker Compose: %s\n' "$(docker compose version)"
}

install_dependencies() {
  printf '\nInstalling project dependencies from pnpm-lock.yaml...\n'
  "${PNPM[@]}" install --frozen-lockfile
}

create_env() {
  if [[ -f .env ]]; then
    printf '.env already exists; leaving it unchanged.\n'
    return
  fi
  cp .env.example .env
  chmod 600 .env 2>/dev/null || true
  printf 'Created .env from .env.example. Add your Discord credentials and rerun this script.\n'
}

validate_environment() {
  node --input-type=module <<'NODE'
import fs from 'node:fs';
import { parse } from 'dotenv';

const environment = parse(fs.readFileSync('.env'));
const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'DATABASE_URL', 'REDIS_URL'];
const missing = required.filter((key) => !environment[key]?.trim());
if (missing.length > 0) {
  console.error(`Required .env values are missing: ${missing.join(', ')}. Edit .env without committing it, then retry.`);
  process.exit(1);
}
NODE
  "${PNPM[@]}" env:validate
  printf 'Environment validation passed. Secret values were not displayed.\n'
}

build_project() {
  printf '\nBuilding the TypeScript project...\n'
  "${PNPM[@]}" build
}

start_dependencies() {
  printf '\nStarting PostgreSQL, Redis, and Lavalink...\n'
  "${COMPOSE[@]}" up --detach postgres redis lavalink
}

wait_for_service() {
  local service=$1 container_id='' status='' attempt
  printf 'Waiting for %s to become healthy...\n' "$service"
  for ((attempt = 1; attempt <= 90; attempt += 1)); do
    container_id=$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null || true)
    if [[ -n $container_id ]]; then
      status=$(docker inspect --format '{{.State.Health.Status}}' "$container_id" 2>/dev/null || true)
      if [[ $status == 'healthy' ]]; then
        printf '%s is healthy.\n' "$service"
        return
      fi
      if [[ $status == 'unhealthy' ]]; then
        break
      fi
    fi
    sleep 2
  done

  printf 'ERROR: %s did not become healthy within 180 seconds.\n' "$service" >&2
  printf 'Recent %s logs:\n' "$service" >&2
  "${COMPOSE[@]}" logs --tail=50 "$service" >&2 || true
  die 'Correct the service issue above, then rerun this script. Existing volumes were not changed.'
}

build_container_images() {
  printf '\nBuilding Docker images (Docker will reuse unchanged layers)...\n'
  "${COMPOSE[@]}" build bot worker
}

run_migrations() {
  printf 'Applying database migrations without resetting existing data...\n'
  "${COMPOSE[@]}" run --rm --no-deps bot node dist/scripts/migrate.js
}

generate_database_client_if_configured() {
  if node -e "process.exit(require('./package.json').scripts?.['prisma:generate'] ? 0 : 1)"; then
    printf 'Generating the configured database client...\n'
    "${PNPM[@]}" run prisma:generate
  else
    printf "Database client generation is not configured; this project uses Drizzle's runtime client.\n"
  fi
}

deploy_test_commands_if_requested() {
  (( DEPLOY_TEST_COMMANDS == 1 )) || {
    printf 'Test-guild command deployment skipped. Use --deploy-test-commands when ready.\n'
    return
  }

  local deployment_key marker
  deployment_key=$(node --input-type=module <<'NODE'
import fs from 'node:fs';
import { parse } from 'dotenv';

const environment = parse(fs.readFileSync('.env'));
if (!environment.DISCORD_TEST_GUILD_ID?.trim()) process.exit(1);
console.log(`${environment.DISCORD_CLIENT_ID ?? ''}-${environment.DISCORD_TEST_GUILD_ID}`);
NODE
  ) || die 'DISCORD_TEST_GUILD_ID is required to deploy test-guild commands.'

  mkdir -p .ble-bot-setup
  marker=".ble-bot-setup/test-guild-commands-${deployment_key}.deployed"
  if [[ -f $marker && $REDEPLOY_TEST_COMMANDS -eq 0 ]]; then
    printf 'Test-guild commands were already deployed for this application and guild; skipping.\n'
    return
  fi

  printf 'Deploying test-guild commands...\n'
  "${PNPM[@]}" commands:deploy:test
  printf 'Deployed successfully on %s.\n' "$(date -Is)" > "$marker"
  printf 'Test-guild command deployment completed.\n'
}

start_application() {
  printf 'Starting BLE Bot and its background worker...\n'
  "${COMPOSE[@]}" up --detach --no-deps bot worker
}

cd -- "$SCRIPT_DIR" || die 'Cannot open the directory containing this script.'
header
check_linux
check_project_root
ensure_git
ensure_node
ensure_corepack_and_pnpm
ensure_docker
install_dependencies
create_env
validate_environment
build_project
start_dependencies
wait_for_service postgres
wait_for_service redis
wait_for_service lavalink
build_container_images
run_migrations
generate_database_client_if_configured
deploy_test_commands_if_requested
start_application

printf '\nBLE Bot and the background worker are running.\n'
printf 'Press Ctrl+C to stop viewing logs. The Docker services will keep running.\n'
printf 'Run "./%s --deploy-test-commands" once to deploy test-guild commands.\n\n' "$SCRIPT_NAME"
trap 'printf "\nStopped log streaming; BLE Bot services remain running.\n"; exit 0' INT
"${COMPOSE[@]}" logs --follow --tail=100 bot worker
