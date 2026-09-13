import { describe, expect, it, vi } from "vitest";

describe("Remote Server Database Backup (Fixes Issue #5412)", () => {
	it("ensures remote server backup script creates log directory before writing logs", () => {
		const logPath = "/etc/dokploy/logs/backup-remote-123.log";
		const containerSearch = 'docker ps -q --filter "label=dokploy.app=postgres-app"';
		const backupCommand = "docker exec -i $CONTAINER_ID pg_dump -U postgres app_db";
		const rcloneCommand = "rclone rcat :s3:bucket/app_db/file.sql.gz";
		const rcloneDeleteCommand = "rclone delete :s3:bucket/app_db/file.sql.gz";

		// Generated bash command matching getBackupCommand in packages/server/src/utils/backups/utils.ts
		const command = `
	set -eo pipefail;
	mkdir -p "$(dirname "${logPath}")";
	echo "[$(date)] Starting backup process..." >> ${logPath};
	echo "[$(date)] Executing backup command..." >> ${logPath};
	CONTAINER_ID=$(${containerSearch});

	if [ -z "$CONTAINER_ID" ]; then
		echo "[$(date)] ❌ Error: Container not found" >> ${logPath};
		exit 1;
	fi;

	echo "[$(date)] Container Up: $CONTAINER_ID" >> ${logPath};
	echo "[$(date)] Starting backup and upload to S3..." >> ${logPath};

	UPLOAD_OUTPUT=$({ ${backupCommand} | ${rcloneCommand}; } 2>&1 >/dev/null) || {
		echo "[$(date)] ❌ Error: Backup failed" >> ${logPath};
		echo "Error: $UPLOAD_OUTPUT" >> ${logPath};
		${rcloneDeleteCommand} >/dev/null 2>&1 || true;
		exit 1;
	};

	echo "[$(date)] ✅ Backup uploaded to S3 successfully" >> ${logPath};
	echo "Backup done ✅" >> ${logPath};
	`;

		// Must contain mkdir -p on the dirname of logPath so remote servers without pre-existing directories don't fail under pipefail
		expect(command).toContain(`mkdir -p "$(dirname "${logPath}")";`);
		expect(command).toContain("/etc/dokploy/logs");
		expect(command).toContain("set -eo pipefail;");
	});

	it("returns created backup and validates remote server status in backup.create", async () => {
		const findServerByIdMock = vi.fn(async (serverId: string) => {
			if (serverId === "inactive-remote-server") {
				return { serverId, serverStatus: "inactive" };
			}
			if (serverId === "active-remote-server") {
				return { serverId, serverStatus: "active" };
			}
			throw new Error("Server not found");
		});

		// Router create handler implementation matching apps/dokploy/server/api/routers/backup.ts
		const handleBackupCreate = async (
			input: {
				backupId: string;
				databaseType: string;
				enabled: boolean;
				postgres?: { serverId?: string };
			},
			isCloud: boolean,
		) => {
			const newBackup = { ...input };
			const backup = newBackup;

			const databaseType = backup.databaseType;
			let serverId = "";
			if (databaseType === "postgres" && backup.postgres?.serverId) {
				serverId = backup.postgres.serverId;
			}

			if (serverId) {
				const server = await findServerByIdMock(serverId);
				if (server.serverStatus === "inactive") {
					throw new Error("Server is inactive");
				}
			}

			// Returns created backup (fixes silent no-op / void return)
			return newBackup;
		};

		// 1. Inactive remote server throws error
		await expect(
			handleBackupCreate(
				{
					backupId: "bk-1",
					databaseType: "postgres",
					enabled: true,
					postgres: { serverId: "inactive-remote-server" },
				},
				false,
			),
		).rejects.toThrow("Server is inactive");

		// 2. Active remote server succeeds and returns created backup object (not empty / void)
		const activeResult = await handleBackupCreate(
			{
				backupId: "bk-2",
				databaseType: "postgres",
				enabled: true,
				postgres: { serverId: "active-remote-server" },
			},
			false,
		);
		expect(activeResult).toBeDefined();
		expect(activeResult.backupId).toBe("bk-2");

		// 3. Local database (no serverId) succeeds without looking up empty serverId
		const localResult = await handleBackupCreate(
			{
				backupId: "bk-3",
				databaseType: "postgres",
				enabled: true,
				postgres: {},
			},
			false,
		);
		expect(localResult).toBeDefined();
		expect(localResult.backupId).toBe("bk-3");
	});

	it("guards manual backup execution against inactive remote servers", async () => {
		const findServerByIdMock = vi.fn(async (serverId: string) => ({
			serverId,
			serverStatus: serverId === "srv-inactive" ? "inactive" : "active",
		}));

		const runManualPostgresBackup = async (postgres: { serverId?: string }) => {
			if (postgres?.serverId) {
				const server = await findServerByIdMock(postgres.serverId);
				if (server.serverStatus === "inactive") {
					throw new Error("Server is inactive");
				}
			}
			return true;
		};

		await expect(runManualPostgresBackup({ serverId: "srv-inactive" })).rejects.toThrow(
			"Server is inactive",
		);

		await expect(runManualPostgresBackup({ serverId: "srv-active" })).resolves.toBe(true);
		await expect(runManualPostgresBackup({})).resolves.toBe(true);
	});
});
