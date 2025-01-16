export interface ServiceConfig {
	appName: string;
	retentionDays: number;
}

export interface MonitoringConfig {
	includeServices: ServiceConfig[];
	excludeServices: string[];
}

export interface Container {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
}

export interface ProcessedContainer {
	timestamp: string;
	BlockIO: {
		read: number;
		write: number;
		readUnit: string;
		writeUnit: string;
	};
	CPU: number;
	Container: string;
	ID: string;
	Memory: {
		percentage: number;
		used: number;
		total: number;
		unit: string;
	};
	Name: string;
	Network: {
		input: number;
		output: number;
		inputUnit: string;
		outputUnit: string;
	};
}
