import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToAllConfigs, generateRandomHash } from "@dokploy/server";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFileCombinedConfigs = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config
        target: /etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config
        target: /usr/src/app/config.json

  db:
    image: postgres:13
    configs:
      - source: db_config
        target: /etc/postgresql/postgresql.conf

configs:
  web_config:
    file: ./web-config.yml

  app_config:
    file: ./app-config.json

  db_config:
    file: ./db-config.yml
`;

const expectedComposeFileCombinedConfigs = parse(`
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config-testhash
        target: /etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config-testhash
        target: /usr/src/app/config.json

  db:
    image: postgres:13
    configs:
      - source: db_config-testhash
        target: /etc/postgresql/postgresql.conf

configs:
  web_config-testhash:
    file: ./web-config.yml

  app_config-testhash:
    file: ./app-config.json

  db_config-testhash:
    file: ./db-config.yml
`) as ComposeSpecification;

test("Add suffix to all configs in root and services", () => {
	const composeData = parse(composeFileCombinedConfigs) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllConfigs(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFileCombinedConfigs);
});

const composeFileWithEnvAndExternal = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config
        target: /etc/nginx/nginx.conf
    environment:
      - NGINX_CONFIG=/etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config
        target: /usr/src/app/config.json

  db:
    image: postgres:13
    configs:
      - source: db_config
        target: /etc/postgresql/postgresql.conf

configs:
  web_config:
    external: true

  app_config:
    file: ./app-config.json

  db_config:
    environment: dev
    file: ./db-config.yml
`;

const expectedComposeFileWithEnvAndExternal = parse(`
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config-testhash
        target: /etc/nginx/nginx.conf
    environment:
      - NGINX_CONFIG=/etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config-testhash
        target: /usr/src/app/config.json

  db:
    image: postgres:13
    configs:
      - source: db_config-testhash
        target: /etc/postgresql/postgresql.conf

configs:
  web_config-testhash:
    external: true

  app_config-testhash:
    file: ./app-config.json

  db_config-testhash:
    environment: dev
    file: ./db-config.yml
`) as ComposeSpecification;

test("Add suffix to configs with environment and external", () => {
	const composeData = parse(
		composeFileWithEnvAndExternal,
	) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllConfigs(composeData, suffix);

	expect(updatedComposeData).toEqual(expectedComposeFileWithEnvAndExternal);
});

const composeFileWithTemplateDriverAndLabels = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config
        target: /etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config
        target: /usr/src/app/config.json

configs:
  web_config:
    file: ./web-config.yml
    template_driver: golang

  app_config:
    file: ./app-config.json
    labels:
      - app=frontend

  db_config:
    file: ./db-config.yml
`;

const expectedComposeFileWithTemplateDriverAndLabels = parse(`
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config-testhash
        target: /etc/nginx/nginx.conf

  app:
    image: node:14
    configs:
      - source: app_config-testhash
        target: /usr/src/app/config.json

configs:
  web_config-testhash:
    file: ./web-config.yml
    template_driver: golang

  app_config-testhash:
    file: ./app-config.json
    labels:
      - app=frontend

  db_config-testhash:
    file: ./db-config.yml
`) as ComposeSpecification;

test("Add suffix to configs with template driver and labels", () => {
	const composeData = parse(
		composeFileWithTemplateDriverAndLabels,
	) as ComposeSpecification;

	const suffix = "testhash";

	const updatedComposeData = addSuffixToAllConfigs(composeData, suffix);

	expect(updatedComposeData).toEqual(
		expectedComposeFileWithTemplateDriverAndLabels,
	);
});
