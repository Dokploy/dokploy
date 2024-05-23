import { generateRandomHash } from "@/server/utils/docker/compose";
import {
	addPrefixToAllServiceNames,
	addPrefixToContainerNames,
	addPrefixToDependsOn,
	addPrefixToExtends,
	addPrefixToLinks,
	addPrefixToServiceNamesRoot,
	addPrefixToVolumesFrom,
} from "@/server/utils/docker/compose/service";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { dump, load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
services:
  mail:
    image: bytemark/smtp
    restart: always

  plausible_db:
    image: postgres:14-alpine
    restart: always
    networks:
      - backend
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
    networks:
      - backend
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

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add prefix to service names in the root of services in Docker Compose file", () => {
	const composeData = load(composeFile) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	if (!composeData?.services) {
		return;
	}

	const finalComposeData = addPrefixToServiceNamesRoot(
		composeData.services,
		prefix,
	);
	expect(finalComposeData).toBeDefined();
	for (const serviceKey of Object.keys(finalComposeData)) {
		expect(serviceKey).toContain(`-${prefix}`);
	}
});

const composeFileContainerNames = `
services:
  app:
    container_name: app-container
    image: some-image
    restart: always

  db:
    container_name: db-container
    image: another-image
    restart: always
`;

const expectedComposeFileContainerNames = load(`
services:
  app:
    container_name: app-container-testprefix
    image: some-image
    restart: always

  db:
    container_name: db-container-testprefix
    image: another-image
    restart: always
`) as ComposeSpecification;

test("Add prefix to container names", () => {
	const composeData = load(composeFileContainerNames) as ComposeSpecification;

	const prefix = "testprefix";

	if (!composeData?.services) {
		return;
	}
	const updatedComposeData = addPrefixToContainerNames(
		composeData.services,
		prefix,
	);

	expect(updatedComposeData).toBeDefined();
	for (const serviceKey of Object.keys(updatedComposeData)) {
		const service = updatedComposeData[serviceKey];
		if (service.container_name) {
			expect(service.container_name).toContain(`-${prefix}`);
		}
	}

	expect(updatedComposeData).toEqual(
		expectedComposeFileContainerNames.services,
	);
});

const composeFileDependsOn = `
version: "3.8"
services:
  app:
    image: myapp:latest
    depends_on:
      - db
  db:
    image: postgres:13
`;

const expectedComposeFileDependsOn = load(`
version: "3.8"
services:
  app:
    image: myapp:latest
    depends_on:
      - db-testhash
  db:
    image: postgres:13
`) as ComposeSpecification;

test("Add prefix to depends_on in Docker Compose file", () => {
	const composeData = load(composeFileDependsOn) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	if (!composeData?.services) {
		return;
	}
	const finalComposeData = addPrefixToDependsOn(composeData.services, prefix);

	expect(finalComposeData).toBeDefined();
	for (const serviceKey of Object.keys(finalComposeData)) {
		const service = finalComposeData[serviceKey];
		if (service.depends_on) {
			for (const dep of service.depends_on) {
				expect(dep).toContain(`-${prefix}`);
			}
		}
	}
	expect(finalComposeData).toEqual(expectedComposeFileDependsOn.services);
});

const composeFileVolumesFrom = `
version: "3.8"
services:
  app:
    image: myapp:latest
    volumes_from:
      - data
  data:
    image: busybox
    volumes:
      - /data
`;

const expectedComposeFileVolumesFrom = load(`
version: "3.8"
services:
  app:
    image: myapp:latest
    volumes_from:
      - data-testhash
  data:
    image: busybox
    volumes:
      - /data
`) as ComposeSpecification;

test("Add prefix to volumes_from in Docker Compose file", () => {
	const composeData = load(composeFileVolumesFrom) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	if (!composeData?.services) {
		return;
	}

	const finalComposeData = addPrefixToVolumesFrom(composeData.services, prefix);

	expect(finalComposeData).toBeDefined();
	for (const serviceKey of Object.keys(finalComposeData)) {
		const service = finalComposeData[serviceKey];
		if (service.volumes_from) {
			for (const vol of service.volumes_from) {
				expect(vol).toContain(`-${prefix}`);
			}
		}
	}
	expect(finalComposeData).toEqual(expectedComposeFileVolumesFrom.services);
});

const composeFileLinks = `
version: "3.8"
services:
  app:
    image: myapp:latest
    links:
      - db
  db:
    image: postgres:13
`;

const expectedComposeFileLinks = load(`
version: "3.8"
services:
  app:
    image: myapp:latest
    links:
      - db-testhash
  db:
    image: postgres:13
`) as ComposeSpecification;

test("Add prefix to links in Docker Compose file", () => {
	const composeData = load(composeFileLinks) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	if (!composeData?.services) {
		return;
	}

	const finalComposeData = addPrefixToLinks(composeData.services, prefix);

	expect(finalComposeData).toBeDefined();
	for (const serviceKey of Object.keys(finalComposeData)) {
		const service = finalComposeData[serviceKey];
		if (service.links) {
			for (const link of service.links) {
				expect(link).toContain(`-${prefix}`);
			}
		}
	}
	expect(finalComposeData).toEqual(expectedComposeFileLinks.services);
});

const composeFileExtends = `
version: "3.8"
services:
  web:
    extends:
      file: common.yml
      service: base
  base:
    image: myapp:base
`;

const expectedComposeFileExtends = load(`
version: "3.8"
services:
  web:
    extends:
      file: common.yml
      service: base-testhash
  base:
    image: myapp:base
`) as ComposeSpecification;

test("Add prefix to extends in Docker Compose file", () => {
	const composeData = load(composeFileExtends) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	if (!composeData?.services) {
		return;
	}

	const finalComposeData = addPrefixToExtends(composeData.services, prefix);

	expect(finalComposeData).toBeDefined();
	for (const serviceKey of Object.keys(finalComposeData)) {
		const service = finalComposeData[serviceKey];
		if (service.extends?.service) {
			expect(service.extends.service).toContain(`-${prefix}`);
		}
	}
	expect(finalComposeData).toEqual(expectedComposeFileExtends.services);
});

const complexComposeFile = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend
    volumes_from:
      - data
    links:
      - app
    depends_on:
      - app
    extends:
      file: common.yml
      service: base-web

  app:
    image: node:14
    networks:
      - backend
      - frontend
    volumes:
      - app-data:/usr/src/app
    secrets:
      - db_password
    configs:
      - app_config
    depends_on:
      - db

  db:
    image: postgres:13
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data
    secrets:
      - db_password

  cache:
    image: redis:alpine
    networks:
      - backend
    depends_on:
      - db

  admin:
    image: adminer
    networks:
      - backend
      - frontend
    links:
      - db

