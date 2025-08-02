import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToServiceNames, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    container_name: web_container

  api:
    image: myapi:latest

networks:
  default:
    driver: bridge
`;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add suffix to service names with container_name in compose file", () => {
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

	// Verificar que el nombre del contenedor ha cambiado correctamente
	expect(actualComposeData.services?.[`web-${suffix}`]?.container_name).toBe(
		`web_container-${suffix}`,
	);
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
});
