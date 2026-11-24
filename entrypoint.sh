#!/bin/sh
set -e
# Start the signup API on 127.0.0.1:3000, then run nginx in the foreground.
# PORT/HOST are forced here because Coolify injects PORT=80 (nginx's port).
# The loop restarts the API if it ever exits.
(
  while true; do
    PORT=3000 HOST=127.0.0.1 node /opt/qb-signup/signup-server.js || true
    sleep 2
  done
) &
if [ -x /docker-entrypoint.sh ]; then
  exec /docker-entrypoint.sh nginx -g "daemon off;"
fi
exec nginx -g "daemon off;"
