import { z } from "zod";

export const apiCreateOwnershipTransfer = z.object({
	email: z.string().email(),
	password: z.string().min(1),
});
