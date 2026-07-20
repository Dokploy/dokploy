export interface TraefikLogEntry {
	ClientAddr: string;
	ClientHost: string;
	ClientPort: string;
	ClientUsername: string;
	DownstreamContentSize: number;
	DownstreamStatus: number;
	Duration: number;
	OriginContentSize: number;
	OriginDuration: number;
	OriginStatus: number;
	Overhead: number;
	RequestAddr: string;
	RequestContentSize: number;
	RequestCount: number;
	RequestHost: string;
	RequestMethod: string;
	RequestPath: string;
	RequestPort: string;
	RequestProtocol: string;
	RequestScheme: string;
	RetryAttempts: number;
	RouterName: string;
	ServiceAddr: string;
	ServiceName: string;
	ServiceURL: {
		Scheme: string;
		Opaque: string;
		User: null;
		Host: string;
		Path: string;
		RawPath: string;
		ForceQuery: boolean;
		RawQuery: string;
		Fragment: string;
		RawFragment: string;
	};
	StartLocal: string;
	StartUTC: string;
	downstream_Content_Type: string;
	entryPointName: string;
	level: string;
	msg: string;
	origin_Content_Type: string;
	request_Content_Type: string;
	request_User_Agent: string;
	time: string;
}

export interface CaddyRawAccessLogEntry {
	level?: string;
	ts?: number;
	logger?: string;
	msg?: string;
	server_name?: string;
	request?: {
		remote_ip?: string;
		remote_port?: string;
		client_ip?: string;
		proto?: string;
		method?: string;
		host?: string;
		uri?: string;
		tls?: unknown;
		headers?: Record<string, string[]>;
	};
	bytes_read?: number;
	duration?: number;
	size?: number;
	status?: number;
	resp_headers?: Record<string, string[]>;
}

export type LogEntry = TraefikLogEntry & {
	Provider?: "traefik" | "caddy";
};
