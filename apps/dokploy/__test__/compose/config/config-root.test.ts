import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToConfigsRoot, generateRandomHash } from "@dokploy/server";
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

test("Add suffix to configs in root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addSuffixToConfigsRoot(composeData.configs, suffix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${suffix}`);
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

test("Add suffix to multiple configs in root property", () => {
	const composeData = load(composeFileMultipleConfigs) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addSuffixToConfigsRoot(composeData.configs, suffix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${suffix}`);
		expect(configs[configKey]).toBeDefined();
	}
	expect(configs).toHaveProperty(`web-config-${suffix}`);
	expect(configs).toHaveProperty(`another-config-${suffix}`);
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

test("Add suffix to configs with different properties in root property", () => {
	const composeData = load(
		composeFileDifferentProperties,
	) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addSuffixToConfigsRoot(composeData.configs, suffix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${suffix}`);
		expect(configs[configKey]).toBeDefined();
	}
	expect(configs).toHaveProperty(`web-config-${suffix}`);
	expect(configs).toHaveProperty(`special-config-${suffix}`);
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

test("Add suffix to configs in root property", () => {
	const composeData = load(composeFileConfigRoot) as ComposeSpecification;

	const suffix = "testhash";

	if (!composeData?.configs) {
		return;
	}
	const configs = addSuffixToConfigsRoot(composeData.configs, suffix);
	const updatedComposeData = { ...composeData, configs };

	// Verificar que el resultado coincide con el archivo esperado
	expect(updatedComposeData).toEqual(expectedComposeFileConfigRoot);
});
