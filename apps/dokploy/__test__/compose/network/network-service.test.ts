import { generateRandomHash } from "@dokploy/server/utils/docker/compose";
import { addPrefixToServiceNetworks } from "@dokploy/server/utils/docker/compose/network";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
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
