export interface DockerNode {
	ID: string;
	Version: {
		Index: number;
	};
	CreatedAt: string;
	UpdatedAt: string;
	Spec: {
		Name: string;
		Labels: Record<string, string>;
		Role: "worker" | "manager";
		Availability: "active" | "pause" | "drain";
	};
	Description: {
		Hostname: string;
		Platform: {
			Architecture: string;
			OS: string;
		};
		Resources: {
			NanoCPUs: number;
			MemoryBytes: number;
		};
		Engine: {
			EngineVersion: string;
			Plugins: Array<{
				Type: string;
				Name: string;
			}>;
		};
	};
	Status: {
		State: "unknown" | "down" | "ready" | "disconnected";
		Message: string;
		Addr: string;
	};
	ManagerStatus?: {
		Leader: boolean;
		Addr: string;
	};
}
