FROM dokploy/dokploy:canary@sha256:4d6524600df2079f3ed851db06360999ff08dc37d34a44e9f59756e9746f5f44
RUN rm -rf /app/.next /app/dist /app/drizzle /app/node_modules/@dokploy/server/dist
COPY next /app/.next
COPY app-dist /app/dist
COPY drizzle /app/drizzle
COPY next.config.mjs /app/next.config.mjs
COPY server-dist /tmp/dokploy-server-dist
RUN server_dist="$(readlink -f /app/node_modules/@dokploy/server)/dist" \
    && mkdir -p "$server_dist" \
    && cp -R /tmp/dokploy-server-dist/. "$server_dist/" \
    && rm -rf /tmp/dokploy-server-dist
