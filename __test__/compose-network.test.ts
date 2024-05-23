import { generateRandomHash } from "@/server/utils/docker/compose";
import {
	addPrefixToAllNetworks,
	addPrefixToNetworksRoot,
	addPrefixToObjectNetworks,
	addPrefixToSimpleObjectNetworks,
	addPrefixToStringNetworks,
} from "@/server/utils/docker/compose/network";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { dump, load } from "js-yaml";
import { expect, test } from "vitest";

// // const expectedComposeFile = load(`
// // services:
// //   mail:
// //     image: bytemark/smtp
// //     restart: always

// //   plausible_db:
// //     image: postgres:14-alpine
// //     restart: always
// //     networks:
// //       - backend-testhash
// //     backend:
// //       aliases:
// //         - app
// //     volumes:
// //       - db-data:/var/lib/postgresql/data
// //     environment:
// //       - POSTGRES_PASSWORD=postgres

// //   plausible_events_db:
// //     image: clickhouse/clickhouse-server:23.3.7.5-alpine
// //     restart: always
// //     volumes:
// //       - event-data:/var/lib/clickhouse
// //       - event-logs:/var/log/clickhouse-server
// //       - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
// //       - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
// //     ulimits:
// //       nofile:
// //         soft: 262144
// //         hard: 262144

// //   plausible:
// //     image: plausible/analytics:v2.0
// //     restart: always
// //     command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
// //     depends_on:
// //       - plausible_db
// //       - plausible_events_db
// //       - mail
// //     ports:
// //       - 127.0.0.1:8000:8000
// //     env_file:
// //       - plausible-conf.env
// //     volumes:
// //       - type: volume
// //         source: plausible-data
// //         target: /data

// //   mysql:
// //     image: mysql:5.7
// //     restart: always
// //     networks:
// //       - backend-testhash
// //     environment:
// //       MYSQL_ROOT_PASSWORD: example
// //     volumes:
// //       - type: volume
// //         source: db-data
// //         target: /var/lib/mysql/data

// // volumes:
// //   db-data:
// //     driver: local
// //   event-data:
// //     driver: local
// //   event-logs:
// //     driver: local

// // networks:
// //   frontend-testhash:
// //     driver: bridge
// //   backend-testhash:
// //     driver: bridge
// // `) as ComposeSpecification;

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend

  app:
    image: node:14
    networks:
      backend:
        aliases:
          - app
      frontend:
        aliases:
          - app-frontend

  db:
    image: postgres:13
    networks:
      backend:
        aliases:
          - db
      frontend:
        ipv4_address: 172.20.0.2
        ipv6_address: 2001:db8::1

  worker:
    image: busybox
    command: sleep 3600
    networks:
      - backend

  redis:
    image: redis:alpine
    networks:
      backend:
        priority: 100

networks:
  frontend:
    driver: bridge
    driver_opts:
      com.docker.network.driver.mtu: 1200

  backend:
    driver: bridge
    attachable: true

  external_network:
    external: true

`;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add prefix to networks root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addPrefixToNetworksRoot(composeData.networks, prefix);

	expect(networks).toBeDefined();
	for (const volumeKey of Object.keys(networks)) {
		expect(volumeKey).toContain(`-${prefix}`);
	}
});

const composeFileWithStringNetworks = `
version: "3.8"

services:
  app:
    image: node:alpine
    networks:
      - backend
      - frontend
`;

const expectedComposeFileWithStringNetworks = load(`
version: "3.8"

services:
  app:
    image: node:alpine
    networks:
      - backend-testprefix
      - frontend-testprefix
`) as ComposeSpecification;

test("Add prefix to service networks declared as a list of strings", () => {
	const composeData = load(
		composeFileWithStringNetworks,
	) as ComposeSpecification;

	if (!composeData?.services) {
		return;
	}

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToStringNetworks(
		composeData.services,
		prefix,
	);

	expect(updatedComposeData).toEqual(
		expectedComposeFileWithStringNetworks.services,
	);
});

const composeFileWithObjectNetworks = `
version: "3.8"

services:
  api:
      networks:
        frontend:
          aliases:
            - api
`;

const expectedComposeFileWithObjectNetworks = load(`
version: "3.8"

services:
  api:
    networks:
      frontend-testprefix:
        aliases:
          - api-testprefix
`) as ComposeSpecification;

test("Add prefix to service networks declared as objects with aliases", () => {
	const composeData = load(
		composeFileWithObjectNetworks,
	) as ComposeSpecification;

	if (!composeData?.services) {
		return;
	}

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToObjectNetworks(
		composeData.services,
		prefix,
	);

	expect(updatedComposeData).toEqual(
		expectedComposeFileWithObjectNetworks.services,
	);
});

const composeFileWithSimpleObjectNetworks = `
version: "3.8"

services:
  app:
    image: node:alpine
    networks:
      backend: 
`;

const expectedComposeFileWithSimpleObjectNetworks = load(`
version: "3.8"

services:
  app:
    image: node:alpine
    networks:
      backend-testprefix: 
`) as ComposeSpecification;

test("Add prefix to service networks declared as simple key-value pairs", () => {
	const composeData = load(
		composeFileWithSimpleObjectNetworks,
	) as ComposeSpecification;

	if (!composeData?.services) {
		return;
	}

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToSimpleObjectNetworks(
		composeData.services,
		prefix,
	);

	expect(updatedComposeData).toEqual(
		expectedComposeFileWithSimpleObjectNetworks.services,
	);
});

const composeFileWithAliases = `
version: "3.8"

services:
  api:
      networks:
        frontend:
          aliases:
            - api
`;

const expectedComposeFileWithAliases = load(`
version: "3.8"

services:
  api:
    networks:
      frontend-testprefix:
        aliases:
          - api-testprefix
`) as ComposeSpecification;

test("Add Prefix to all networks with Aliases in a Docker Compose file 2", () => {
	const composeData = load(composeFileWithAliases) as ComposeSpecification;
	const prefix = "testprefix"; // Prefijo definido para pruebas

	const updatedServices = addPrefixToAllNetworks(composeData, prefix);
	expect(updatedServices).toBeDefined();

	expect(updatedServices).toEqual(expectedComposeFileWithAliases);
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

const composeFileWithNetworksAndAliases = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend

  app:
    image: node:14
    networks:
      backend:
        aliases:
          - app
      frontend:
        aliases:
          - app-frontend

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

const expectedComposeFileWithNetworksAndAliases = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash

  app:
    image: node:14
    networks:
      backend-testhash:
        aliases:
          - app-testhash
      frontend-testhash:
        aliases:
          - app-frontend-testhash

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

test("Add prefix to all networks and aliases in a Docker Compose file", () => {
	const composeData = load(
		composeFileWithNetworksAndAliases,
	) as ComposeSpecification;
	const prefix = "testhash"; // Prefijo definido para pruebas

	// Añadir prefijo a las networks definidas en los servicios
	const finalComposeData = addPrefixToAllNetworks(composeData, prefix);

	// expect(finalComposeData).toEqual(expectedComposeFileWithNetworksAndAliases);
});
