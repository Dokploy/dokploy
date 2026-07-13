import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToVolumesInServices,
	generateRandomHash,
} from "@dokploy/server";
import { expect, test } from "vitest";
import { parse } from "yaml";

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

const composeFile1 = `
version: "3.8"

services:
  db:
    image: postgres:latest
    volumes:
      - db_data:/var/lib/postgresql/data
`;

test("Add suffix to volumes declared directly in services", () => {
	const composeData = parse(composeFile1) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToVolumesInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };
	expect(actualComposeData.services?.db?.volumes).toContain(
		`db_data-${suffix}:/var/lib/postgresql/data`,
	);
});

const composeFileReadOnly = `
version: "3.8"

services:
  db:
    image: postgres:latest
    volumes:
      - db_data:/var/lib/postgresql/data:ro
      - config/nginx:/etc/nginx/conf.d:z
`;

test("Preserve access mode when adding suffix to named volumes", () => {
	const composeData = parse(composeFileReadOnly) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToVolumesInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.db?.volumes).toContain(
		`db_data-${suffix}:/var/lib/postgresql/data:ro`,
	);
	expect(actualComposeData.services?.db?.volumes).toContain(
		`config-${suffix}/nginx:/etc/nginx/conf.d:z`,
	);
});

const composeFileTypeVolume = `
version: "3.8"

services:
  db:
    image: postgres:latest
    volumes:
      - type: volume
        source: db-test
        target: /var/lib/postgresql/data

volumes:
  db-test:
    driver: local
`;

test("Add suffix to volumes declared directly in services (Case 2)", () => {
	const composeData = parse(composeFileTypeVolume) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addSuffixToVolumesInServices(
		composeData.services,
		suffix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.db?.volumes).toEqual([
		{
			type: "volume",
			source: `db-test-${suffix}`,
			target: "/var/lib/postgresql/data",
		},
	]);
});
