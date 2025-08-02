import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToAllVolumes,
	addSuffixToVolumesRoot,
	generateRandomHash,
} from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
services:
  mail:
    image: bytemark/smtp
    restart: always

  plausible_db:
    image: postgres:14-alpine
    restart: always
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=postgres

  plausible_events_db:
    image: clickhouse/clickhouse-server:23.3.7.5-alpine
    restart: always
    volumes:
      - event-data:/var/lib/clickhouse
      - event-logs:/var/log/clickhouse-server
      - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
      - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  plausible:
    image: plausible/analytics:v2.0
    restart: always
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    depends_on:
      - plausible_db
      - plausible_events_db
      - mail
    ports:
      - 127.0.0.1:8000:8000
    env_file:
      - plausible-conf.env
    volumes:
      - type: volume
        source: plausible-data
        target: /data

  mysql:
    image: mysql:5.7
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: example
    volumes:
      - type: volume
        source: db-data
        target: /var/lib/mysql/data

volumes:
  db-data:
    driver: local
  event-data:
    driver: local
  event-logs:
    driver: local
`;

const expectedDockerCompose = load(`
services:
  mail:
    image: bytemark/smtp
    restart: always

  plausible_db:
    image: postgres:14-alpine
    restart: always
    volumes:
      - db-data-testhash:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=postgres

  plausible_events_db:
    image: clickhouse/clickhouse-server:23.3.7.5-alpine
    restart: always
    volumes:
      - event-data-testhash:/var/lib/clickhouse
      - event-logs-testhash:/var/log/clickhouse-server
      - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
      - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  plausible:
    image: plausible/analytics:v2.0
    restart: always
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    depends_on:
      - plausible_db
      - plausible_events_db
      - mail
    ports:
      - 127.0.0.1:8000:8000
    env_file:
      - plausible-conf.env
    volumes:
      - type: volume
        source: plausible-data-testhash
        target: /data

  mysql:
    image: mysql:5.7
    restart: always
    environment:
      MYSQL_ROOT_PASSWORD: example
    volumes:
      - type: volume
        source: db-data-testhash
        target: /var/lib/mysql/data

volumes:
  db-data-testhash:
    driver: local
  event-data-testhash:
    driver: local
  event-logs-testhash:
    driver: local
`) as ComposeSpecification;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

// Docker compose needs unique names for services, volumes, networks and containers
// So base on a input which is a dockercompose file, it should replace the name with a hash and return a new dockercompose file
test("Add suffix to volumes root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.volumes) {
		return;
	}
	const volumes = addSuffixToVolumesRoot(composeData.volumes, suffix);

	// {
	// 	'db-data-af045046': { driver: 'local' },
	// 	'event-data-af045046': { driver: 'local' },
	// 	'event-logs-af045046': { driver: 'local' }
	//   }

	expect(volumes).toBeDefined();
	for (const volumeKey of Object.keys(volumes)) {
		expect(volumeKey).toContain(`-${suffix}`);
	}
});

test("Expect to change the suffix in all the possible places", () => {
	const composeData = load(composeFile) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerCompose);
});

const composeFile2 = `
version: '3.8'
services:
  app:
    image: myapp:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - app-config:/usr/src/app/config
      - ./config:/usr/src/app/config:ro
    environment:
      - NODE_ENV=production
  mongo:
    image: mongo:4.2
    volumes:
      - mongo-data:/data/db
volumes:
  app-config:
  mongo-data:
`;

const expectedDockerCompose2 = load(`
version: '3.8'
services:
  app:
    image: myapp:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - app-config-testhash:/usr/src/app/config
      - ./config:/usr/src/app/config:ro
    environment:
      - NODE_ENV=production
  mongo:
    image: mongo:4.2
    volumes:
      - mongo-data-testhash:/data/db
volumes:
  app-config-testhash:
  mongo-data-testhash:
