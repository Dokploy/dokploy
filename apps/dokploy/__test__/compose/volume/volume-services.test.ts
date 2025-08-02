import type { ComposeSpecification } from "@dokploy/server";
import {
	addSuffixToVolumesInServices,
	generateRandomHash,
} from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

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
	const composeData = load(composeFile1) as ComposeSpecification;

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
	const composeData = load(composeFileTypeVolume) as ComposeSpecification;

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
