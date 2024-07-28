import { load } from "js-yaml";
import { expect, test } from "vitest";
import { generateRandomHash } from "~/server/utils/docker/compose";
import { addPrefixToVolumesRoot } from "~/server/utils/docker/compose/volume";
import type { ComposeSpecification } from "~/server/utils/docker/types";

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    volumes:
      - web_data:/var/lib/nginx/data

volumes:
  web_data:
    driver: local

networks:
  default:
    driver: bridge
`;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add prefix to volumes in root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.volumes) {
		return;
	}
	const volumes = addPrefixToVolumesRoot(composeData.volumes, prefix);
	expect(volumes).toBeDefined();
	for (const volumeKey of Object.keys(volumes)) {
		expect(volumeKey).toContain(`-${prefix}`);
		expect(volumes[volumeKey]).toBeDefined();
	}
});

const composeFile2 = `
version: "3.8"

services:
  app:
    image: node:latest
    volumes:
      - app_data:/var/lib/app/data

volumes:
  app_data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=10.0.0.1,rw
      device: ":/exported/path"

networks:
  default:
    driver: bridge
`;

test("Add prefix to volumes in root property (Case 2)", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.volumes) {
		return;
	}
	const volumes = addPrefixToVolumesRoot(composeData.volumes, prefix);
	expect(volumes).toBeDefined();
	for (const volumeKey of Object.keys(volumes)) {
		expect(volumeKey).toContain(`-${prefix}`);
		expect(volumes[volumeKey]).toBeDefined();
	}
});

const composeFile3 = `
version: "3.8"

services:
  db:
    image: postgres:latest
    volumes:
      - db_data:/var/lib/postgresql/data

volumes:
  db_data:
    external: true

networks:
  default:
    driver: bridge
`;

test("Add prefix to volumes in root property (Case 3)", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

	const prefix = generateRandomHash();

	if (!composeData?.volumes) {
		return;
	}
	const volumes = addPrefixToVolumesRoot(composeData.volumes, prefix);

	expect(volumes).toBeDefined();
	for (const volumeKey of Object.keys(volumes)) {
		expect(volumeKey).toContain(`-${prefix}`);
		expect(volumes[volumeKey]).toBeDefined();
	}
});

const composeFile4 = `
version: "3.8"

services:
  web:
    image: nginx:latest

  app:
    image: node:latest

  db:
    image: postgres:latest

volumes:
  web_data:
    driver: local

  app_data:
    driver: local
    driver_opts:
      type: nfs
      o: addr=10.0.0.1,rw
      device: ":/exported/path"

  db_data:
    external: true


`;

// Expected compose file con el prefijo `testhash`
const expectedComposeFile4 = load(`
version: "3.8"

services:
  web:
    image: nginx:latest

  app:
    image: node:latest

  db:
    image: postgres:latest

volumes:
  web_data-testhash:
    driver: local

  app_data-testhash:
    driver: local
    driver_opts:
      type: nfs
      o: addr=10.0.0.1,rw
      device: ":/exported/path"

  db_data-testhash:
    external: true


`) as ComposeSpecification;

test("Add prefix to volumes in root property", () => {
	const composeData = load(composeFile4) as ComposeSpecification;

	const prefix = "testhash";

	if (!composeData?.volumes) {
		return;
	}
	const volumes = addPrefixToVolumesRoot(composeData.volumes, prefix);
	const updatedComposeData = { ...composeData, volumes };

	// Verificar que el resultado coincide con el archivo esperado
	expect(updatedComposeData).toEqual(expectedComposeFile4);
});
