import { certificates } from "@dokploy/server/db/schema/certificate";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const certificatesSelectSchema = createSelectSchema(certificates);


export const apiCertificatesCreateOutput = certificatesSelectSchema;

export const apiCertificatesFindOneOutput = certificatesSelectSchema;

export const apiCertificatesFindAllOutput = z.array(certificatesSelectSchema);

export const apiCertificatesUpdateOutput = certificatesSelectSchema;

export const apiCertificatesDeleteOutput = certificatesSelectSchema;