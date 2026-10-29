#!/usr/bin/env bash
# Generates a node heartbeat token. Prints the token ONCE, plus its sha256 (hex) for nodes.token_hash.
# Does NOT write to any database or file. Usage: ./gen-token.sh <node_id>
set -euo pipefail
node="${1:?usage: gen-token.sh <node_id>}"
case "$node" in *[!a-z0-9_-]*) echo "invalid node id" >&2; exit 2;; esac
token="$(openssl rand -hex 32)"
hash="$(printf '%s' "$token" | sha256sum | cut -d' ' -f1)"
cat <<OUT
node_id     : $node
TOKEN (shown once, put in /etc/labit-heartbeat.env on that node, then forget it):
$token

sha256 (hex) for the DB (run by the user/CTO, not by this script):
$hash

  update labit_ops.nodes set token_hash = '$hash' where id = '$node';
OUT
