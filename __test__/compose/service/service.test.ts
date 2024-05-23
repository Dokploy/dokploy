import { addPrefixToServiceNames } from "@/server/utils/docker/compose/service";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFileCombinedAllCases = `
version: "3.8"

services:
  web:
    image: nginx:latest
    container_name: web_container
    links:
      - api
    depends_on:
      - api
    extends: base_service

  api:
    image: myapi:latest
    depends_on:
      db:
        condition: service_healthy
    volumes_from:
      - db

  db:
    image: postgres:latest

  base_service:
    image: base:latest

networks:
  default:
    driver: bridge
`;

const expectedComposeFile = load(`
version: "3.8"

services:
  web-testhash:
    image: nginx:latest
    container_name: web_container-testhash
    links:
      - api-testhash
    depends_on:
      - api-testhash
    extends: base_service-testhash

  api-testhash:
    image: myapi:latest
    depends_on:
      db-testhash:
        condition: service_healthy
    volumes_from:
      - db-testhash

  db-testhash:
    image: postgres:latest

  base_service-testhash:
    image: base:latest

networks:
  default:
    driver: bridge
`);

test("Add prefix to all service names in compose file", () => {
	const composeData = load(composeFileCombinedAllCases) as ComposeSpecification;

	const prefix = "testhash";

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addPrefixToServiceNames(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFile);
});

const composeFileCombinedAllCases2 = `
version: "3.8"

services:
  app:
    image: node:latest
    container_name: app_container
    links:
      - cache
    depends_on:
      - db
    extends:
      service: base_service

  cache:
    image: redis:latest
    volumes_from:
      - db
    depends_on:
      db:
        condition: service_healthy

  db:
    image: postgres:latest

  base_service:
    image: base:latest

networks:
  default:
    driver: bridge
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  app-testhash:
    image: node:latest
    container_name: app_container-testhash
    links:
      - cache-testhash
    depends_on:
      - db-testhash
    extends:
      service: base_service-testhash

  cache-testhash:
    image: redis:latest
    volumes_from:
      - db-testhash
    depends_on:
      db-testhash:
        condition: service_healthy

  db-testhash:
    image: postgres:latest

  base_service-testhash:
    image: base:latest

networks:
  default:
    driver: bridge
`) as ComposeSpecification;
test("Add prefix to all service names in compose file", () => {
	const composeData = load(
		composeFileCombinedAllCases2,
	) as ComposeSpecification;

	const prefix = "testhash";

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addPrefixToServiceNames(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFile2);
});