`) as ComposeSpecification;

test("Expect to change the suffix in all the possible places (2 Try)", () => {
	const composeData = load(composeFile2) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerCompose2);
});

const composeFile3 = `
version: '3.8'
services:
  app:
    image: myapp:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - app-config:/usr/src/app/config
      - ./config:/usr/src/app/config:ro
    environment:
      - NODE_ENV=production
  mongo:
    image: mongo:4.2
    volumes:
      - mongo-data:/data/db
volumes:
  app-config:
  mongo-data:
`;

const expectedDockerCompose3 = load(`
version: '3.8'
services:
  app:
    image: myapp:latest
    build:
      context: .
      dockerfile: Dockerfile
    volumes:
      - app-config-testhash:/usr/src/app/config
      - ./config:/usr/src/app/config:ro
    environment:
      - NODE_ENV=production
  mongo:
    image: mongo:4.2
    volumes:
      - mongo-data-testhash:/data/db
volumes:
  app-config-testhash:
  mongo-data-testhash:
`) as ComposeSpecification;

test("Expect to change the suffix in all the possible places (3 Try)", () => {
	const composeData = load(composeFile3) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerCompose3);
});

const composeFileComplex = `
version: "3.8"
services:
  studio:
    container_name: supabase-studio
    image: supabase/studio:20240422-5cf8f30
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('http').get('http://localhost:3000/api/profile', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: \${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: \${STUDIO_DEFAULT_PROJECT}
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: \${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SERVICE_ROLE_KEY}
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
      LOGFLARE_URL: http://analytics:4000
      NEXT_PUBLIC_ENABLE_LOGS: true
      NEXT_ANALYTICS_BACKEND_PROVIDER: postgres

  kong:
    container_name: supabase-kong
    image: kong:2.8.1
    restart: unless-stopped
    entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'
    ports:
      - \${KONG_HTTP_PORT}:8000/tcp
      - \${KONG_HTTPS_PORT}:8443/tcp
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SERVICE_ROLE_KEY}
      DASHBOARD_USERNAME: \${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: \${DASHBOARD_PASSWORD}
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro

  auth:
    container_name: supabase-auth
    image: supabase/gotrue:v2.151.0
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:9999/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: \${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      GOTRUE_SITE_URL: \${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: \${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: \${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: \${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: \${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: \${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: \${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: \${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: \${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: \${SMTP_HOST}
      GOTRUE_SMTP_PORT: \${SMTP_PORT}
      GOTRUE_SMTP_USER: \${SMTP_USER}
      GOTRUE_SMTP_PASS: \${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: \${SMTP_SENDER_NAME}
      GOTRUE_MAILER_URLPATHS_INVITE: \${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: \${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: \${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: \${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: \${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: \${ENABLE_PHONE_AUTOCONFIRM}

  rest:
    container_name: supabase-rest
    image: postgrest/postgrest:v12.0.1
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    restart: unless-stopped
    environment:
      PGRST_DB_URI: postgres://authenticator:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      PGRST_DB_SCHEMAS: \${PGRST_DB_SCHEMAS}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: \${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: \${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: \${JWT_EXPIRY}
    command: "postgrest"

  realtime:
    container_name: realtime-dev.supabase-realtime
    image: supabase/realtime:v2.28.32
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "curl",
          "-sSfL",
          "--head",
          "-o",
          "/dev/null",
          "-H",
          "Authorization: Bearer \${ANON_KEY}",
          "http://localhost:4000/api/tenants/realtime-dev/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      PORT: 4000
      DB_HOST: \${POSTGRES_HOST}
      DB_PORT: \${POSTGRES_PORT}
      DB_USER: supabase_admin
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      DB_NAME: \${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: \${JWT_SECRET}
      FLY_ALLOC_ID: fly123
      FLY_APP_NAME: realtime
      SECRET_KEY_BASE: UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq
      ERL_AFLAGS: -proto_dist inet_tcp
      ENABLE_TAILSCALE: "false"
      DNS_NODES: "''"
    command: >
      sh -c "/app/bin/migrate && /app/bin/realtime eval 'Realtime.Release.seeds(Realtime.Repo)' && /app/bin/server"

  storage:
    container_name: supabase-storage
    image: supabase/storage-api:v1.0.6
    depends_on:
      db:
        condition: service_healthy
      rest:
        condition: service_started
      imgproxy:
        condition: service_started
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:5000/status"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      ANON_KEY: \${ANON_KEY}
      SERVICE_KEY: \${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: \${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://imgproxy:5001
    volumes:
      - ./volumes/storage:/var/lib/storage:z

  imgproxy:
    container_name: supabase-imgproxy
    image: darthsim/imgproxy:v3.8.0
    healthcheck:
      test: [ "CMD", "imgproxy", "health" ]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: \${IMGPROXY_ENABLE_WEBP_DETECTION}
    volumes:
      - ./volumes/storage:/var/lib/storage:z

  meta:
    container_name: supabase-meta
    image: supabase/postgres-meta:v0.80.0
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    restart: unless-stopped
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: \${POSTGRES_HOST}
      PG_META_DB_PORT: \${POSTGRES_PORT}
      PG_META_DB_NAME: \${POSTGRES_DB}
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: \${POSTGRES_PASSWORD}

  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.45.2
    restart: unless-stopped
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      JWT_SECRET: \${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: \${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      VERIFY_JWT: "\${FUNCTIONS_VERIFY_JWT}"
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    command:
      - start
      - --main-service
      - /home/deno/functions/main

  analytics:
    container_name: supabase-analytics
    image: supabase/logflare:1.4.0
    healthcheck:
      test: [ "CMD", "curl", "http://localhost:4000/health" ]
      timeout: 5s
      interval: 5s
      retries: 10
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      LOGFLARE_NODE_HOST: 127.0.0.1
      DB_USERNAME: supabase_admin
      DB_DATABASE: \${POSTGRES_DB}
      DB_HOSTNAME: \${POSTGRES_HOST}
      DB_PORT: \${POSTGRES_PORT}
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      DB_SCHEMA: _analytics
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
      LOGFLARE_SINGLE_TENANT: true
      LOGFLARE_SUPABASE_MODE: true
      LOGFLARE_MIN_CLUSTER_SIZE: 1
      POSTGRES_BACKEND_URL: postgresql://supabase_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      POSTGRES_BACKEND_SCHEMA: _analytics
      LOGFLARE_FEATURE_FLAG_OVERRIDE: multibackend=true
    ports:
      - 4000:4000

  db:
    container_name: supabase-db
    image: supabase/postgres:15.1.1.41
    healthcheck:
      test: pg_isready -U postgres -h localhost
      interval: 5s
      timeout: 5s
      retries: 10
    depends_on:
      vector:
        condition: service_healthy
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=fatal
    restart: unless-stopped
    ports:
      - \${POSTGRES_PORT}:\${POSTGRES_PORT}
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: \${POSTGRES_PORT}
      POSTGRES_PORT: \${POSTGRES_PORT}
      PGPASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      PGDATABASE: \${POSTGRES_DB}
      POSTGRES_DB: \${POSTGRES_DB}
      JWT_SECRET: \${JWT_SECRET}
      JWT_EXP: \${JWT_EXPIRY}
    volumes:
      - ./volumes/db/realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:Z
      - ./volumes/db/webhooks.sql:/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql:Z
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:Z
      - ./volumes/db/data:/var/lib/postgresql/data:Z
      - ./volumes/db/logs.sql:/docker-entrypoint-initdb.d/migrations/99-logs.sql:Z
      - db-config:/etc/postgresql-custom

  vector:
    container_name: supabase-vector
    image: timberio/vector:0.28.1-alpine
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://vector:9001/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    volumes:
      - ./volumes/logs/vector.yml:/etc/vector/vector.yml:ro
      - "\${DOCKER_SOCKET_LOCATION}:/var/run/docker.sock:ro"
    environment:
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
    command: [ "--config", "etc/vector/vector.yml" ]

volumes:
  db-config:
`;

const expectedDockerComposeComplex = load(`
version: "3.8"
services:
  studio:
    container_name: supabase-studio
    image: supabase/studio:20240422-5cf8f30
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('http').get('http://localhost:3000/api/profile', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      STUDIO_PG_META_URL: http://meta:8080
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      DEFAULT_ORGANIZATION_NAME: \${STUDIO_DEFAULT_ORGANIZATION}
      DEFAULT_PROJECT_NAME: \${STUDIO_DEFAULT_PROJECT}
      SUPABASE_URL: http://kong:8000
      SUPABASE_PUBLIC_URL: \${SUPABASE_PUBLIC_URL}
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SERVICE_ROLE_KEY}
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
      LOGFLARE_URL: http://analytics:4000
      NEXT_PUBLIC_ENABLE_LOGS: true
      NEXT_ANALYTICS_BACKEND_PROVIDER: postgres

  kong:
    container_name: supabase-kong
    image: kong:2.8.1
    restart: unless-stopped
    entrypoint: bash -c 'eval "echo \"$$(cat ~/temp.yml)\"" > ~/kong.yml && /docker-entrypoint.sh kong docker-start'
    ports:
      - \${KONG_HTTP_PORT}:8000/tcp
      - \${KONG_HTTPS_PORT}:8443/tcp
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /home/kong/kong.yml
      KONG_DNS_ORDER: LAST,A,CNAME
      KONG_PLUGINS: request-transformer,cors,key-auth,acl,basic-auth
      KONG_NGINX_PROXY_PROXY_BUFFER_SIZE: 160k
      KONG_NGINX_PROXY_PROXY_BUFFERS: 64 160k
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_KEY: \${SERVICE_ROLE_KEY}
      DASHBOARD_USERNAME: \${DASHBOARD_USERNAME}
      DASHBOARD_PASSWORD: \${DASHBOARD_PASSWORD}
    volumes:
      - ./volumes/api/kong.yml:/home/kong/temp.yml:ro

  auth:
    container_name: supabase-auth
    image: supabase/gotrue:v2.151.0
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:9999/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      GOTRUE_API_HOST: 0.0.0.0
      GOTRUE_API_PORT: 9999
      API_EXTERNAL_URL: \${API_EXTERNAL_URL}
      GOTRUE_DB_DRIVER: postgres
      GOTRUE_DB_DATABASE_URL: postgres://supabase_auth_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      GOTRUE_SITE_URL: \${SITE_URL}
      GOTRUE_URI_ALLOW_LIST: \${ADDITIONAL_REDIRECT_URLS}
      GOTRUE_DISABLE_SIGNUP: \${DISABLE_SIGNUP}
      GOTRUE_JWT_ADMIN_ROLES: service_role
      GOTRUE_JWT_AUD: authenticated
      GOTRUE_JWT_DEFAULT_GROUP_NAME: authenticated
      GOTRUE_JWT_EXP: \${JWT_EXPIRY}
      GOTRUE_JWT_SECRET: \${JWT_SECRET}
      GOTRUE_EXTERNAL_EMAIL_ENABLED: \${ENABLE_EMAIL_SIGNUP}
      GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: \${ENABLE_ANONYMOUS_USERS}
      GOTRUE_MAILER_AUTOCONFIRM: \${ENABLE_EMAIL_AUTOCONFIRM}
      GOTRUE_SMTP_ADMIN_EMAIL: \${SMTP_ADMIN_EMAIL}
      GOTRUE_SMTP_HOST: \${SMTP_HOST}
      GOTRUE_SMTP_PORT: \${SMTP_PORT}
      GOTRUE_SMTP_USER: \${SMTP_USER}
      GOTRUE_SMTP_PASS: \${SMTP_PASS}
      GOTRUE_SMTP_SENDER_NAME: \${SMTP_SENDER_NAME}
      GOTRUE_MAILER_URLPATHS_INVITE: \${MAILER_URLPATHS_INVITE}
      GOTRUE_MAILER_URLPATHS_CONFIRMATION: \${MAILER_URLPATHS_CONFIRMATION}
      GOTRUE_MAILER_URLPATHS_RECOVERY: \${MAILER_URLPATHS_RECOVERY}
      GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE: \${MAILER_URLPATHS_EMAIL_CHANGE}
      GOTRUE_EXTERNAL_PHONE_ENABLED: \${ENABLE_PHONE_SIGNUP}
      GOTRUE_SMS_AUTOCONFIRM: \${ENABLE_PHONE_AUTOCONFIRM}

  rest:
    container_name: supabase-rest
    image: postgrest/postgrest:v12.0.1
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    restart: unless-stopped
    environment:
      PGRST_DB_URI: postgres://authenticator:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      PGRST_DB_SCHEMAS: \${PGRST_DB_SCHEMAS}
      PGRST_DB_ANON_ROLE: anon
      PGRST_JWT_SECRET: \${JWT_SECRET}
      PGRST_DB_USE_LEGACY_GUCS: "false"
      PGRST_APP_SETTINGS_JWT_SECRET: \${JWT_SECRET}
      PGRST_APP_SETTINGS_JWT_EXP: \${JWT_EXPIRY}
    command: "postgrest"

  realtime:
    container_name: realtime-dev.supabase-realtime
    image: supabase/realtime:v2.28.32
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    healthcheck:
      test:
        [
          "CMD",
          "curl",
          "-sSfL",
          "--head",
          "-o",
          "/dev/null",
          "-H",
          "Authorization: Bearer \${ANON_KEY}",
          "http://localhost:4000/api/tenants/realtime-dev/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      PORT: 4000
      DB_HOST: \${POSTGRES_HOST}
      DB_PORT: \${POSTGRES_PORT}
      DB_USER: supabase_admin
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      DB_NAME: \${POSTGRES_DB}
      DB_AFTER_CONNECT_QUERY: 'SET search_path TO _realtime'
      DB_ENC_KEY: supabaserealtime
      API_JWT_SECRET: \${JWT_SECRET}
      FLY_ALLOC_ID: fly123
      FLY_APP_NAME: realtime
      SECRET_KEY_BASE: UpNVntn3cDxHJpq99YMc1T1AQgQpc8kfYTuRgBiYa15BLrx8etQoXz3gZv1/u2oq
      ERL_AFLAGS: -proto_dist inet_tcp
      ENABLE_TAILSCALE: "false"
      DNS_NODES: "''"
    command: >
      sh -c "/app/bin/migrate && /app/bin/realtime eval 'Realtime.Release.seeds(Realtime.Repo)' && /app/bin/server"

  storage:
    container_name: supabase-storage
    image: supabase/storage-api:v1.0.6
    depends_on:
      db:
        condition: service_healthy
      rest:
        condition: service_started
      imgproxy:
        condition: service_started
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://localhost:5000/status"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    restart: unless-stopped
    environment:
      ANON_KEY: \${ANON_KEY}
      SERVICE_KEY: \${SERVICE_ROLE_KEY}
      POSTGREST_URL: http://rest:3000
      PGRST_JWT_SECRET: \${JWT_SECRET}
      DATABASE_URL: postgres://supabase_storage_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      FILE_SIZE_LIMIT: 52428800
      STORAGE_BACKEND: file
      FILE_STORAGE_BACKEND_PATH: /var/lib/storage
      TENANT_ID: stub
      REGION: stub
      GLOBAL_S3_BUCKET: stub
      ENABLE_IMAGE_TRANSFORMATION: "true"
      IMGPROXY_URL: http://imgproxy:5001
    volumes:
      - ./volumes/storage:/var/lib/storage:z

  imgproxy:
    container_name: supabase-imgproxy
    image: darthsim/imgproxy:v3.8.0
    healthcheck:
      test: [ "CMD", "imgproxy", "health" ]
      timeout: 5s
      interval: 5s
      retries: 3
    environment:
      IMGPROXY_BIND: ":5001"
      IMGPROXY_LOCAL_FILESYSTEM_ROOT: /
      IMGPROXY_USE_ETAG: "true"
      IMGPROXY_ENABLE_WEBP_DETECTION: \${IMGPROXY_ENABLE_WEBP_DETECTION}
    volumes:
      - ./volumes/storage:/var/lib/storage:z

  meta:
    container_name: supabase-meta
    image: supabase/postgres-meta:v0.80.0
    depends_on:
      db:
        condition: service_healthy
      analytics:
        condition: service_healthy
    restart: unless-stopped
    environment:
      PG_META_PORT: 8080
      PG_META_DB_HOST: \${POSTGRES_HOST}
      PG_META_DB_PORT: \${POSTGRES_PORT}
      PG_META_DB_NAME: \${POSTGRES_DB}
      PG_META_DB_USER: supabase_admin
      PG_META_DB_PASSWORD: \${POSTGRES_PASSWORD}

  functions:
    container_name: supabase-edge-functions
    image: supabase/edge-runtime:v1.45.2
    restart: unless-stopped
    depends_on:
      analytics:
        condition: service_healthy
    environment:
      JWT_SECRET: \${JWT_SECRET}
      SUPABASE_URL: http://kong:8000
      SUPABASE_ANON_KEY: \${ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: \${SERVICE_ROLE_KEY}
      SUPABASE_DB_URL: postgresql://postgres:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      VERIFY_JWT: "\${FUNCTIONS_VERIFY_JWT}"
    volumes:
      - ./volumes/functions:/home/deno/functions:Z
    command:
      - start
      - --main-service
      - /home/deno/functions/main

  analytics:
    container_name: supabase-analytics
    image: supabase/logflare:1.4.0
    healthcheck:
      test: [ "CMD", "curl", "http://localhost:4000/health" ]
      timeout: 5s
      interval: 5s
      retries: 10
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    environment:
      LOGFLARE_NODE_HOST: 127.0.0.1
      DB_USERNAME: supabase_admin
      DB_DATABASE: \${POSTGRES_DB}
      DB_HOSTNAME: \${POSTGRES_HOST}
      DB_PORT: \${POSTGRES_PORT}
      DB_PASSWORD: \${POSTGRES_PASSWORD}
      DB_SCHEMA: _analytics
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
      LOGFLARE_SINGLE_TENANT: true
      LOGFLARE_SUPABASE_MODE: true
      LOGFLARE_MIN_CLUSTER_SIZE: 1
      POSTGRES_BACKEND_URL: postgresql://supabase_admin:\${POSTGRES_PASSWORD}@\${POSTGRES_HOST}:\${POSTGRES_PORT}/\${POSTGRES_DB}
      POSTGRES_BACKEND_SCHEMA: _analytics
      LOGFLARE_FEATURE_FLAG_OVERRIDE: multibackend=true
    ports:
      - 4000:4000

  db:
    container_name: supabase-db
    image: supabase/postgres:15.1.1.41
    healthcheck:
      test: pg_isready -U postgres -h localhost
      interval: 5s
      timeout: 5s
      retries: 10
    depends_on:
      vector:
        condition: service_healthy
    command:
      - postgres
      - -c
      - config_file=/etc/postgresql/postgresql.conf
      - -c
      - log_min_messages=fatal
    restart: unless-stopped
    ports:
      - \${POSTGRES_PORT}:\${POSTGRES_PORT}
    environment:
      POSTGRES_HOST: /var/run/postgresql
      PGPORT: \${POSTGRES_PORT}
      POSTGRES_PORT: \${POSTGRES_PORT}
      PGPASSWORD: \${POSTGRES_PASSWORD}
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD}
      PGDATABASE: \${POSTGRES_DB}
      POSTGRES_DB: \${POSTGRES_DB}
      JWT_SECRET: \${JWT_SECRET}
      JWT_EXP: \${JWT_EXPIRY}
    volumes:
      - ./volumes/db/realtime.sql:/docker-entrypoint-initdb.d/migrations/99-realtime.sql:Z
      - ./volumes/db/webhooks.sql:/docker-entrypoint-initdb.d/init-scripts/98-webhooks.sql:Z
      - ./volumes/db/roles.sql:/docker-entrypoint-initdb.d/init-scripts/99-roles.sql:Z
      - ./volumes/db/jwt.sql:/docker-entrypoint-initdb.d/init-scripts/99-jwt.sql:Z
      - ./volumes/db/data:/var/lib/postgresql/data:Z
      - ./volumes/db/logs.sql:/docker-entrypoint-initdb.d/migrations/99-logs.sql:Z
      - db-config-testhash:/etc/postgresql-custom

  vector:
    container_name: supabase-vector
    image: timberio/vector:0.28.1-alpine
    healthcheck:
      test:
        [
          "CMD",
          "wget",
          "--no-verbose",
          "--tries=1",
          "--spider",
          "http://vector:9001/health"
        ]
      timeout: 5s
      interval: 5s
      retries: 3
    volumes:
      - ./volumes/logs/vector.yml:/etc/vector/vector.yml:ro
      - \${DOCKER_SOCKET_LOCATION}:/var/run/docker.sock:ro
    environment:
      LOGFLARE_API_KEY: \${LOGFLARE_API_KEY}
    command: [ "--config", "etc/vector/vector.yml" ]

volumes:
  db-config-testhash:
`);

test("Expect to change the suffix in all the possible places (4 Try)", () => {
	const composeData = load(composeFileComplex) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerComposeComplex);
});

const composeFileExample1 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
    networks:
      - frontend
    volumes:
      - web-data:/var/www/html
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

  app:
    image: node:14
    depends_on:
      - db
    networks:
      - backend
      - frontend
    volumes:
      - app-data:/usr/src/app
      - ./src:/usr/src/app/src

  db:
    image: postgres:13
    environment:
      POSTGRES_PASSWORD: example
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  web-data:
  app-data:
  db-data:
`;

const expectedDockerComposeExample1 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    ports:
      - "80:80"
    networks:
      - frontend
    volumes:
      - web-data-testhash:/var/www/html
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

  app:
    image: node:14
    depends_on:
      - db
    networks:
      - backend
      - frontend
    volumes:
      - app-data-testhash:/usr/src/app
      - ./src:/usr/src/app/src

  db:
    image: postgres:13
    environment:
      POSTGRES_PASSWORD: example
    networks:
      - backend
    volumes:
      - db-data-testhash:/var/lib/postgresql/data

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

volumes:
  web-data-testhash:
  app-data-testhash:
  db-data-testhash:
`) as ComposeSpecification;

test("Expect to change the suffix in all the possible places (5 Try)", () => {
	const composeData = load(composeFileExample1) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerComposeExample1);
});

const composeFileBackrest = `
services:
  backrest:
    image: garethgeorge/backrest:v1.7.3
    restart: unless-stopped
    ports:
      - 9898
    environment:
      - BACKREST_PORT=9898
      - BACKREST_DATA=/data
      - BACKREST_CONFIG=/config/config.json
      - XDG_CACHE_HOME=/cache
      - TZ=\${TZ}
    volumes:
      - backrest/data:/data
      - backrest/config:/config
      - backrest/cache:/cache
      - /:/userdata:ro

volumes:
  backrest:
  backrest-cache:
`;

const expectedDockerComposeBackrest = load(`
services:
  backrest:
    image: garethgeorge/backrest:v1.7.3
    restart: unless-stopped
    ports:
      - 9898
    environment:
      - BACKREST_PORT=9898
      - BACKREST_DATA=/data
      - BACKREST_CONFIG=/config/config.json
      - XDG_CACHE_HOME=/cache
      - TZ=\${TZ}
    volumes:
      - backrest-testhash/data:/data
      - backrest-testhash/config:/config
      - backrest-testhash/cache:/cache
      - /:/userdata:ro

volumes:
  backrest-testhash:
  backrest-cache-testhash:
`) as ComposeSpecification;

test("Should handle volume paths with subdirectories correctly", () => {
	const composeData = load(composeFileBackrest) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedDockerComposeBackrest);
});
