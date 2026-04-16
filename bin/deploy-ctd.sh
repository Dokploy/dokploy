#!/usr/bin/env bash
#
# Deploy a CTD-tagged Dokploy image to the Contracko Hetzner host.
#
# Usage:
#   bin/deploy-ctd.sh <tag>
#
# Examples:
#   bin/deploy-ctd.sh v0.29.0-ctd1c18ac3          # specific pinned build
#   bin/deploy-ctd.sh feat-github-deployments-api  # rolling branch tag
#
# Behavior:
#   - SSHes to the Hetzner host over Tailscale
#   - Runs `docker service update --image <IMAGE> --with-registry-auth dokploy`
#   - Streams the rollout via `docker service ps dokploy`
#
# Prerequisites on Hetzner:
#   - Docker swarm node (dokploy is a swarm service)
#   - `docker login ghcr.io` already run with a GHCR PAT that can read
#     ghcr.io/budivoogt/dokploy (needed only if the package is private)

set -euo pipefail

TAG="${1:-}"
if [[ -z "$TAG" ]]; then
  echo "Usage: $0 <tag>" >&2
  echo "Example: $0 v0.29.0-ctd1c18ac3" >&2
  exit 1
fi

HOST="${CTD_DOKPLOY_HOST:-100.71.164.32}"
USER="${CTD_DOKPLOY_USER:-root}"
SERVICE="${CTD_DOKPLOY_SERVICE:-dokploy}"
IMAGE="ghcr.io/budivoogt/dokploy:${TAG}"

echo "==> Updating service '${SERVICE}' on ${USER}@${HOST} to ${IMAGE}"

ssh "${USER}@${HOST}" "docker service update \
  --image ${IMAGE} \
  --with-registry-auth \
  --update-order start-first \
  ${SERVICE}"

echo
echo "==> Rollout status:"
ssh "${USER}@${HOST}" "docker service ps ${SERVICE} --no-trunc --format 'table {{.Name}}\t{{.Image}}\t{{.CurrentState}}\t{{.Error}}' | head -5"

echo
echo "Done. If anything looks wrong, roll back with:"
echo "  $0 <previous-tag>"
