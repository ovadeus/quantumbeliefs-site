FROM nginx:alpine
# nodejs only (no npm) — same-container signup API that writes to /data.
RUN apk add --no-cache nodejs
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /usr/local/bin/qb-entrypoint.sh
COPY index.html styles.css script.js /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/
COPY linkedin/ /usr/share/nginx/html/linkedin/
COPY server/signup-server.js /opt/qb-signup/signup-server.js
RUN chmod +x /usr/local/bin/qb-entrypoint.sh
# /data is provided at runtime by a Coolify volume, not copied into the image.
EXPOSE 80
ENTRYPOINT ["/usr/local/bin/qb-entrypoint.sh"]
