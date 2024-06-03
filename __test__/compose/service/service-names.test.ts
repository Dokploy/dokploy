import { generateRandomHash } from "@/server/utils/docker/compose";
import { addPrefixToServiceNames } from "@/server/utils/docker/compose/service";
import type { ComposeSpecification } from "@/server/utils/docker/types";
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

test("Add prefix to service names in compose file", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addPrefixToServiceNames(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	// Verificar que los nombres de los servicios han cambiado correctamente
	expect(actualComposeData.services).toHaveProperty(`web-${prefix}`);
	expect(actualComposeData.services).toHaveProperty(`api-${prefix}`);
	// Verificar que las claves originales no existen
	expect(actualComposeData.services).not.toHaveProperty("web");
	expect(actualComposeData.services).not.toHaveProperty("api");
});
