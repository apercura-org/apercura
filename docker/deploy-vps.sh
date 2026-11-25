#!/usr/bin/env bash
# Deploys one commit of main on a single VPS: docker/compose.selfhost.yml + docker/compose.vps.yml,
# image built on the server. See docs/deploy-vps.md.
#
#   docker/deploy-vps.sh <40-hex git sha>
#
# Meant to be the forced command of a dedicated SSH key (authorized_keys `command="…"`): the
# sha then comes from SSH_ORIGINAL_COMMAND, the command the client asked for. Only a full
# 40-character lowercase hex sha is accepted, from either source; anything else is refused.
#
# Steps: fetch origin/main, check the sha is on it, check it out (detached), build the image,
# `up -d` (migrations run before the app starts), wait until the app container is healthy,
# check /api/health on the host port, prune dangling images.
#
# No automatic rollback: migrations only go forward, and the previous image may not run on the
# migrated schema. On failure this exits non-zero and leaves the stack as it is; a rollback is
# a restore (docs/self-hosting.md#backups-and-restore).
#
# Environment (paths relative to the repository root):
#   APERCURA_REPO_DIR        repository checkout (default: the parent of this script's folder)
#   APERCURA_COMPOSE_FILE    base Compose file (default docker/compose.selfhost.yml)
#   APERCURA_COMPOSE_VPS     override file (default docker/compose.vps.yml)
#   APERCURA_ENV_FILE        environment file (default docker/.env.selfhost)
#   APERCURA_HEALTH_TIMEOUT  seconds to wait for a healthy app (default 180)
#   APERCURA_REMOTE          git remote to fetch main from (default origin)
# Exit codes: 0 deployed, 1 failed, 2 refused (bad or unknown sha, dirty checkout, busy).
set -euo pipefail

# Everything runs from main(): bash has then parsed the whole script before `git checkout`
# replaces this file with the deployed commit's version.
main() {
	local sha="${1:-${SSH_ORIGINAL_COMMAND:-}}"
	if ! [[ "$sha" =~ ^[0-9a-f]{40}$ ]]; then
		echo "usage: deploy-vps.sh <40-hex git sha> (got: ${sha:0:80})" >&2
		exit 2
	fi

	local script_dir repo
	script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
	repo="${APERCURA_REPO_DIR:-$(cd "$script_dir/.." && pwd)}"
	cd "$repo"

	local compose_file="${APERCURA_COMPOSE_FILE:-docker/compose.selfhost.yml}"
	local compose_vps="${APERCURA_COMPOSE_VPS:-docker/compose.vps.yml}"
	local env_file="${APERCURA_ENV_FILE:-docker/.env.selfhost}"
	local timeout="${APERCURA_HEALTH_TIMEOUT:-180}"
	local remote="${APERCURA_REMOTE:-origin}"

	[ -f "$env_file" ] || fail "environment file $env_file not found in $repo"
	command -v docker >/dev/null || fail "docker is not installed"

	# One deploy at a time on this checkout.
	local lock
	lock="$(git rev-parse --absolute-git-dir)/deploy-vps.lock"
	exec 9>"$lock"
	if command -v flock >/dev/null && ! flock -n 9; then
		echo "another deploy is running ($lock)" >&2
		exit 2
	fi

	log "fetching $remote main"
	git fetch --quiet "$remote" main
	if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
		echo "refused: $sha is not a known commit after fetching $remote main" >&2
		exit 2
	fi
	if ! git merge-base --is-ancestor "$sha" "refs/remotes/$remote/main"; then
		echo "refused: $sha is not on $remote/main" >&2
		exit 2
	fi
	# Tracked files only: the environment file is ignored by git and stays in place.
	if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
		echo "refused: the checkout in $repo has local changes (git status)" >&2
		exit 2
	fi

	local previous
	previous="$(git rev-parse HEAD)"
	log "checking out $sha (was $previous)"
	git checkout --quiet --detach "$sha"

	compose() {
		docker compose -f "$compose_file" -f "$compose_vps" --env-file "$env_file" "$@"
	}

	log "building the image"
	compose build || fail "image build failed (still running the previous containers)"
	log "starting the stack (migrations first)"
	compose up -d || fail "docker compose up failed (see: docker compose logs migrate app)"

	log "waiting up to ${timeout}s for the app to be healthy"
	local container status deadline=$((SECONDS + timeout))
	container="$(compose ps -q app)"
	[ -n "$container" ] || fail "no app container after up"
	while :; do
		status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || echo missing)"
		case "$status" in
		healthy) break ;;
		unhealthy | exited | dead | missing)
			compose logs --no-color --tail 50 app >&2 || true
			fail "app container is $status"
			;;
		esac
		if [ "$SECONDS" -ge "$deadline" ]; then
			compose logs --no-color --tail 50 app >&2 || true
			fail "app not healthy after ${timeout}s (last status: $status)"
		fi
		sleep 3
	done

	# The host side of the app's port, as published (APP_BIND:APP_PORT, 127.0.0.1:3000 by default).
	local published port
	published="$(compose port app 3000 2>/dev/null || true)"
	port="${published##*:}"
	port="${port:-${APP_PORT:-3000}}"
	curl -fsS --max-time 10 "http://127.0.0.1:${port}/api/health" >/dev/null ||
		fail "http://127.0.0.1:${port}/api/health did not answer 200"

	log "pruning dangling images"
	docker image prune -f >/dev/null || true

	log "deployed $(git rev-parse HEAD)"
}

log() { printf '[deploy %s] %s\n' "$(date -u '+%H:%M:%S')" "$*"; }

fail() {
	printf '[deploy %s] FAILED: %s\n' "$(date -u '+%H:%M:%S')" "$*" >&2
	exit 1
}

main "$@"
