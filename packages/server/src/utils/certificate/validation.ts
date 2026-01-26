import { TRPCError } from "@trpc/server";

export interface CertificateInfo {
	domains: string[];
	expiresAt: Date | null;
	issuer: string | null;
	subject: string | null;
	isWildcard: boolean;
	isValid: boolean;
	errors: string[];
}

/**
 * Extract domains from certificate data (including SANs)
 */
export const extractDomains = (certData: string): string[] => {
	const domains: string[] = [];
	
	try {
		// Parse certificate to extract CN and SANs
		const certs = certData.split(/-----BEGIN CERTIFICATE-----/).filter(c => c.trim());
		
		for (const cert of certs) {
			const fullCert = `-----BEGIN CERTIFICATE-----${cert}-----END CERTIFICATE-----`;
			const domainsFromCert = extractDomainsFromCert(fullCert);
			domains.push(...domainsFromCert);
		}
	} catch (error) {
		console.error("Error extracting domains:", error);
	}
	
	return [...new Set(domains)]; // Remove duplicates
};

/**
 * Extract domains from a single certificate
 */
const extractDomainsFromCert = (certData: string): string[] => {
	const domains: string[] = [];
	
	try {
		// Decode PEM base64 to DER binary
		const b64 = certData.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
		const der = Buffer.from(b64, "base64");
		
		let offset = 0;
		
		// Helper: read ASN.1 length field
		function readLength(pos: number): { length: number; offset: number } {
			let len = der[pos++];
			if (len & 0x80) {
				const bytes = len & 0x7f;
				len = 0;
				for (let i = 0; i < bytes; i++) {
					len = (len << 8) + der[pos++];
				}
			}
			return { length: len, offset: pos };
		}
		
		// Skip outer certificate sequence
		if (der[offset++] !== 0x30) return domains;
		({ offset } = readLength(offset));
		
		// Skip tbsCertificate sequence
		if (der[offset++] !== 0x30) return domains;
		({ offset } = readLength(offset));
		
		// Skip version, serialNumber, signature, issuer
		for (let i = 0; i < 4; i++) {
			if (der[offset] === 0xa0) {
				// Context-specific tag
				offset++;
				const len = readLength(offset);
				offset = len.offset + len.length;
			} else {
				offset++;
				const len = readLength(offset);
				offset = len.offset + len.length;
			}
		}
		
		// Now we're at subject
		// Extract CN from subject
		const subjectStart = offset;
		if (der[offset++] === 0x30) {
			const subjectLen = readLength(offset);
			const subjectEnd = subjectLen.offset + subjectLen.length;
			const subjectData = der.slice(subjectLen.offset, subjectEnd);
			const subjectStr = extractSubjectFromDER(subjectData);
			if (subjectStr) {
				const cnMatch = subjectStr.match(/CN=([^,]+)/);
				if (cnMatch) {
					const cn = cnMatch[1].trim();
					if (cn && !domains.includes(cn)) {
						domains.push(cn);
					}
				}
			}
			offset = subjectEnd;
		}
		
		// Skip validity
		if (der[offset++] === 0x30) {
			const validityLen = readLength(offset);
			offset = validityLen.offset + validityLen.length;
		}
		
		// Skip subjectPublicKeyInfo
		if (der[offset++] === 0x30) {
			const spkiLen = readLength(offset);
			offset = spkiLen.offset + spkiLen.length;
		}
		
		// Look for extensions (context-specific tag [3])
		while (offset < der.length) {
			if (der[offset] === 0xa3) {
				offset++;
				const extLen = readLength(offset);
				const extEnd = extLen.offset + extLen.length;
				const extData = der.slice(extLen.offset, extEnd);
				
				// Parse extensions to find SAN
				const sans = extractSANsFromExtensions(extData);
				for (const san of sans) {
					if (san && !domains.includes(san)) {
						domains.push(san);
					}
				}
				offset = extEnd;
			} else {
				break;
			}
		}
	} catch (error) {
		console.error("Error parsing certificate for domains:", error);
	}
	
	return domains;
};

/**
 * Extract subject from DER-encoded data
 */
const extractSubjectFromDER = (data: Uint8Array): string | null => {
	try {
		// Simple extraction - look for printable strings in the subject
		let result = "";
		for (let i = 0; i < data.length; i++) {
			if (data[i] === 0x0c || data[i] === 0x13 || data[i] === 0x16) {
				// UTF8String, PrintableString, or IA5String
				i++;
				if (i < data.length) {
					const len = data[i] & 0x7f;
					if (len > 0 && len < 200) {
						const str = new TextDecoder().decode(data.slice(i + 1, i + 1 + len));
						if (str.includes("=")) {
							result += str;
						}
						i += len;
					}
				}
			}
		}
		return result || null;
	} catch {
		return null;
	}
};

/**
 * Extract SANs from extensions
 */
