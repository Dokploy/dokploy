FROM dokploy/dokploy:v0.30.10
RUN rm -rf /app/.next /app/dist /app/node_modules/@dokploy/server/dist
COPY next /app/.next
COPY app-dist /app/dist
COPY server-dist /tmp/dokploy-server-dist
RUN server_dist="$(readlink -f /app/node_modules/@dokploy/server)/dist" \
    && mkdir -p "$server_dist" \
    && cp -R /tmp/dokploy-server-dist/. "$server_dist/" \
    && rm -rf /tmp/dokploy-server-dist
