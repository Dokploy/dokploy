import { domains } from "@dokploy/server/db/schema/domain";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const domainSelectSchema = createSelectSchema(domains);

export const apiCreateDomainOutput = domainSelectSchema;

export const apiFindDomainsOutput = z.array(domainSelectSchema);

export const apiFindOneDomainOutput = domainSelectSchema;

export const apiUpdateDomainOutput = domainSelectSchema;

export const apiDeleteDomainOutput = domainSelectSchema;
