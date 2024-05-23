import { expect, test } from "vitest";
import { load, dump } from "js-yaml";
import { generateRandomHash } from "@/server/utils/docker/compose";
import type { ComposeSpecification } from "@/server/utils/docker/types";
import {
	addPrefixToAllSecrets,
	addPrefixToSecretsRoot,
	addPrefixToServiceSecrets,
} from "@/server/utils/docker/compose/secrets";

const complexComposeFile = `
version: "3.8"

services:
  app:
    image: nginx:alpine
    secrets:
      - source: app-secret
        target: /run/secrets/app-secret
      - source: common-secret
        target: /run/secrets/common-secret

  api:
    image: node:alpine
    secrets:
      - source: api-secret
        target: /run/secrets/api-secret
      - source: common-secret
        target: /run/secrets/common-secret

secrets:
  app-secret:
    file: ./app-secret.txt
  api-secret:
    file: ./api-secret.txt
  common-secret:
    file: ./common-secret.txt
`;

const expectedComposeFile = load(`
version: "3.8"

services:
  app:
    image: nginx:alpine
    secrets:
      - source: app-secret-testprefix
        target: /run/secrets/app-secret
      - source: common-secret-testprefix
        target: /run/secrets/common-secret

  api:
    image: node:alpine
    secrets:
      - source: api-secret-testprefix
        target: /run/secrets/api-secret
      - source: common-secret-testprefix
        target: /run/secrets/common-secret

secrets:
  app-secret-testprefix:
    file: ./app-secret.txt
  api-secret-testprefix:
    file: ./api-secret.txt
  common-secret-testprefix:
    file: ./common-secret.txt
`);

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add prefix to secrets root property", () => {
	const composeData = load(complexComposeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.secrets) {
		return;
	}
	const secrets = addPrefixToSecretsRoot(composeData.secrets, prefix);

	expect(secrets).toBeDefined();
	for (const secretKey of Object.keys(secrets)) {
		expect(secretKey).toContain(`-${prefix}`);
	}
});

test("Add prefix to service secrets property", () => {
	const composeData = load(complexComposeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.services) {
		return;
	}
	const services = addPrefixToServiceSecrets(composeData.services, prefix);

	expect(services).toBeDefined();

	// Ensure each service secret source has the prefix
	for (const serviceKey of Object.keys(services)) {
		const service = services[serviceKey];
		if (service.secrets) {
			for (const secret of service.secrets) {
				expect(secret.source).toContain(`-${prefix}`);
			}
		}
	}
});

test("Add prefix to all secrets properties", () => {
	const composeData = load(complexComposeFile) as ComposeSpecification;

	const prefix = "testprefix";
	const updatedComposeData = addPrefixToAllSecrets(composeData, prefix);

	expect(updatedComposeData).toEqual(expectedComposeFile);
});