const extractSANsFromExtensions = (extData: Uint8Array): string[] => {
	const sans: string[] = [];
	
	try {
		let offset = 0;
		
		function readLength(pos: number): { length: number; offset: number } {
			let len = extData[pos++];
			if (len & 0x80) {
				const bytes = len & 0x7f;
				len = 0;
				for (let i = 0; i < bytes; i++) {
					len = (len << 8) + extData[pos++];
				}
			}
			return { length: len, offset: pos };
		}
		
		// Extensions sequence
		if (extData[offset++] !== 0x30) return sans;
		const { offset: extSeqOffset } = readLength(offset);
		offset = extSeqOffset;
		
		// Iterate through extensions
		while (offset < extData.length) {
			if (extData[offset++] === 0x30) {
				const extLen = readLength(offset);
				const extEnd = extLen.offset + extLen.length;
				
				// Extension: SEQUENCE { extnID, critical, extnValue }
				// extnID for SAN is 2.5.29.17 (id-ce-subjectAltName)
				// Look for OCTET STRING containing the SAN
				let extOffset = extLen.offset;
				while (extOffset < extEnd) {
					if (extData[extOffset] === 0x04) {
						// OCTET STRING
						extOffset++;
						const octetLen = readLength(extOffset);
						const sanData = extData.slice(octetLen.offset, octetLen.offset + octetLen.length);
						
						// Parse SAN GeneralNames
						const names = parseGeneralNames(sanData);
						sans.push(...names);
						break;
					}
					extOffset++;
				}
				offset = extEnd;
			} else {
				break;
			}
		}
	} catch (error) {
		console.error("Error parsing SANs:", error);
	}
	
	return sans;
};

/**
 * Parse GeneralNames from SAN extension
 */
const parseGeneralNames = (data: Uint8Array): string[] => {
	const names: string[] = [];
	
	try {
		let offset = 0;
		
		function readLength(pos: number): { length: number; offset: number } {
			let len = data[pos++];
			if (len & 0x80) {
				const bytes = len & 0x7f;
				len = 0;
				for (let i = 0; i < bytes; i++) {
					len = (len << 8) + data[pos++];
				}
			}
			return { length: len, offset: pos };
		}
		
		// GeneralNames is a SEQUENCE OF
		if (data[offset++] === 0x30) {
			const { offset: seqOffset } = readLength(offset);
			offset = seqOffset;
			
			while (offset < data.length) {
				// Each GeneralName is a CHOICE with context-specific tags
				// dNSName is [2] IMPLICIT IA5String
				if (data[offset] === 0x82) {
					offset++;
					const len = readLength(offset);
					const name = new TextDecoder().decode(
						data.slice(len.offset, len.offset + len.length),
					);
					if (name && !names.includes(name)) {
						names.push(name);
					}
					offset = len.offset + len.length;
				} else {
					// Skip other GeneralName types
					offset++;
					const len = readLength(offset);
					offset = len.offset + len.length;
				}
			}
		}
	} catch (error) {
		console.error("Error parsing GeneralNames:", error);
	}
	
	return names;
};

/**
 * Extract expiration date from certificate
 */
export const extractExpirationDate = (certData: string): Date | null => {
	try {
		// Use the first certificate in chain for expiration
		const firstCert = certData.split(/-----BEGIN CERTIFICATE-----/)[1];
		if (!firstCert) return null;
		
		const fullCert = `-----BEGIN CERTIFICATE-----${firstCert}-----END CERTIFICATE-----`;
		
		// Decode PEM base64 to DER binary
		const b64 = fullCert.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
		const der = Buffer.from(b64, "base64");
		
		let offset = 0;
		
		function readLength(pos: number): { length: number; offset: number } {
			let len = der[pos++];
			if (len & 0x80) {
				const bytes = len & 0x7f;
				len = 0;
				for (let i = 0; i < bytes; i++) {
					len = (len << 8) + der[pos++];
				}
			}
			return { length: len, offset: pos };
		}
		
		// Skip outer certificate sequence
		if (der[offset++] !== 0x30) return null;
		({ offset } = readLength(offset));
		
		// Skip tbsCertificate sequence
		if (der[offset++] !== 0x30) return null;
		({ offset } = readLength(offset));
		
		// Skip version if present
		if (der[offset] === 0xa0) {
			offset++;
			const versionLen = readLength(offset);
			offset = versionLen.offset + versionLen.length;
		}
		
		// Skip serialNumber, signature, issuer
		for (let i = 0; i < 3; i++) {
			if (der[offset] !== 0x30 && der[offset] !== 0x02) return null;
			offset++;
			const fieldLen = readLength(offset);
			offset = fieldLen.offset + fieldLen.length;
		}
		
		// Validity sequence
		if (der[offset++] !== 0x30) return null;
		const validityLen = readLength(offset);
		offset = validityLen.offset;
		
		// Skip notBefore
		offset++;
		const notBeforeLen = readLength(offset);
		offset = notBeforeLen.offset + notBeforeLen.length;
		
		// notAfter
		offset++;
		const notAfterLen = readLength(offset);
		const notAfterStr = new TextDecoder().decode(
			der.slice(notAfterLen.offset, notAfterLen.offset + notAfterLen.length),
		);
		
		// Parse time
		function parseTime(str: string): Date {
			if (str.length === 13) {
				const year = Number.parseInt(str.slice(0, 2), 10);
				const fullYear = year < 50 ? 2000 + year : 1900 + year;
				return new Date(
					`${fullYear}-${str.slice(2, 4)}-${str.slice(4, 6)}T${str.slice(6, 8)}:${str.slice(8, 10)}:${str.slice(10, 12)}Z`,
				);
			}
			if (str.length === 15) {
				return new Date(
					`${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}Z`,
				);
			}
			throw new Error("Invalid time format");
		}
		
		return parseTime(notAfterStr);
	} catch (error) {
		console.error("Error extracting expiration date:", error);
		return null;
	}
};

