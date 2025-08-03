import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToAllNetworks,
	addSuffixToNetworksRoot,
	addSuffixToServiceNetworks,
	generateRandomHash,
} from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

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

test("Add suffix to networks in services and root (combined case)", () => {
	const composeData = load(composeFileCombined) as ComposeSpecification;

	const suffix = generateRandomHash();

	// Prefijo para redes definidas en el root
	if (composeData.networks) {
		composeData.networks = addSuffixToNetworksRoot(
			composeData.networks,
			suffix,
		);
	}

	// Prefijo para redes definidas en los servicios
	if (composeData.services) {
		composeData.services = addSuffixToServiceNetworks(
			composeData.services,
			suffix,
		);
	}

	const actualComposeData = { ...composeData };

	// Verificar redes en root
	expect(actualComposeData.networks).toHaveProperty(`frontend-${suffix}`);
	expect(actualComposeData.networks).toHaveProperty(`backend-${suffix}`);
	expect(actualComposeData.networks).not.toHaveProperty("frontend");
	expect(actualComposeData.networks).not.toHaveProperty("backend");

	// Caso 1: ListOfStrings
	expect(actualComposeData.services?.web?.networks).toContain(
		`frontend-${suffix}`,
	);
	expect(actualComposeData.services?.web?.networks).toContain(
		`backend-${suffix}`,
	);

	// Caso 2: Objeto con aliases
	const apiNetworks = actualComposeData.services?.api?.networks as {
		[key: string]: { aliases?: string[] };
	};
	expect(apiNetworks).toHaveProperty(`frontend-${suffix}`);
	expect(apiNetworks?.[`frontend-${suffix}`]?.aliases).toContain("api");
	expect(apiNetworks).not.toHaveProperty("frontend");

	// Caso 3: Objeto con redes simples
	const redisNetworks = actualComposeData.services?.redis?.networks;
	expect(redisNetworks).toHaveProperty(`backend-${suffix}`);
	expect(redisNetworks).not.toHaveProperty("backend");
});

const expectedComposeFile = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash
      - backend-testhash

  api:
    image: myapi:latest
    networks:
      frontend-testhash:
        aliases:
          - api

  redis:
    image: redis:alpine
    networks:
      backend-testhash:

networks:
  frontend-testhash:
    driver: bridge

  backend-testhash:
    driver: bridge
`);

test("Add suffix to networks in compose file", () => {
	const composeData = load(composeFileCombined) as ComposeSpecification;

	const suffix = "testhash";
	if (!composeData?.networks) {
		return;
	}
	const updatedComposeData = addSuffixToAllNetworks(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile);
});

const composeFile2 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend

  db:
    image: postgres:latest
    networks:
      backend:
        aliases:
          - db

networks:
  frontend:
    external: true

  backend:
    driver: bridge
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash
      - backend-testhash

  db:
    image: postgres:latest
    networks:
      backend-testhash:
        aliases:
          - db

networks:
  frontend-testhash:
    external: true

  backend-testhash:
    driver: bridge
`);

test("Add suffix to networks in compose file with external and internal networks", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const suffix = "testhash";
	const updatedComposeData = addSuffixToAllNetworks(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile2);
});

const composeFile3 = `
version: "3.8"

services:
  app:
    image: myapp:latest
    networks:
      frontend:
        aliases:
          - app
      backend:

  worker:
    image: worker:latest
    networks:
      - backend

networks:
  frontend:
    driver: bridge
    attachable: true

  backend:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"
`;

const expectedComposeFile3 = load(`
version: "3.8"

services:
  app:
    image: myapp:latest
    networks:
      frontend-testhash:
        aliases:
          - app
      backend-testhash:

  worker:
    image: worker:latest
    networks:
      - backend-testhash

networks:
  frontend-testhash:
    driver: bridge
    attachable: true

  backend-testhash:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"
`);

test("Add suffix to networks in compose file with multiple services and complex network configurations", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

	const suffix = "testhash";
	const updatedComposeData = addSuffixToAllNetworks(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile3);
});

const composeFile4 = `
version: "3.8"

services:
  app:
    image: myapp:latest
    networks:
      frontend:
        aliases:
          - app
      backend:
      dokploy-network:

  worker:
    image: worker:latest
    networks:
      - backend
      - dokploy-network

networks:
  frontend:
    driver: bridge
    attachable: true

  backend:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"

  dokploy-network:
    driver: bridge

`;

const expectedComposeFile4 = load(`
version: "3.8"

services:
  app:
    image: myapp:latest
    networks:
      frontend-testhash:
        aliases:
          - app
      backend-testhash:
      dokploy-network:

  worker:
    image: worker:latest
    networks:
      - backend-testhash
      - dokploy-network

networks:
  frontend-testhash:
    driver: bridge
    attachable: true

  backend-testhash:
    driver: bridge
    driver_opts:
      com.docker.network.bridge.enable_icc: "true"
  
  dokploy-network:
    driver: bridge


  
`);

test("Expect don't add suffix to dokploy-network in compose file with multiple services and complex network configurations", () => {
	const composeData = load(composeFile4) as ComposeSpecification;

	const suffix = "testhash";
	const updatedComposeData = addSuffixToAllNetworks(composeData, suffix);
	expect(updatedComposeData).toEqual(expectedComposeFile4);
});
