// @ts-nocheck

// Split certificate chain into individual certificates
export const splitCertificateChain = (certData: string): string[] => {
	const certRegex =
		/(-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----)/g;
	const matches = certData.match(certRegex);
	return matches || [];
};

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

export const extractCommonName = (certData: string): string | null => {
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

		// Helper: skip a field
		function skipField(pos: number): number {
			// biome-ignore lint/style/noParameterAssign: <explanation>
			pos++;
			const fieldLen = readLength(pos);
			return fieldLen.offset + fieldLen.length;
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

		// Skip serialNumber
		offset = skipField(offset);

		// Skip signature
		offset = skipField(offset);

		// Skip issuer
		offset = skipField(offset);

		// Skip validity
		offset = skipField(offset);

		// Subject sequence - where we find the CN
		if (der[offset++] !== 0x30) throw new Error("Expected subject sequence");
		const subjectLen = readLength(offset);
		const subjectEnd = subjectLen.offset + subjectLen.length;
		offset = subjectLen.offset;

		// Parse subject RDNs looking for CN (OID 2.5.4.3)
		while (offset < subjectEnd) {
			if (der[offset++] !== 0x31) continue; // SET
			const setLen = readLength(offset);
			offset = setLen.offset;

			if (der[offset++] !== 0x30) continue; // SEQUENCE
			const seqLen = readLength(offset);
			offset = seqLen.offset;

			if (der[offset++] !== 0x06) continue; // OID
			const oidLen = readLength(offset);
			offset = oidLen.offset;

			// Check if OID is 2.5.4.3 (commonName)
			const oid = Array.from(der.slice(offset, offset + oidLen.length));
			offset += oidLen.length;

			// OID 2.5.4.3 in DER: [0x55, 0x04, 0x03]
			if (
				oid.length === 3 &&
				oid[0] === 0x55 &&
				oid[1] === 0x04 &&
				oid[2] === 0x03
			) {
				// Next should be the string value
				const strType = der[offset++];
				const strLen = readLength(offset);
				const cnBytes = der.slice(strLen.offset, strLen.offset + strLen.length);
				return new TextDecoder().decode(cnBytes);
			}
		}

		return null;
	} catch (error) {
		console.error("Error parsing certificate CN:", error);
		return null;
	}
};

// Extract the Common Name from the first (leaf) certificate in a chain
export const extractLeafCommonName = (certData: string): string | null => {
	const certs = splitCertificateChain(certData);
	if (certs.length === 0) return null;
	return extractCommonName(certs[0]);
};

// Extract expiration dates from all certificates in a chain
export const extractAllExpirationDates = (
	certData: string,
): Array<{
	cert: string;
	index: number;
	expirationDate: Date | null;
	commonName: string | null;
}> => {
	const certs = splitCertificateChain(certData);
	return certs.map((cert, index) => ({
		cert,
		index,
		expirationDate: extractExpirationDate(cert),
		commonName: extractCommonName(cert),
	}));
};

// Get the earliest expiration date from a certificate chain
export const getEarliestExpirationDate = (certData: string): Date | null => {
	const expirationDates = extractAllExpirationDates(certData);
	const validDates = expirationDates
		.filter((item) => item.expirationDate !== null)
		.map((item) => item.expirationDate as Date);

	if (validDates.length === 0) return null;

	return new Date(Math.min(...validDates.map((date) => date.getTime())));
};

export const getExpirationStatus = (certData: string) => {
	const chainInfo = getCertificateChainInfo(certData);
	const expirationDate = chainInfo.isChain
		? getEarliestExpirationDate(certData)
		: extractExpirationDate(certData);

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

// Get detailed expiration information for all certificates in a chain
export const getCertificateChainExpirationDetails = (certData: string) => {
	const allExpirations = extractAllExpirationDates(certData);
	const now = new Date();

	return allExpirations.map(({ index, expirationDate, commonName }) => {
		if (!expirationDate) {
			return {
				index,
				label: `Certificate ${index + 1}`,
				commonName,
				status: "unknown" as const,
				className: "text-muted-foreground",
				message: "Could not determine expiration",
				expirationDate: null,
			};
		}

		const daysUntilExpiration = Math.ceil(
			(expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
		);

		let status: "expired" | "warning" | "valid";
		let className: string;
		let message: string;

		if (daysUntilExpiration < 0) {
			status = "expired";
			className = "text-red-500";
			message = `Expired on ${expirationDate.toLocaleDateString([], {
				year: "numeric",
				month: "long",
				day: "numeric",
			})}`;
		} else if (daysUntilExpiration <= 30) {
			status = "warning";
			className = "text-yellow-500";
			message = `Expires in ${daysUntilExpiration} days`;
		} else {
			status = "valid";
			className = "text-muted-foreground";
			message = `Expires ${expirationDate.toLocaleDateString([], {
				year: "numeric",
				month: "long",
				day: "numeric",
			})}`;
		}

		return {
			index,
			label:
				index === 0
					? `Certificate ${index + 1} (Leaf)`
					: `Certificate ${index + 1}`,
			commonName,
			status,
			className,
			message,
			expirationDate,
			daysUntilExpiration,
		};
	});
};
