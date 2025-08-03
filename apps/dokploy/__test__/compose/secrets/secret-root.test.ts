import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToSecretsRoot, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFileSecretsRoot = `
version: "3.8"

services:
  web:
    image: nginx:latest

secrets:
  db_password:
    file: ./db_password.txt
`;

test("Add suffix to secrets in root property", () => {
	const composeData = load(composeFileSecretsRoot) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData?.secrets) {
		return;
	}
	const secrets = addSuffixToSecretsRoot(composeData.secrets, suffix);
	expect(secrets).toBeDefined();
	if (secrets) {
		for (const secretKey of Object.keys(secrets)) {
			expect(secretKey).toContain(`-${suffix}`);
			expect(secrets[secretKey]).toBeDefined();
		}
	}
});

const composeFileSecretsRoot1 = `
version: "3.8"

services:
  api:
    image: myapi:latest

secrets:
  api_key:
    file: ./api_key.txt
`;

test("Add suffix to secrets in root property (Test 1)", () => {
	const composeData = load(composeFileSecretsRoot1) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData?.secrets) {
		return;
	}
	const secrets = addSuffixToSecretsRoot(composeData.secrets, suffix);
	expect(secrets).toBeDefined();

	if (secrets) {
		for (const secretKey of Object.keys(secrets)) {
			expect(secretKey).toContain(`-${suffix}`);
			expect(secrets[secretKey]).toBeDefined();
		}
	}
});

const composeFileSecretsRoot2 = `
version: "3.8"

services:
  frontend:
    image: nginx:latest

secrets:
  frontend_secret:
    file: ./frontend_secret.txt
  db_password:
    external: true
`;

test("Add suffix to secrets in root property (Test 2)", () => {
	const composeData = load(composeFileSecretsRoot2) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData?.secrets) {
		return;
	}
	const secrets = addSuffixToSecretsRoot(composeData.secrets, suffix);
	expect(secrets).toBeDefined();

	if (secrets) {
		for (const secretKey of Object.keys(secrets)) {
			expect(secretKey).toContain(`-${suffix}`);
			expect(secrets[secretKey]).toBeDefined();
		}
	}
});
