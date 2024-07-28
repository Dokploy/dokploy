import { generateRandomHash } from "@dokploy/server/utils/docker/compose";
import { addPrefixToConfigsRoot } from "@dokploy/server/utils/docker/compose/configs";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest

configs:
  web-config:
    file: ./web-config.yml
`;

test("Add prefix to configs in root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addPrefixToConfigsRoot(composeData.configs, prefix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${prefix}`);
		expect(configs[configKey]).toBeDefined();
	}
});

const composeFileMultipleConfigs = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web-config
        target: /etc/nginx/nginx.conf
      - source: another-config
        target: /etc/nginx/another.conf

configs:
  web-config:
    file: ./web-config.yml
  another-config:
    file: ./another-config.yml
`;

test("Add prefix to multiple configs in root property", () => {
	const composeData = load(composeFileMultipleConfigs) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addPrefixToConfigsRoot(composeData.configs, prefix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${prefix}`);
		expect(configs[configKey]).toBeDefined();
	}
	expect(configs).toHaveProperty(`web-config-${prefix}`);
	expect(configs).toHaveProperty(`another-config-${prefix}`);
});

const composeFileDifferentProperties = `
version: "3.8"

services:
  web:
    image: nginx:latest

configs:
  web-config:
    file: ./web-config.yml
  special-config:
    external: true
`;

test("Add prefix to configs with different properties in root property", () => {
	const composeData = load(
		composeFileDifferentProperties,
	) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addPrefixToConfigsRoot(composeData.configs, prefix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${prefix}`);
		expect(configs[configKey]).toBeDefined();
	}
	expect(configs).toHaveProperty(`web-config-${prefix}`);
	expect(configs).toHaveProperty(`special-config-${prefix}`);
});

const composeFileConfigRoot = `
version: "3.8"

services:
  web:
    image: nginx:latest

  app:
    image: node:latest

  db:
    image: postgres:latest

configs:
  web_config:
    file: ./web-config.yml

  app_config:
    file: ./app-config.json

  db_config:
    file: ./db-config.yml
`;

// Expected compose file con el prefijo `testhash`
const expectedComposeFileConfigRoot = load(`
version: "3.8"

services:
  web:
    image: nginx:latest

  app:
    image: node:latest

  db:
    image: postgres:latest

configs:
  web_config-testhash:
    file: ./web-config.yml

  app_config-testhash:
    file: ./app-config.json

  db_config-testhash:
    file: ./db-config.yml
`) as ComposeSpecification;

test("Add prefix to configs in root property", () => {
	const composeData = load(composeFileConfigRoot) as ComposeSpecification;

	const prefix = "testhash";

	if (!composeData?.configs) {
		return;
	}
	const configs = addPrefixToConfigsRoot(composeData.configs, prefix);
	const updatedComposeData = { ...composeData, configs };

	// Verificar que el resultado coincide con el archivo esperado
	expect(updatedComposeData).toEqual(expectedComposeFileConfigRoot);
});
