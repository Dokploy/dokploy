import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToAllServiceNames,
	addSuffixToServiceNames,
} from "@dokploy/server";
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

test("Add suffix to all service names in compose file", () => {
	const composeData = load(composeFileCombinedAllCases) as ComposeSpecification;

	const suffix = "testhash";

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addSuffixToServiceNames(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFile);
});

const composeFile1 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    container_name: web_container
    depends_on:
      - app
    networks:
      - frontend
    volumes_from:
      - data
    links:
      - db
    extends:
      service: base_service

  app:
    image: node:14
    networks:
      - backend
      - frontend

  db:
    image: postgres:13
    networks:
      - backend

  data:
    image: busybox
    volumes:
      - /data

  base_service:
    image: base:latest

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`;

const expectedComposeFile1 = load(`
version: "3.8"

services:
  web-testhash:
    image: nginx:latest
    container_name: web_container-testhash
    depends_on:
      - app-testhash
    networks:
      - frontend
    volumes_from:
      - data-testhash
    links:
      - db-testhash
    extends:
      service: base_service-testhash

  app-testhash:
    image: node:14
    networks:
      - backend
      - frontend

  db-testhash:
    image: postgres:13
    networks:
      - backend

  data-testhash:
    image: busybox
    volumes:
      - /data

  base_service-testhash:
    image: base:latest

networks:
  frontend:
    driver: bridge
  backend:
    driver: bridge
`) as ComposeSpecification;

test("Add suffix to all service names in compose file 1", () => {
	const composeData = load(composeFile1) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllServiceNames(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile1);
});

const composeFile2 = `
version: "3.8"

services:
  frontend:
    image: nginx:latest
    depends_on:
      - backend
    networks:
      - public
    volumes_from:
      - logs
    links:
      - cache
    extends:
      service: shared_service

  backend:
    image: node:14
    networks:
      - private
      - public

  cache:
    image: redis:latest
    networks:
      - private

  logs:
    image: busybox
    volumes:
      - /logs

  shared_service:
    image: shared:latest

networks:
  public:
    driver: bridge
  private:
    driver: bridge
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  frontend-testhash:
    image: nginx:latest
    depends_on:
      - backend-testhash
    networks:
      - public
    volumes_from:
      - logs-testhash
    links:
      - cache-testhash
    extends:
      service: shared_service-testhash

  backend-testhash:
    image: node:14
    networks:
      - private
      - public

  cache-testhash:
    image: redis:latest
    networks:
      - private

  logs-testhash:
    image: busybox
    volumes:
      - /logs

  shared_service-testhash:
    image: shared:latest

networks:
  public:
    driver: bridge
  private:
    driver: bridge
`) as ComposeSpecification;

test("Add suffix to all service names in compose file 2", () => {
	const composeData = load(composeFile2) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllServiceNames(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile2);
});

const composeFile3 = `
version: "3.8"

services:
  service_a:
    image: service_a:latest
    depends_on:
      - service_b
    networks:
      - net_a
    volumes_from:
      - data_volume
    links:
      - service_c
    extends:
      service: common_service

  service_b:
    image: service_b:latest
    networks:
      - net_b
      - net_a

  service_c:
    image: service_c:latest
    networks:
      - net_b

  data_volume:
    image: busybox
    volumes:
      - /data

  common_service:
    image: common:latest

networks:
  net_a:
    driver: bridge
  net_b:
    driver: bridge
`;

const expectedComposeFile3 = load(`
version: "3.8"

services:
  service_a-testhash:
    image: service_a:latest
    depends_on:
      - service_b-testhash
    networks:
      - net_a
    volumes_from:
      - data_volume-testhash
    links:
      - service_c-testhash
    extends:
      service: common_service-testhash

  service_b-testhash:
    image: service_b:latest
    networks:
      - net_b
      - net_a

  service_c-testhash:
    image: service_c:latest
    networks:
      - net_b

  data_volume-testhash:
    image: busybox
    volumes:
      - /data

  common_service-testhash:
    image: common:latest

networks:
  net_a:
    driver: bridge
  net_b:
    driver: bridge
`) as ComposeSpecification;

test("Add suffix to all service names in compose file 3", () => {
	const composeData = load(composeFile3) as ComposeSpecification;
	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllServiceNames(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFile3);
});
