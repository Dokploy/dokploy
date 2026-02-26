import {
	createVolumeBackupSchema,
	updateVolumeBackupSchema,
} from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("volume backup schema storage class field", () => {
	it("allows create payload without storage class", () => {
		const parsed = createVolumeBackupSchema.safeParse({
			name: "Volume Backup",
			volumeName: "my-volume",
			prefix: "backups/",
			serviceType: "application",
			appName: "volume-backup-test",
			turnOff: false,
			cronExpression: "0 0 * * *",
			enabled: true,
			applicationId: "app-id",
			destinationId: "destination-id",
		});

		expect(parsed.success).toBe(true);
	});

	it("accepts storage class when present", () => {
		const parsed = createVolumeBackupSchema.safeParse({
			name: "Volume Backup",
			volumeName: "my-volume",
			prefix: "backups/",
			serviceType: "application",
			appName: "volume-backup-test",
			turnOff: false,
			cronExpression: "0 0 * * *",
			enabled: true,
			applicationId: "app-id",
			destinationId: "destination-id",
			storageClass: "GLACIER",
		});

		expect(parsed.success).toBe(true);
	});

	it("allows update payload without storage class", () => {
		const parsed = updateVolumeBackupSchema.safeParse({
			volumeBackupId: "volume-backup-id",
			name: "Volume Backup",
			volumeName: "my-volume",
			prefix: "backups/",
			serviceType: "application",
			appName: "volume-backup-test",
			turnOff: false,
			cronExpression: "0 0 * * *",
			enabled: true,
			applicationId: "app-id",
			destinationId: "destination-id",
		});

		expect(parsed.success).toBe(true);
	});
});
