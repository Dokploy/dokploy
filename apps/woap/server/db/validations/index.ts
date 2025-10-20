import { z } from "zod";

export const sshKeyCreate = z.object({
	name: z.string().min(1),
	description: z.string().optional(),
	publicKey: z.string().refine(
		(key) => {
			const rsaPubPattern = /^ssh-rsa\s+([A-Za-z0-9+/=]+)\s*(.*)?\s*$/;
			const ed25519PubPattern = /^ssh-ed25519\s+([A-Za-z0-9+/=]+)\s*(.*)?\s*$/;
			return rsaPubPattern.test(key) || ed25519PubPattern.test(key);
		},
		{
			message: "Invalid public key format",
		},
	),
	privateKey: z.string().refine(
		(key) => {
			const rsaPrivPattern =
				/^-----BEGIN RSA PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)-----END RSA PRIVATE KEY-----\s*$/;
			const ed25519PrivPattern =
				/^-----BEGIN OPENSSH PRIVATE KEY-----\n([A-Za-z0-9+/=\n]+)-----END OPENSSH PRIVATE KEY-----\s*$/;
			return rsaPrivPattern.test(key) || ed25519PrivPattern.test(key);
		},
		{
			message: "Invalid private key format",
		},
	),
});

export const sshKeyUpdate = sshKeyCreate.pick({
	name: true,
	description: true,
});

export const sshKeyType = z.object({
	type: z.enum(["rsa", "ed25519"]).optional(),
});
