import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const hasOpenSsl = () => {
	try {
		execFileSync("openssl", ["version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

/**
 * A self-signed certificate for the given names, and its key, as PEM.
 */
export const issueCertificate = (names: string[], days = 30) => {
	// Through files, not /dev/stdout: a child of Node writes to a socket, which
	// Linux does not open by that name.
	const folder = mkdtempSync(join(tmpdir(), "certificate-"));
	const read = (name: string) =>
		readFileSync(join(folder, name), "utf8").trim();
	try {
		execFileSync(
			"openssl",
			[
				"req",
				"-x509",
				"-newkey",
				"ec",
				"-pkeyopt",
				"ec_paramgen_curve:prime256v1",
				"-nodes",
				"-days",
				String(days),
				"-subj",
				`/CN=${names[0]}`,
				"-addext",
				`subjectAltName=${names.map((name) => `DNS:${name}`).join(",")}`,
				"-keyout",
				join(folder, "key"),
				"-out",
				join(folder, "certificate"),
			],
			{ stdio: "ignore" },
		);
		return { certificate: read("certificate"), key: read("key") };
	} finally {
		rmSync(folder, { recursive: true });
	}
};
