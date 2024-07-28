import { load } from "js-yaml";
import { expect, test } from "vitest";
import { generateRandomHash } from "~/server/utils/docker/compose";
import { addPrefixToVolumesInServices } from "~/server/utils/docker/compose/volume";
import type { ComposeSpecification } from "~/server/utils/docker/types";

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

test("Add prefix to volumes declared directly in services", () => {
	const composeData = load(composeFile1) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addPrefixToVolumesInServices(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };
	expect(actualComposeData.services?.db?.volumes).toContain(
		`db_data-${prefix}:/var/lib/postgresql/data`,
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

test("Add prefix to volumes declared directly in services (Case 2)", () => {
	const composeData = load(composeFileTypeVolume) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData.services) {
		return;
	}

	const updatedComposeData = addPrefixToVolumesInServices(
		composeData.services,
		prefix,
	);
	const actualComposeData = { ...composeData, services: updatedComposeData };

	expect(actualComposeData.services?.db?.volumes).toEqual([
		{
			type: "volume",
			source: `db-test-${prefix}`,
			target: "/var/lib/postgresql/data",
		},
	]);
});
