import type { z } from "zod";
import { apiRestoreBackup } from "@dokploy/server/db/schema";
import { findBackupForRestore } from "@dokploy/server/services/backup";
import { findGpgKeyById } from "@dokploy/server/services/gpg-key";
import { findVolumeBackupForRestore } from "@dokploy/server/services/volume-backups";
import {
        getComposeContainerCommand,
        getServiceContainerCommand,
} from "../backups/utils";

interface GpgOptions {
        privateKey?: string;
        passphrase?: string;
}

const trimOrUndefined = (value?: string | null) => {
        const trimmed = value?.trim();
        return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const resolveStoredGpgSecrets = async (
        gpgKey:
                | {
                          privateKey: string | null;
                          passphrase: string | null;
                  }
                | null
                | undefined,
        gpgKeyId?: string | null,
) => {
        const initialPrivateKey = trimOrUndefined(gpgKey?.privateKey);
        const initialPassphrase = trimOrUndefined(gpgKey?.passphrase);

        if (!gpgKeyId) {
                return { privateKey: initialPrivateKey, passphrase: initialPassphrase };
        }

        try {
                const fullKey = await findGpgKeyById(gpgKeyId);
                return {
                        privateKey: trimOrUndefined(fullKey.privateKey) ?? initialPrivateKey,
                        passphrase: trimOrUndefined(fullKey.passphrase) ?? initialPassphrase,
                };
        } catch (error) {
                console.warn(
                        `Failed to hydrate stored GPG key ${gpgKeyId}:`,
                        error instanceof Error ? error.message : error,
                );
        }

        return { privateKey: initialPrivateKey, passphrase: initialPassphrase };
};

export const resolveBackupGpgMaterial = async (
        backupInput: z.infer<typeof apiRestoreBackup>,
) => {
        const providedPrivateKey = trimOrUndefined(backupInput.gpgPrivateKey);
        const providedPassphrase = trimOrUndefined(backupInput.gpgPassphrase);

        const needsLookup =
                backupInput.backupFile.endsWith(".gpg") &&
                (!providedPrivateKey || !providedPassphrase);

        if (!needsLookup) {
                return {
                        privateKey: providedPrivateKey,
                        passphrase: providedPassphrase,
                };
        }

        const matchingBackup = await findBackupForRestore({
                destinationId: backupInput.destinationId,
                backupFile: backupInput.backupFile,
                databaseId: backupInput.databaseId,
                databaseType: backupInput.databaseType,
                backupType: backupInput.backupType,
        });

        const { privateKey: storedPrivateKey, passphrase: storedPassphrase } =
                await resolveStoredGpgSecrets(matchingBackup?.gpgKey, matchingBackup?.gpgKeyId);

        return {
                privateKey: providedPrivateKey ?? storedPrivateKey,
                passphrase: providedPassphrase ?? storedPassphrase,
        };
};

export const resolveVolumeBackupGpgMaterial = async ({
        destinationId,
        backupFileName,
        serviceId,
        serviceType,
        volumeName,
        gpgPrivateKey,
        gpgPassphrase,
}: {
        destinationId: string;
        backupFileName: string;
        serviceId: string;
        serviceType: Parameters<typeof findVolumeBackupForRestore>[0]["serviceType"];
        volumeName: string;
        gpgPrivateKey?: string;
        gpgPassphrase?: string;
}) => {
        const providedPrivateKey = trimOrUndefined(gpgPrivateKey);
        const providedPassphrase = trimOrUndefined(gpgPassphrase);

        const needsLookup =
                backupFileName.endsWith(".gpg") &&
                (!providedPrivateKey || !providedPassphrase);

        if (!needsLookup) {
                return {
                        privateKey: providedPrivateKey,
                        passphrase: providedPassphrase,
                };
        }

        const matchingVolumeBackup = await findVolumeBackupForRestore({
                destinationId,
                backupFile: backupFileName,
                serviceId,
                serviceType,
                volumeName,
        });

        const { privateKey: storedPrivateKey, passphrase: storedPassphrase } =
                await resolveStoredGpgSecrets(
                        matchingVolumeBackup?.gpgKey,
                        matchingVolumeBackup?.gpgKeyId,
                );

        return {
                privateKey: providedPrivateKey ?? storedPrivateKey,
                passphrase: providedPassphrase ?? storedPassphrase,
        };
};

export const prepareGpgDecryption = ({
        privateKey,
        passphrase,
}: GpgOptions) => {
        const normalizedPrivateKey = privateKey?.trim();
        const normalizedPassphrase = passphrase?.trim();

        if (!normalizedPrivateKey) {
                return {
                        setup: "",
                        decryptCommand: "",
                };
        }

        const setupParts = [
                String.raw`
GPG_TEMP_DIR=$(mktemp -d);
trap 'rm -rf "$GPG_TEMP_DIR"' EXIT;
GPG_PRIVATE_KEY_FILE="$GPG_TEMP_DIR/private.key";
cat <<'EOF' > "$GPG_PRIVATE_KEY_FILE"
${normalizedPrivateKey}
EOF
chmod 600 "$GPG_PRIVATE_KEY_FILE";
gpg --homedir "$GPG_TEMP_DIR" --batch --yes --no-tty --import "$GPG_PRIVATE_KEY_FILE" >/dev/null 2>&1;
`,
        ];

        if (normalizedPassphrase) {
                setupParts.push(
                        String.raw`
GPG_PASSPHRASE_FILE="$GPG_TEMP_DIR/passphrase.txt";
cat <<'EOF' > "$GPG_PASSPHRASE_FILE"
${normalizedPassphrase}
EOF
chmod 600 "$GPG_PASSPHRASE_FILE";
`,
                );
        }

        const decryptParts = [
                String.raw`gpg --homedir "$GPG_TEMP_DIR" --batch --yes --no-tty --pinentry-mode loopback --trust-model always`,
        ];

        if (normalizedPassphrase) {
                decryptParts.push(String.raw`--passphrase-file "$GPG_PASSPHRASE_FILE"`);
        }

        decryptParts.push("--decrypt");

        const decryptCommand = decryptParts.join(" ");

        return {
                setup: setupParts.join("\n"),
                decryptCommand,
        };
};

const BATCH_MODE_ERROR_PATTERNS = [
        "gpg: Sorry, we are in batchmode - can't get input",
        "gpg: can't query passphrase in batch mode",
];

const HEREDOC_PRIVATE_KEY_REGEX = /cat <<'EOF' > "\$GPG_PRIVATE_KEY_FILE"[\s\S]*?EOF/gu;
const HEREDOC_PASSPHRASE_REGEX = /cat <<'EOF' > "\$GPG_PASSPHRASE_FILE"[\s\S]*?EOF/gu;
const PRIVATE_KEY_BLOCK_REGEX =
        /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/gu;

const SENSITIVE_LINE_PATTERNS = [
        /^set -eo pipefail;?$/u,
        /^GPG_TEMP_DIR=.*$/u,
        /^trap 'rm -rf "\$GPG_TEMP_DIR"' EXIT;?$/u,
        /^GPG_PRIVATE_KEY_FILE=.*$/u,
        /^chmod 600 "\$GPG_PRIVATE_KEY_FILE";?$/u,
        /^gpg --homedir "\$GPG_TEMP_DIR".*$/u,
        /^GPG_PASSPHRASE_FILE=.*$/u,
        /^chmod 600 "\$GPG_PASSPHRASE_FILE";?$/u,
        /^GPG_PASSPHRASE_ARG=.*$/u,
        /^rm ".*";?$/u,
];

const sanitizeRestoreErrorMessage = (message: string) => {
        if (!message) {
                return "";
        }

        let sanitized = message
                .replace(HEREDOC_PRIVATE_KEY_REGEX, "[redacted private key]")
                .replace(HEREDOC_PASSPHRASE_REGEX, "[redacted passphrase]")
                .replace(PRIVATE_KEY_BLOCK_REGEX, "[redacted private key]")
                .replace(/command:\s*[^\n\r]+/gu, "command: [redacted]");

        sanitized = sanitized.replace(/Command failed:[\s\S]*/gu, (match) => {
                const newlineIndex = match.indexOf("\n");
                if (newlineIndex === -1) {
                        return "Command failed: [command redacted]";
                }

                const rest = match.slice(newlineIndex + 1);
                return `Command failed: [command redacted]\n${rest}`;
        });

        const lines = sanitized
                .split(/\r?\n/u)
                .map((line) => line.trimEnd())
                .filter((line) => line.trim().length > 0)
                .filter((line) => !SENSITIVE_LINE_PATTERNS.some((pattern) => pattern.test(line)));

        return lines.join("\n");
};

const collectErrorSegments = (error: unknown) => {
        const segments: string[] = [];
        const seen = new Set<string>();

        const pushUnique = (value: unknown) => {
                if (value === undefined || value === null) {
                        return;
                }

                const text = String(value).trim();
                if (!text || seen.has(text)) {
                        return;
                }

                seen.add(text);
                segments.push(text);
        };

        if (typeof error === "object" && error !== null) {
                const maybeError = error as {
                        message?: unknown;
                        stderr?: unknown;
                        stdout?: unknown;
                };
                pushUnique(maybeError.stderr);
                pushUnique(maybeError.stdout);
                pushUnique(maybeError.message);
        }

        if (error instanceof Error) {
                pushUnique(error.message);
        }

        if (segments.length === 0) {
                pushUnique(error);
        }

        return segments.join("\n");
};

export const normalizeGpgError = (error: unknown) => {
        const aggregatedMessage = collectErrorSegments(error);
        const containsBatchModeIssue = BATCH_MODE_ERROR_PATTERNS.some((pattern) =>
                aggregatedMessage.includes(pattern),
        );

        if (containsBatchModeIssue) {
                return new Error(
                        "GPG decryption failed because the private key requires a passphrase. Provide the correct passphrase or store it with the selected GPG key before retrying.",
                        { cause: error instanceof Error ? error : undefined },
                );
        }

        const sanitizedMessage = sanitizeRestoreErrorMessage(aggregatedMessage).trim();

        if (sanitizedMessage) {
                return new Error(sanitizedMessage, {
                        cause: error instanceof Error ? error : undefined,
                });
        }

        return new Error("Restore failed due to an unknown error.", {
                cause: error instanceof Error ? error : undefined,
        });
};

export const getPostgresRestoreCommand = (
	database: string,
	databaseUser: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "pg_restore -U ${databaseUser} -d ${database} -O --clean --if-exists"`;
};

export const getMariadbRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mariadb -u ${databaseUser} -p${databasePassword} ${database}"`;
};

export const getMysqlRestoreCommand = (
	database: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mysql -u root -p${databasePassword} ${database}"`;
};

export const getMongoRestoreCommand = (
	database: string,
	databaseUser: string,
	databasePassword: string,
) => {
	return `docker exec -i $CONTAINER_ID sh -c "mongorestore --username ${databaseUser} --password ${databasePassword} --authenticationDatabase admin --db ${database} --archive"`;
};

export const getComposeSearchCommand = (
	appName: string,
	type: "stack" | "docker-compose" | "database",
	serviceName?: string,
) => {
	if (type === "database") {
		return getServiceContainerCommand(appName || "");
	}
	return getComposeContainerCommand(appName || "", serviceName || "", type);
};

interface DatabaseCredentials {
	database: string;
	databaseUser?: string;
	databasePassword?: string;
}

const generateRestoreCommand = (
	type: "postgres" | "mariadb" | "mysql" | "mongo",
	credentials: DatabaseCredentials,
) => {
	const { database, databaseUser, databasePassword } = credentials;
	switch (type) {
		case "postgres":
			return getPostgresRestoreCommand(database, databaseUser || "");
		case "mariadb":
			return getMariadbRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
			);
		case "mysql":
			return getMysqlRestoreCommand(database, databasePassword || "");
		case "mongo":
			return getMongoRestoreCommand(
				database,
				databaseUser || "",
				databasePassword || "",
			);
	}
};

