import { security } from "@dokploy/server/db/schema/security";
import { createSelectSchema } from "drizzle-zod";


const securitySelectSchema = createSelectSchema(security);

export const apiCreateSecurityOutput = securitySelectSchema;

export const apiFindOneSecurityOutput = securitySelectSchema;

export const apiUpdateSecurityOutput = securitySelectSchema;

export const apiDeleteSecurityOutput = securitySelectSchema;
