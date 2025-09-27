import { organization } from "@dokploy/server/db/schema/account";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const organizationSelectSchema = createSelectSchema(organization);

export const apiCreateOrganizationOutput = organizationSelectSchema;

export const apiFindOneOrganizationOutput = organizationSelectSchema;

export const apiFindAllOrganizationsOutput = z.array(organizationSelectSchema);

export const apiUpdateOrganizationOutput = organizationSelectSchema;

export const apiDeleteOrganizationOutput = organizationSelectSchema;