const getMongoSpecificCommand = (
        rcloneCommand: string,
        restoreCommand: string,
        backupFile: string,
        decryptCommand?: string,
): string => {
        const tempDir = "/tmp/dokploy-restore";
        const originalFileName = backupFile.split("/").pop() || "backup.sql.gz";
        const gzFileName = originalFileName.endsWith(".gpg")
                ? originalFileName.slice(0, -4)
                : originalFileName;
        const decompressedName = gzFileName.replace(/\.gz$/, "");
        const downloadStep = decryptCommand
                ? `${rcloneCommand} | ${decryptCommand} --output "${tempDir}/${gzFileName}"`
                : `${rcloneCommand} "${tempDir}"`;
        return `
rm -rf ${tempDir} && \
mkdir -p ${tempDir} && \
${downloadStep} && \
cd ${tempDir} && \
gunzip -f "${gzFileName}" && \
${restoreCommand} < "${decompressedName}" && \
rm -rf ${tempDir}
        `;
};

interface RestoreOptions {
        appName: string;
        type: "postgres" | "mariadb" | "mysql" | "mongo";
        restoreType: "stack" | "docker-compose" | "database";
        credentials: DatabaseCredentials;
        serviceName?: string;
        rcloneCommand: string;
        backupFile?: string;
        decryptCommand?: string;
}

export const getRestoreCommand = ({
        appName,
        type,
        restoreType,
        credentials,
        serviceName,
        rcloneCommand,
        backupFile,
        decryptCommand,
}: RestoreOptions) => {
	const containerSearch = getComposeSearchCommand(
		appName,
		restoreType,
		serviceName,
	);
	const restoreCommand = generateRestoreCommand(type, credentials);
	let cmd = `CONTAINER_ID=$(${containerSearch})`;

        if (type !== "mongo") {
                cmd += ` && ${rcloneCommand} | ${restoreCommand}`;
        } else {
                cmd += ` && ${getMongoSpecificCommand(
                        rcloneCommand,
                        restoreCommand,
                        backupFile || "",
                        decryptCommand,
                )}`;
        }

	return cmd;
};
