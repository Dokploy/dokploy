// import {
// 	addPrefixToServiceObjectVolumes,
// 	addPrefixToServiceVolumes,
// 	addPrefixToVolumesRoot,
// 	generateRandomHash,
// } from "@/server/utils/docker/compose";
// import type { ComposeSpecification } from "@/server/utils/docker/types";
// import { load } from "js-yaml";
// import { expect, test } from "vitest";

// const composeFile = `
// services:
//   mail:
//     image: bytemark/smtp
//     restart: always

//   plausible_db:
//     image: postgres:14-alpine
//     restart: always
//     volumes:
//       - db-data:/var/lib/postgresql/data
//     environment:
//       - POSTGRES_PASSWORD=postgres

//   plausible_events_db:
//     image: clickhouse/clickhouse-server:23.3.7.5-alpine
//     restart: always
//     volumes:
//       - event-data:/var/lib/clickhouse
//       - event-logs:/var/log/clickhouse-server
//       - ./clickhouse/clickhouse-config.xml:/etc/clickhouse-server/config.d/logging.xml:ro
//       - ./clickhouse/clickhouse-user-config.xml:/etc/clickhouse-server/users.d/logging.xml:ro
//     ulimits:
//       nofile:
//         soft: 262144
//         hard: 262144

//   plausible:
//     image: plausible/analytics:v2.0
//     restart: always
//     command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
//     depends_on:
//       - plausible_db
//       - plausible_events_db
//       - mail
//     ports:
//       - 127.0.0.1:8000:8000
//     env_file:
//       - plausible-conf.env
//     volumes:
//       - type: volume
//         source: plausible-data
//         target: /data

//   mysql:
//     image: mysql:5.7
//     restart: always
//     environment:
//       MYSQL_ROOT_PASSWORD: example
//     volumes:
//       - type: volume
//         source: db-data
//         target: /var/lib/mysql/data

// volumes:
//   db-data:
//     driver: local
//   event-data:
//     driver: local
//   event-logs:
//     driver: local
// `;

// test("Generate random hash with 8 characters", () => {
// 	const hash = generateRandomHash();

// 	expect(hash).toBeDefined();
// 	expect(hash.length).toBe(8);
// });

// // Docker compose needs unique names for services, volumes, networks and containers
// // So base on a input which is a dockercompose file, it should replace the name with a hash and return a new dockercompose file
// test("Add prefix to volumes root property", () => {
// 	const composeData = load(composeFile) as ComposeSpecification;

// 	const prefix = generateRandomHash();

// 	if (!composeData?.volumes) {
// 		return;
// 	}
// 	const volumes = addPrefixToVolumesRoot(composeData.volumes, prefix);

// 	// {
// 	// 	'db-data-af045046': { driver: 'local' },
// 	// 	'event-data-af045046': { driver: 'local' },
// 	// 	'event-logs-af045046': { driver: 'local' }
// 	//   }

// 	expect(volumes).toBeDefined();
// 	for (const volumeKey of Object.keys(volumes)) {
// 		expect(volumeKey).toContain(`-${prefix}`);
// 	}
// });

// test("Add prefix to service volumes", () => {
// 	const composeData = load(composeFile) as ComposeSpecification;

// 	const prefix = generateRandomHash();

// 	if (!composeData?.services) {
// 		return;
// 	}
// 	const volumesServices = addPrefixToServiceVolumes(
// 		composeData.services,
// 		prefix,
// 	);

// 	expect(volumesServices).toBeDefined();
// 	for (const serviceKey of Object.keys(volumesServices)) {
// 		const service = volumesServices[serviceKey];
// 		if (service.volumes) {
// 			for (const volume of service.volumes) {
// 				if (typeof volume === "string") {
// 					const parts = volume.split(":");
// 					if (parts.length > 1 && !parts[0].startsWith("./")) {
// 						expect(parts[0]).toContain(`-${prefix}`);
// 					}
// 				}
// 			}
// 		}
// 	}
// });

// test("Add prefix to service object volumes", () => {
// 	const composeData = load(composeFile) as ComposeSpecification;

// 	const prefix = generateRandomHash();

// 	if (!composeData?.services) {
// 		return;
// 	}
// 	const services = addPrefixToServiceObjectVolumes(
// 		composeData.services,
// 		prefix,
// 	);

// 	expect(services).toBeDefined();
// 	for (const serviceKey of Object.keys(services)) {
// 		const service = services[serviceKey];
// 		if (service.volumes) {
// 			for (const volume of service.volumes) {
// 				if (typeof volume === "object" && volume.type === "volume") {
// 					expect(volume.source).toContain(`-${prefix}`);
// 				}
// 			}
// 		}
// 	}
// });
