#!/usr/bin/env bash
# Runs ON the VPS (piped over SSH by the GitHub Actions workflow).
# Pulls the exact SHA-tagged image and redeploys only this project
# (/opt/persona-studio) — other services on the host are untouched.
#
# Environment handling:
#   /opt/persona-studio/.env is created with mode 600. POSTGRES_PASSWORD and
#   JWT_SECRET are generated once on first deploy and NEVER overwritten, so an
#   initialized database keeps its original password. PUBLIC_BASE_URL and
#   ALLOWED_ORIGINS are managed settings (upserted). Secret values are never
#   printed — only key names and set/missing status reach the logs.
#
# User-provided (must be added on the VPS if missing):
#   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET  in .env
#   .ghcr-token (+ .ghcr-user)               read:packages PAT, only needed
#                                             while the GHCR image is private
#
# Database/upload data lives in the named volume postgres_data and survives
# every deploy. Migrations run automatically in the container entrypoint
# (`prisma migrate deploy && npm start`) before the API starts.
set -euo pipefail

: "${IMAGE:?IMAGE not set}" "${IMAGE_TAG:?IMAGE_TAG not set}"
DEPLOY_DIR=/opt/persona-studio
ENV_FILE="$DEPLOY_DIR/.env"
cd "$DEPLOY_DIR"
export IMAGE_TAG

# ── Docker prerequisite (idempotent) ─────────────────────────────────────────
# Install Docker Engine + Compose plugin from Docker's official Ubuntu
# repository only when docker is absent; existing services are untouched.
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker not found — installing from the official Docker apt repository"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME:-noble} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi

docker info >/dev/null 2>&1 || { echo "✗ docker daemon is not responding (systemctl status docker)" >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "✗ docker compose plugin missing" >&2; exit 1; }

# ── Production environment file ──────────────────────────────────────────────
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"

gen() { openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

ensure_env() { # key [value] — write only if absent; never overwrite
  if ! grep -q "^$1=" "$ENV_FILE"; then
    printf '%s=%s\n' "$1" "${2:-$(gen)}" >> "$ENV_FILE"
    echo "env: $1 ${2:+set}${2:-generated (value not printed)}"
  fi
}

set_env() { # key value — upsert managed settings
  if grep -q "^$1=" "$ENV_FILE"; then
    sed -i "s|^$1=.*|$1=$2|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$1" "$2" >> "$ENV_FILE"
    echo "env: $1 set"
  fi
}

ensure_env POSTGRES_PASSWORD
ensure_env JWT_SECRET
set_env PUBLIC_BASE_URL https://personastudio.site
set_env ALLOWED_ORIGINS https://personastudio.site
ensure_env EXTENSION_REDIRECT_PREFIXES https://pblieelekmbhlcepckbaooofjocckiga.chromiumapp.org/

# ── GHCR login (only when a token file exists) ───────────────────────────────
if [ -f "$DEPLOY_DIR/.ghcr-token" ]; then
  docker login ghcr.io -u "$(cat "$DEPLOY_DIR/.ghcr-user" 2>/dev/null || echo persona-deploy)" \
    --password-stdin < "$DEPLOY_DIR/.ghcr-token"
fi

# ── User-provided secrets check (one list, nothing printed) ──────────────────
MISSING=()
for k in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET; do
  v=$(grep -E "^$k=" "$ENV_FILE" | tail -1 | cut -d= -f2- || true)
  if [ -z "$v" ] || printf '%s' "$v" | grep -qiE "CHANGE_ME|YOUR_"; then MISSING+=("$k(in .env)"); fi
done
if [ ! -f "$DEPLOY_DIR/.ghcr-token" ] && ! docker manifest inspect "$IMAGE:$IMAGE_TAG" >/dev/null 2>&1; then
  MISSING+=(".ghcr-token (read:packages PAT — the image is private)")
fi
if [ ${#MISSING[@]} -gt 0 ]; then
  echo "✗ missing user-provided configuration: ${MISSING[*]}" >&2
  cat >&2 <<'EOF'
Add it on the VPS, then re-run the workflow (Actions → Build & Deploy → Run workflow):

  ssh root@162.35.27.103
  nano /opt/persona-studio/.env        # append:
      GOOGLE_CLIENT_ID=<id>.apps.googleusercontent.com
      GOOGLE_CLIENT_SECRET=<secret>
  printf '%s' '<your-github-username>'    > /opt/persona-studio/.ghcr-user
  printf '%s' '<classic PAT, read:packages>' > /opt/persona-studio/.ghcr-token
  chmod 600 /opt/persona-studio/.env /opt/persona-studio/.ghcr-token
EOF
  exit 1
fi

# ── Deploy ───────────────────────────────────────────────────────────────────
COMPOSE="docker compose --project-directory $DEPLOY_DIR --env-file $ENV_FILE -f $DEPLOY_DIR/deploy/compose.production.yaml"

# Caddyfile must already exist as a regular file; otherwise Docker would
# create a directory at the bind-mount source and caddy would fail to start.
CADDYFILE="$DEPLOY_DIR/deploy/Caddyfile"
if [ ! -f "$CADDYFILE" ]; then
  echo "✗ $CADDYFILE is missing or not a regular file — re-run the workflow to sync deploy/" >&2
  exit 1
fi

# Validate before replacing running services. Caddy owns certificates; do not
# run Certbot or delete the persistent caddy_data volume.
$COMPOSE run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

$COMPOSE pull api
$COMPOSE up -d --remove-orphans

# A bind mount of a single file pins the inode it was created with. This
# deploy replaces the Caddyfile on disk (tar/scp substitute the file), so the
# running container can still see the previous copy — validate passes against
# the new file while a reload inside the container re-applies the old one.
# Recreate caddy whenever the file on disk and inside the container diverge.
HOST_HASH=$(md5sum "$CADDYFILE" | cut -d' ' -f1)
CT_HASH=$($COMPOSE exec -T caddy md5sum /etc/caddy/Caddyfile 2>/dev/null | cut -d' ' -f1 || true)
if [ "$HOST_HASH" != "$CT_HASH" ]; then
  echo "Caddyfile on disk differs from the running container — recreating caddy"
  $COMPOSE up -d --force-recreate --no-deps caddy
fi

# A bind-mounted Caddyfile change does not cause Compose to recreate Caddy.
# Reload explicitly so hostnames/redirects apply on every deployment.
$COMPOSE exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Health check: the API must report healthy within ~60s
for i in $(seq 1 30); do
  if $COMPOSE exec -T api node -e \
    "fetch('http://127.0.0.1:3210/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "✓ deployed $IMAGE_TAG — healthy"
    docker image prune -f >/dev/null 2>&1 || true
    exit 0
  fi
  sleep 2
done

echo "✗ health check failed for $IMAGE_TAG" >&2
$COMPOSE logs --tail 50 api >&2
exit 1