/**
 * Extract issuer from certificate
 */
export const extractIssuer = (certData: string): string | null => {
	try {
		const firstCert = certData.split(/-----BEGIN CERTIFICATE-----/)[1];
		if (!firstCert) return null;
		
		const fullCert = `-----BEGIN CERTIFICATE-----${firstCert}-----END CERTIFICATE-----`;
		const b64 = fullCert.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
		const der = Buffer.from(b64, "base64");
		
		// Simplified extraction - look for issuer in the certificate
		// This is a simplified version; full parsing would be more complex
		const certStr = new TextDecoder().decode(der);
		const issuerMatch = certStr.match(/O=([^,]+)/);
		if (issuerMatch) {
			return issuerMatch[1].trim();
		}
		
		return "Unknown";
	} catch {
		return null;
	}
};

/**
 * Extract subject from certificate
 */
export const extractSubject = (certData: string): string | null => {
	try {
		const firstCert = certData.split(/-----BEGIN CERTIFICATE-----/)[1];
		if (!firstCert) return null;
		
		const fullCert = `-----BEGIN CERTIFICATE-----${firstCert}-----END CERTIFICATE-----`;
		const b64 = fullCert.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
		const der = Buffer.from(b64, "base64");
		
		const certStr = new TextDecoder().decode(der);
		const subjectMatch = certStr.match(/CN=([^,]+)/);
		if (subjectMatch) {
			return subjectMatch[1].trim();
		}
		
		return null;
	} catch {
		return null;
	}
};

/**
 * Check if domain is a wildcard
 */
export const isWildcardDomain = (domain: string): boolean => {
	return domain.trim().startsWith("*.");
};

/**
 * Check if certificate contains wildcard domains
 */
export const hasWildcardDomain = (domains: string[]): boolean => {
	return domains.some(domain => isWildcardDomain(domain));
};

/**
 * Validate certificate data format
 */
export const validateCertificateFormat = (certData: string, privateKey: string): {
	isValid: boolean;
	errors: string[];
} => {
	const errors: string[] = [];
	
	if (!certData || !certData.trim()) {
		errors.push("Certificate data is required");
	}
	
	if (!privateKey || !privateKey.trim()) {
		errors.push("Private key is required");
	}
	
	// Check for PEM format
	if (certData && !certData.includes("-----BEGIN CERTIFICATE-----")) {
		errors.push("Certificate data must be in PEM format");
	}
	
	if (privateKey && !privateKey.includes("-----BEGIN")) {
		errors.push("Private key must be in PEM format");
	}
	
	// Basic validation - check if we can extract expiration
	if (certData && certData.includes("-----BEGIN CERTIFICATE-----")) {
		const expiration = extractExpirationDate(certData);
		if (!expiration) {
			errors.push("Could not parse certificate expiration date");
		} else if (expiration < new Date()) {
			errors.push("Certificate has already expired");
		}
	}
	
	return {
		isValid: errors.length === 0,
		errors,
	};
};

/**
 * Extract comprehensive certificate information
 */
export const extractCertificateInfo = (certData: string, privateKey: string): CertificateInfo => {
	const errors: string[] = [];
	
	// Validate format
	const formatValidation = validateCertificateFormat(certData, privateKey);
	if (!formatValidation.isValid) {
		errors.push(...formatValidation.errors);
	}
	
	// Extract domains
	const domains = extractDomains(certData);
	if (domains.length === 0) {
		errors.push("No domains found in certificate");
	}
	
	// Extract expiration
	const expiresAt = extractExpirationDate(certData);
	if (!expiresAt) {
		errors.push("Could not extract expiration date");
	}
	
	// Extract issuer and subject
	const issuer = extractIssuer(certData);
	const subject = extractSubject(certData);
	
	// Check for wildcard
	const isWildcard = hasWildcardDomain(domains);
	
	return {
		domains,
		expiresAt,
		issuer,
		subject,
		isWildcard,
		isValid: errors.length === 0,
		errors,
	};
};

