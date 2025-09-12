import { ports } from "@dokploy/server/db/schema/port";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const portsSelectSchema = createSelectSchema(ports);

export const apiCreatePortOutput = portsSelectSchema;

export const apiFindOnePortOutput = portsSelectSchema;

export const apiFindAllPortsOutput = z.array(portsSelectSchema);

export const apiUpdatePortOutput = portsSelectSchema;

export const apiDeletePortOutput = portsSelectSchema;