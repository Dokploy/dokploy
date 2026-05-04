import { z } from "zod";
import { zfd } from "zod-form-data";

if (typeof window === "undefined") {
	void (async () => {
		const undici = await import("undici");
		globalThis.File = undici.File as any;
		// @ts-ignore
		globalThis.FileList = undici.FileList as any;
	})();
}

export const APP_NAME_REGEX = /^[a-z](?!.*--)([a-z0-9-]*[a-z0-9])?$/;
export const APP_NAME_MESSAGE =
	"App name supports lowercase letters, numbers, '-' and must start with a letter, end with a letter or number, and cannot contain consecutive '-'";

export const uploadFileSchema = zfd.formData({
	applicationId: z.string().optional(),
	zip: zfd.file(),
	dropBuildPath: z.string().optional(),
});

export type UploadFile = z.infer<typeof uploadFileSchema>;

export const uploadFileToContainerSchema = zfd.formData({
	containerId: z
		.string()
		.min(1)
		.regex(/^[a-zA-Z0-9.\-_]+$/, "Invalid container ID"),
	file: zfd.file(),
	destinationPath: z.string().min(1),
	serverId: z.string().optional(),
});

export type UploadFileToContainer = z.infer<typeof uploadFileToContainerSchema>;
