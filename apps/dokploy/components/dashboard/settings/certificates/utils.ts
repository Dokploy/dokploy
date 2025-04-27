export const extractExpirationDate = (certData: string): Date | null => {
	try {
		const match = certData.match(
			/-----BEGIN CERTIFICATE-----\s*([^-]+)\s*-----END CERTIFICATE-----/,
		);
		if (!match?.[1]) return null;

		const base64Cert = match[1].replace(/\s/g, "");
		const binaryStr = window.atob(base64Cert);
		const bytes = new Uint8Array(binaryStr.length);

		for (let i = 0; i < binaryStr.length; i++) {
			bytes[i] = binaryStr.charCodeAt(i);
		}

		// ASN.1 tag for UTCTime is 0x17, GeneralizedTime is 0x18
		// We need to find the second occurrence of either tag as it's the "not after" (expiration) date
		let dateFound = false;
		for (let i = 0; i < bytes.length - 2; i++) {
			// Look for sequence containing validity period (0x30)
			if (bytes[i] === 0x30) {
				// Check next bytes for UTCTime or GeneralizedTime
				let j = i + 1;
				while (j < bytes.length - 2) {
					if (bytes[j] === 0x17 || bytes[j] === 0x18) {
						const dateType = bytes[j];
						const dateLength = bytes[j + 1];
						if (typeof dateLength === "undefined") break;

						if (!dateFound) {
							// Skip "not before" date
							dateFound = true;
							j += dateLength + 2;
							continue;
						}

						// Found "not after" date
						let dateStr = "";
						for (let k = 0; k < dateLength; k++) {
							const charCode = bytes[j + 2 + k];
							if (typeof charCode === "undefined") continue;
							dateStr += String.fromCharCode(charCode);
						}

						if (dateType === 0x17) {
							// UTCTime (YYMMDDhhmmssZ)
							const year = Number.parseInt(dateStr.slice(0, 2));
							const fullYear = year >= 50 ? 1900 + year : 2000 + year;
							return new Date(
								Date.UTC(
									fullYear,
									Number.parseInt(dateStr.slice(2, 4)) - 1,
									Number.parseInt(dateStr.slice(4, 6)),
									Number.parseInt(dateStr.slice(6, 8)),
									Number.parseInt(dateStr.slice(8, 10)),
									Number.parseInt(dateStr.slice(10, 12)),
								),
							);
						}

						// GeneralizedTime (YYYYMMDDhhmmssZ)
						return new Date(
							Date.UTC(
								Number.parseInt(dateStr.slice(0, 4)),
								Number.parseInt(dateStr.slice(4, 6)) - 1,
								Number.parseInt(dateStr.slice(6, 8)),
								Number.parseInt(dateStr.slice(8, 10)),
								Number.parseInt(dateStr.slice(10, 12)),
								Number.parseInt(dateStr.slice(12, 14)),
							),
						);
					}
					j++;
				}
			}
		}
		return null;
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
