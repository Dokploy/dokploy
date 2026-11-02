import { z } from "zod";
import { serviceType } from "./mount";

export const apiTransferService = z.object({
	serviceType: z.enum(serviceType.enumValues),
	serviceId: z.string().min(1),
	targetServerId: z.string().min(1).nullable(),
	removeSourceData: z.boolean().default(false),
});
