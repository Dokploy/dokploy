import {
	buildPostgresSslArgs,
	buildPostgresSslCertScript,
	buildPostgresSslHba,
	buildPostgresSslSan,
	getSslCertMount,
	POSTGRES_SSL_MOUNT_PATH,
} from "@dokploy/server/utils/databases/postgres-ssl";
import { describe, expect, it } from "vitest";

describe("buildPostgresSslArgs", () => {
	it("returns undefined when SSL is disabled", () => {
		expect(
			buildPostgresSslArgs({ command: null, args: null, sslMode: "disabled" }),
		).toBeUndefined();
	});

	it("returns undefined when a custom command owns the invocation", () => {
		expect(
			buildPostgresSslArgs({
				command: "docker-entrypoint.sh postgres -c work_mem=4MB",
				args: null,
				sslMode: "required",
			}),
		).toBeUndefined();
	});

	it("starts from postgres when there are no args", () => {
		expect(
			buildPostgresSslArgs({ command: null, args: [], sslMode: "optional" }),
		).toEqual([
			"postgres",
			"-c",
			"ssl=on",
			"-c",
			`ssl_cert_file=${POSTGRES_SSL_MOUNT_PATH}/server.crt`,
			"-c",
			`ssl_key_file=${POSTGRES_SSL_MOUNT_PATH}/server.key`,
		]);
	});

	it("keeps user args and appends the SSL flags", () => {
		expect(
			buildPostgresSslArgs({
				command: null,
				args: ["postgres", "-c", "max_connections=200"],
				sslMode: "optional",
			}),
		).toEqual([
			"postgres",
			"-c",
			"max_connections=200",
			"-c",
			"ssl=on",
			"-c",
			`ssl_cert_file=${POSTGRES_SSL_MOUNT_PATH}/server.crt`,
			"-c",
			`ssl_key_file=${POSTGRES_SSL_MOUNT_PATH}/server.key`,
		]);
	});

	it("adds the hba_file flag only in required mode", () => {
		const optional = buildPostgresSslArgs({
			command: null,
			args: null,
			sslMode: "optional",
		});
		const required = buildPostgresSslArgs({
			command: null,
			args: null,
			sslMode: "required",
		});
		expect(optional).not.toContain(
			`hba_file=${POSTGRES_SSL_MOUNT_PATH}/pg_hba.conf`,
		);
		expect(required?.slice(-2)).toEqual([
			"-c",
			`hba_file=${POSTGRES_SSL_MOUNT_PATH}/pg_hba.conf`,
		]);
	});
});

describe("getSslCertMount", () => {
	it("binds the certificate directory into the container", () => {
		expect(getSslCertMount("/etc/dokploy/applications/pg-1/ssl")).toEqual({
			Type: "bind",
			Source: "/etc/dokploy/applications/pg-1/ssl",
			Target: POSTGRES_SSL_MOUNT_PATH,
		});
	});
});

describe("buildPostgresSslHba", () => {
	it("only allows TLS over TCP while keeping local and loopback working", () => {
		const hba = buildPostgresSslHba();
		expect(hba).toContain("local all all trust");
		expect(hba).toContain("host all all 127.0.0.1/32 trust");
		expect(hba).toContain("hostssl all all all md5");
		expect(hba).not.toMatch(/^host all all all/m);
	});
});

describe("buildPostgresSslSan", () => {
	it("covers the service name, localhost and loopback", () => {
		expect(buildPostgresSslSan({ appName: "pg-1" })).toBe(
			"DNS:pg-1,DNS:localhost,IP:127.0.0.1",
		);
	});

	it("adds the server IP as IP when it is an address", () => {
		expect(buildPostgresSslSan({ appName: "pg-1", serverIp: "1.2.3.4" })).toBe(
			"DNS:pg-1,DNS:localhost,IP:127.0.0.1,IP:1.2.3.4",
		);
	});

	it("adds the server address as DNS when it is a hostname", () => {
		expect(
			buildPostgresSslSan({ appName: "pg-1", serverIp: "db.example.com" }),
		).toBe("DNS:pg-1,DNS:localhost,IP:127.0.0.1,DNS:db.example.com");
	});
});

describe("buildPostgresSslCertScript", () => {
	const base = {
		sslDir: "/etc/dokploy/applications/pg-1/ssl",
		san: "DNS:pg-1,DNS:localhost,IP:127.0.0.1",
		appName: "pg-1",
	};

	it("generates a CA and a signed server cert and drops the CA key", () => {
		const script = buildPostgresSslCertScript({ ...base, required: false });
		expect(script).toContain("openssl req -x509");
		expect(script).toContain("openssl x509 -req");
		expect(script).toContain("subjectAltName=%s");
		expect(script).toContain(
			'rm -f "$SSL_DIR/server.csr" "$SSL_DIR/server.ext" "$SSL_DIR/ca.key"',
		);
		expect(script).not.toContain("chown");
		expect(script).toContain('chmod 600 "$SSL_DIR"/*.key');
		expect(script).toContain('cat "$SSL_DIR/ca.crt"');
		expect(script).not.toContain("pg_hba.conf <<");
	});

	it("skips generation when certificates already exist", () => {
		const script = buildPostgresSslCertScript({ ...base, required: false });
		expect(script).toContain('if [ ! -f "$SSL_DIR/server.crt" ]');
	});

	it("writes the TLS-only pg_hba.conf in required mode", () => {
		const script = buildPostgresSslCertScript({ ...base, required: true });
		expect(script).toContain("DOKPLOY_PG_HBA");
		expect(script).toContain("hostssl all all all md5");
	});

	it("quotes paths and subject names with spaces", () => {
		const script = buildPostgresSslCertScript({
			sslDir: "/tmp/my dir/ssl",
			san: "DNS:pg-1",
			appName: "pg 1",
			required: false,
		});
		expect(script).toContain(`SSL_DIR='/tmp/my dir/ssl'`);
		expect(script).toContain(`CA_CN='pg 1-ca'`);
	});
});
