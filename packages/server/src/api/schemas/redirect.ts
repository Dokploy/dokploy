import { redirects } from "@dokploy/server/db/schema/redirects";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const redirectsSelectSchema = createSelectSchema(redirects);

export const apiCreateRedirectOutput = redirectsSelectSchema;

export const apiFindOneRedirectOutput = redirectsSelectSchema;

export const apiFindAllRedirectsOutput = z.array(redirectsSelectSchema);

export const apiUpdateRedirectOutput = redirectsSelectSchema;

export const apiDeleteRedirectOutput = redirectsSelectSchema;
