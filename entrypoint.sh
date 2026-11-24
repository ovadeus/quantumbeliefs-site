#!/bin/sh
set -e
# Start the signup API on 127.0.0.1:3000, then run nginx in the foreground.
# Use the nginx image's own entrypoint when present so default nginx setup is preserved.
node /opt/qb-signup/signup-server.js &
if [ -x /docker-entrypoint.sh ]; then
  exec /docker-entrypoint.sh nginx -g "daemon off;"
fi
exec nginx -g "daemon off;"
