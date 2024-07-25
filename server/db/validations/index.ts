import { z } from "zod";

export const sshKeyCreate = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	publicKey: z.string().regex(/^ssh-rsa\s+([A-Za-z0-9+/=]+)\s*(.*)?$/, {
		message: "Invalid format",
	}),
	privateKey: z
		.string()
		.regex(
			/^-----BEGIN RSA PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)-----END RSA PRIVATE KEY-----$/,
			{
				message: "Invalid format",
			},
		),
});

export const sshKeyUpdate = sshKeyCreate.pick({
	name: true,
	description: true,
});
