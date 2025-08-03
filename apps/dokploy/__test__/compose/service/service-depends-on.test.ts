import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToServiceNames, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile4 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    depends_on:
      - db
      - api

  api:
    image: myapi:latest

  db:
    image: postgres:latest

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names with depends_on (array) in compose file", () => {
	const composeData = load(composeFile4) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addSuffixToServiceNames(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	// Verificar que la nueva clave del servicio tiene el prefijo y la vieja clave no existe
	expect(actualComposeData.services).toHaveProperty(`web-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("web");

	// Verificar que la configuración de la imagen sigue igual
	expect(actualComposeData.services?.[`web-${suffix}`]?.image).toBe(
		"nginx:latest",
	);
	expect(actualComposeData.services?.[`api-${suffix}`]?.image).toBe(
		"myapi:latest",
	);

	// Verificar que los nombres en depends_on tienen el prefijo
	expect(actualComposeData.services?.[`web-${suffix}`]?.depends_on).toContain(
		`db-${suffix}`,
	);
	expect(actualComposeData.services?.[`web-${suffix}`]?.depends_on).toContain(
		`api-${suffix}`,
	);

	// Verificar que los servicios `db` y `api` también tienen el prefijo
	expect(actualComposeData.services).toHaveProperty(`db-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("db");
	expect(actualComposeData.services?.[`db-${suffix}`]?.image).toBe(
		"postgres:latest",
	);
	expect(actualComposeData.services).toHaveProperty(`api-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("api");
	expect(actualComposeData.services?.[`api-${suffix}`]?.image).toBe(
		"myapi:latest",
	);
});

const composeFile5 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    depends_on:
      db:
        condition: service_healthy
      api:
        condition: service_started

  api:
    image: myapi:latest

  db:
    image: postgres:latest

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names with depends_on (object) in compose file", () => {
	const composeData = load(composeFile5) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}
	const updatedComposeData = addSuffixToServiceNames(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	// Verificar que la nueva clave del servicio tiene el prefijo y la vieja clave no existe
	expect(actualComposeData.services).toHaveProperty(`web-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("web");

	// Verificar que la configuración de la imagen sigue igual
	expect(actualComposeData.services?.[`web-${suffix}`]?.image).toBe(
		"nginx:latest",
	);
	expect(actualComposeData.services?.[`api-${suffix}`]?.image).toBe(
		"myapi:latest",
	);

	// Verificar que los nombres en depends_on tienen el prefijo
	const webDependsOn = actualComposeData.services?.[`web-${suffix}`]
		?.depends_on as Record<string, any>;
	expect(webDependsOn).toHaveProperty(`db-${suffix}`);
	expect(webDependsOn).toHaveProperty(`api-${suffix}`);
	expect(webDependsOn[`db-${suffix}`].condition).toBe("service_healthy");
	expect(webDependsOn[`api-${suffix}`].condition).toBe("service_started");

	// Verificar que los servicios `db` y `api` también tienen el prefijo
	expect(actualComposeData.services).toHaveProperty(`db-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("db");
	expect(actualComposeData.services?.[`db-${suffix}`]?.image).toBe(
		"postgres:latest",
	);
	expect(actualComposeData.services).toHaveProperty(`api-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("api");
	expect(actualComposeData.services?.[`api-${suffix}`]?.image).toBe(
		"myapi:latest",
	);
});
