import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToConfigsInServices,
	generateRandomHash,
} from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web-config
        target: /etc/nginx/nginx.conf

configs:
  web-config:
    file: ./web-config.yml
`;

test("Add suffix to configs in services", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addSuffixToConfigsInServices(composeData.services, suffix);
	const actualComposeData = { ...composeData, services };

	expect(actualComposeData.services?.web?.configs).toContainEqual({
		source: `web-config-${suffix}`,
		target: "/etc/nginx/nginx.conf",
	});
});

const composeFileSingleServiceConfig = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web-config
        target: /etc/nginx/nginx.conf

configs:
  web-config:
    file: ./web-config.yml
`;

test("Add suffix to configs in services with single config", () => {
	const composeData = load(
		composeFileSingleServiceConfig,
	) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addSuffixToConfigsInServices(composeData.services, suffix);

	expect(services).toBeDefined();
	for (const serviceKey of Object.keys(services)) {
		const serviceConfigs = services?.[serviceKey]?.configs;
		if (serviceConfigs) {
			for (const config of serviceConfigs) {
				if (typeof config === "object") {
					expect(config.source).toContain(`-${suffix}`);
				}
			}
		}
	}
});

const composeFileMultipleServicesConfigs = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web-config
        target: /etc/nginx/nginx.conf
      - source: common-config
        target: /etc/nginx/common.conf

  app:
    image: node:14
    configs:
      - source: app-config
        target: /usr/src/app/config.json
      - source: common-config
        target: /usr/src/app/common.json

configs:
  web-config:
    file: ./web-config.yml
  app-config:
    file: ./app-config.json
  common-config:
    file: ./common-config.yml
`;

test("Add suffix to configs in services with multiple configs", () => {
	const composeData = load(
		composeFileMultipleServicesConfigs,
	) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addSuffixToConfigsInServices(composeData.services, suffix);

	expect(services).toBeDefined();
	for (const serviceKey of Object.keys(services)) {
		const serviceConfigs = services?.[serviceKey]?.configs;
		if (serviceConfigs) {
			for (const config of serviceConfigs) {
				if (typeof config === "object") {
					expect(config.source).toContain(`-${suffix}`);
				}
			}
		}
	}
});

const composeFileConfigServices = `
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config
        target: /etc/nginx/nginx.conf

  app:
    image: node:latest
    configs:
      - source: app_config
        target: /usr/src/app/config.json

  db:
    image: postgres:latest
    configs:
      - source: db_config
        target: /etc/postgresql/postgresql.conf

`;

// Expected compose file con el prefijo `testhash`
const expectedComposeFileConfigServices = load(`
version: "3.8"

services:
  web:
    image: nginx:latest
    configs:
      - source: web_config-testhash
        target: /etc/nginx/nginx.conf

  app:
    image: node:latest
    configs:
      - source: app_config-testhash
        target: /usr/src/app/config.json

  db:
    image: postgres:latest
    configs:
      - source: db_config-testhash
        target: /etc/postgresql/postgresql.conf

`) as ComposeSpecification;

test("Add suffix to configs in services", () => {
	const composeData = load(composeFileConfigServices) as ComposeSpecification;

	const suffix = "testhash";

	if (!composeData?.services) {
		return;
	}
	const updatedComposeData = addSuffixToConfigsInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData).toEqual(expectedComposeFileConfigServices);
});
