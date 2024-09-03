import { generateRandomHash } from "@/server/utils/docker/compose";
import { addPrefixToServiceNetworks } from "@/server/utils/docker/compose/network";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend

  api:
    image: myapi:latest
    networks:
      - backend
`;

test("Add prefix to networks in services", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceNetworks(composeData.services, prefix);
	const actualComposeData = { ...composeData, services };

	expect(actualComposeData?.services?.web?.networks).toContain(
		`frontend-${prefix}`,
	);

	expect(actualComposeData?.services?.api?.networks).toContain(
		`backend-${prefix}`,
	);

	const apiNetworks = actualComposeData?.services?.api?.networks;

	expect(apiNetworks).toBeDefined();
	expect(actualComposeData?.services?.api?.networks).toContain(
		`backend-${prefix}`,
	);
});

// Caso 2: Objeto con aliases
const composeFile2 = `
version: "3.8"

services:
  api:
    image: myapi:latest
    networks:
      frontend:
        aliases:
          - api

networks:
  frontend:
    driver: bridge
`;

test("Add prefix to networks in services with aliases", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceNetworks(composeData.services, prefix);
	const actualComposeData = { ...composeData, services };

	expect(actualComposeData.services?.api?.networks).toHaveProperty(
		`frontend-${prefix}`,
	);

	const networkConfig = actualComposeData?.services?.api?.networks as {
		[key: string]: { aliases?: string[] };
	};
	expect(networkConfig[`frontend-${prefix}`]).toBeDefined();
	expect(networkConfig[`frontend-${prefix}`]?.aliases).toContain("api");

	expect(actualComposeData.services?.api?.networks).not.toHaveProperty(
		"frontend-ash",
	);
});

const composeFile3 = `
version: "3.8"

services:
  redis:
    image: redis:alpine
    networks:
      backend:

networks:
  backend:
    driver: bridge
`;

test("Add prefix to networks in services (Object with simple networks)", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceNetworks(composeData.services, prefix);
	const actualComposeData = { ...composeData, services };

	expect(actualComposeData.services?.redis?.networks).toHaveProperty(
		`backend-${prefix}`,
	);
});

const composeFileCombined = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend

  api:
    image: myapi:latest
    networks:
      frontend:
        aliases:
          - api

  redis:
    image: redis:alpine
    networks:
      backend:

networks:
  frontend:
    driver: bridge

  backend:
    driver: bridge
`;

test("Add prefix to networks in services (combined case)", () => {
	const composeData = load(composeFileCombined) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceNetworks(composeData.services, prefix);
	const actualComposeData = { ...composeData, services };

	// Caso 1: ListOfStrings
	expect(actualComposeData.services?.web?.networks).toContain(
		`frontend-${prefix}`,
	);
	expect(actualComposeData.services?.web?.networks).toContain(
		`backend-${prefix}`,
	);

	// Caso 2: Objeto con aliases
	const apiNetworks = actualComposeData.services?.api?.networks as {
		[key: string]: unknown;
	};
	expect(apiNetworks).toHaveProperty(`frontend-${prefix}`);
	expect(apiNetworks[`frontend-${prefix}`]).toBeDefined();
	expect(apiNetworks).not.toHaveProperty("frontend");

	// Caso 3: Objeto con redes simples
	const redisNetworks = actualComposeData.services?.redis?.networks;
	expect(redisNetworks).toHaveProperty(`backend-${prefix}`);
	expect(redisNetworks).not.toHaveProperty("backend");
});

const composeFile7 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - dokploy-network
`;

test("It shoudn't add prefix to dokploy-network in services", () => {
	const composeData = load(composeFile7) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const networks = addPrefixToServiceNetworks(composeData.services, prefix);
	const service = networks.web;

	expect(service).toBeDefined();
	expect(service?.networks).toContain("dokploy-network");
});

const composeFile8 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend
      - dokploy-network


  api:
    image: myapi:latest
    networks:
      frontend:
        aliases:
          - api
      dokploy-network:
        aliases:
          - api
  redis:
    image: redis:alpine
    networks:
      dokploy-network:
  db:
    image: myapi:latest
    networks:
      dokploy-network:
        aliases:
          - apid
	
`;

test("It shoudn't add prefix to dokploy-network in services multiples cases", () => {
	const composeData = load(composeFile8) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const networks = addPrefixToServiceNetworks(composeData.services, prefix);
	const service = networks.web;
	const api = networks.api;
	const redis = networks.redis;
	const db = networks.db;

	const dbNetworks = db?.networks as {
		[key: string]: unknown;
	};

	const apiNetworks = api?.networks as {
		[key: string]: unknown;
	};

	expect(service).toBeDefined();
	expect(service?.networks).toContain("dokploy-network");

	expect(redis?.networks).toHaveProperty("dokploy-network");
	expect(dbNetworks["dokploy-network"]).toBeDefined();
	expect(apiNetworks["dokploy-network"]).toBeDefined();
});
