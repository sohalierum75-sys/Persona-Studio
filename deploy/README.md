# Production WWW and HTTPS

Production is `/opt/persona-studio` on `162.35.27.103`. The existing Compose
services are `caddy`, `api`, and `db`; use service names instead of assuming
Docker-generated container names. `caddy:2` publishes TCP 80 and 443. The API
serves React and `/api` on `api:3210` inside Docker. PostgreSQL has no public
production port. The root `compose.yaml` is for local development, not an
override for this production file.

## Why WWW failed

The original Caddyfile declared only `personastudio.site`. It did not provision
TLS or a redirect site for `www.personastudio.site`. A DNS CNAME only resolves
the hostname; it does not rewrite the HTTP Host header or TLS server name.
The observed WWW 525 response is consistent with that missing TLS site.
The later repeated 308 redirect to the same HTTPS WWW URL is consistent with
Cloudflare Flexible SSL contacting Caddy over HTTP, followed by Caddy's
automatic HTTPS redirect. Confirm the mode in Cloudflare; it cannot be read
from the repository. Misconfigured edge redirect rules can also cause loops.

The deployment workflow already copies the Caddyfile, but `compose up -d`
does not reload an unchanged container when only its bind-mounted file changes.
Worse, the workflow replaces the file on disk (`tar`/`scp` substitute the
file), and a single-file bind mount keeps serving the inode the container was
created with — so a `caddy reload` inside the container can silently re-apply
the OLD config while `caddy validate` (a fresh container) passes on the new
one. This was confirmed live on 2026-10-06: deploy run 21 succeeded yet the
origin kept emitting the old catch-all 308 for WWW. `deploy.sh` now compares
the md5 of the file on disk against the copy visible inside the running
container and force-recreates caddy when they diverge, then reloads.
One more deploy-script pitfall, also confirmed by run 21/22 logs: deploy.sh
is piped to `bash -s` over stdin, so every command inside must detach stdin
(`-T`, `</dev/null`) — an attached `compose run` drains the remaining script
bytes and bash exits 0 after running only the commands above it.
Existing API routing, headers, database volumes, and app settings stay
unchanged.

## Apply this update

First, in Cloudflare:

1. Keep `A @ -> 162.35.27.103` DNS only.
2. Set `CNAME www -> personastudio.site` to **DNS only temporarily** so Caddy
   can obtain its public certificate directly. Wait until public DNS returns
   the VPS address for WWW. An existing `A www -> 162.35.27.103` also works;
   do not create both A and CNAME records at WWW.
3. Disable existing WWW redirect rules / Page Rules that overlap this redirect.
   Caddy will own the canonical redirect.
4. Set SSL/TLS encryption to **Full (strict)**, not Flexible, before enabling
   the WWW proxy again.

From the local repository root, copy the changed configuration and deployment
script. These commands back up the existing VPS files before replacing them:

```sh
ssh root@162.35.27.103 'cp -p /opt/persona-studio/deploy/Caddyfile /opt/persona-studio/deploy/Caddyfile.pre-www; cp -p /opt/persona-studio/deploy/deploy.sh /opt/persona-studio/deploy/deploy.sh.pre-www'
scp deploy/Caddyfile deploy/deploy.sh root@162.35.27.103:/opt/persona-studio/deploy/
ssh root@162.35.27.103
```

Then on the VPS:

```sh
cd /opt/persona-studio
dc() {
  docker compose --project-directory /opt/persona-studio \
    --env-file /opt/persona-studio/.env \
    -f /opt/persona-studio/deploy/compose.production.yaml "$@"
}

dc ps
sudo ss -lntp '( sport = :80 or sport = :443 )'
dc exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
# Run only after validation succeeds:
dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
dc logs --tail=100 caddy
```

Reload is sufficient; the API and database do not need rebuilding or restarting.
If the Caddy container is stopped, use `dc up -d --no-deps caddy` first. If a
reload is unavailable after successful validation, use `dc restart caddy`.
No Nginx service or Certbot is used by this project.

If UFW is active and lacks these rules, permit the two web ports (also check
the VPS provider firewall). Do not enable/reset the firewall as part of this fix:

```sh
sudo ufw status
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

Caddy obtains and renews publicly trusted certificates for both HTTPS names,
normally as separate certificates. It stores them in the existing `caddy_data`
volume. Do not delete that volume or run a second certificate manager. Watch
the Caddy logs for successful certificate issuance before re-enabling the
Cloudflare WWW proxy. Keep port 80 reachable for ACME HTTP validation.

After the direct-origin HTTPS checks below pass, set `www` back to **Proxied**.
Keep Full (strict) enabled. Cloudflare's edge certificate must also be active
for `www.personastudio.site`. Do not install an Origin-CA-only certificate on
the DNS-only apex: browsers connect directly to it.

## Verify

These direct-origin checks bypass Cloudflare while still checking the real
hostname and TLS certificate. Do not use `-k`:

```sh
curl -I --resolve personastudio.site:443:162.35.27.103 https://personastudio.site/
curl -I --resolve www.personastudio.site:443:162.35.27.103 'https://www.personastudio.site/dashboard?id=123'
curl -I --resolve www.personastudio.site:80:162.35.27.103 'http://www.personastudio.site/dashboard?id=123'
```

Expected: apex HTTPS returns 200; both WWW requests return 301 with
`Location: https://personastudio.site/dashboard?id=123`.

After DNS refreshes, test public URLs (including through Cloudflare):

```sh
curl -I https://personastudio.site/
curl -I http://personastudio.site/
curl -I 'https://www.personastudio.site/dashboard?id=123'
curl -I 'http://www.personastudio.site/dashboard?id=123'
curl -IL --max-redirs 5 'https://www.personastudio.site/dashboard?id=123'
```

Caddy's automatic HTTP-to-HTTPS redirect for the apex uses 308. The explicit
WWW redirect uses 301 for HTTP and HTTPS and preserves the entire URI. A
Cloudflare Always Use HTTPS setting may add an initial edge HTTPS redirect
for HTTP requests; the final destination must still be the non-WWW domain.

If you still see a loop through Cloudflare after origin checks pass, inspect
SSL/TLS mode overrides, Redirect Rules, Page Rules, and Workers for this host.

## Rollback

```sh
cp -p /opt/persona-studio/deploy/Caddyfile.pre-www /opt/persona-studio/deploy/Caddyfile
cp -p /opt/persona-studio/deploy/deploy.sh.pre-www /opt/persona-studio/deploy/deploy.sh
dc exec -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
dc exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

References: [Caddy redirects](https://caddyserver.com/docs/caddyfile/directives/redir),
[automatic HTTPS](https://caddyserver.com/docs/automatic-https),
[Cloudflare redirect loops](https://developers.cloudflare.com/ssl/troubleshooting/too-many-redirects/).
