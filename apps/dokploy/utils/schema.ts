import { z } from "zod";
import { zfd } from "zod-form-data";

if (typeof window === "undefined") {
	const undici = require("undici");
	globalThis.File = undici.File as any;
	globalThis.FileList = undici.FileList as any;
}

export const uploadFileSchema = zfd.formData({
	applicationId: z.string().optional(),
	zip: zfd.file(),
	dropBuildPath: z.string().optional(),
});

export type UploadFile = z.infer<typeof uploadFileSchema>;
