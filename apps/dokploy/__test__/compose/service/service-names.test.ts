import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToServiceNames, generateRandomHash } from "@dokploy/server";
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

  api:
    image: myapi:latest

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names in compose file", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addSuffixToServiceNames(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	// Verificar que los nombres de los servicios han cambiado correctamente
	expect(actualComposeData.services).toHaveProperty(`web-${suffix}`);
	expect(actualComposeData.services).toHaveProperty(`api-${suffix}`);
	// Verificar que las claves originales no existen
	expect(actualComposeData.services).not.toHaveProperty("web");
	expect(actualComposeData.services).not.toHaveProperty("api");
});
