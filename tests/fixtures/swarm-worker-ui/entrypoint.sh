#!/bin/sh
set -eu
mkdir -p /root/.ssh
chmod 700 /root/.ssh
cp /lab-key/id_ed25519.pub /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
ssh-keygen -A
/usr/sbin/sshd
exec dockerd-entrypoint.sh dockerd --host=unix:///var/run/docker.sock
