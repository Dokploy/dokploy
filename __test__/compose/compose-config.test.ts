import { expect, test } from "vitest";
import { load } from "js-yaml";
import { generateRandomHash } from "@/server/utils/docker/compose";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import {
	addPrefixToAllConfigs,
	addPrefixToConfigsRoot,
	addPrefixToServiceConfigs,
} from "@/server/utils/docker/compose/configs";

const composeFile = `
version: "3.8"

services:
  app:
    image: nginx:alpine
    configs:
      - source: app-config
        target: /etc/nginx/nginx.conf

configs:
  app-config:
    file: ./nginx.conf
`;

const expectedComposeFile = load(`
version: "3.8"

services:
  app:
    image: nginx:alpine
    configs:
      - source: app-config-testprefix
        target: /etc/nginx/nginx.conf

configs:
  app-config-testprefix:
    file: ./nginx.conf
`);

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

// Docker compose needs unique names for services, volumes, networks and containers
// So base on a input which is a dockercompose file, it should replace the name with a hash and return a new dockercompose file
test("Add prefix to configs root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.configs) {
		return;
	}
	const configs = addPrefixToConfigsRoot(composeData.configs, prefix);

	expect(configs).toBeDefined();
	for (const configKey of Object.keys(configs)) {
		expect(configKey).toContain(`-${prefix}`);
	}
});

test("Add prefix to service configs property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceConfigs(composeData.services, prefix);

	expect(services).toBeDefined();

	// Ensure each service config source has the prefix
	for (const serviceKey of Object.keys(services)) {
		const service = services[serviceKey];
		if (service.configs) {
			for (const config of service.configs) {
				expect(config.source).toContain(`-${prefix}`);
			}
		}
	}
});

test("Add prefix to all configs properties", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllConfigs(composeData, prefix);

	// Convert expected data to YAML for comparison

	expect(updatedComposeData).toEqual(expectedComposeFile);
});

const complexComposeFile2 = `
version: "3.8"

services:
  app:
    image: nginx:alpine
    configs:
      - source: app-config
        target: /etc/nginx/nginx.conf
      - source: common-config
        target: /etc/nginx/common.conf

  api:
    image: node:alpine
    configs:
      - source: api-config
        target: /usr/src/app/config.json
      - source: common-config
        target: /usr/src/app/common.json

configs:
  app-config:
    file: ./nginx.conf
  api-config:
    file: ./config.json
  common-config:
    file: ./common.conf
`;

const expectedComposeFile2 = load(`
version: "3.8"

services:
  app:
    image: nginx:alpine
    configs:
      - source: app-config-testprefix
        target: /etc/nginx/nginx.conf
      - source: common-config-testprefix
        target: /etc/nginx/common.conf

  api:
    image: node:alpine
    configs:
      - source: api-config-testprefix
        target: /usr/src/app/config.json
      - source: common-config-testprefix
        target: /usr/src/app/common.json

configs:
  app-config-testprefix:
    file: ./nginx.conf
  api-config-testprefix:
    file: ./config.json
  common-config-testprefix:
    file: ./common.conf
`);

test("Add prefix to all configs properties (2 Try)", () => {
	const composeData = load(complexComposeFile2) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllConfigs(composeData, prefix);

	// Convert expected data to YAML for comparison
	expect(updatedComposeData).toEqual(expectedComposeFile2);
});
