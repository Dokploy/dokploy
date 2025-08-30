import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToSecretsInServices,
	generateRandomHash,
} from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFileSecretsServices = `
version: "3.8"

services:
  db:
    image: postgres:latest
    secrets:
      - db_password

secrets:
  db_password:
    file: ./db_password.txt
`;

test("Add suffix to secrets in services", () => {
	const composeData = load(composeFileSecretsServices) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToSecretsInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.db?.secrets).toContain(
		`db_password-${suffix}`,
	);
});

const composeFileSecretsServices1 = `
version: "3.8"

services:
  app:
    image: node:14
    secrets:
      - app_secret

secrets:
  app_secret:
    file: ./app_secret.txt
`;

test("Add suffix to secrets in services (Test 1)", () => {
	const composeData = load(composeFileSecretsServices1) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToSecretsInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.app?.secrets).toContain(
		`app_secret-${suffix}`,
	);
});

const composeFileSecretsServices2 = `
version: "3.8"

services:
  backend:
    image: backend:latest
    secrets:
      - backend_secret
  frontend:
    image: frontend:latest
    secrets:
      - frontend_secret

secrets:
  backend_secret:
    file: ./backend_secret.txt
  frontend_secret:
    file: ./frontend_secret.txt
`;

test("Add suffix to secrets in services (Test 2)", () => {
	const composeData = load(composeFileSecretsServices2) as ComposeSpecification;
	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToSecretsInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.backend?.secrets).toContain(
		`backend_secret-${suffix}`,
	);
	expect(actualComposeData.services?.frontend?.secrets).toContain(
		`frontend_secret-${suffix}`,
	);
});
