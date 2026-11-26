# Deploy on a single VPS

The cheapest way to put Apercura online: one generic Linux server, the
[self-hosting](./self-hosting.md) Compose stack, a Caddy on the host for TLS,
and a deploy after every green CI run on `main`. Production runs it under
[Coolify](#under-coolify), which GitHub Actions asks to deploy through its API;
without Coolify, the same deploy goes [over SSH](#deploy-over-ssh-without-coolify).
Either way the image is built on the server, so the environment file (secrets,
the legal facts of the publisher and the host) never leaves it and never goes
through GitHub.

| File                           | Role                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| `docker/compose.selfhost.yml`  | The whole stack (see [self-hosting](./self-hosting.md)): the application stack + data   |
| `docker/compose.app.yml`       | The application stack alone, against an external database and S3 (what Coolify deploys) |
| `docker/compose.vps.yml`       | Override: the public host name resolved to the host for the scheduler, log rotation     |
| `docker/deploy-vps.sh`         | Without Coolify: checks a commit of `main`, checks it out, builds, restarts, health     |
| `.github/workflows/deploy.yml` | After CI passes on a push to `main`: a Coolify deployment, followed to the end          |

## Who it is for

An interim production, **directory only** (`FEATURE_BOOKING=false`), until the
HDS host of [deploy-clever-cloud](./deploy-clever-cloud.md) is contracted. Read
[Health data and HDS](./self-hosting.md#health-data-and-hds) first: a generic
VPS rented from a provider is not HDS-certified, so online booking (health
data) must stay off on it, and `PUBLIC_HDS_HOST` must stay empty. The legal
pages name the VPS provider as the host.

One VPS also means one point of failure: no replica, no managed backups. The
backups and alerts below are not optional.

## Server prerequisites

- Debian 12 or 13, or Ubuntu 24.04 LTS, **amd64** (the PostGIS image is
  published for amd64 only).
- Docker Engine and the Compose plugin v2.24 or later, from
  [Docker's apt repository](https://docs.docker.com/engine/install/).
- [Caddy](https://caddyserver.com/docs/install#debian-ubuntu-raspbian) from its
  apt repository, on the host (not in a container), plus `git` and `curl`.
- 4 vCPU and **8 GB of RAM recommended**: `next build` runs on the server at
  every deploy, next to the running stack. With 4 GB, add swap; add some
  anyway, a build that runs out of memory fails the deploy:

  ```sh
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

- 40 GB of disk: images and their build cache, the database, the import's
  downloads (about 1.2 GB per run) and a few days of local dumps.
- A domain name whose apex (and `www`) point to the server.

## Hardening checklist

- [ ] A personal sudo user with an SSH key; in `/etc/ssh/sshd_config.d/10-hardening.conf`:
      `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PermitRootLogin no`,
      then `sudo systemctl reload ssh`. Keep a second session open while you test.
- [ ] Firewall: `sudo ufw default deny incoming`, `sudo ufw allow 22/tcp` (or your SSH port),
      `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`, `sudo ufw enable`. Ports that Docker
      publishes bypass ufw: every service of the stack publishes on `127.0.0.1` only (the app
      on `APP_PORT`, MinIO not at all); keep the other apps of the server that way too.
- [ ] `fail2ban` with its default `sshd` jail (`sudo apt install fail2ban`).
- [ ] Automatic security updates: `sudo apt install unattended-upgrades` and
      `sudo dpkg-reconfigure -plow unattended-upgrades`.
- [ ] Docker log rotation for every container of the server, in `/etc/docker/daemon.json`
      (below), then `sudo systemctl restart docker`. `docker/compose.vps.yml` sets the same
      limits on Apercura's own containers.
- [ ] The clock synchronised (`timedatectl` shows `System clock synchronized: yes`): sign-in
      codes and authenticator apps depend on it.

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
```

## Layout and deploy user

A dedicated `deploy` user owns the checkout and runs the deploys. Being in the
`docker` group makes it root-equivalent on this server: give it nothing else
(no sudo, no password, only the deploy key below).

```sh
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo install -d -o deploy -g deploy /srv/apps
sudo -u deploy git clone https://github.com/maxgfr/apercura.git /srv/apps/apercura
```

The repository is public: the server fetches it over HTTPS without credentials.
Other apps go next to it (`/srv/apps/<app>`), each on its own host port.

## Environment file

```sh
cd /srv/apps/apercura
sudo -u deploy cp docker/.env.selfhost.example docker/.env.selfhost
sudo -u deploy chmod 600 docker/.env.selfhost
```

Fill it in as in [self-hosting, Start](./self-hosting.md#start), with these
values for this setup:

| Variable                    | Value                                                                               |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `APP_URL`                   | `https://example.org` (read at build time too)                                      |
| `APP_HOST`                  | `example.org`: the host name of `APP_URL`, read by `docker/compose.vps.yml`         |
| `APP_PORT`                  | `3000`, or any port no other app of the server uses; the Caddyfile points to it     |
| `TRUSTED_PROXY_COUNT`       | `1`: the host's Caddy is the only proxy                                             |
| `APERCURA_JOBS_DB_PASSWORD` | Set it: `migrate` gives `apercura_jobs` its login and password on every deploy      |
| `FEATURE_BOOKING`           | `false`                                                                             |
| `PUBLIC_HDS_HOST`           | empty                                                                               |
| Other `LEGAL_*`             | The publisher's facts ([self-hosting, Start](./self-hosting.md#start), step 5)      |
| `LEGAL_HOST_*`              | The VPS provider's legal identity (name, address, phone), from its own legal notice |
| `SMTP_URL`, `MAIL_FROM`     | A real provider over TLS (`smtps://` or STARTTLS); no `SMTP_ALLOW_INSECURE`         |

`bun run keys:generate` (on a trusted machine) or, once the image is built,
`docker run --rm apercura:local keys` prints the eight secrets.

## The override file

`docker/compose.vps.yml` adds two things to `docker/compose.selfhost.yml`:

- **`extra_hosts` on the scheduler**: `${APP_HOST}:host-gateway`. The jobs
  refresh cached pages through `APP_URL/api/revalidate`
  ([Scheduled jobs](./self-hosting.md#scheduled-jobs)); this resolves the public
  name to the host, so the request reaches the host's Caddy directly, with its
  real certificate, even when the server cannot reach its own public address
  (no hairpin NAT). `host-gateway` is the address of the Docker bridge on the
  host: Caddy must listen on every interface, which it does unless the
  Caddyfile has a `bind` or `default_bind`. Check with `sudo ss -tlnp | grep caddy`
  (`*:443`). The firewall must let the containers in too: `ufw allow 443/tcp`
  does, a rule limited to the public interface does not. The app never calls
  its own URL, and the import already uses `http://app:3000`.
- **Log rotation** on every service: `json-file`, 10 MB per file, 5 files.

Every Compose command then takes both files:

```sh
alias apercura-compose='docker compose -f docker/compose.selfhost.yml -f docker/compose.vps.yml --env-file docker/.env.selfhost'
```

## Caddy

`/etc/caddy/Caddyfile`, one block per site; Caddy gets and renews the
certificates and sets `X-Forwarded-For`, `X-Forwarded-Host` and
`X-Forwarded-Proto` itself:

```caddy
{
	email ops@example.org
}

example.org {
	encode zstd gzip
	reverse_proxy 127.0.0.1:3000
}

www.example.org {
	redir https://example.org{uri} permanent
}

# Other apps of the same server, each on its own local port.
other.example.org {
	reverse_proxy 127.0.0.1:3001
}
```

`sudo systemctl reload caddy` after each change. Any other host name that
reaches the app answers a permanent redirect to the same page on `APP_URL`
(`CANONICAL_HOST_REDIRECT`). A former domain whose old paths must be mapped
(apercura.fr) is proxied to the app, never `redir`ected by Caddy: the app
knows where each old path lives now ([Moving to apercura.org](#moving-production-to-apercuraorg)).

## First start

As the `deploy` user, from `/srv/apps/apercura`:

```sh
apercura-compose up -d --build
curl -s http://127.0.0.1:3000/api/health      # {"status":"ok"}
```

Then the [first import](./self-hosting.md#first-import) and the
[first administrator](./self-hosting.md#first-administrator), as in the
self-hosting guide. Later deploys go through Coolify or, without it,
`docker/deploy-vps.sh`.

## Under Coolify

Production runs under [Coolify](https://coolify.io) (v4), split in three
resources of the same project and environment, so that a deploy never touches
the data. Coolify stops and removes **every** container of a Docker Compose
application at each deploy before starting the new ones; with the database and
the storage inside the application, every deploy restarted PostgreSQL and MinIO
(about 30 s without a database, and any running import killed). Its
"Consistent Container Names" setting does not change that: the containers keep
their names, but they are still stopped and removed. So:

| Resource                                             | What                                               | Restarted by an app deploy |
| ---------------------------------------------------- | -------------------------------------------------- | -------------------------- |
| PostgreSQL database                                  | PostgreSQL 17 + PostGIS, image `postgis/postgis`   | no                         |
| MinIO service (or any S3-compatible storage)         | Photos and encrypted claim documents               | no                         |
| Docker Compose application, `docker/compose.app.yml` | `migrate`, `minio-init`, `app`, `scheduler`, `etl` | yes                        |

A deploy still restarts the app and the scheduler (a few seconds, and an import
running in the scheduler at that moment stops; the next weekly run, or
`docker exec <scheduler container> apercura etl:fr`, redoes it).

### 1. The database

**New resource > Databases > PostgreSQL**, on the same server and destination
as the application:

- **Image**: `postgis/postgis:17-3.7` (a custom image in place of the default
  `postgres`: the migrations need PostGIS; amd64 only);
- **Initial database**: `apercura`; **user**: `postgres`; **password**: letters
  and digits only (`openssl rand -hex 24`), since it ends up in a URL;
- not publicly available; backups: Coolify's scheduled backups of the resource,
  or the [Backups](#backups) script below pointed at its container.

Nothing else: no init script and no role to create. On the first deploy,
`migrate` waits for the database, the migrations create the four roles of
Apercura without login (migrations 0004 and 0016, only when they are missing),
then `migrate` gives each role whose `APERCURA_*_DB_PASSWORD` is set its login
and password (`ALTER ROLE … WITH LOGIN PASSWORD`). It does so again on every
deploy: changing one of these variables and redeploying rotates it. Note the
resource's internal host name (its "Postgres URL (internal)",
`postgres://postgres:…@<host>:5432/apercura`).

### 2. The storage

**New resource > Services > MinIO** (or any S3-compatible storage outside
Coolify). Note its internal host name (the MinIO container's name), its API
port (`9000`) and its administrator's user and password. Keep the API private:
the app serves the files itself.

`minio-init`, in the application, creates the private bucket and the app's own
access key, limited to that bucket, when it is given the MinIO administrator
(`MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`). The administrator then only reaches
that one-shot container, never the app. To keep it out of the application
entirely (and with any other S3), leave `MINIO_ROOT_PASSWORD` empty and create,
in the MinIO console or at the provider, the bucket and a key allowed only
`s3:GetBucketLocation` and `s3:ListBucket` on it and `s3:GetObject`,
`s3:PutObject` and `s3:DeleteObject` on its objects; `minio-init` then does
nothing.

### 3. The application

**New resource > Docker Compose** (public repository, or GitHub App), branch
`main`, **base directory** `/docker`, **Docker Compose location**
`/compose.app.yml`:

- turn on **Connect To Predefined Network**, so the application resolves the
  database's and MinIO's internal host names. Coolify warns that short service
  names may then also match containers of other stacks on its network: if
  another application of the server has an `app` service, set
  `INTERNAL_APP_URL` to `APP_URL` (the import then sends its cache tags through
  the public URL instead of `http://app:3000`);
- the domain goes on the `app` service, port `3000`; Coolify's Traefik is the
  only proxy: no Caddy on the host, and `TRUSTED_PROXY_COUNT=1`;
- the variables, set in Coolify (not in a file on the server), are those of the
  [environment file](#environment-file), plus where the data lives:

| Variable                                                | Value                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `APERCURA_DB_HOST`                                      | The database resource's internal host name (`APERCURA_DB_PORT`, `APERCURA_DB_NAME`: `5432`, `apercura`) |
| `DATABASE_URL_MIGRATE`                                  | `postgres://postgres:<password>@<host>:5432/apercura`: the database's superuser, for `migrate` only     |
| `APERCURA_APP_DB_PASSWORD`, `…_ETL_…`, `…_JOBS_…`       | The roles' passwords (`openssl rand -hex 24` each); `…_READONLY_…` optional                             |
| `S3_ENDPOINT`                                           | `http://<minio host>:9000`                                                                              |
| `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | The app's bucket and its own key (not the administrator's)                                              |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`                | The MinIO administrator, for `minio-init`; empty if the bucket and key are made by hand                 |
| `CACHE_REDIS_PASSWORD`                                  | The page cache's password (`openssl rand -hex 24`): another stack's `valkey` may share the network      |
| `CACHE_MAX_MEMORY`, `CACHE_MEM_LIMIT`                   | Optional: the page cache's size and its container's limit (default `1gb`, `1280m`)                      |

`POSTGRES_PASSWORD` is not used here: `DATABASE_URL_MIGRATE` replaces it.
Coolify builds the image on the server and runs the file as is: it only uses
`${VAR}`, `${VAR:-default}` and `${VAR:?message}`, no single-file bind mount
and no empty `command`, which Coolify would not read the same way. The override
file `docker/compose.vps.yml` and `docker/deploy-vps.sh` are not used; backups
and alerts are still needed (the sections below, adapted to the containers
Coolify names).

### Moving from the single-application layout

Until this split, production ran `docker/compose.selfhost.yml` as one Coolify
application, data included. Moving once, in a quiet hour (the site is
down for a few minutes):

1. Create the database and the MinIO resources above and start them.
2. Stop the old application's `app` and `scheduler` containers (writes stop),
   then dump its database from the server's shell:

   ```sh
   docker exec <old postgres container> pg_dump -U postgres -Fc apercura > /root/apercura-move.dump
   ```

3. Restore into the new database. The dump holds no roles, and the grants need
   them; restoring into a database made from `template0` keeps the extensions of
   the dump only:

   ```sh
   new=<new database container>
   docker exec "$new" dropdb -U postgres --force apercura
   docker exec "$new" createdb -U postgres -T template0 apercura
   for role in apercura_app apercura_etl apercura_readonly apercura_jobs; do
     docker exec "$new" psql -U postgres -d apercura -c "CREATE ROLE $role NOLOGIN"
   done
   docker exec -i "$new" pg_restore -U postgres -d apercura --exit-on-error --no-owner < /root/apercura-move.dump
   ```

4. Copy the bucket with `mc mirror`, from a throwaway `mc` container joined to
   both networks (`docker inspect` on each MinIO container shows its network):

   ```sh
   docker run -d --name apercura-move --network <old app network> --entrypoint sleep pgsty/mc:RELEASE.2026-11-12T00-00-00Z 3600
   docker network connect <new MinIO network> apercura-move
   docker exec -it apercura-move sh -c '
     mc alias set old http://minio:9000 <old root user> <old root password> &&
     mc alias set new http://<new minio host>:9000 <new root user> <new root password> &&
     mc mb --ignore-existing new/apercura && mc mirror old/apercura new/apercura'
   docker rm -f apercura-move
   ```

5. In the application: Docker Compose location `/compose.app.yml`, Connect To
   Predefined Network on, the variables of the table above (with the same
   `APERCURA_*_DB_PASSWORD` and S3 key as before), then deploy (Actions >
   Deploy > Run workflow). `migrate` logs `Migrations applied` and
   `Role passwords applied: …`.
6. Check `/api/health`, a practitioner page, a practitioner photo and
   `docker exec <scheduler container> apercura jobs:tick`.
7. The old `postgres` and `minio` containers are no longer part of the
   application: remove them if Coolify left them running, but keep their
   volumes until a backup of the new database has been [verified](./self-hosting.md#verify-a-backup).

### Deploys gated on CI

**Turn off Coolify's own automatic deploy** on push (the application's
"Auto Deploy" setting, or no GitHub webhook): otherwise Coolify deploys every
push to `main` before CI has run. `.github/workflows/deploy.yml` then deploys
instead, after every successful `CI` run on a push to `main` (a merged pull
request), one deploy at a time (concurrency group `deploy-production`, never
cancelled midway):

1. it checks that the head of `main` is the commit CI tested. If `main` has
   moved on, it does nothing: the newer commit's own CI run deploys it, once
   green;
2. it asks Coolify to deploy the application (`POST /api/v1/deploy`) and
   follows the deployment (`GET /api/v1/deployments/<uuid>`) until it is
   `finished`, for up to 30 minutes. Any other end (`failed`, cancelled) or the
   timeout fails the job;
3. Coolify cannot be given a commit, only the head of the branch: if the
   commit it built differs from the tested one (a push in between), the job
   summary shows a warning;
4. it checks `PRODUCTION_URL/api/health` for a 200.

**Actions > Deploy > Run workflow** deploys by hand: the head of `main`, only
if CI passed on it. There is no deploy of an older commit and no automatic
rollback: migrations only go forward; going back is a revert on `main` (or a
[restore](./self-hosting.md#backups-and-restore)).

The Coolify API is off by default. In Coolify:

1. **Settings > Advanced**: enable the API. It is served under the public
   Coolify URL (`https://coolify.example.org/api/v1`, through Coolify's
   Traefik, with its UI), which is how GitHub's runners reach it; an IP
   allowlist there would have to allow GitHub's ranges;
2. **Keys & Tokens > API tokens**: create a token for GitHub only, with the
   `deploy` ability (queue a deployment) and `read` (follow it). Nothing else:
   not `write`, `read:sensitive` or root;
3. copy the application's UUID (in its URL, or its configuration page).

## GitHub settings

In **Settings > Environments**, create `production` (optionally limited to the
`main` branch, with required reviewers if every deploy should be approved),
then:

| Kind                | Name                       | Value                                                              |
| ------------------- | -------------------------- | ------------------------------------------------------------------ |
| Environment secret  | `COOLIFY_TOKEN`            | The API token above                                                |
| Variable            | `COOLIFY_URL`              | `https://coolify.example.org`                                      |
| Variable            | `COOLIFY_APP_UUID`         | The application's UUID                                             |
| Repository variable | `PRODUCTION_URL`           | `https://example.org`: the deploy's health check, and `uptime.yml` |
| Repository variable | `UPTIME_PRACTITIONER_PATH` | Optional, e.g. `/fr/praticien/<slug>`                              |

Without `COOLIFY_TOKEN` or `COOLIFY_APP_UUID` (forks) the deploy job does
nothing. The token never appears in the logs: it is sent through a header
file, and GitHub masks secrets.

## Deploy over SSH (without Coolify)

On a plain Compose VPS (Caddy on the host, `docker/compose.vps.yml`), the
deploy goes over SSH instead: `.github/workflows/deploy.yml` targets Coolify,
so replace its deploy step with the one below.

`docker/deploy-vps.sh <sha>` fetches `origin/main`, refuses anything that is
not a full 40-character sha of a commit on `main` (and a checkout with local
changes), checks it out detached, builds the image, runs `up -d` (migrations
first), waits up to 180 s for the app container to be healthy, checks
`/api/health` on the host port, prunes dangling images and prints the deployed
sha. Unlike Coolify it deploys the exact commit CI tested. There is **no
automatic rollback**: migrations only go forward, a failed deploy leaves the
stack as it is, and going back is a
[restore](./self-hosting.md#backups-and-restore). Paths and the timeout can be
overridden (see the script's header).

Generate a key pair for GitHub only, on a trusted machine, without passphrase:

```sh
ssh-keygen -t ed25519 -N "" -C apercura-deploy -f apercura-deploy
```

On the server, in `/home/deploy/.ssh/authorized_keys` (mode 600, owned by
`deploy`), the public key with a forced command: whatever the client asks,
the server runs the deploy script with the requested command in
`SSH_ORIGINAL_COMMAND`, and no shell, tunnel or terminal is offered.

```text
command="/srv/apps/apercura/docker/deploy-vps.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA… apercura-deploy
```

The script runs from the checkout, so it is the version of the last deployed
commit: whoever can merge to `main` already controls what runs there. Test it:

```sh
ssh -i apercura-deploy deploy@example.org hello    # refused: usage, exit 2
```

Record the server's host keys for the workflow, from a trusted machine, and
compare the fingerprints with `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`
run on the server's console:

```sh
ssh-keyscan -p 22 example.org > known_hosts
```

In the `production` environment, set the secrets `DEPLOY_HOST` (the server's
host name or address), `DEPLOY_SSH_KEY` (the private key `apercura-deploy`)
and `DEPLOY_KNOWN_HOSTS` (the `known_hosts` lines above), and optionally the
variables `DEPLOY_USER` (default `deploy`) and `DEPLOY_PORT` (default `22`).
The deploy step, with the job's `env` and skip condition changed to
`DEPLOY_HOST` (the sha is the one CI tested, from the "Resolve the tested
commit" step):

```yaml
- name: Deploy over SSH
  if: env.DEPLOY_HOST != ''
  timeout-minutes: 30
  env:
    DEPLOY_HOST: ${{ secrets.DEPLOY_HOST }}
    DEPLOY_USER: ${{ vars.DEPLOY_USER || 'deploy' }}
    DEPLOY_PORT: ${{ vars.DEPLOY_PORT || '22' }}
    DEPLOY_SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
    DEPLOY_KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
    SHA: ${{ steps.sha.outputs.sha }}
  run: |
    set -euo pipefail
    dir="$RUNNER_TEMP/deploy-ssh"
    install -d -m 700 "$dir"
    install -m 600 /dev/null "$dir/key"
    install -m 600 /dev/null "$dir/known_hosts"
    trap 'rm -rf "$dir"' EXIT
    printf '%s\n' "$DEPLOY_SSH_KEY" > "$dir/key"
    printf '%s\n' "$DEPLOY_KNOWN_HOSTS" > "$dir/known_hosts"
    # The server's forced command reads the sha from SSH_ORIGINAL_COMMAND.
    ssh -i "$dir/key" -p "$DEPLOY_PORT" \
      -o BatchMode=yes -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$dir/known_hosts" \
      -o ConnectTimeout=20 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 \
      "${DEPLOY_USER}@${DEPLOY_HOST}" "$SHA"
```

The SSH deploy can target an older commit of `main` (pass its sha in place of
the resolved one); that is only safe when no migration came in between.

## Moving production to apercura.org

Every market lives on apercura.org, France under `/fr`
([ADR 0002, section 2](./adr/0002-multi-country.md)); apercura.fr only
redirects, each old URL to its new one (`apercura.fr/praticien/x` →
`apercura.org/fr/praticien/x`, `apercura.fr/en/about` →
`apercura.org/fr-en/about`, the home to `/fr`;
[the mapping](./public-site.md#former-urls)). The switch, in order:

1. **DNS.** Point `apercura.org` and `www.apercura.org` (A and AAAA) to the
   server. Keep `apercura.fr` and `www.apercura.fr` pointing to it too, and keep
   the domain registered: the redirects must answer for good (Google asks for
   at least 180 days; links in old emails and on other sites live longer).
2. **Domains.** Under Coolify, put all four on the `app` service, port 3000:
   `https://apercura.org,https://www.apercura.org,https://apercura.fr,https://www.apercura.fr`
   (Traefik gets a certificate for each). With Caddy, one block
   `apercura.org, www.apercura.org, apercura.fr, www.apercura.fr { reverse_proxy 127.0.0.1:3000 }`:
   no `redir` for apercura.fr, the app maps the paths.
3. **Mail.** In Brevo, add and authenticate the domain apercura.org (**Senders,
   domains and dedicated IPs > Domains**): create the DNS records it lists (its
   verification code and the DKIM records), and a DMARC record, starting with
   `_dmarc.apercura.org TXT "v=DMARC1; p=none; rua=mailto:dmarc@apercura.org"`,
   then `p=quarantine` once the reports are clean. Add the sender
   `no-reply@apercura.org`, and a mailbox or a forward for `contact@apercura.org`
   (MX records). Wait for Brevo to show the domain as authenticated before the
   next step.
4. **Pro Santé Connect.** Ask for the redirect URI
   `https://apercura.org/api/auth/callback/psc` on the production client (API
   routes are not redirected: the old one stops being used at the switch).
5. **Environment.** Set, then redeploy (the image is rebuilt: `APP_URL` and the
   `LEGAL_*` facts are baked into static pages):

   | Variable              | Value                                                       |
   | --------------------- | ----------------------------------------------------------- |
   | `APP_URL`             | `https://apercura.org`                                      |
   | `BETTER_AUTH_URL`     | unset, or `https://apercura.org`                            |
   | `LEGACY_HOSTS`        | `apercura.fr,www.apercura.fr`                               |
   | `APP_HOST`            | `apercura.org` (SSH deploys only, `docker/compose.vps.yml`) |
   | `MAIL_FROM`           | `Apercura <no-reply@apercura.org>`                          |
   | `LEGAL_CONTACT_EMAIL` | `contact@apercura.org`                                      |
   | `SECURITY_CONTACT`    | `mailto:` an `@apercura.org` address, if set                |

   `www.apercura.org` needs no variable: any host other than `APP_URL`'s
   redirects its pages, and `www.` of the canonical host keeps the
   international home at `/`.
6. **Check.**

   ```sh
   curl -sI https://apercura.fr/ | grep -i '^location'                 # https://apercura.org/fr (301)
   curl -sI https://apercura.fr/en/about | grep -i '^location'         # https://apercura.org/fr-en/about
   curl -sI https://apercura.fr/sitemap.xml | grep -i '^location'      # https://apercura.org/sitemap.xml
   curl -s https://apercura.org/ | grep -o 'hrefLang="[^"]*"'          # fr-FR, x-default
   curl -s https://apercura.org/robots.txt | tail -2                   # Sitemap: https://apercura.org/sitemap.xml
   curl -s https://apercura.org/.well-known/security.txt | grep Canonical
   ```

   Then send yourself a sign-up email and check its links and its
   authentication (DKIM and DMARC `pass` in the headers).
7. **Search engines.** In Google Search Console, add a Domain property for
   apercura.org (DNS TXT record; or a URL-prefix property through
   `GOOGLE_SITE_VERIFICATION`, read at build time) and submit
   `https://apercura.org/sitemap.xml`. Then, on the apercura.fr property,
   **Settings > Change of address** to apercura.org: the tool checks that the
   home and sample pages answer a 301 to the new site. In Bing Webmaster Tools,
   add apercura.org and use **Site Move** (`BING_SITE_VERIFICATION`).
8. **GitHub.** Set the repository variable `PRODUCTION_URL` to
   `https://apercura.org` (deploy health check, `uptime.yml`), and
   `UPTIME_PRACTITIONER_PATH`, if set, to its `/fr/…` form.

What people notice:

- **Sessions.** Session cookies belong to the host: everyone signed in on
  apercura.fr signs in again on apercura.org.
- **Passkeys.** A passkey is bound to the domain it was registered on (the
  relying party is `BETTER_AUTH_URL`'s host): passkeys registered on
  apercura.fr no longer work. Practitioners sign in with their password and
  second factor, then register a new passkey. Acceptable while production has
  only just launched.
- **Calendar invitations.** An appointment's `.ics` UID is
  `{id}@{APP_URL host}`: an update or a cancellation sent after the switch for
  an appointment booked before it carries a new UID, so the patient's calendar
  adds an event instead of updating the first one (the email itself is
  right). Calendar feed subscriptions on apercura.fr keep answering, since API
  routes are not redirected.

## Backups

Three things, daily, as in [Backups and restore](./self-hosting.md#backups-and-restore):
the database (`pg_dump -Fc`), the MinIO files and `docker/.env.selfhost`. Keep
a few days on the server and an encrypted copy off it, for example with
[restic](https://restic.net) to any S3-compatible bucket at another provider.

`/usr/local/sbin/apercura-backup` (root, mode 700):

```sh
#!/usr/bin/env bash
set -euo pipefail
# /etc/apercura-backup.env (root, mode 600): RESTIC_REPOSITORY=s3:https://s3.example.org/<bucket>,
# RESTIC_PASSWORD_FILE, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY of that bucket.
set -a; . /etc/apercura-backup.env; set +a
cd /srv/apps/apercura
out=/var/backups/apercura
install -d -m 700 "$out/db" "$out/minio"
compose() { docker compose -f docker/compose.selfhost.yml -f docker/compose.vps.yml --env-file docker/.env.selfhost "$@"; }

day=$(date -u +%F)
compose exec -T postgres pg_dump -U postgres -Fc apercura > "$out/db/apercura-$day.dump.part"
mv "$out/db/apercura-$day.dump.part" "$out/db/apercura-$day.dump"
find "$out/db" -name '*.dump' -mtime +7 -delete

# Photos and claim documents: a mirror of the bucket, through the stack's own mc image (single
# quotes: the variables are the container's).
compose run --rm --no-deps -v "$out/minio:/mirror" --entrypoint sh minio-init -c \
  'mc alias set local "$S3_ENDPOINT" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null && mc mirror --overwrite --remove "local/$S3_BUCKET" /mirror'

restic backup --quiet --tag apercura "$out/db" "$out/minio"
restic forget --quiet --prune --keep-daily 7 --keep-weekly 4 --keep-monthly 6
touch "$out/last-success"
```

```sh
# /etc/cron.d/apercura-backup
15 2 * * * root /usr/local/sbin/apercura-backup >> /var/log/apercura-backup.log 2>&1
```

Run `restic init` once. The environment file holds the keys that decrypt patient
fields and claim documents: keep its copy **apart from the dumps** (a password
manager, or a second restic repository with its own password), and the restic
password apart from both.

Test a restore at least monthly, on another machine with Docker, never on the
server: `restic restore latest --target ./restore --include '/var/backups/apercura/db'`,
then [`scripts/verify-backup.sh`](./self-hosting.md#verify-a-backup) on the
latest dump.

## Alerts

From outside, `.github/workflows/uptime.yml` checks `/api/health` and a
practitioner page every 15 minutes once `PRODUCTION_URL` is set, and opens an
`uptime` issue when they fail. On the server, an hourly check covers what the
outside cannot see:

- the app's health on the host port;
- the open data import: the scheduler runs it every Monday at 03:00 UTC, and it
  exits `1` (failed) or `2` (blocked by a circuit breaker, waiting for
  `--approve`; see [data-import](./data-import.md)). Each run is recorded in
  `directory.etl_runs` (`source = 'fr'`, `status` `succeeded`, `skipped`,
  `failed`, `blocked`, `running` or `dry_run`, `finished_at`): alert when the
  latest finished run failed or is blocked, and when the last success
  (`succeeded`, or `skipped` because nothing changed) is older than 9 days, which
  also catches a run that never finished;
- the age of the last backup;
- the disk.

`/usr/local/sbin/apercura-check` (root, mode 700), with any webhook or
dead man's switch service you use (placeholders below):

```sh
#!/usr/bin/env bash
set -uo pipefail
cd /srv/apps/apercura || exit 1
compose() { docker compose -f docker/compose.selfhost.yml -f docker/compose.vps.yml --env-file docker/.env.selfhost "$@"; }
sql() { compose exec -T postgres psql -U postgres -d apercura -tAc "$1"; }
problems=()

curl -fsS --max-time 10 http://127.0.0.1:3000/api/health >/dev/null || problems+=("health check failed")

last=$(sql "select status from directory.etl_runs where source = 'fr' and not dry_run and status <> 'running' order by id desc limit 1") || last=error
case "$last" in failed | blocked | error) problems+=("last import: $last") ;; esac
stale=$(sql "select coalesce(max(finished_at) < now() - interval '9 days', true) from directory.etl_runs where source = 'fr' and not dry_run and status in ('succeeded', 'skipped')") || stale=error
[ "$stale" = f ] || problems+=("no successful import for 9 days ($stale)")

[ -n "$(find /var/backups/apercura/last-success -mmin -1560 2>/dev/null)" ] || problems+=("no backup for 26 hours")

for mount in / /var/lib/docker; do
  used=$(df -P "$mount" | awk 'NR == 2 { sub("%", "", $5); print $5 }')
  [ "${used:-100}" -lt 85 ] || problems+=("disk $mount at ${used}%")
done

if [ ${#problems[@]} -gt 0 ]; then
  printf '%s\n' "${problems[@]}" | curl -fsS --max-time 10 --data-binary @- https://alerts.example.org/apercura
  exit 1
fi
curl -fsS --max-time 10 https://alerts.example.org/apercura/heartbeat >/dev/null
```

```sh
# /etc/cron.d/apercura-check
7 * * * * root /usr/local/sbin/apercura-check >> /var/log/apercura-check.log 2>&1
```

The heartbeat on success matters as much as the alert: a dead man's switch
also tells you when the server, cron or the check itself stopped running.
Follow the import with `apercura-compose logs -f scheduler`, and read
`etl_runs.guards` before approving a blocked run.
