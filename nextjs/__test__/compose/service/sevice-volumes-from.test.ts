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

test("Add prefix to service names with volumes_from in compose file", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

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
	expect(actualComposeData.services[`web-${prefix}`].image).toBe(
		"nginx:latest",
	);
	expect(actualComposeData.services[`api-${prefix}`].image).toBe(
		"myapi:latest",
	);

	// Verificar que los nombres en volumes_from tienen el prefijo
	expect(actualComposeData.services[`web-${prefix}`].volumes_from).toContain(
		`shared-${prefix}`,
	);
	expect(actualComposeData.services[`api-${prefix}`].volumes_from).toContain(
		`shared-${prefix}`,
	);

	// Verificar que el servicio shared también tiene el prefijo
	expect(actualComposeData.services).toHaveProperty(`shared-${prefix}`);
	expect(actualComposeData.services).not.toHaveProperty("shared");
	expect(actualComposeData.services[`shared-${prefix}`].image).toBe("busybox");
});
