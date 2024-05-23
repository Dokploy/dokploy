import { generateRandomHash } from "@/server/utils/docker/compose";
import {
	addPrefixToAllNetworks,
	addPrefixToNetworksRoot,
	addPrefixToServiceNetworks,
} from "@/server/utils/docker/compose/network";
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

const expectedComposeFile = load(`
services:
  mail:
    image: bytemark/smtp
    restart: always

  plausible_db:
    image: postgres:14-alpine
    restart: always
    networks:
      - backend-testhash
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
      - backend-testhash
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
  frontend-testhash:
    driver: bridge
  backend-testhash:
    driver: bridge
`) as ComposeSpecification;
test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

// Docker compose needs unique names for services, volumes, networks and containers
// So base on a input which is a dockercompose file, it should replace the name with a hash and return a new dockercompose file
test("Add prefix to networks root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addPrefixToNetworksRoot(composeData.networks, prefix);

	// {
	//     'frontend-503fbfe9': { driver: 'bridge' },
	//     'backend-503fbfe9': { driver: 'bridge' }
	//   }

	expect(networks).toBeDefined();
	for (const volumeKey of Object.keys(networks)) {
		expect(volumeKey).toContain(`-${prefix}`);
	}
});

test("Add prefix to service networks", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceNetworks(composeData.services, prefix);

	expect(services).toBeDefined();

	for (const serviceKey of Object.keys(services)) {
		const service = services[serviceKey];
		if (service.networks) {
			for (const network of service.networks) {
				if (!network.startsWith("${")) {
					expect(network).toContain(`-${prefix}`);
				}
			}
		}
	}
});

test("Add prefix to all networks in a Docker Compose file", () => {
	const composeData = load(composeFile) as ComposeSpecification;
	const prefix = "testhash"; // Hash definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFile);
});

const composeFileExample1 = `
version: "3.8"
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    networks:
      - frontend
      - backend
    secrets:
      - db_password

  app:
    image: myapp:latest
    environment:
      - NODE_ENV=production
      - DB_PASSWORD_FILE=/run/secrets/db_password
    networks:
      - backend
      - frontend
    secrets:
      - db_password

  db:
    image: postgres:13
    networks:
      - backend
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge

secrets:
  db_password:
    file: ./secrets/db_password.txt
`;

const expectedComposeFileExample1 = load(`
version: "3.8"
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "80:80"
    networks:
      - frontend-testhash
      - backend-testhash
    secrets:
      - db_password

  app:
    image: myapp:latest
    environment:
      - NODE_ENV=production
      - DB_PASSWORD_FILE=/run/secrets/db_password
    networks:
      - backend-testhash
      - frontend-testhash
    secrets:
      - db_password

  db:
    image: postgres:13
    networks:
      - backend-testhash
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets:
      - db_password

networks:
  frontend-testhash:
    driver: bridge
  backend-testhash:
    driver: bridge

secrets:
  db_password:
    file: ./secrets/db_password.txt
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with secrets and build configurations", () => {
	const composeData = load(composeFileExample1) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample1);
});

const composeFileExample2 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - \${EXTERNAL_NETWORK}

  app:
    image: node:14
    networks:
      - backend
      - frontend

  db:
    image: postgres:13
    networks:
      - backend

networks:
  frontend:
  backend:
`;

const expectedComposeFileExample2 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash
      - \${EXTERNAL_NETWORK}

  app:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash

  db:
    image: postgres:13
    networks:
      - backend-testhash

networks:
  frontend-testhash:
  backend-testhash:
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with external networks and environment variables", () => {
	const composeData = load(composeFileExample2) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample2);
});

const composeFileExample3 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend
    depends_on:
      - app

  app:
    image: node:14
    networks:
      - backend
      - frontend
    depends_on:
      - db

  db:
    image: postgres:13
    networks:
      - backend

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;

const expectedComposeFileExample3 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash
    depends_on:
      - app

  app:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash
    depends_on:
      - db

  db:
    image: postgres:13
    networks:
      - backend-testhash

networks:
  frontend-testhash:
    driver: bridge
  backend-testhash:
    driver: bridge
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with advanced configurations and dependencies", () => {
	const composeData = load(composeFileExample3) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample3);
});

const composeFileExample4 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - shared

  app:
    image: node:14
    networks:
      - backend
      - frontend
      - shared

  db:
    image: postgres:13
    networks:
      - backend
      - shared

networks:
  frontend:
  backend:
  shared:
    external: true
`;

const expectedComposeFileExample4 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash
      - shared-testhash

  app:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash
      - shared-testhash

  db:
    image: postgres:13
    networks:
      - backend-testhash
      - shared-testhash

networks:
  frontend-testhash:
  backend-testhash:
  shared-testhash:
    external: true
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with shared and external networks", () => {
	const composeData = load(composeFileExample4) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample4);
});

const composeFileExample5 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend

  app:
    image: node:14
    networks:
      - backend
      - frontend

  db:
    image: postgres:13
    networks:
      - backend
`;

const expectedComposeFileExample5 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash

  app:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash

  db:
    image: postgres:13
    networks:
      - backend-testhash
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with networks only within services", () => {
	const composeData = load(composeFileExample5) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample5);
});

const composeFileExample6 = `
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend

  app:
    image: node:14
    networks:
      - backend
      - frontend

  db:
    image: postgres:13
    networks:
      - backend
`;

const expectedComposeFileExample6 = load(`
version: "3.8"
services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash

  app:
    image: node:14
    networks:
      - backend-testhash
      - frontend-testhash

  db:
    image: postgres:13
    networks:
      - backend-testhash
`) as ComposeSpecification;

test("Add prefix to all networks in a Docker Compose file with networks only within services", () => {
	const composeData = load(composeFileExample6) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(finalComposeData).toEqual(expectedComposeFileExample6);
});
