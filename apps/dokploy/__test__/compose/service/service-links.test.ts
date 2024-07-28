import { generateRandomHash } from "@dokploy/server/utils/docker/compose";
import { addPrefixToServiceNames } from "@dokploy/server/utils/docker/compose/service";
import type { ComposeSpecification } from "@dokploy/server/utils/docker/types";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile2 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    links:
      - db

  api:
    image: myapi:latest

  db:
    image: postgres:latest

networks:
  default:
    driver: bridge
`;

test("Add prefix to service names with links in compose file", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addPrefixToServiceNames(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	// Verificar que la nueva clave del servicio tiene el prefijo y la vieja clave no existe
	expect(actualComposeData.services).toHaveProperty(`web-${prefix}`);
	expect(actualComposeData.services).not.toHaveProperty("web");

	// Verificar que la configuración de la imagen sigue igual
	expect(actualComposeData.services?.[`web-${prefix}`]?.image).toBe(
		"nginx:latest",
	);
	expect(actualComposeData.services?.[`api-${prefix}`]?.image).toBe(
		"myapi:latest",
	);

	// Verificar que los nombres en links tienen el prefijo
	expect(actualComposeData.services?.[`web-${prefix}`]?.links).toContain(
		`db-${prefix}`,
	);

	// Verificar que los servicios `db` y `api` también tienen el prefijo
	expect(actualComposeData.services).toHaveProperty(`db-${prefix}`);
	expect(actualComposeData.services).not.toHaveProperty("db");
	expect(actualComposeData.services?.[`db-${prefix}`]?.image).toBe(
		"postgres:latest",
	);
	expect(actualComposeData.services).toHaveProperty(`api-${prefix}`);
	expect(actualComposeData.services).not.toHaveProperty("api");
	expect(actualComposeData.services?.[`api-${prefix}`]?.image).toBe(
		"myapi:latest",
	);
});
