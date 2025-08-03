import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToAllVolumes } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFileTypeVolume = `
version: "3.8"

services:
  db1:
    image: postgres:latest
    volumes:
      - "db-test:/var/lib/postgresql/data"
  db2:
    image: postgres:latest
    volumes:
      - type: volume
        source: db-test
        target: /var/lib/postgresql/data

volumes:
  db-test:
    driver: local
`;

const expectedComposeFileTypeVolume = load(`
version: "3.8"

services:
  db1:
    image: postgres:latest
    volumes:
      - "db-test-testhash:/var/lib/postgresql/data"
  db2:
    image: postgres:latest
    volumes:
      - type: volume
        source: db-test-testhash
        target: /var/lib/postgresql/data

volumes:
  db-test-testhash:
    driver: local
`) as ComposeSpecification;

test("Add suffix to volumes with type: volume in services", () => {
	const composeData = load(composeFileTypeVolume) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);
	const actualComposeData = { ...composeData, ...updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFileTypeVolume);
});

const composeFileTypeVolume1 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes:
      - "web-data:/var/www/html"
      - type: volume
        source: web-logs
        target: /var/log/nginx

volumes:
  web-data:
    driver: local
  web-logs:
    driver: local
`;

const expectedComposeFileTypeVolume1 = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes:
      - "web-data-testhash:/var/www/html"
      - type: volume
        source: web-logs-testhash
        target: /var/log/nginx

volumes:
  web-data-testhash:
    driver: local
  web-logs-testhash:
    driver: local
`) as ComposeSpecification;

test("Add suffix to mixed volumes in services", () => {
	const composeData = load(composeFileTypeVolume1) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);
	const actualComposeData = { ...composeData, ...updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFileTypeVolume1);
});

const composeFileTypeVolume2 = `
version: "3.8"

services:
  app:
    image: node:latest
    volumes:
      - "app-data:/usr/src/app"
      - type: volume
        source: app-logs
        target: /var/log/app
        volume:
          nocopy: true

volumes:
  app-data:
    driver: local
  app-logs:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/app/logs
`;

const expectedComposeFileTypeVolume2 = load(`
version: "3.8"

services:
  app:
    image: node:latest
    volumes:
      - "app-data-testhash:/usr/src/app"
      - type: volume
        source: app-logs-testhash
        target: /var/log/app
        volume:
          nocopy: true

volumes:
  app-data-testhash:
    driver: local
  app-logs-testhash:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/app/logs
`) as ComposeSpecification;

test("Add suffix to complex volume configurations in services", () => {
	const composeData = load(composeFileTypeVolume2) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);
	const actualComposeData = { ...composeData, ...updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFileTypeVolume2);
});

const composeFileTypeVolume3 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes:
      - "web-data:/usr/share/nginx/html"
      - type: volume
        source: web-logs
        target: /var/log/nginx
        volume:
          nocopy: true

  api:
    image: node:latest
    volumes:
      - "api-data:/usr/src/app"
      - type: volume
        source: api-logs
        target: /var/log/app
        volume:
          nocopy: true
      - type: volume
        source: shared-logs
        target: /shared/logs

volumes:
  web-data:
    driver: local
  web-logs:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/web/logs

  api-data:
    driver: local
  api-logs:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/api/logs

  shared-logs:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/shared/logs
`;

const expectedComposeFileTypeVolume3 = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes:
      - "web-data-testhash:/usr/share/nginx/html"
      - type: volume
        source: web-logs-testhash
        target: /var/log/nginx
        volume:
          nocopy: true

  api:
    image: node:latest
    volumes:
      - "api-data-testhash:/usr/src/app"
      - type: volume
        source: api-logs-testhash
        target: /var/log/app
        volume:
          nocopy: true
      - type: volume
        source: shared-logs-testhash
        target: /shared/logs

volumes:
  web-data-testhash:
    driver: local
  web-logs-testhash:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/web/logs

  api-data-testhash:
    driver: local
  api-logs-testhash:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/api/logs

  shared-logs-testhash:
    driver: local
    driver_opts:
      o: bind
      type: none
      device: /path/to/shared/logs
`) as ComposeSpecification;

test("Add suffix to complex nested volumes configuration in services", () => {
	const composeData = load(composeFileTypeVolume3) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllVolumes(composeData, suffix);
	const actualComposeData = { ...composeData, ...updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFileTypeVolume3);
});
