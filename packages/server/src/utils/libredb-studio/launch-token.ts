import { createHmac, randomBytes } from "node:crypto";

export type StudioRole = "admin" | "user";

export const LAUNCH_TOKEN_ISSUER = "dokploy";
export const LAUNCH_TOKEN_TTL_SECONDS = 60;

// Studio refuses to verify with a LAUNCH_TOKEN_SECRET shorter than this, so a
// token signed with a shorter secret could never be used.
const LAUNCH_SECRET_MIN_LENGTH = 32;
const CONNECTION_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

const encodeSegment = (value: Record<string, unknown>): string =>
	Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

export const createLaunchToken = (input: {
	secret: string;
	libredbStudioId: string;
	userId: string;
	email: string;
	role: StudioRole;
	connectionId?: string;
	now?: Date;
}): string => {
	if (input.secret.length < LAUNCH_SECRET_MIN_LENGTH) {
		throw new Error(
			`The LibreDB Studio launch secret must be at least ${LAUNCH_SECRET_MIN_LENGTH} characters long`,
		);
	}
	if (
		input.connectionId !== undefined &&
		!CONNECTION_ID_PATTERN.test(input.connectionId)
	) {
		throw new Error(
			`"${input.connectionId}" is not a LibreDB Studio connection id: it must match ${CONNECTION_ID_PATTERN}`,
		);
	}
	const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
	// Studio refuses any other typ before it checks the signature, so a launch
	// token can never pass as another JWT type.
	const header = encodeSegment({ alg: "HS256", typ: "libredb-launch+jwt" });
	const payload = encodeSegment({
		iss: LAUNCH_TOKEN_ISSUER,
		aud: input.libredbStudioId,
		sub: input.userId,
		email: input.email,
		role: input.role,
		...(input.connectionId !== undefined && { conn: input.connectionId }),
		iat: issuedAt,
		exp: issuedAt + LAUNCH_TOKEN_TTL_SECONDS,
		jti: randomBytes(16).toString("base64url"),
	});
	const signingInput = `${header}.${payload}`;
	// Studio verifies with the UTF-8 bytes of LAUNCH_TOKEN_SECRET, so the hex
	// secret is used as text and never decoded to the bytes it spells.
	const signature = createHmac("sha256", Buffer.from(input.secret, "utf8"))
		.update(signingInput)
		.digest("base64url");
	return `${signingInput}.${signature}`;
};
