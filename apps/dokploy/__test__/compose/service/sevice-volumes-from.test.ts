import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToServiceNames, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile3 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes_from:
      - shared

  api:
    image: myapi:latest
    volumes_from:
      - shared

  shared:
    image: busybox
    volumes:
      - /data

networks:
  default:
    driver: bridge
`;

test("Add suffix to service names with volumes_from in compose file", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

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

	// Verificar que los nombres en volumes_from tienen el prefijo
	expect(actualComposeData.services?.[`web-${suffix}`]?.volumes_from).toContain(
		`shared-${suffix}`,
	);
	expect(actualComposeData.services?.[`api-${suffix}`]?.volumes_from).toContain(
		`shared-${suffix}`,
	);

	// Verificar que el servicio shared también tiene el prefijo
	expect(actualComposeData.services).toHaveProperty(`shared-${suffix}`);
	expect(actualComposeData.services).not.toHaveProperty("shared");
	expect(actualComposeData.services?.[`shared-${suffix}`]?.image).toBe(
		"busybox",
	);
});
