import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToServiceNames, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile6 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    extends: base_service

  api:
    image: myapi:latest

  base_service:
    image: base:latest

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names with extends (string) in compose file", () => {
	const composeData = load(composeFile6) as ComposeSpecification;

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

	// Verificar que el nombre en extends tiene el prefijo
	expect(actualComposeData.services?.[`web-${suffix}`]?.extends).toBe(
		`base_service-${suffix}`,
	);

	// Verificar que el servicio `base_service` también tiene el prefijo
	expect(actualComposeData.services).toHaveProperty(`base_service-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("base_service");
	expect(actualComposeData.services?.[`base_service-${suffix}`]?.image).toBe(
		"base:latest",
	);
});

const composeFile7 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    extends:
      service: base_service
      file: docker-compose.base.yml

  api:
    image: myapi:latest

  base_service:
    image: base:latest

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names with extends (object) in compose file", () => {
	const composeData = load(composeFile7) as ComposeSpecification;

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

	// Verificar que el nombre en extends.service tiene el prefijo
	const webExtends = actualComposeData.services?.[`web-${suffix}`]?.extends;
	if (typeof webExtends !== "string") {
		expect(webExtends?.service).toBe(`base_service-${suffix}`);
	}

	// Verificar que el servicio `base_service` también tiene el prefijo
	expect(actualComposeData.services).toHaveProperty(`base_service-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("base_service");
	expect(actualComposeData.services?.[`base_service-${suffix}`]?.image).toBe(
		"base:latest",
	);
});
