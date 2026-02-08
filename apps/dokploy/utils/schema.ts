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
