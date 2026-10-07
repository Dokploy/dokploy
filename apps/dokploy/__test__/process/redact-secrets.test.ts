import { redactSecrets } from "@dokploy/server/utils/process/redactSecrets";
import { describe, expect, it } from "vitest";

// All key material below is synthetic: these base64 strings decode to the
// literal text "synthetic-test-not-a-real-...-key" and are not real keys.

describe("redactSecrets", () => {
	it("redacts a PEM private key block written to /tmp/id_rsa", () => {
		const secret = "c3ludGhldGljLXRlc3Qtbm90LWEtcmVhbC1wcml2YXRlLWtleQ==";
		const command =
			`echo "-----BEGIN OPENSSH PRIVATE KEY-----\n${secret}\n-----END OPENSSH PRIVATE KEY-----" > /tmp/id_rsa;` +
			"chmod 600 /tmp/id_rsa;git clone --branch main --depth 1 git@example.com:org/repo /code";

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain(secret);
		expect(redacted).toContain("[REDACTED PRIVATE KEY]");
		expect(redacted).toContain("chmod 600 /tmp/id_rsa");
		expect(redacted).toContain("git clone --branch main");
	});

	it("redacts a base64 key piped to base64 -d", () => {
		const secret = "c3ludGhldGljLXRlc3Qtbm90LWEtcmVhbC1jZXJ0LWtleQ==";
		const command = `echo "${secret}" | base64 -d > "/etc/dokploy/cert.key";`;

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain(secret);
		expect(redacted).toContain('echo "[REDACTED]" | base64 -d');
	});

	it("redacts the registry password piped into docker login", () => {
		const password = "s3cr3t-registry-pass";
		const command =
			`echo ok; printf %s '${password}' | docker login 'localhost:5000' -u 'dokploy' --password-stdin || exit 1;` +
			`printf %s '${password}' | docker login --username AWS --password-stdin 'x.dkr.ecr.eu-west-1.amazonaws.com';` +
			`printf %s hunter2 | docker login reg.example.com -u u --password-stdin`;

		const redacted = redactSecrets(command);

		expect(redacted).not.toContain(password);
		expect(redacted).not.toContain("hunter2");
		expect(redacted).toContain(
			`printf %s "[REDACTED]" | docker login 'localhost:5000' -u 'dokploy' --password-stdin`,
		);
		expect(redacted).toContain("docker login --username AWS");
	});

	it("does not touch an ordinary printf pipe", () => {
		const command = "printf %s 'hello' | base64";
		expect(redactSecrets(command)).toBe(command);
	});

	it("leaves commands without secrets untouched", () => {
		const command =
			"git clone --branch main --depth 1 git@github.com:org/repo.git /tmp/code";

		expect(redactSecrets(command)).toBe(command);
	});

	// All credentials below are obviously fake.
	it("redacts rclone S3 credential flags in every quoting form", () => {
		const doubleQuoted = redactSecrets(
			'rclone rcat --s3-access-key-id="AKIAFAKEFAKEFAKE" :s3:b/f',
		);
		expect(doubleQuoted).not.toContain("AKIAFAKEFAKEFAKE");
		expect(doubleQuoted).toContain('--s3-access-key-id="[REDACTED]"');

		// Flag values are always rewritten to a double-quoted placeholder,
		// regardless of the original quoting, which stays valid shell.
		const singleQuoted = redactSecrets(
			"rclone rcat --s3-secret-access-key='secret123' :s3:b/f",
		);
		expect(singleQuoted).not.toContain("secret123");
		expect(singleQuoted).toContain('--s3-secret-access-key="[REDACTED]"');

		const bare = redactSecrets(
			"rclone rcat --s3-session-token=sessFAKE :s3:b/f",
		);
		expect(bare).not.toContain("sessFAKE");
		expect(bare).toContain('--s3-session-token="[REDACTED]"');
	});

	it("keeps non-credential S3 flags intact", () => {
		const command =
			'rclone rcat --s3-region="eu-west-1" --s3-endpoint="https://s3.example.com" :s3:b/f';
		expect(redactSecrets(command)).toBe(command);
	});

	it("redacts SFTP/FTP passwords (space and equals forms)", () => {
		const redacted = redactSecrets(
			"rclone --sftp-pass 'sftpFAKE' --ftp-pass=\"ftpFAKE\" remote:",
		);
		expect(redacted).not.toContain("sftpFAKE");
		expect(redacted).not.toContain("ftpFAKE");
	});

	it("redacts database password env assignments", () => {
		expect(redactSecrets("PGPASSWORD='pgFAKE' pg_dump db")).toContain(
			"PGPASSWORD='[REDACTED]'",
		);
		expect(redactSecrets("MYSQL_PWD=mysqlFAKE mysqldump db")).toContain(
			"MYSQL_PWD=[REDACTED]",
		);
		expect(
			redactSecrets("MONGO_INITDB_ROOT_PASSWORD='mongoFAKE' mongodump"),
		).not.toContain("mongoFAKE");
	});

	it("redacts rclone crypt and config password env vars", () => {
		const redacted = redactSecrets(
			"RCLONE_CRYPT_PASSWORD='cryptFAKE1' RCLONE_CRYPT_PASSWORD2='cryptFAKE2' RCLONE_CONFIG_MYS3_PASS='cfgFAKE' rclone lsf MYS3:",
		);
		expect(redacted).not.toContain("cryptFAKE1");
		expect(redacted).not.toContain("cryptFAKE2");
		expect(redacted).not.toContain("cfgFAKE");
		expect(redacted).toContain("RCLONE_CRYPT_PASSWORD='[REDACTED]'");
		expect(redacted).toContain("RCLONE_CRYPT_PASSWORD2='[REDACTED]'");
	});

	it("redacts Authorization headers", () => {
		const redacted = redactSecrets(
			'curl -H "Authorization: Bearer tokenFAKE" https://example.com',
		);
		expect(redacted).not.toContain("tokenFAKE");
		expect(redacted).toContain("Authorization: [REDACTED]");
	});

	it("scrubs a full generated backup command end to end", () => {
		const command =
			`PGPASSWORD='pgFAKEpass' pg_dump -U dokploy mydb | ` +
			`RCLONE_CRYPT_PASSWORD='cryptFAKE1' RCLONE_CRYPT_PASSWORD2='cryptFAKE2' ` +
			`rclone rcat --s3-access-key-id="AKIAFAKEFAKEFAKE" ` +
			`--s3-secret-access-key="secret123" --s3-session-token="sessFAKE" ` +
			`--s3-region="us-east-1" :s3:my-bucket/daily/db.sql.gz`;

		const redacted = redactSecrets(command);

		for (const secret of [
			"pgFAKEpass",
			"cryptFAKE1",
			"cryptFAKE2",
			"AKIAFAKEFAKEFAKE",
			"secret123",
			"sessFAKE",
		]) {
			expect(redacted).not.toContain(secret);
		}
		// Non-secret context is preserved for diagnosability.
		expect(redacted).toContain('--s3-region="us-east-1"');
		expect(redacted).toContain("pg_dump -U dokploy mydb");
	});

	// Token values below are synthetic and only shaped like the real prefixes.
	it("redacts the token in a git clone URL userinfo (GitHub App, GitLab)", () => {
		const token = "ghs_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";
		const redacted = redactSecrets(
			`git clone --branch main --depth 1 https://oauth2:${token}@github.com/org/repo.git /code --progress`,
		);
		expect(redacted).not.toContain(token);
		expect(redacted).toContain(
			"https://oauth2:[REDACTED]@github.com/org/repo.git /code --progress",
		);

		const gitlab = redactSecrets(
			"https://oauth2:glFAKEaccessToken@gitlab.example.com/group/repo.git",
		);
		expect(gitlab).not.toContain("glFAKEaccessToken");
		expect(gitlab).toContain("https://oauth2:[REDACTED]@gitlab.example.com/");
	});

	it("redacts URL credentials in the shell-escaped form the clone command uses", () => {
		const token = "ghs_FAKEFAKEFAKEFAKEFAKEFAKEFAKE";
		const redacted = redactSecrets(
			`git clone --branch main --depth 1 https\\://oauth2\\:${token}\\@github.com/org/repo.git /code`,
		);
		expect(redacted).not.toContain(token);
		expect(redacted).toContain(
			"https\\://oauth2\\:[REDACTED]\\@github.com/org/repo.git /code",
		);
	});

	it("redacts basic-auth passwords in any URL but keeps user and host", () => {
		const redacted = redactSecrets(
			"docker login https://user:appPassFAKE@registry.example.com:5000/v2/",
		);
		expect(redacted).not.toContain("appPassFAKE");
		expect(redacted).toContain(
			"https://user:[REDACTED]@registry.example.com:5000/v2/",
		);
	});

	it("leaves credential-free URLs and scp-style remotes untouched", () => {
		for (const command of [
			"git clone --branch main https://github.com/org/repo.git /code",
			"git clone git@github.com:org/repo.git /code",
			"curl https://s3.example.com:9000/bucket/key",
		]) {
			expect(redactSecrets(command)).toBe(command);
		}
	});

	it("redacts well-known token prefixes outside a URL", () => {
		const redacted = redactSecrets(
			"git remote set-url origin ghp_FAKEFAKEFAKEFAKEFAKE github_pat_FAKEFAKEFAKE_x glpat-FAKEFAKEFAKE",
		);
		expect(redacted).not.toContain("ghp_FAKE");
		expect(redacted).not.toContain("github_pat_FAKE");
		expect(redacted).not.toContain("glpat-FAKE");
		expect(redacted).toContain(
			"remote set-url origin [REDACTED] [REDACTED] [REDACTED]",
		);
	});
});

describe("redactSecrets shell-quoted values (#5519)", () => {
	it("redacts a double-quoted value that contains escaped quotes", () => {
		const redacted = redactSecrets(
			String.raw`rclone rcat --s3-secret-access-key="say \"hi\" it's" --s3-region=us-east-1`,
		);
		expect(redacted).not.toContain("hi");
		expect(redacted).toContain(
			'--s3-secret-access-key="[REDACTED]" --s3-region=us-east-1',
		);
	});

	it("redacts a DB password assignment that contains escaped quotes", () => {
		const redacted = redactSecrets(
			String.raw`PGPASSWORD="p\"a ss" pg_dump -h db`,
		);
		expect(redacted).not.toContain("ss");
		expect(redacted).toBe('PGPASSWORD="[REDACTED]" pg_dump -h db');
	});

	it("still redacts a value with an unbalanced quote", () => {
		const redacted = redactSecrets('rclone lsf --s3-access-key-id="oops next');
		expect(redacted).not.toContain("oops");
	});
});
