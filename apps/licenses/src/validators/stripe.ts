import { z } from "zod";

export const createCheckoutSessionSchema = z.object({
	type: z.enum(["basic", "premium", "business"]),
	serverQuantity: z.number().min(1),
	isAnnual: z.boolean(),
});
