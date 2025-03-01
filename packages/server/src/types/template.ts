export interface TemplateConfig {
	variables: Record<string, string>;
	domains: Array<{
		serviceName: string;
		port: number;
		path?: string;
		host?: string;
	}>;
	env: Record<string, string>;
	mounts: Array<{
		filePath: string;
		content: string;
	}>;
}

export interface Template {
	metadata: {
		id: string;
		name: string;
		description: string;
		version: string;
		logo: string;
		links: {
			github: string;
			website?: string;
			docs?: string;
		};
		tags: string[];
	};
	variables: Record<string, string>;
	config: {
		domains: Array<{
			serviceName: string;
			port: number;
			path?: string;
			host?: string;
		}>;
		env: Record<string, string>;
		mounts?: Array<{
			filePath: string;
			content: string;
		}>;
	};
}