networks:
  frontend:
  backend:

volumes:
  app-data:
  db-data:

configs:
  app_config:
    file: ./app.conf

secrets:
  db_password:
    file: ./secrets/db_password.txt
`;

const expectedComplexComposeFile = load(`
version: "3.8"
services:
  web-testhash:
    image: nginx:latest
    networks:
      - frontend
    volumes_from:
      - data-testhash
    links:
      - app-testhash
    depends_on:
      - app-testhash
    extends:
      file: common.yml
      service: base-web-testhash

  app-testhash:
    image: node:14
    networks:
      - backend
      - frontend
    volumes:
      - app-data:/usr/src/app
    secrets:
      - db_password
    configs:
      - app_config
    depends_on:
      - db-testhash

  db-testhash:
    image: postgres:13
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data
    secrets:
      - db_password

  cache-testhash:
    image: redis:alpine
    networks:
      - backend
    depends_on:
      - db-testhash

  admin-testhash:
    image: adminer
    networks:
      - backend
      - frontend
    links:
      - db-testhash

networks:
  frontend:
  backend:

volumes:
  app-data:
  db-data:

configs:
  app_config:
    file: ./app.conf

secrets:
  db_password:
    file: ./secrets/db_password.txt
`) as ComposeSpecification;

test("Add prefix to all service names and references in a complex Docker Compose file", () => {
	const composeData = load(complexComposeFile) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllServiceNames(composeData, prefix);

	expect(finalComposeData.services).toEqual(
		expectedComplexComposeFile.services,
	);
});

const complexComposeFile2 = `
# WARNING!
# This is a development version of THE Appwrite docker-compose.yml file.
# Avoid using this file in your production environment.
# We're exposing here sensitive ports and mounting code volumes for rapid development and debugging of the server stack.

x-logging: &x-logging
  logging:
    driver: "json-file"
    options:
      max-file: "5"
      max-size: "10m"

version: "3"

