import { generateRandomHash } from "@/server/utils/docker/compose";
import {
	addPrefixToAllNetworks,
	addPrefixToServiceNetworks,
} from "@/server/utils/docker/compose/network";
import { addPrefixToNetworksRoot } from "@/server/utils/docker/compose/network";
import type { ComposeSpecification } from "@/server/utils/docker/types";
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

test("Add prefix to networks in services and root (combined case)", () => {
	const composeData = load(composeFileCombined) as ComposeSpecification;

	const prefix = generateRandomHash();

	// Prefijo para redes definidas en el root
	if (composeData.networks) {
		composeData.networks = addPrefixToNetworksRoot(
			composeData.networks,
			prefix,
		);
	}

	// Prefijo para redes definidas en los servicios
	if (composeData.services) {
		composeData.services = addPrefixToServiceNetworks(
			composeData.services,
			prefix,
		);
	}

	const actualComposeData = { ...composeData };

	// Verificar redes en root
	expect(actualComposeData.networks).toHaveProperty(`frontend-${prefix}`);
	expect(actualComposeData.networks).toHaveProperty(`backend-${prefix}`);
	expect(actualComposeData.networks).not.toHaveProperty("frontend");
	expect(actualComposeData.networks).not.toHaveProperty("backend");

	// Caso 1: ListOfStrings
	expect(actualComposeData.services?.web?.networks).toContain(
		`frontend-${prefix}`,
	);
	expect(actualComposeData.services?.web?.networks).toContain(
		`backend-${prefix}`,
	);

	// Caso 2: Objeto con aliases
	const apiNetworks = actualComposeData.services?.api?.networks as {
		[key: string]: { aliases?: string[] };
	};
	expect(apiNetworks).toHaveProperty(`frontend-${prefix}`);
	expect(apiNetworks?.[`frontend-${prefix}`]?.aliases).toContain("api");
	expect(apiNetworks).not.toHaveProperty("frontend");

	// Caso 3: Objeto con redes simples
	const redisNetworks = actualComposeData.services?.redis?.networks;
	expect(redisNetworks).toHaveProperty(`backend-${prefix}`);
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

test("Add prefix to networks in compose file", () => {
	const composeData = load(composeFileCombined) as ComposeSpecification;

	const prefix = "testhash";
	if (!composeData?.networks) {
		return;
	}
	const updatedComposeData = addPrefixToAllNetworks(composeData, prefix);

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

test("Add prefix to networks in compose file with external and internal networks", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const prefix = "testhash";
	const updatedComposeData = addPrefixToAllNetworks(composeData, prefix);

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

test("Add prefix to networks in compose file with multiple services and complex network configurations", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

	const prefix = "testhash";
	const updatedComposeData = addPrefixToAllNetworks(composeData, prefix);

	expect(updatedComposeData).toEqual(expectedComposeFile3);
});
