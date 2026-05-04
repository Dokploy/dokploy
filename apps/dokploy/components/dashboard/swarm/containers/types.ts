export interface ContainerStat {
	BlockIO: string;
	CPUPerc: string;
	Container: string;
	ID: string;
	MemPerc: string;
	MemUsage: string;
	Name: string;
	NetIO: string;
}

export interface ContainerInfo {
	Name: string;
	Image: string;
	Node: string;
	CurrentState: string;
	DesiredState: string;
	Ports: string;
	Error: string;
	ID: string;
}

export interface SwarmNode {
	ID: string;
	Hostname: string;
	Status: string;
	Availability: string;
	ManagerStatus: string;
}

export interface NodeGroup {
	nodeName: string;
	containers: ContainerInfo[];
	nodeStatus?: SwarmNode;
}