services:
  traefik:
    image: traefik:2.11
    <<: *x-logging
    container_name: appwrite-traefik
    command:
      - --log.level=DEBUG
      - --api.insecure=true
      - --providers.file.directory=/storage/config
      - --providers.file.watch=true
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --providers.docker.constraints=Label(\`traefik.constraint-label-stack\`,\`appwrite\`)
      - --entrypoints.appwrite_web.address=:80
      - --entrypoints.appwrite_websecure.address=:443
      - --accesslog=true
    ports:
      - 80:80
      - 8080:80
      - 443:443
      - 9500:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - appwrite-config:/storage/config:ro
      - appwrite-certificates:/storage/certificates:ro
    depends_on:
      - appwrite
    networks:
      - gateway
      - appwrite

  appwrite:
    container_name: appwrite
    <<: *x-logging
    image: appwrite-dev
    build:
      context: .
      args:
        DEBUG: false
        TESTING: true
        VERSION: dev
    ports:
      - 9501:80
    networks:
      - appwrite
    labels:
      - "traefik.enable=true"
      - "traefik.constraint-label-stack=appwrite"
      - "traefik.docker.network=appwrite"
      - "traefik.http.services.appwrite_api.loadbalancer.server.port=80"
      #http
      - traefik.http.routers.appwrite_api_http.entrypoints=appwrite_web
      - traefik.http.routers.appwrite_api_http.rule=PathPrefix(\`/\`)
      - traefik.http.routers.appwrite_api_http.service=appwrite_api
      # https
      - traefik.http.routers.appwrite_api_https.entrypoints=appwrite_websecure
      - traefik.http.routers.appwrite_api_https.rule=PathPrefix(\`/\`)
      - traefik.http.routers.appwrite_api_https.service=appwrite_api
      - traefik.http.routers.appwrite_api_https.tls=true
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - appwrite-cache:/storage/cache:rw
      - appwrite-config:/storage/config:rw
      - appwrite-certificates:/storage/certificates:rw
      - appwrite-functions:/storage/functions:rw
      - ./phpunit.xml:/usr/src/code/phpunit.xml
      - ./tests:/usr/src/code/tests
      - ./app:/usr/src/code/app
      - ./docs:/usr/src/code/docs
      - ./public:/usr/src/code/public
      - ./src:/usr/src/code/src
      - ./dev:/usr/src/code/dev
    depends_on:
      - mariadb
      - redis
    entrypoint:
      - php
      - -e
      - app/http.php
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_LOCALE
      - _APP_CONSOLE_WHITELIST_ROOT
      - _APP_CONSOLE_WHITELIST_EMAILS
      - _APP_CONSOLE_WHITELIST_IPS
      - _APP_CONSOLE_HOSTNAMES
      - _APP_SYSTEM_EMAIL_NAME
      - _APP_SYSTEM_EMAIL_ADDRESS
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_SYSTEM_RESPONSE_FORMAT
      - _APP_OPTIONS_ABUSE
      - _APP_OPTIONS_ROUTER_PROTECTION
      - _APP_OPTIONS_FORCE_HTTPS
      - _APP_OPTIONS_FUNCTIONS_FORCE_HTTPS
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_SMTP_HOST
      - _APP_SMTP_PORT
      - _APP_SMTP_SECURE
      - _APP_SMTP_USERNAME
      - _APP_SMTP_PASSWORD
      - _APP_USAGE_STATS
      - _APP_STORAGE_LIMIT
      - _APP_STORAGE_PREVIEW_LIMIT
      - _APP_STORAGE_ANTIVIRUS
      - _APP_STORAGE_ANTIVIRUS_HOST
      - _APP_STORAGE_ANTIVIRUS_PORT
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET
      - _APP_FUNCTIONS_SIZE_LIMIT
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_FUNCTIONS_RUNTIMES
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_MAINTENANCE_INTERVAL
      - _APP_MAINTENANCE_RETENTION_EXECUTION
      - _APP_MAINTENANCE_RETENTION_CACHE
      - _APP_MAINTENANCE_RETENTION_ABUSE
      - _APP_MAINTENANCE_RETENTION_AUDIT
      - _APP_MAINTENANCE_RETENTION_USAGE_HOURLY
      - _APP_MAINTENANCE_RETENTION_SCHEDULES
      - _APP_SMS_PROVIDER
      - _APP_SMS_FROM
      - _APP_GRAPHQL_MAX_BATCH_SIZE
      - _APP_GRAPHQL_MAX_COMPLEXITY
      - _APP_GRAPHQL_MAX_DEPTH
      - _APP_VCS_GITHUB_APP_NAME
      - _APP_VCS_GITHUB_PRIVATE_KEY
      - _APP_VCS_GITHUB_APP_ID
      - _APP_VCS_GITHUB_WEBHOOK_SECRET
      - _APP_VCS_GITHUB_CLIENT_SECRET
      - _APP_VCS_GITHUB_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_SECRET
      - _APP_ASSISTANT_OPENAI_API_KEY
      - _APP_MESSAGE_SMS_TEST_DSN
      - _APP_MESSAGE_EMAIL_TEST_DSN
      - _APP_MESSAGE_PUSH_TEST_DSN
      - _APP_CONSOLE_COUNTRIES_DENYLIST

  appwrite-realtime:
    entrypoint: realtime
    <<: *x-logging
    container_name: appwrite-realtime
    image: appwrite-dev
    restart: unless-stopped
    ports:
      - 9505:80
    labels:
      - "traefik.enable=true"
      - "traefik.constraint-label-stack=appwrite"
      - "traefik.docker.network=appwrite"
      - "traefik.http.services.appwrite_realtime.loadbalancer.server.port=80"
      #ws
      - traefik.http.routers.appwrite_realtime_ws.entrypoints=appwrite_web
      - traefik.http.routers.appwrite_realtime_ws.rule=PathPrefix(\`/v1/realtime\`)
      - traefik.http.routers.appwrite_realtime_ws.service=appwrite_realtime
      # wss
      - traefik.http.routers.appwrite_realtime_wss.entrypoints=appwrite_websecure
      - traefik.http.routers.appwrite_realtime_wss.rule=PathPrefix(\`/v1/realtime\`)
      - traefik.http.routers.appwrite_realtime_wss.service=appwrite_realtime
      - traefik.http.routers.appwrite_realtime_wss.tls=true
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb
      - redis
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPTIONS_ABUSE
      - _APP_OPTIONS_ROUTER_PROTECTION
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-audits:
    entrypoint: worker-audits
    <<: *x-logging
    container_name: appwrite-worker-audits
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-webhooks:
    entrypoint: worker-webhooks
    <<: *x-logging
    container_name: appwrite-worker-webhooks
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
      - request-catcher
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_WEBHOOK_MAX_FAILED_ATTEMPTS

  appwrite-worker-deletes:
    entrypoint: worker-deletes
    <<: *x-logging
    container_name: appwrite-worker-deletes
    image: appwrite-dev
    networks:
      - appwrite
    depends_on:
      - redis
      - mariadb
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - appwrite-cache:/storage/cache:rw
      - appwrite-functions:/storage/functions:rw
      - appwrite-builds:/storage/builds:rw
      - appwrite-certificates:/storage/certificates:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST

  appwrite-worker-databases:
    entrypoint: worker-databases
    <<: *x-logging
    container_name: appwrite-worker-databases
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_WORKERS_NUM
      - _APP_QUEUE_NAME

  appwrite-worker-builds:
    entrypoint: worker-builds
    <<: *x-logging
    container_name: appwrite-worker-builds
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - appwrite-functions:/storage/functions:rw
      - appwrite-builds:/storage/builds:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_VCS_GITHUB_APP_NAME
      - _APP_VCS_GITHUB_PRIVATE_KEY
      - _APP_VCS_GITHUB_APP_ID
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_FUNCTIONS_SIZE_LIMIT
      - _APP_OPTIONS_FORCE_HTTPS
      - _APP_OPTIONS_FUNCTIONS_FORCE_HTTPS
      - _APP_DOMAIN
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET

  appwrite-worker-certificates:
    entrypoint: worker-certificates
    <<: *x-logging
    container_name: appwrite-worker-certificates
    image: appwrite-dev
    networks:
      - appwrite
    depends_on:
      - redis
      - mariadb
    volumes:
      - appwrite-config:/storage/config:rw
      - appwrite-certificates:/storage/certificates:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-functions:
    entrypoint: worker-functions
    <<: *x-logging
    container_name: appwrite-worker-functions
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
      - openruntimes-executor
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_USAGE_STATS
      - _APP_DOCKER_HUB_USERNAME
      - _APP_DOCKER_HUB_PASSWORD
      - _APP_LOGGING_CONFIG
      - _APP_LOGGING_PROVIDER

  appwrite-worker-mails:
    entrypoint: worker-mails
    <<: *x-logging
    container_name: appwrite-worker-mails
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - maildev
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_SYSTEM_EMAIL_NAME
      - _APP_SYSTEM_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_SMTP_HOST
      - _APP_SMTP_PORT
      - _APP_SMTP_SECURE
      - _APP_SMTP_USERNAME
      - _APP_SMTP_PASSWORD
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_DOMAIN
      - _APP_OPTIONS_FORCE_HTTPS

  appwrite-worker-messaging:
    entrypoint: worker-messaging
    <<: *x-logging
    container_name: appwrite-worker-messaging
    restart: unless-stopped
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_SMS_FROM
      - _APP_SMS_PROVIDER
      - _APP_SMS_PROJECTS_DENY_LIST
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET

  appwrite-worker-migrations:
    entrypoint: worker-migrations
    <<: *x-logging
    container_name: appwrite-worker-migrations
    restart: unless-stopped
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
      - ./tests:/usr/src/code/tests
    depends_on:
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_MIGRATIONS_FIREBASE_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_SECRET

  appwrite-task-maintenance:
    entrypoint: maintenance
    <<: *x-logging
    container_name: appwrite-task-maintenance
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_MAINTENANCE_INTERVAL
      - _APP_MAINTENANCE_RETENTION_EXECUTION
      - _APP_MAINTENANCE_RETENTION_CACHE
      - _APP_MAINTENANCE_RETENTION_ABUSE
      - _APP_MAINTENANCE_RETENTION_AUDIT
      - _APP_MAINTENANCE_RETENTION_USAGE_HOURLY
      - _APP_MAINTENANCE_RETENTION_SCHEDULES
      - _APP_MAINTENANCE_DELAY

  appwrite-worker-usage:
    entrypoint: worker-usage
    <<: *x-logging
    container_name: appwrite-worker-usage
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_USAGE_AGGREGATION_INTERVAL

  appwrite-worker-usage-dump:
    entrypoint: worker-usage-dump
    <<: *x-logging
    container_name: appwrite-worker-usage-dump
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis
      - mariadb
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_USAGE_AGGREGATION_INTERVAL

  appwrite-task-scheduler-functions:
    entrypoint: schedule-functions
    <<: *x-logging
    container_name: appwrite-task-scheduler-functions
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb
      - redis
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS

  appwrite-task-scheduler-messages:
    entrypoint: schedule-messages
    <<: *x-logging
    container_name: appwrite-task-scheduler-messages
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb
      - redis
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS

  appwrite-assistant:
    container_name: appwrite-assistant
    image: appwrite/assistant:0.4.0
    networks:
      - appwrite
    environment:
      - _APP_ASSISTANT_OPENAI_API_KEY

  openruntimes-executor:
    container_name: openruntimes-executor
    hostname: appwrite-executor
    <<: *x-logging
    stop_signal: SIGINT
    image: openruntimes/executor:0.5.5
    restart: unless-stopped
    networks:
      - appwrite
      - runtimes
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - appwrite-builds:/storage/builds:rw
      - appwrite-functions:/storage/functions:rw
      # Host mount nessessary to share files between executor and runtimes.
      # It's not possible to share mount file between 2 containers without host mount (copying is too slow)
      - /tmp:/tmp:rw
    environment:
      - OPR_EXECUTOR_INACTIVE_TRESHOLD=$_APP_FUNCTIONS_INACTIVE_THRESHOLD
      - OPR_EXECUTOR_MAINTENANCE_INTERVAL=$_APP_FUNCTIONS_MAINTENANCE_INTERVAL
      - OPR_EXECUTOR_NETWORK=$_APP_FUNCTIONS_RUNTIMES_NETWORK
      - OPR_EXECUTOR_DOCKER_HUB_USERNAME=$_APP_DOCKER_HUB_USERNAME
      - OPR_EXECUTOR_DOCKER_HUB_PASSWORD=$_APP_DOCKER_HUB_PASSWORD
      - OPR_EXECUTOR_ENV=$_APP_ENV
      - OPR_EXECUTOR_RUNTIMES=$_APP_FUNCTIONS_RUNTIMES
      - OPR_EXECUTOR_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_EXECUTOR_RUNTIME_VERSIONS=v2,v3
      - OPR_EXECUTOR_LOGGING_PROVIDER=$_APP_LOGGING_PROVIDER
      - OPR_EXECUTOR_LOGGING_CONFIG=$_APP_LOGGING_CONFIG
      - OPR_EXECUTOR_STORAGE_DEVICE=$_APP_STORAGE_DEVICE
      - OPR_EXECUTOR_STORAGE_S3_ACCESS_KEY=$_APP_STORAGE_S3_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_S3_SECRET=$_APP_STORAGE_S3_SECRET
      - OPR_EXECUTOR_STORAGE_S3_REGION=$_APP_STORAGE_S3_REGION
      - OPR_EXECUTOR_STORAGE_S3_BUCKET=$_APP_STORAGE_S3_BUCKET
      - OPR_EXECUTOR_STORAGE_DO_SPACES_ACCESS_KEY=$_APP_STORAGE_DO_SPACES_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_DO_SPACES_SECRET=$_APP_STORAGE_DO_SPACES_SECRET
      - OPR_EXECUTOR_STORAGE_DO_SPACES_REGION=$_APP_STORAGE_DO_SPACES_REGION
      - OPR_EXECUTOR_STORAGE_DO_SPACES_BUCKET=$_APP_STORAGE_DO_SPACES_BUCKET
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_ACCESS_KEY=$_APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_SECRET=$_APP_STORAGE_BACKBLAZE_SECRET
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_REGION=$_APP_STORAGE_BACKBLAZE_REGION
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_BUCKET=$_APP_STORAGE_BACKBLAZE_BUCKET
      - OPR_EXECUTOR_STORAGE_LINODE_ACCESS_KEY=$_APP_STORAGE_LINODE_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_LINODE_SECRET=$_APP_STORAGE_LINODE_SECRET
      - OPR_EXECUTOR_STORAGE_LINODE_REGION=$_APP_STORAGE_LINODE_REGION
      - OPR_EXECUTOR_STORAGE_LINODE_BUCKET=$_APP_STORAGE_LINODE_BUCKET
      - OPR_EXECUTOR_STORAGE_WASABI_ACCESS_KEY=$_APP_STORAGE_WASABI_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_WASABI_SECRET=$_APP_STORAGE_WASABI_SECRET
      - OPR_EXECUTOR_STORAGE_WASABI_REGION=$_APP_STORAGE_WASABI_REGION
      - OPR_EXECUTOR_STORAGE_WASABI_BUCKET=$_APP_STORAGE_WASABI_BUCKET

  openruntimes-proxy:
    container_name: openruntimes-proxy
    hostname: proxy
    <<: *x-logging
    stop_signal: SIGINT
    image: openruntimes/proxy:0.3.1
    networks:
      - appwrite
      - runtimes
    environment:
      - OPR_PROXY_WORKER_PER_CORE=$_APP_WORKER_PER_CORE
      - OPR_PROXY_ENV=$_APP_ENV
      - OPR_PROXY_EXECUTOR_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_PROXY_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_PROXY_LOGGING_PROVIDER=$_APP_LOGGING_PROVIDER
      - OPR_PROXY_LOGGING_CONFIG=$_APP_LOGGING_CONFIG
      - OPR_PROXY_ALGORITHM=random
      - OPR_PROXY_EXECUTORS=appwrite-executor
      - OPR_PROXY_HEALTHCHECK_INTERVAL=10000
      - OPR_PROXY_MAX_TIMEOUT=600
      - OPR_PROXY_HEALTHCHECK=enabled

  mariadb:
    image: mariadb:10.11 # fix issues when upgrading using: mysql_upgrade -u root -p
    container_name: appwrite-mariadb
    <<: *x-logging
    networks:
      - appwrite
    volumes:
      - appwrite-mariadb:/var/lib/mysql:rw
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD={_APP_DB_ROOT_PASS}
      - MYSQL_DATABASE={_APP_DB_SCHEMA}
      - MYSQL_USER={_APP_DB_USER}
      - MYSQL_PASSWORD={_APP_DB_PASS}
      - MARIADB_AUTO_UPGRADE=1
    command: "mysqld --innodb-flush-method=fsync" # add ' --query_cache_size=0' for DB tests
    # command: mv /var/lib/mysql/ib_logfile0 /var/lib/mysql/ib_logfile0.bu && mv /var/lib/mysql/ib_logfile1 /var/lib/mysql/ib_logfile1.bu

  redis:
    image: redis:7.2.4-alpine
    <<: *x-logging
    container_name: appwrite-redis
    command: >
      redis-server
      --maxmemory            512mb
      --maxmemory-policy     allkeys-lru
      --maxmemory-samples    5
    ports:
      - "6379:6379"
    networks:
      - appwrite
    volumes:
      - appwrite-redis:/data:rw

  maildev:
    image: appwrite/mailcatcher:1.0.0
    container_name: appwrite-mailcatcher
    <<: *x-logging
    ports:
      - "9503:1080"
    networks:
      - appwrite

  request-catcher:
    image: appwrite/requestcatcher:1.0.0
    container_name: appwrite-requestcatcher
    <<: *x-logging
    ports:
      - "9504:5000"
    networks:
      - appwrite

  adminer:
    image: adminer
    container_name: appwrite-adminer
    <<: *x-logging
    restart: always
    ports:
      - 9506:8080
    networks:
      - appwrite

  redis-insight:
    image: redis/redisinsight:latest
    restart: unless-stopped
    networks:
      - appwrite
    environment:
      - REDIS_HOSTS=redis
    ports:
      - "8081:5540"

  graphql-explorer:
    container_name: appwrite-graphql-explorer
    image: appwrite/altair:0.3.0
    restart: unless-stopped
    networks:
      - appwrite
    ports:
      - "9509:3000"
    environment:
      - SERVER_URL=http://localhost/v1/graphql

networks:
  gateway:
    name: gateway
  appwrite:
    name: appwrite
  runtimes:
    name: runtimes

volumes:
  appwrite-mariadb:
  appwrite-redis:
  appwrite-cache:
  appwrite-uploads:
  appwrite-certificates:
  appwrite-functions:
  appwrite-builds:
  appwrite-config:
`;

const expectedComposeFile = load(`
# WARNING!
# This is a development version of THE Appwrite docker-compose.yml file.
# Avoid using this file in your production environment.
# We're exposing here sensitive ports and mounting code volumes for rapid development and debugging of the server stack.

x-logging: &x-logging
  logging:
    driver: "json-file"
    options:
      max-file: "5"
      max-size: "10m"

version: "3"

services:
  traefik-testhash:
    image: traefik:2.11
    <<: *x-logging
    container_name: appwrite-traefik-testhash
    command:
      - --log.level=DEBUG
      - --api.insecure=true
      - --providers.file.directory=/storage/config
      - --providers.file.watch=true
      - --providers.docker=true
      - --providers.docker.exposedByDefault=false
      - --providers.docker.constraints=Label(\`traefik.constraint-label-stack\`,\`appwrite\`)
      - --entrypoints.appwrite_web.address=:80
      - --entrypoints.appwrite_websecure.address=:443
      - --accesslog=true
    ports:
      - 80:80
      - 8080:80
      - 443:443
      - 9500:8080
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - appwrite-config:/storage/config:ro
      - appwrite-certificates:/storage/certificates:ro
    depends_on:
      - appwrite-testhash
    networks:
      - gateway
      - appwrite

  appwrite-testhash:
    container_name: appwrite-testhash
    <<: *x-logging
    image: appwrite-dev
    build:
      context: .
      args:
        DEBUG: false
        TESTING: true
        VERSION: dev
    ports:
      - 9501:80
    networks:
      - appwrite
    labels:
      - "traefik.enable=true"
      - "traefik.constraint-label-stack=appwrite"
      - "traefik.docker.network=appwrite"
      - "traefik.http.services.appwrite_api.loadbalancer.server.port=80"
      #http
      - traefik.http.routers.appwrite_api_http.entrypoints=appwrite_web
      - traefik.http.routers.appwrite_api_http.rule=PathPrefix(\`/\`)
      - traefik.http.routers.appwrite_api_http.service=appwrite_api
      # https
      - traefik.http.routers.appwrite_api_https.entrypoints=appwrite_websecure
      - traefik.http.routers.appwrite_api_https.rule=PathPrefix(\`/\`)
      - traefik.http.routers.appwrite_api_https.service=appwrite_api
      - traefik.http.routers.appwrite_api_https.tls=true
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - appwrite-cache:/storage/cache:rw
      - appwrite-config:/storage/config:rw
      - appwrite-certificates:/storage/certificates:rw
      - appwrite-functions:/storage/functions:rw
      - ./phpunit.xml:/usr/src/code/phpunit.xml
      - ./tests:/usr/src/code/tests
      - ./app:/usr/src/code/app
      - ./docs:/usr/src/code/docs
      - ./public:/usr/src/code/public
      - ./src:/usr/src/code/src
      - ./dev:/usr/src/code/dev
    depends_on:
      - mariadb-testhash
      - redis-testhash
    entrypoint:
      - php
      - -e
      - app/http.php
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_LOCALE
      - _APP_CONSOLE_WHITELIST_ROOT
      - _APP_CONSOLE_WHITELIST_EMAILS
      - _APP_CONSOLE_WHITELIST_IPS
      - _APP_CONSOLE_HOSTNAMES
      - _APP_SYSTEM_EMAIL_NAME
      - _APP_SYSTEM_EMAIL_ADDRESS
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_SYSTEM_RESPONSE_FORMAT
      - _APP_OPTIONS_ABUSE
      - _APP_OPTIONS_ROUTER_PROTECTION
      - _APP_OPTIONS_FORCE_HTTPS
      - _APP_OPTIONS_FUNCTIONS_FORCE_HTTPS
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_SMTP_HOST
      - _APP_SMTP_PORT
      - _APP_SMTP_SECURE
      - _APP_SMTP_USERNAME
      - _APP_SMTP_PASSWORD
      - _APP_USAGE_STATS
      - _APP_STORAGE_LIMIT
      - _APP_STORAGE_PREVIEW_LIMIT
      - _APP_STORAGE_ANTIVIRUS
      - _APP_STORAGE_ANTIVIRUS_HOST
      - _APP_STORAGE_ANTIVIRUS_PORT
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET
      - _APP_FUNCTIONS_SIZE_LIMIT
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_FUNCTIONS_RUNTIMES
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_MAINTENANCE_INTERVAL
      - _APP_MAINTENANCE_RETENTION_EXECUTION
      - _APP_MAINTENANCE_RETENTION_CACHE
      - _APP_MAINTENANCE_RETENTION_ABUSE
      - _APP_MAINTENANCE_RETENTION_AUDIT
      - _APP_MAINTENANCE_RETENTION_USAGE_HOURLY
      - _APP_MAINTENANCE_RETENTION_SCHEDULES
      - _APP_SMS_PROVIDER
      - _APP_SMS_FROM
      - _APP_GRAPHQL_MAX_BATCH_SIZE
      - _APP_GRAPHQL_MAX_COMPLEXITY
      - _APP_GRAPHQL_MAX_DEPTH
      - _APP_VCS_GITHUB_APP_NAME
      - _APP_VCS_GITHUB_PRIVATE_KEY
      - _APP_VCS_GITHUB_APP_ID
      - _APP_VCS_GITHUB_WEBHOOK_SECRET
      - _APP_VCS_GITHUB_CLIENT_SECRET
      - _APP_VCS_GITHUB_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_SECRET
      - _APP_ASSISTANT_OPENAI_API_KEY
      - _APP_MESSAGE_SMS_TEST_DSN
      - _APP_MESSAGE_EMAIL_TEST_DSN
      - _APP_MESSAGE_PUSH_TEST_DSN
      - _APP_CONSOLE_COUNTRIES_DENYLIST

  appwrite-realtime-testhash:
    entrypoint: realtime
    <<: *x-logging
    container_name: appwrite-realtime-testhash
    image: appwrite-dev
    restart: unless-stopped
    ports:
      - 9505:80
    labels:
      - "traefik.enable=true"
      - "traefik.constraint-label-stack=appwrite"
      - "traefik.docker.network=appwrite"
      - "traefik.http.services.appwrite_realtime.loadbalancer.server.port=80"
      #ws
      - traefik.http.routers.appwrite_realtime_ws.entrypoints=appwrite_web
      - traefik.http.routers.appwrite_realtime_ws.rule=PathPrefix(\`/v1/realtime\`)
      - traefik.http.routers.appwrite_realtime_ws.service=appwrite_realtime
      # wss
      - traefik.http.routers.appwrite_realtime_wss.entrypoints=appwrite_websecure
      - traefik.http.routers.appwrite_realtime_wss.rule=PathPrefix(\`/v1/realtime\`)
      - traefik.http.routers.appwrite_realtime_wss.service=appwrite_realtime
      - traefik.http.routers.appwrite_realtime_wss.tls=true
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb-testhash
      - redis-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPTIONS_ABUSE
      - _APP_OPTIONS_ROUTER_PROTECTION
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-audits-testhash:
    entrypoint: worker-audits
    <<: *x-logging
    container_name: appwrite-worker-audits-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-webhooks-testhash:
    entrypoint: worker-webhooks
    <<: *x-logging
    container_name: appwrite-worker-webhooks-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
      - request-catcher-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_WEBHOOK_MAX_FAILED_ATTEMPTS

  appwrite-worker-deletes-testhash:
    entrypoint: worker-deletes
    <<: *x-logging
    container_name: appwrite-worker-deletes-testhash
    image: appwrite-dev
    networks:
      - appwrite
    depends_on:
      - redis-testhash
      - mariadb-testhash
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - appwrite-cache:/storage/cache:rw
      - appwrite-functions:/storage/functions:rw
      - appwrite-builds:/storage/builds:rw
      - appwrite-certificates:/storage/certificates:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST

  appwrite-worker-databases-testhash:
    entrypoint: worker-databases
    <<: *x-logging
    container_name: appwrite-worker-databases-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_WORKERS_NUM
      - _APP_QUEUE_NAME

  appwrite-worker-builds-testhash:
    entrypoint: worker-builds
    <<: *x-logging
    container_name: appwrite-worker-builds-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - appwrite-functions:/storage/functions:rw
      - appwrite-builds:/storage/builds:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_VCS_GITHUB_APP_NAME
      - _APP_VCS_GITHUB_PRIVATE_KEY
      - _APP_VCS_GITHUB_APP_ID
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_FUNCTIONS_SIZE_LIMIT
      - _APP_OPTIONS_FORCE_HTTPS
      - _APP_OPTIONS_FUNCTIONS_FORCE_HTTPS
      - _APP_DOMAIN
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET

  appwrite-worker-certificates-testhash:
    entrypoint: worker-certificates
    <<: *x-logging
    container_name: appwrite-worker-certificates-testhash
    image: appwrite-dev
    networks:
      - appwrite
    depends_on:
      - redis-testhash
      - mariadb-testhash
    volumes:
      - appwrite-config:/storage/config:rw
      - appwrite-certificates:/storage/certificates:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG

  appwrite-worker-functions-testhash:
    entrypoint: worker-functions
    <<: *x-logging
    container_name: appwrite-worker-functions-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
      - openruntimes-executor-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_FUNCTIONS_TIMEOUT
      - _APP_FUNCTIONS_BUILD_TIMEOUT
      - _APP_FUNCTIONS_CPUS
      - _APP_FUNCTIONS_MEMORY
      - _APP_EXECUTOR_SECRET
      - _APP_EXECUTOR_HOST
      - _APP_USAGE_STATS
      - _APP_DOCKER_HUB_USERNAME
      - _APP_DOCKER_HUB_PASSWORD
      - _APP_LOGGING_CONFIG
      - _APP_LOGGING_PROVIDER

  appwrite-worker-mails-testhash:
    entrypoint: worker-mails
    <<: *x-logging
    container_name: appwrite-worker-mails-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - maildev-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_SYSTEM_EMAIL_NAME
      - _APP_SYSTEM_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_SMTP_HOST
      - _APP_SMTP_PORT
      - _APP_SMTP_SECURE
      - _APP_SMTP_USERNAME
      - _APP_SMTP_PASSWORD
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_DOMAIN
      - _APP_OPTIONS_FORCE_HTTPS

  appwrite-worker-messaging-testhash:
    entrypoint: worker-messaging
    <<: *x-logging
    container_name: appwrite-worker-messaging-testhash
    restart: unless-stopped
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - appwrite-uploads:/storage/uploads:rw
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_SMS_FROM
      - _APP_SMS_PROVIDER
      - _APP_SMS_PROJECTS_DENY_LIST
      - _APP_STORAGE_DEVICE
      - _APP_STORAGE_S3_ACCESS_KEY
      - _APP_STORAGE_S3_SECRET
      - _APP_STORAGE_S3_REGION
      - _APP_STORAGE_S3_BUCKET
      - _APP_STORAGE_DO_SPACES_ACCESS_KEY
      - _APP_STORAGE_DO_SPACES_SECRET
      - _APP_STORAGE_DO_SPACES_REGION
      - _APP_STORAGE_DO_SPACES_BUCKET
      - _APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - _APP_STORAGE_BACKBLAZE_SECRET
      - _APP_STORAGE_BACKBLAZE_REGION
      - _APP_STORAGE_BACKBLAZE_BUCKET
      - _APP_STORAGE_LINODE_ACCESS_KEY
      - _APP_STORAGE_LINODE_SECRET
      - _APP_STORAGE_LINODE_REGION
      - _APP_STORAGE_LINODE_BUCKET
      - _APP_STORAGE_WASABI_ACCESS_KEY
      - _APP_STORAGE_WASABI_SECRET
      - _APP_STORAGE_WASABI_REGION
      - _APP_STORAGE_WASABI_BUCKET

  appwrite-worker-migrations-testhash:
    entrypoint: worker-migrations
    <<: *x-logging
    container_name: appwrite-worker-migrations-testhash
    restart: unless-stopped
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
      - ./tests:/usr/src/code/tests
    depends_on:
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_SYSTEM_SECURITY_EMAIL_ADDRESS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_MIGRATIONS_FIREBASE_CLIENT_ID
      - _APP_MIGRATIONS_FIREBASE_CLIENT_SECRET

  appwrite-task-maintenance-testhash:
    entrypoint: maintenance
    <<: *x-logging
    container_name: appwrite-task-maintenance-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_DOMAIN
      - _APP_DOMAIN_TARGET
      - _APP_DOMAIN_FUNCTIONS
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_MAINTENANCE_INTERVAL
      - _APP_MAINTENANCE_RETENTION_EXECUTION
      - _APP_MAINTENANCE_RETENTION_CACHE
      - _APP_MAINTENANCE_RETENTION_ABUSE
      - _APP_MAINTENANCE_RETENTION_AUDIT
      - _APP_MAINTENANCE_RETENTION_USAGE_HOURLY
      - _APP_MAINTENANCE_RETENTION_SCHEDULES
      - _APP_MAINTENANCE_DELAY

  appwrite-worker-usage-testhash:
    entrypoint: worker-usage
    <<: *x-logging
    container_name: appwrite-worker-usage-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_USAGE_AGGREGATION_INTERVAL

  appwrite-worker-usage-dump-testhash:
    entrypoint: worker-usage-dump
    <<: *x-logging
    container_name: appwrite-worker-usage-dump-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - redis-testhash
      - mariadb-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_USAGE_STATS
      - _APP_LOGGING_PROVIDER
      - _APP_LOGGING_CONFIG
      - _APP_USAGE_AGGREGATION_INTERVAL

  appwrite-task-scheduler-functions-testhash:
    entrypoint: schedule-functions
    <<: *x-logging
    container_name: appwrite-task-scheduler-functions-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb-testhash
      - redis-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS

  appwrite-task-scheduler-messages-testhash:
    entrypoint: schedule-messages
    <<: *x-logging
    container_name: appwrite-task-scheduler-messages-testhash
    image: appwrite-dev
    networks:
      - appwrite
    volumes:
      - ./app:/usr/src/code/app
      - ./src:/usr/src/code/src
    depends_on:
      - mariadb-testhash
      - redis-testhash
    environment:
      - _APP_ENV
      - _APP_WORKER_PER_CORE
      - _APP_OPENSSL_KEY_V1
      - _APP_REDIS_HOST
      - _APP_REDIS_PORT
      - _APP_REDIS_USER
      - _APP_REDIS_PASS
      - _APP_DB_HOST
      - _APP_DB_PORT
      - _APP_DB_SCHEMA
      - _APP_DB_USER
      - _APP_DB_PASS

  appwrite-assistant-testhash:
    container_name: appwrite-assistant-testhash
    image: appwrite/assistant:0.4.0
    networks:
      - appwrite
    environment:
      - _APP_ASSISTANT_OPENAI_API_KEY

  openruntimes-executor-testhash:
    container_name: openruntimes-executor-testhash
    hostname: appwrite-executor
    <<: *x-logging
    stop_signal: SIGINT
    image: openruntimes/executor:0.5.5
    restart: unless-stopped
    networks:
      - appwrite
      - runtimes
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - appwrite-builds:/storage/builds:rw
      - appwrite-functions:/storage/functions:rw
      # Host mount nessessary to share files between executor and runtimes.
      # It's not possible to share mount file between 2 containers without host mount (copying is too slow)
      - /tmp:/tmp:rw
    environment:
      - OPR_EXECUTOR_INACTIVE_TRESHOLD=$_APP_FUNCTIONS_INACTIVE_THRESHOLD
      - OPR_EXECUTOR_MAINTENANCE_INTERVAL=$_APP_FUNCTIONS_MAINTENANCE_INTERVAL
      - OPR_EXECUTOR_NETWORK=$_APP_FUNCTIONS_RUNTIMES_NETWORK
      - OPR_EXECUTOR_DOCKER_HUB_USERNAME=$_APP_DOCKER_HUB_USERNAME
      - OPR_EXECUTOR_DOCKER_HUB_PASSWORD=$_APP_DOCKER_HUB_PASSWORD
      - OPR_EXECUTOR_ENV=$_APP_ENV
      - OPR_EXECUTOR_RUNTIMES=$_APP_FUNCTIONS_RUNTIMES
      - OPR_EXECUTOR_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_EXECUTOR_RUNTIME_VERSIONS=v2,v3
      - OPR_EXECUTOR_LOGGING_PROVIDER=$_APP_LOGGING_PROVIDER
      - OPR_EXECUTOR_LOGGING_CONFIG=$_APP_LOGGING_CONFIG
      - OPR_EXECUTOR_STORAGE_DEVICE=$_APP_STORAGE_DEVICE
      - OPR_EXECUTOR_STORAGE_S3_ACCESS_KEY=$_APP_STORAGE_S3_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_S3_SECRET=$_APP_STORAGE_S3_SECRET
      - OPR_EXECUTOR_STORAGE_S3_REGION=$_APP_STORAGE_S3_REGION
      - OPR_EXECUTOR_STORAGE_S3_BUCKET=$_APP_STORAGE_S3_BUCKET
      - OPR_EXECUTOR_STORAGE_DO_SPACES_ACCESS_KEY=$_APP_STORAGE_DO_SPACES_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_DO_SPACES_SECRET=$_APP_STORAGE_DO_SPACES_SECRET
      - OPR_EXECUTOR_STORAGE_DO_SPACES_REGION=$_APP_STORAGE_DO_SPACES_REGION
      - OPR_EXECUTOR_STORAGE_DO_SPACES_BUCKET=$_APP_STORAGE_DO_SPACES_BUCKET
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_ACCESS_KEY=$_APP_STORAGE_BACKBLAZE_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_SECRET=$_APP_STORAGE_BACKBLAZE_SECRET
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_REGION=$_APP_STORAGE_BACKBLAZE_REGION
      - OPR_EXECUTOR_STORAGE_BACKBLAZE_BUCKET=$_APP_STORAGE_BACKBLAZE_BUCKET
      - OPR_EXECUTOR_STORAGE_LINODE_ACCESS_KEY=$_APP_STORAGE_LINODE_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_LINODE_SECRET=$_APP_STORAGE_LINODE_SECRET
      - OPR_EXECUTOR_STORAGE_LINODE_REGION=$_APP_STORAGE_LINODE_REGION
      - OPR_EXECUTOR_STORAGE_LINODE_BUCKET=$_APP_STORAGE_LINODE_BUCKET
      - OPR_EXECUTOR_STORAGE_WASABI_ACCESS_KEY=$_APP_STORAGE_WASABI_ACCESS_KEY
      - OPR_EXECUTOR_STORAGE_WASABI_SECRET=$_APP_STORAGE_WASABI_SECRET
      - OPR_EXECUTOR_STORAGE_WASABI_REGION=$_APP_STORAGE_WASABI_REGION
      - OPR_EXECUTOR_STORAGE_WASABI_BUCKET=$_APP_STORAGE_WASABI_BUCKET

  openruntimes-proxy-testhash:
    container_name: openruntimes-proxy-testhash
    hostname: proxy
    <<: *x-logging
    stop_signal: SIGINT
    image: openruntimes/proxy:0.3.1
    networks:
      - appwrite
      - runtimes
    environment:
      - OPR_PROXY_WORKER_PER_CORE=$_APP_WORKER_PER_CORE
      - OPR_PROXY_ENV=$_APP_ENV
      - OPR_PROXY_EXECUTOR_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_PROXY_SECRET=$_APP_EXECUTOR_SECRET
      - OPR_PROXY_LOGGING_PROVIDER=$_APP_LOGGING_PROVIDER
      - OPR_PROXY_LOGGING_CONFIG=$_APP_LOGGING_CONFIG
      - OPR_PROXY_ALGORITHM=random
      - OPR_PROXY_EXECUTORS=appwrite-executor
      - OPR_PROXY_HEALTHCHECK_INTERVAL=10000
      - OPR_PROXY_MAX_TIMEOUT=600
      - OPR_PROXY_HEALTHCHECK=enabled

  mariadb-testhash:
    image: mariadb:10.11 # fix issues when upgrading using: mysql_upgrade -u root -p
    container_name: appwrite-mariadb-testhash
    <<: *x-logging
    networks:
      - appwrite
    volumes:
      - appwrite-mariadb:/var/lib/mysql:rw
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD={_APP_DB_ROOT_PASS}
      - MYSQL_DATABASE={_APP_DB_SCHEMA}
      - MYSQL_USER={_APP_DB_USER}
      - MYSQL_PASSWORD={_APP_DB_PASS}
      - MARIADB_AUTO_UPGRADE=1
    command: "mysqld --innodb-flush-method=fsync" # add ' --query_cache_size=0' for DB tests
    # command: mv /var/lib/mysql/ib_logfile0 /var/lib/mysql/ib_logfile0.bu && mv /var/lib/mysql/ib_logfile1 /var/lib/mysql/ib_logfile1.bu

  redis-testhash:
    image: redis:7.2.4-alpine
    <<: *x-logging
    container_name: appwrite-redis-testhash
    command: >
      redis-server
      --maxmemory            512mb
      --maxmemory-policy     allkeys-lru
      --maxmemory-samples    5
    ports:
      - "6379:6379"
    networks:
      - appwrite
    volumes:
      - appwrite-redis:/data:rw

  maildev-testhash:
    image: appwrite/mailcatcher:1.0.0
    container_name: appwrite-mailcatcher-testhash
    <<: *x-logging
    ports:
      - "9503:1080"
    networks:
      - appwrite

  request-catcher-testhash:
    image: appwrite/requestcatcher:1.0.0
    container_name: appwrite-requestcatcher-testhash
    <<: *x-logging
    ports:
      - "9504:5000"
    networks:
      - appwrite

  adminer-testhash:
    image: adminer
    container_name: appwrite-adminer-testhash
    <<: *x-logging
    restart: always
    ports:
      - 9506:8080
    networks:
      - appwrite

  redis-insight-testhash:
    image: redis/redisinsight:latest
    restart: unless-stopped
    networks:
      - appwrite
    environment:
      - REDIS_HOSTS=redis
    ports:
      - "8081:5540"

  graphql-explorer-testhash:
    container_name: appwrite-graphql-explorer-testhash
    image: appwrite/altair:0.3.0
    restart: unless-stopped
    networks:
      - appwrite
    ports:
      - "9509:3000"
    environment:
      - SERVER_URL=http://localhost/v1/graphql

networks:
  gateway:
    name: gateway
  appwrite:
    name: appwrite
  runtimes:
    name: runtimes

volumes:
  appwrite-mariadb:
  appwrite-redis:
  appwrite-cache:
  appwrite-uploads:
  appwrite-certificates:
  appwrite-functions:
  appwrite-builds:
  appwrite-config:
`);

test("Add prefix to all service names in Docker Compose", () => {
	const composeData = load(complexComposeFile2) as ComposeSpecification;

	const prefix = "testhash";

	const finalComposeData = addPrefixToAllServiceNames(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFile);

	// expect(updatedComposeFile).toBe(dump(expectedComposeFile));
});

const complexComposeFile6 = `
version: "3.8"

services:
  web:
    container_name: web-container
    image: nginx:alpine
    ports:
      - "80:80"
    networks:
      - frontend
    volumes:
      - web-data:/usr/share/nginx/html

  api:
    container_name: api-container
    image: node:alpine
    ports:
      - "3000:3000"
    networks:
      - frontend
      - backend
    volumes:
      - api-data:/usr/src/app
    depends_on:
      - db

  db:
    container_name: db-container
    image: postgres:alpine
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  web-data:
    driver: local
  api-data:
    driver: local
  db-data:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;

const expectedComposeFile6 = load(`
version: "3.8"

services:
  web-testhash:
    container_name: web-container-testhash
    image: nginx:alpine
    ports:
      - "80:80"
    networks:
      - frontend
    volumes:
      - web-data:/usr/share/nginx/html

  api-testhash:
    container_name: api-container-testhash
    image: node:alpine
    ports:
      - "3000:3000"
    networks:
      - frontend
      - backend
    volumes:
      - api-data:/usr/src/app
    depends_on:
      - db-testhash

  db-testhash:
    container_name: db-container-testhash
    image: postgres:alpine
    networks:
      - backend
    volumes:
      - db-data:/var/lib/postgresql/data

volumes:
  web-data:
    driver: local
  api-data:
    driver: local
  db-data:
    driver: local

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`);

test("Add prefix to all service names in Docker Compose", () => {
	const composeData = load(complexComposeFile6) as ComposeSpecification;

	const prefix = "testhash";

	const finalComposeData = addPrefixToAllServiceNames(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFile6);
});
