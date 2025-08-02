// @ts-nocheck

export const extractExpirationDate = (certData: string): Date | null => {
	try {
		// Decode PEM base64 to DER binary
		const b64 = certData.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
		const binStr = atob(b64);
		const der = new Uint8Array(binStr.length);
		for (let i = 0; i < binStr.length; i++) {
			der[i] = binStr.charCodeAt(i);
		}

		let offset = 0;

		// Helper: read ASN.1 length field
		function readLength(pos: number): { length: number; offset: number } {
			// biome-ignore lint/style/noParameterAssign: <explanation>
			let len = der[pos++];
			if (len & 0x80) {
				const bytes = len & 0x7f;
				len = 0;
				for (let i = 0; i < bytes; i++) {
					// biome-ignore lint/style/noParameterAssign: <explanation>
					len = (len << 8) + der[pos++];
				}
			}
			return { length: len, offset: pos };
		}

		// Skip the outer certificate sequence
		if (der[offset++] !== 0x30) throw new Error("Expected sequence");
		({ offset } = readLength(offset));

		// Skip tbsCertificate sequence
		if (der[offset++] !== 0x30) throw new Error("Expected tbsCertificate");
		({ offset } = readLength(offset));

		// Check for optional version field (context-specific tag [0])
		if (der[offset] === 0xa0) {
			offset++;
			const versionLen = readLength(offset);
			offset = versionLen.offset + versionLen.length;
		}

		// Skip serialNumber, signature, issuer
		for (let i = 0; i < 3; i++) {
			if (der[offset] !== 0x30 && der[offset] !== 0x02)
				throw new Error("Unexpected structure");
			offset++;
			const fieldLen = readLength(offset);
			offset = fieldLen.offset + fieldLen.length;
		}

		// Validity sequence (notBefore and notAfter)
		if (der[offset++] !== 0x30) throw new Error("Expected validity sequence");
		const validityLen = readLength(offset);
		offset = validityLen.offset;

		// notBefore
		offset++;
		const notBeforeLen = readLength(offset);
		offset = notBeforeLen.offset + notBeforeLen.length;

		// notAfter
		offset++;
		const notAfterLen = readLength(offset);
		const notAfterStr = new TextDecoder().decode(
			der.slice(notAfterLen.offset, notAfterLen.offset + notAfterLen.length),
		);

		// Parse GeneralizedTime (15 chars) or UTCTime (13 chars)
		function parseTime(str: string): Date {
			if (str.length === 13) {
				// UTCTime YYMMDDhhmmssZ
				const year = Number.parseInt(str.slice(0, 2), 10);
				const fullYear = year < 50 ? 2000 + year : 1900 + year;
				return new Date(
					`${fullYear}-${str.slice(2, 4)}-${str.slice(4, 6)}T${str.slice(6, 8)}:${str.slice(8, 10)}:${str.slice(10, 12)}Z`,
				);
			}
			if (str.length === 15) {
				// GeneralizedTime YYYYMMDDhhmmssZ
				return new Date(
					`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}Z`,
				);
			}
			throw new Error("Invalid ASN.1 time format");
		}

		return parseTime(notAfterStr);
	} catch (error) {
		console.error("Error parsing certificate:", error);
		return null;
	}
};

export const getExpirationStatus = (certData: string) => {
	const expirationDate = extractExpirationDate(certData);

	if (!expirationDate)
		return {
			status: "unknown" as const,
			className: "text-muted-foreground",
			message: "Could not determine expiration",
		};

	const now = new Date();
	const daysUntilExpiration = Math.ceil(
		(expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (daysUntilExpiration < 0) {
		return {
			status: "expired" as const,
			className: "text-red-500",
			message: `Expired on ${expirationDate.toLocaleDateString([], {
				year: "numeric",
				month: "long",
				day: "numeric",
			})}`,
		};
	}

	if (daysUntilExpiration <= 30) {
		return {
			status: "warning" as const,
			className: "text-yellow-500",
			message: `Expires in ${daysUntilExpiration} days`,
		};
	}

	return {
		status: "valid" as const,
		className: "text-muted-foreground",
		message: `Expires ${expirationDate.toLocaleDateString([], {
			year: "numeric",
			month: "long",
			day: "numeric",
		})}`,
	};
};

export const getCertificateChainInfo = (certData: string) => {
	const certCount = (certData.match(/-----BEGIN CERTIFICATE-----/g) || [])
		.length;
	return certCount > 1
		? {
				isChain: true,
				count: certCount,
			}
		: {
				isChain: false,
				count: 1,
			};
};
