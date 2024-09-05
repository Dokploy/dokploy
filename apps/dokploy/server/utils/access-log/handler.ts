import { findAdmin, updateAdmin } from "@/server/api/services/admin";
import { DYNAMIC_TRAEFIK_PATH } from "@/server/constants";
import { type RotatingFileStream, createStream } from "rotating-file-stream";
import { execAsync } from "../process/execAsync";

class LogRotationManager {
	private static instance: LogRotationManager;
	private stream: RotatingFileStream | null = null;

	private constructor() {
		this.initialize().catch(console.error);
	}

	public static getInstance(): LogRotationManager {
		if (!LogRotationManager.instance) {
			LogRotationManager.instance = new LogRotationManager();
		}
		return LogRotationManager.instance;
	}

	private async initialize(): Promise<void> {
		const isActive = await this.getStateFromDB();
		if (isActive) {
			await this.activateStream();
		}
		console.log(`Log rotation initialized. Active: ${isActive}`);
	}

	private async getStateFromDB(): Promise<boolean> {
		const setting = await findAdmin();
		return setting?.enableLogRotation ?? false;
	}

	private async setStateInDB(active: boolean): Promise<void> {
		const admin = await findAdmin();
		await updateAdmin(admin.authId, {
			enableLogRotation: active,
		});
	}

	private async activateStream(): Promise<void> {
		if (this.stream) {
			await this.deactivateStream();
		}

		this.stream = createStream("access.log", {
			size: "100M",
			interval: "1d",
			path: DYNAMIC_TRAEFIK_PATH,
			rotate: 6,
			compress: "gzip",
		});

		this.stream.on("rotation", this.handleRotation.bind(this));
	}

	private async deactivateStream(): Promise<void> {
		return new Promise<void>((resolve) => {
			if (this.stream) {
				this.stream.end(() => {
					this.stream = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	public async activate(): Promise<boolean> {
		const currentState = await this.getStateFromDB();
		if (currentState) {
			return true;
		}

		await this.setStateInDB(true);
		await this.activateStream();
		return true;
	}

	public async deactivate(): Promise<boolean> {
		console.log("Deactivating log rotation...");
		const currentState = await this.getStateFromDB();
		if (!currentState) {
			console.log("Log rotation is already inactive in DB");
			return true;
		}

		await this.setStateInDB(false);
		await this.deactivateStream();
		console.log("Log rotation deactivated successfully");
		return true;
	}

	private async handleRotation() {
		try {
			const status = await this.getStatus();
			if (!status) {
				await this.deactivateStream();
			}
			await execAsync(
				"docker kill -s USR1 $(docker ps -q --filter name=traefik)",
			);
			console.log("USR1 Signal send to Traefik");
		} catch (error) {
			console.error("Error to send USR1 Signal to Traefik:", error);
		}
	}
	public async getStatus(): Promise<boolean> {
		const dbState = await this.getStateFromDB();
		return dbState;
	}
}
export const logRotationManager = LogRotationManager.getInstance();
