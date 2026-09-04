import { z } from "zod";

export const externalPortFormSchema = z.object({
	externalPort: z.preprocess((a) => {
		if (a === null || a === undefined || a === "") return null;
		const parsed = Number.parseInt(String(a), 10);
		return Number.isNaN(parsed) ? null : parsed;
	}, z
		.number()
		.gte(0, "Range must be 0 - 65535")
		.lte(65535, "Range must be 0 - 65535")
		.nullable()),
});

export type ExternalPortForm = z.infer<typeof externalPortFormSchema>;
