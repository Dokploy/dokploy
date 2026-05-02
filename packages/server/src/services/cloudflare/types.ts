export interface Zone {
	id: string;
	name: string;
	status: string;
	account: { id: string; name: string };
}

export interface DnsRecord {
	id: string;
	zone_id: string;
	zone_name: string;
	name: string;
	type: string;
	content: string;
	proxied: boolean;
	ttl: number;
	comment: string | null;
}

export interface IngressRule {
	hostname?: string;
	path?: string;
	service: string;
	originRequest?: Record<string, unknown>;
}

export interface CloudflareErrorEntry {
	code: number;
	message: string;
}

export interface VerifyTokenResult {
	ok: boolean;
	accountId: string | null;
	scopes: string[];
	expiresOn: string | null;
	status: string;
}

export interface TunnelInfo {
	id: string;
	status: string;
	connections: number;
}

export class CloudflareApiError extends Error {
	readonly status: number;
	readonly errors: CloudflareErrorEntry[];
	readonly code: number | null;
	readonly retryable: boolean;

	constructor(opts: {
		status: number;
		errors: CloudflareErrorEntry[];
		retryable: boolean;
		message?: string;
	}) {
		const first = opts.errors[0];
		const message =
			opts.message ??
			(first ? `${first.code}: ${first.message}` : `HTTP ${opts.status}`);
		super(message);
		this.name = "CloudflareApiError";
		this.status = opts.status;
		this.errors = opts.errors;
		this.code = first ? first.code : null;
		this.retryable = opts.retryable;
	}
}
