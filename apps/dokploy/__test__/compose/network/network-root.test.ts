import type { ComposeSpecification } from "@dokploy/server";
import { addSuffixToNetworksRoot, generateRandomHash } from "@dokploy/server";
import { load } from "js-yaml";
import { expect, test } from "vitest";

const composeFile = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend

networks:
  frontend:
    driver: bridge
    driver_opts:
      com.docker.network.driver.mtu: 1200

  backend:
    driver: bridge
    attachable: true

  external_network:
    external: true

`;

test("Generate random hash with 8 characters", () => {
	const hash = generateRandomHash();

	expect(hash).toBeDefined();
	expect(hash.length).toBe(8);
});

test("Add suffix to networks root property", () => {
	const composeData = load(composeFile) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const volumeKey of Object.keys(networks)) {
		expect(volumeKey).toContain(`-${suffix}`);
	}
});

const composeFile2 = `
version: "3.8"

services:
  app:
    image: myapp:latest
    networks:
      - app_net

networks:
  app_net:
    driver: bridge
    driver_opts:
      com.docker.network.driver.mtu: 1500
    ipam:
      driver: default
      config:
        - subnet: 172.20.0.0/16

  database_net:
    driver: overlay
    attachable: true

  monitoring_net:
    driver: bridge
    internal: true
`;

test("Add suffix to advanced networks root property (2 TRY)", () => {
	const composeData = load(composeFile2) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const networkKey of Object.keys(networks)) {
		expect(networkKey).toContain(`-${suffix}`);
	}
});

const composeFile3 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend
      - backend

networks:
  frontend:
    external:
      name: my_external_network

  backend:
    driver: bridge
    labels:
      - "com.example.description=Backend network"
      - "com.example.environment=production"

  external_network:
    external: true
`;

test("Add suffix to networks with external properties", () => {
	const composeData = load(composeFile3) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const networkKey of Object.keys(networks)) {
		expect(networkKey).toContain(`-${suffix}`);
	}
});

const composeFile4 = `
version: "3.8"

services:
  db:
    image: postgres:13
    networks:
      - db_net

networks:
  db_net:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.1.0/24
        - gateway: 192.168.1.1
        - aux_addresses:
            host1: 192.168.1.2
            host2: 192.168.1.3

  external_network:
    external: true
`;

test("Add suffix to networks with IPAM configurations", () => {
	const composeData = load(composeFile4) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const networkKey of Object.keys(networks)) {
		expect(networkKey).toContain(`-${suffix}`);
	}
});

const composeFile5 = `
version: "3.8"

services:
  api:
    image: myapi:latest
    networks:
      - api_net

networks:
  api_net:
    driver: bridge
    options:
      com.docker.network.bridge.name: br0
    enable_ipv6: true
    ipam:
      driver: default
      config:
        - subnet: "2001:db8:1::/64"
        - gateway: "2001:db8:1::1"

  external_network:
    external: true
`;

test("Add suffix to networks with custom options", () => {
	const composeData = load(composeFile5) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const networkKey of Object.keys(networks)) {
		expect(networkKey).toContain(`-${suffix}`);
	}
});

const composeFile6 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend

networks:
  frontend:
    driver: bridge
    driver_opts:
      com.docker.network.driver.mtu: 1200

  backend:
    driver: bridge
    attachable: true

  external_network:
    external: true
`;

// Expected compose file with static suffix `testhash`
const expectedComposeFile6 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - frontend-testhash

networks:
  frontend-testhash:
    driver: bridge
    driver_opts:
      com.docker.network.driver.mtu: 1200

  backend-testhash:
    driver: bridge
    attachable: true

  external_network-testhash:
    external: true
`;

test("Add suffix to networks with static suffix", () => {
	const composeData = load(composeFile6) as ComposeSpecification;

	const suffix = "testhash";

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	const expectedComposeData = load(
		expectedComposeFile6,
	) as ComposeSpecification;
	expect(networks).toStrictEqual(expectedComposeData.networks);
});

const composeFile7 = `
version: "3.8"

services:
  web:
    image: nginx:latest
    networks:
      - dokploy-network

networks:
  dokploy-network:
`;

test("It shoudn't add suffix to dokploy-network", () => {
	const composeData = load(composeFile7) as ComposeSpecification;

	const suffix = generateRandomHash();

	if (!composeData?.networks) {
		return;
	}
	const networks = addSuffixToNetworksRoot(composeData.networks, suffix);

	expect(networks).toBeDefined();
	for (const networkKey of Object.keys(networks)) {
		expect(networkKey).toContain("dokploy-network");
	}
});
