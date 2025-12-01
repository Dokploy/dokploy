/**
 * KubernetesAdapter - Kubernetes Implementation of IOrchestratorAdapter
 *
 * This adapter provides full Kubernetes support including:
 * - Deployments, Services, and Ingress management
 * - HPA (Horizontal Pod Autoscaler)
 * - Network Policies
 * - Custom Resources (Traefik IngressRoute)
 */

import * as k8s from "@kubernetes/client-node";
import type { IOrchestratorAdapter } from "./base.interface";
import type {
	CustomResource,
	Deployment,
	DeploymentConfig,
	DeploymentStatus,
	HealthStatus,
	HPAConfig,
	HPAStatus,
	Ingress,
	IngressConfig,
	K8sAdapterConfig,
	LogOptions,
	NetworkPolicyConfig,
	OrchestratorType,
	ResourceMetrics,
	Service,
	ServiceConfig,
} from "./types";

export class KubernetesAdapter implements IOrchestratorAdapter {
	private kc: k8s.KubeConfig;
	private appsApi: k8s.AppsV1Api;
	private coreApi: k8s.CoreV1Api;
	private autoscalingApi: k8s.AutoscalingV2Api;
	private networkingApi: k8s.NetworkingV1Api;
	private customObjectsApi: k8s.CustomObjectsApi;
	private metricsApi: k8s.Metrics;
	private config: K8sAdapterConfig;

	constructor(config: K8sAdapterConfig) {
		this.config = config;
		this.kc = new k8s.KubeConfig();

		// Load kubeconfig
		if (config.inCluster) {
			this.kc.loadFromCluster();
		} else if (config.kubeconfig) {
			// Load from string (base64 or raw YAML)
			try {
				const decoded = Buffer.from(config.kubeconfig, "base64").toString("utf8");
				this.kc.loadFromString(decoded);
			} catch {
				// Not base64, try raw YAML
				this.kc.loadFromString(config.kubeconfig);
			}
		} else if (config.kubeconfigPath) {
			this.kc.loadFromFile(config.kubeconfigPath);
		} else {
			this.kc.loadFromDefault();
		}

		// Set context if specified
		if (config.context) {
			this.kc.setCurrentContext(config.context);
		}

		// Initialize API clients
		this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
		this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
		this.autoscalingApi = this.kc.makeApiClient(k8s.AutoscalingV2Api);
		this.networkingApi = this.kc.makeApiClient(k8s.NetworkingV1Api);
		this.customObjectsApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
		this.metricsApi = new k8s.Metrics(this.kc);
	}

	// ==========================================================================
	// Detection & Health
	// ==========================================================================

	async detect(): Promise<OrchestratorType> {
		try {
			await this.coreApi.readNamespace({ name: "default" });
			return "kubernetes";
		} catch {
			return "swarm"; // Fallback if K8s is not available
		}
	}

	async healthCheck(): Promise<HealthStatus> {
		try {
			const versionInfo = await this.coreApi.getAPIVersions();
			const nodes = await this.coreApi.listNode();

			const readyNodes = nodes.items.filter(node =>
				node.status?.conditions?.some(
					c => c.type === "Ready" && c.status === "True"
				)
			);

			return {
				healthy: readyNodes.length > 0,
				message: `Kubernetes cluster is healthy with ${readyNodes.length} ready nodes`,
				details: {
					version: versionInfo.serverAddressByClientCIDRs?.[0]?.serverAddress || "unknown",
					nodes: readyNodes.length,
					apiEndpoint: this.kc.getCurrentCluster()?.server,
					lastCheck: new Date(),
				},
			};
		} catch (error) {
			return {
				healthy: false,
				message: `Failed to connect to Kubernetes: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	async getVersion(): Promise<string> {
		const versionApi = this.kc.makeApiClient(k8s.VersionApi);
		const version = await versionApi.getCode();
		return `${version.major}.${version.minor}`;
	}

	// ==========================================================================
	// Deployment Management
	// ==========================================================================

	async deployApplication(config: DeploymentConfig): Promise<Deployment> {
		const namespace = config.namespace || this.config.namespace;

		// 1. Ensure namespace exists
		await this.ensureNamespace(namespace);

		// 2. Build K8s Deployment manifest
		const deployment = this.buildK8sDeployment(config, namespace);

		// 3. Create or update deployment
		try {
			await this.appsApi.readNamespacedDeployment({
				name: config.name,
				namespace,
			});

			// Update existing deployment
			await this.appsApi.replaceNamespacedDeployment({
				name: config.name,
				namespace,
				body: deployment,
			});
		} catch {
			// Create new deployment
			await this.appsApi.createNamespacedDeployment({
				namespace,
				body: deployment,
			});
		}

		// 4. Create Service
		await this.createService({
			name: config.name,
			namespace,
			selector: { app: config.name },
			ports: config.ports.map(p => ({
				port: p.containerPort,
				targetPort: p.containerPort,
				protocol: p.protocol,
			})),
		});

		// 5. Configure Traefik IngressRoute if domain is specified
		if (config.domain) {
			await this.configureTraefikIngress(config, namespace);
		}

		// 6. Configure HPA if enabled
		if (config.hpa?.enabled) {
			await this.configureHPA({
				...config.hpa,
				name: `${config.name}-hpa`,
				namespace,
				targetName: config.name,
			});
		}

		// 7. Configure Network Policy if specified
		if (config.networkPolicy) {
			await this.createNetworkPolicy({
				...config.networkPolicy,
				namespace,
			});
		}

		// 8. Configure PDB if specified
		if (config.pdb) {
			await this.configurePodDisruptionBudget(config.name, namespace, config.pdb);
		}

		return this.getDeployment(config.name, namespace) as Promise<Deployment>;
	}

	async getDeployment(name: string, namespace?: string): Promise<Deployment | null> {
		const ns = namespace || this.config.namespace;

		try {
			const response = await this.appsApi.readNamespacedDeployment({
				name,
				namespace: ns,
			});

			return this.mapK8sDeployment(response);
		} catch {
			return null;
		}
	}

	async scaleApplication(
		name: string,
		replicas: number,
		namespace?: string,
	): Promise<void> {
		const ns = namespace || this.config.namespace;

		await this.appsApi.patchNamespacedDeploymentScale({
			name,
			namespace: ns,
			body: {
				spec: { replicas },
			},
		});
	}

	async updateApplication(
		name: string,
		config: Partial<DeploymentConfig>,
		namespace?: string,
	): Promise<Deployment> {
		const ns = namespace || this.config.namespace;

		// Get existing deployment
		const existing = await this.appsApi.readNamespacedDeployment({
			name,
			namespace: ns,
		});

		// Build patch
		const patch: k8s.V1Deployment = {
			...existing,
			spec: {
				...existing.spec,
				...(config.replicas && { replicas: config.replicas }),
				template: {
					...existing.spec?.template,
					spec: {
						...existing.spec?.template?.spec,
						containers: [
							{
								...existing.spec?.template?.spec?.containers?.[0],
								...(config.image && { image: config.image }),
								...(config.env && {
									env: Object.entries(config.env).map(([name, value]) => ({
										name,
										value,
									})),
								}),
								...(config.command && { command: config.command }),
								...(config.args && { args: config.args }),
							},
						],
					},
				},
			},
		};

		await this.appsApi.replaceNamespacedDeployment({
			name,
			namespace: ns,
			body: patch,
		});

		return this.getDeployment(name, ns) as Promise<Deployment>;
	}

	async deleteApplication(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;

		// Delete in order: HPA, PDB, NetworkPolicy, Ingress, Service, Deployment
		try {
			await this.deleteHPA(`${name}-hpa`, ns);
		} catch {
			// Ignore if not exists
		}

		try {
			await this.coreApi.deleteNamespacedService({ name, namespace: ns });
		} catch {
			// Ignore if not exists
		}

		try {
			await this.deleteIngress(`${name}-ingress`, ns);
		} catch {
			// Ignore if not exists
		}

		try {
			await this.deleteNetworkPolicy(`${name}-network-policy`, ns);
		} catch {
			// Ignore if not exists
		}

		await this.appsApi.deleteNamespacedDeployment({
			name,
			namespace: ns,
		});
	}

	async rollbackApplication(
		name: string,
		revision?: number,
		namespace?: string,
	): Promise<void> {
		const ns = namespace || this.config.namespace;

		// K8s rollback is done via kubectl rollout undo or patch
		// Using the patch approach to set rollback revision
		const patch = {
			spec: {
				rollbackTo: {
					revision: revision || 0, // 0 = previous version
				},
			},
		};

		await this.appsApi.patchNamespacedDeployment({
			name,
			namespace: ns,
			body: patch,
		});
	}

	async restartApplication(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;

		// Rolling restart by patching an annotation
		const patch = {
			spec: {
				template: {
					metadata: {
						annotations: {
							"kubectl.kubernetes.io/restartedAt": new Date().toISOString(),
						},
					},
				},
			},
		};

		await this.appsApi.patchNamespacedDeployment({
			name,
			namespace: ns,
			body: patch,
		});
	}

	async listDeployments(
		namespace?: string,
		labelSelector?: string,
	): Promise<Deployment[]> {
		const ns = namespace || this.config.namespace;

		const response = await this.appsApi.listNamespacedDeployment({
			namespace: ns,
			labelSelector,
		});

		return response.items.map(d => this.mapK8sDeployment(d));
	}

	// ==========================================================================
	// Service Discovery
	// ==========================================================================

	async createService(config: ServiceConfig): Promise<Service> {
		const namespace = config.namespace || this.config.namespace;

		const service: k8s.V1Service = {
			apiVersion: "v1",
			kind: "Service",
			metadata: {
				name: config.name,
				namespace,
			},
			spec: {
				selector: config.selector,
				type: config.type || "ClusterIP",
				ports: config.ports.map(p => ({
					name: p.name || `port-${p.port}`,
					port: p.port,
					targetPort: p.targetPort,
					protocol: p.protocol || "TCP",
					...(p.nodePort && { nodePort: p.nodePort }),
				})),
			},
		};

		try {
			await this.coreApi.readNamespacedService({
				name: config.name,
				namespace,
			});

			// Update existing
			await this.coreApi.replaceNamespacedService({
				name: config.name,
				namespace,
				body: service,
			});
		} catch {
			// Create new
			await this.coreApi.createNamespacedService({
				namespace,
				body: service,
			});
		}

		return this.getService(config.name, namespace) as Promise<Service>;
	}

	async getService(name: string, namespace?: string): Promise<Service | null> {
		const ns = namespace || this.config.namespace;

		try {
			const response = await this.coreApi.readNamespacedService({
				name,
				namespace: ns,
			});

			return {
				name: response.metadata?.name || name,
				namespace: response.metadata?.namespace,
				type: (response.spec?.type || "ClusterIP") as "ClusterIP" | "NodePort" | "LoadBalancer",
				clusterIP: response.spec?.clusterIP,
				externalIP: response.status?.loadBalancer?.ingress?.map(i => i.ip || i.hostname || ""),
				ports: (response.spec?.ports || []).map(p => ({
					name: p.name,
					port: p.port,
					targetPort: typeof p.targetPort === "number" ? p.targetPort : 0,
					protocol: (p.protocol || "TCP") as "TCP" | "UDP",
					nodePort: p.nodePort,
				})),
				selector: response.spec?.selector || {},
			};
		} catch {
			return null;
		}
	}

	async updateService(
		name: string,
		config: Partial<ServiceConfig>,
		namespace?: string,
	): Promise<Service> {
		const ns = namespace || this.config.namespace;
		const existing = await this.coreApi.readNamespacedService({
			name,
			namespace: ns,
		});

		const updated: k8s.V1Service = {
			...existing,
			spec: {
				...existing.spec,
				...(config.selector && { selector: config.selector }),
				...(config.type && { type: config.type }),
				...(config.ports && {
					ports: config.ports.map(p => ({
						name: p.name || `port-${p.port}`,
						port: p.port,
						targetPort: p.targetPort,
						protocol: p.protocol || "TCP",
					})),
				}),
			},
		};

		await this.coreApi.replaceNamespacedService({
			name,
			namespace: ns,
			body: updated,
		});

		return this.getService(name, ns) as Promise<Service>;
	}

	async deleteService(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;
		await this.coreApi.deleteNamespacedService({ name, namespace: ns });
	}

	// ==========================================================================
	// Ingress/Routing (Traefik)
	// ==========================================================================

	async configureIngress(config: IngressConfig): Promise<Ingress> {
		return this.configureTraefikIngress(
			{
				name: config.name,
				domain: config.domain,
				ports: [{ containerPort: config.servicePort, protocol: "TCP" }],
				image: "",
				replicas: 1,
				env: {},
				ssl: config.ssl,
			},
			config.namespace || this.config.namespace,
		);
	}

	async getIngress(name: string, namespace?: string): Promise<Ingress | null> {
		const ns = namespace || this.config.namespace;

		try {
			// Try to get Traefik IngressRoute first
			const ingressRoute = await this.customObjectsApi.getNamespacedCustomObject({
				group: "traefik.io",
				version: "v1alpha1",
				namespace: ns,
				plural: "ingressroutes",
				name,
			});

			const spec = (ingressRoute as { spec?: { routes?: Array<{ match?: string }> } }).spec;
			const routes = spec?.routes || [];

			return {
				name,
				namespace: ns,
				hosts: routes.map(r => {
					const match = r.match?.match(/Host\(`([^`]+)`\)/);
					return match ? match[1] : "";
				}).filter(Boolean),
				tls: true,
				rules: routes.map(r => ({
					host: r.match?.match(/Host\(`([^`]+)`\)/)?.[1] || "",
					paths: [{
						path: "/",
						pathType: "Prefix" as const,
						serviceName: name,
						servicePort: 80,
					}],
				})),
			};
		} catch {
			// Try native K8s Ingress
			try {
				const ingress = await this.networkingApi.readNamespacedIngress({
					name,
					namespace: ns,
				});

				return {
					name: ingress.metadata?.name || name,
					namespace: ingress.metadata?.namespace,
					hosts: ingress.spec?.rules?.map(r => r.host || "") || [],
					tls: !!ingress.spec?.tls,
					rules: (ingress.spec?.rules || []).map(r => ({
						host: r.host || "",
						paths: (r.http?.paths || []).map(p => ({
							path: p.path || "/",
							pathType: (p.pathType || "Prefix") as "Prefix" | "Exact" | "ImplementationSpecific",
							serviceName: p.backend?.service?.name || "",
							servicePort: p.backend?.service?.port?.number || 80,
						})),
					})),
				};
			} catch {
				return null;
			}
		}
	}

	async deleteIngress(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;

		// Try to delete Traefik IngressRoute first
		try {
			await this.customObjectsApi.deleteNamespacedCustomObject({
				group: "traefik.io",
				version: "v1alpha1",
				namespace: ns,
				plural: "ingressroutes",
				name,
			});
			return;
		} catch {
			// Try native Ingress
		}

		await this.networkingApi.deleteNamespacedIngress({ name, namespace: ns });
	}

	// ==========================================================================
	// Monitoring & Logs
	// ==========================================================================

	async getMetrics(name: string, namespace?: string): Promise<ResourceMetrics | null> {
		const ns = namespace || this.config.namespace;

		try {
			const pods = await this.coreApi.listNamespacedPod({
				namespace: ns,
				labelSelector: `app=${name}`,
			});

			if (pods.items.length === 0) {
				return null;
			}

			const podMetrics = await this.metricsApi.getPodMetrics(ns);
			const appPodMetrics = podMetrics.items.filter(m =>
				pods.items.some(p => p.metadata?.name === m.metadata?.name)
			);

			let totalCPU = 0;
			let totalMemory = 0;
			const containers: ResourceMetrics["containers"] = [];

			for (const pod of appPodMetrics) {
				for (const container of pod.containers || []) {
					const cpuStr = container.usage?.cpu || "0";
					const memStr = container.usage?.memory || "0";

					const cpuNano = this.parseCPUUsage(cpuStr);
					const memBytes = this.parseMemoryUsage(memStr);

					totalCPU += cpuNano;
					totalMemory += memBytes;

					containers.push({
						name: container.name || "unknown",
						cpu: {
							usage: cpuStr,
							usageNanoCores: cpuNano,
						},
						memory: {
							usage: memStr,
							usageBytes: memBytes,
						},
					});
				}
			}

			return {
				name,
				namespace: ns,
				timestamp: new Date(),
				containers,
				totalCPU: `${(totalCPU / 1000000000).toFixed(3)}`,
				totalMemory: `${Math.round(totalMemory / 1024 / 1024)}Mi`,
			};
		} catch {
			return null;
		}
	}

	async getLogs(
		name: string,
		options?: LogOptions,
		namespace?: string,
	): Promise<string[]> {
		const ns = namespace || this.config.namespace;

		// Get pods for the deployment
		const pods = await this.coreApi.listNamespacedPod({
			namespace: ns,
			labelSelector: `app=${name}`,
		});

		if (pods.items.length === 0) {
			return [];
		}

		const podName = pods.items[0]?.metadata?.name;
		if (!podName) {
			return [];
		}

		const response = await this.coreApi.readNamespacedPodLog({
			name: podName,
			namespace: ns,
			container: options?.container,
			tailLines: options?.tailLines,
			sinceSeconds: options?.sinceSeconds,
			timestamps: options?.timestamps,
			previous: options?.previous,
		});

		return (response as string).split("\n").filter(Boolean);
	}

	async streamLogs(
		name: string,
		callback: (log: string) => void,
		options?: LogOptions,
		namespace?: string,
	): Promise<() => void> {
		const ns = namespace || this.config.namespace;

		// Get pods for the deployment
		const pods = await this.coreApi.listNamespacedPod({
			namespace: ns,
			labelSelector: `app=${name}`,
		});

		if (pods.items.length === 0) {
			return () => {};
		}

		const podName = pods.items[0]?.metadata?.name;
		if (!podName) {
			return () => {};
		}

		const log = new k8s.Log(this.kc);
		const stream = await log.log(
			ns,
			podName,
			options?.container || "",
			process.stdout,
			(err) => {
				if (err) {
					console.error("Log stream error:", err);
				}
			},
			{
				follow: true,
				tailLines: options?.tailLines,
				timestamps: options?.timestamps,
			}
		);

		// Note: The actual streaming implementation would need
		// to pipe to a custom writable stream that calls the callback
		// This is a simplified version

		return () => {
			if (stream && typeof stream === "object" && "destroy" in stream) {
				(stream as NodeJS.ReadableStream).destroy();
			}
		};
	}

	// ==========================================================================
	// Autoscaling (HPA)
	// ==========================================================================

	async configureHPA(config: HPAConfig): Promise<void> {
		const namespace = config.namespace || this.config.namespace;

		const hpa: k8s.V2HorizontalPodAutoscaler = {
			apiVersion: "autoscaling/v2",
			kind: "HorizontalPodAutoscaler",
			metadata: {
				name: config.name || `${config.targetName}-hpa`,
				namespace,
			},
			spec: {
				scaleTargetRef: {
					apiVersion: "apps/v1",
					kind: "Deployment",
					name: config.targetName,
				},
				minReplicas: config.minReplicas,
				maxReplicas: config.maxReplicas,
				metrics: [
					...(config.targetCPU
						? [
								{
									type: "Resource" as const,
									resource: {
										name: "cpu",
										target: {
											type: "Utilization" as const,
											averageUtilization: config.targetCPU,
										},
									},
								},
							]
						: []),
					...(config.targetMemory
						? [
								{
									type: "Resource" as const,
									resource: {
										name: "memory",
										target: {
											type: "Utilization" as const,
											averageUtilization: config.targetMemory,
										},
									},
								},
							]
						: []),
				],
				behavior: config.behavior
					? {
							scaleDown: config.behavior.scaleDown
								? {
										stabilizationWindowSeconds:
											config.behavior.scaleDown.stabilizationWindowSeconds,
										policies: config.behavior.scaleDown.policies?.map(p => ({
											type: p.type,
											value: p.value,
											periodSeconds: p.periodSeconds,
										})),
									}
								: undefined,
							scaleUp: config.behavior.scaleUp
								? {
										stabilizationWindowSeconds:
											config.behavior.scaleUp.stabilizationWindowSeconds,
										policies: config.behavior.scaleUp.policies?.map(p => ({
											type: p.type,
											value: p.value,
											periodSeconds: p.periodSeconds,
										})),
									}
								: undefined,
						}
					: {
							scaleDown: {
								stabilizationWindowSeconds: 300,
								policies: [
									{
										type: "Percent",
										value: 50,
										periodSeconds: 60,
									},
								],
							},
							scaleUp: {
								stabilizationWindowSeconds: 0,
								policies: [
									{
										type: "Percent",
										value: 100,
										periodSeconds: 15,
									},
								],
							},
						},
			},
		};

		try {
			await this.autoscalingApi.readNamespacedHorizontalPodAutoscaler({
				name: hpa.metadata!.name!,
				namespace,
			});

			// Update existing
			await this.autoscalingApi.replaceNamespacedHorizontalPodAutoscaler({
				name: hpa.metadata!.name!,
				namespace,
				body: hpa,
			});
		} catch {
			// Create new
			await this.autoscalingApi.createNamespacedHorizontalPodAutoscaler({
				namespace,
				body: hpa,
			});
		}
	}

	async getHPAStatus(name: string, namespace?: string): Promise<HPAStatus | null> {
		const ns = namespace || this.config.namespace;

		try {
			const response = await this.autoscalingApi.readNamespacedHorizontalPodAutoscaler({
				name,
				namespace: ns,
			});

			return {
				currentReplicas: response.status?.currentReplicas || 0,
				desiredReplicas: response.status?.desiredReplicas || 0,
				currentMetrics: response.status?.currentMetrics?.map(m => ({
					name: m.resource?.name || "unknown",
					currentValue: String(m.resource?.current?.averageUtilization || 0),
					targetValue: String(
						response.spec?.metrics?.find(
							sm => sm.resource?.name === m.resource?.name
						)?.resource?.target?.averageUtilization || 0
					),
				})),
				conditions: response.status?.conditions?.map(c => ({
					type: c.type || "",
					status: c.status as "True" | "False" | "Unknown",
					reason: c.reason,
					message: c.message,
				})),
				lastScaleTime: response.status?.lastScaleTime
					? new Date(response.status.lastScaleTime)
					: undefined,
			};
		} catch {
			return null;
		}
	}

	async deleteHPA(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;
		await this.autoscalingApi.deleteNamespacedHorizontalPodAutoscaler({
			name,
			namespace: ns,
		});
	}

	// ==========================================================================
	// Network Policies
	// ==========================================================================

	async createNetworkPolicy(policy: NetworkPolicyConfig): Promise<void> {
		const namespace = policy.namespace || this.config.namespace;

		const networkPolicy: k8s.V1NetworkPolicy = {
			apiVersion: "networking.k8s.io/v1",
			kind: "NetworkPolicy",
			metadata: {
				name: policy.name,
				namespace,
			},
			spec: {
				podSelector: {
					matchLabels: policy.podSelector,
				},
				policyTypes: policy.policyTypes,
				ingress: policy.ingress?.map(rule => ({
					from: rule.from?.map(peer => ({
						...(peer.podSelector && {
							podSelector: { matchLabels: peer.podSelector },
						}),
						...(peer.namespaceSelector && {
							namespaceSelector: { matchLabels: peer.namespaceSelector },
						}),
						...(peer.ipBlock && { ipBlock: peer.ipBlock }),
					})),
					ports: rule.ports?.map(p => ({
						protocol: p.protocol,
						port: p.port,
					})),
				})),
				egress: policy.egress?.map(rule => ({
					to: rule.to?.map(peer => ({
						...(peer.podSelector && {
							podSelector: { matchLabels: peer.podSelector },
						}),
						...(peer.namespaceSelector && {
							namespaceSelector: { matchLabels: peer.namespaceSelector },
						}),
						...(peer.ipBlock && { ipBlock: peer.ipBlock }),
					})),
					ports: rule.ports?.map(p => ({
						protocol: p.protocol,
						port: p.port,
					})),
				})),
			},
		};

		try {
			await this.networkingApi.readNamespacedNetworkPolicy({
				name: policy.name,
				namespace,
			});

			// Update existing
			await this.networkingApi.replaceNamespacedNetworkPolicy({
				name: policy.name,
				namespace,
				body: networkPolicy,
			});
		} catch {
			// Create new
			await this.networkingApi.createNamespacedNetworkPolicy({
				namespace,
				body: networkPolicy,
			});
		}
	}

	async getNetworkPolicy(
		name: string,
		namespace?: string,
	): Promise<NetworkPolicyConfig | null> {
		const ns = namespace || this.config.namespace;

		try {
			const response = await this.networkingApi.readNamespacedNetworkPolicy({
				name,
				namespace: ns,
			});

			return {
				name: response.metadata?.name || name,
				namespace: response.metadata?.namespace,
				podSelector: response.spec?.podSelector?.matchLabels || {},
				policyTypes: (response.spec?.policyTypes || []) as ("Ingress" | "Egress")[],
				ingress: response.spec?.ingress?.map(rule => ({
					from: rule.from?.map(peer => ({
						podSelector: peer.podSelector?.matchLabels,
						namespaceSelector: peer.namespaceSelector?.matchLabels,
						ipBlock: peer.ipBlock as { cidr: string; except?: string[] } | undefined,
					})),
					ports: rule.ports?.map(p => ({
						protocol: p.protocol as "TCP" | "UDP",
						port: p.port as number,
					})),
				})),
				egress: response.spec?.egress?.map(rule => ({
					to: rule.to?.map(peer => ({
						podSelector: peer.podSelector?.matchLabels,
						namespaceSelector: peer.namespaceSelector?.matchLabels,
						ipBlock: peer.ipBlock as { cidr: string; except?: string[] } | undefined,
					})),
					ports: rule.ports?.map(p => ({
						protocol: p.protocol as "TCP" | "UDP",
						port: p.port as number,
					})),
				})),
			};
		} catch {
			return null;
		}
	}

	async deleteNetworkPolicy(name: string, namespace?: string): Promise<void> {
		const ns = namespace || this.config.namespace;
		await this.networkingApi.deleteNamespacedNetworkPolicy({
			name,
			namespace: ns,
		});
	}

	// ==========================================================================
	// Custom Resources
	// ==========================================================================

	async createCustomResource(resource: CustomResource): Promise<CustomResource> {
		const [group, version] = resource.apiVersion.split("/");
		const namespace = resource.metadata.namespace || this.config.namespace;
		const plural = `${resource.kind.toLowerCase()}s`; // Simplified pluralization

		try {
			const result = await this.customObjectsApi.createNamespacedCustomObject({
				group: group || "",
				version: version || resource.apiVersion,
				namespace,
				plural,
				body: resource,
			});

			return result as CustomResource;
		} catch (error) {
			// Try to update if exists
			const result = await this.customObjectsApi.replaceNamespacedCustomObject({
				group: group || "",
				version: version || resource.apiVersion,
				namespace,
				plural,
				name: resource.metadata.name,
				body: resource,
			});

			return result as CustomResource;
		}
	}

	async getCustomResource(
		apiVersion: string,
		kind: string,
		name: string,
		namespace?: string,
	): Promise<CustomResource | null> {
		const ns = namespace || this.config.namespace;
		const [group, version] = apiVersion.split("/");
		const plural = `${kind.toLowerCase()}s`;

		try {
			const result = await this.customObjectsApi.getNamespacedCustomObject({
				group: group || "",
				version: version || apiVersion,
				namespace: ns,
				plural,
				name,
			});

			return result as CustomResource;
		} catch {
			return null;
		}
	}

	async deleteCustomResource(
		apiVersion: string,
		kind: string,
		name: string,
		namespace?: string,
	): Promise<void> {
		const ns = namespace || this.config.namespace;
		const [group, version] = apiVersion.split("/");
		const plural = `${kind.toLowerCase()}s`;

		await this.customObjectsApi.deleteNamespacedCustomObject({
			group: group || "",
			version: version || apiVersion,
			namespace: ns,
			plural,
			name,
		});
	}

	// ==========================================================================
	// Namespace Management
	// ==========================================================================

	async ensureNamespace(namespace: string): Promise<void> {
		try {
			await this.coreApi.readNamespace({ name: namespace });
		} catch {
			// Create namespace
			await this.coreApi.createNamespace({
				body: {
					apiVersion: "v1",
					kind: "Namespace",
					metadata: {
						name: namespace,
						labels: {
							"dokploy.managed": "true",
						},
					},
				},
			});
		}
	}

	async listNamespaces(): Promise<string[]> {
		const response = await this.coreApi.listNamespace();
		return response.items.map(ns => ns.metadata?.name || "").filter(Boolean);
	}

	// ==========================================================================
	// Events
	// ==========================================================================

	async getEvents(
		name: string,
		namespace?: string,
	): Promise<
		Array<{
			type: "Normal" | "Warning";
			reason: string;
			message: string;
			count: number;
			firstTimestamp: Date;
			lastTimestamp: Date;
		}>
	> {
		const ns = namespace || this.config.namespace;

		const events = await this.coreApi.listNamespacedEvent({
			namespace: ns,
			fieldSelector: `involvedObject.name=${name}`,
		});

		return events.items.map(e => ({
			type: (e.type || "Normal") as "Normal" | "Warning",
			reason: e.reason || "Unknown",
			message: e.message || "",
			count: e.count || 1,
			firstTimestamp: e.firstTimestamp ? new Date(e.firstTimestamp) : new Date(),
			lastTimestamp: e.lastTimestamp ? new Date(e.lastTimestamp) : new Date(),
		}));
	}

	// ==========================================================================
	// Private Helpers
	// ==========================================================================

	private buildK8sDeployment(
		config: DeploymentConfig,
		namespace: string,
	): k8s.V1Deployment {
		const envVars = Object.entries(config.env).map(([name, value]) => ({
			name,
			value,
		}));

		return {
			apiVersion: "apps/v1",
			kind: "Deployment",
			metadata: {
				name: config.name,
				namespace,
				labels: {
					app: config.name,
					"dokploy.managed": "true",
					...config.labels,
				},
				annotations: config.annotations,
			},
			spec: {
				replicas: config.replicas,
				selector: {
					matchLabels: { app: config.name },
				},
				strategy: config.strategy
					? {
							type: config.strategy.type === "rolling" ? "RollingUpdate" : "Recreate",
							...(config.strategy.type === "rolling" &&
								config.strategy.rollingUpdate && {
									rollingUpdate: {
										maxSurge: config.strategy.rollingUpdate.maxSurge,
										maxUnavailable: config.strategy.rollingUpdate.maxUnavailable,
									},
								}),
						}
					: {
							type: "RollingUpdate",
							rollingUpdate: {
								maxSurge: "25%",
								maxUnavailable: "25%",
							},
						},
				template: {
					metadata: {
						labels: {
							app: config.name,
							...config.labels,
						},
						annotations: config.annotations,
					},
					spec: {
						...(config.serviceAccount && {
							serviceAccountName: config.serviceAccount,
						}),
						containers: [
							{
								name: config.name,
								image: config.image,
								ports: config.ports.map(p => ({
									containerPort: p.containerPort,
									protocol: p.protocol || "TCP",
								})),
								env: envVars,
								...(config.command && { command: config.command }),
								...(config.args && { args: config.args }),
								...(config.resources && {
									resources: {
										requests: {
											cpu: config.resources.requests.cpu,
											memory: config.resources.requests.memory,
										},
										limits: {
											cpu: config.resources.limits.cpu,
											memory: config.resources.limits.memory,
										},
									},
								}),
								...(config.livenessProbe && {
									livenessProbe: this.buildProbe(config.livenessProbe),
								}),
								...(config.readinessProbe && {
									readinessProbe: this.buildProbe(config.readinessProbe),
								}),
								...(config.startupProbe && {
									startupProbe: this.buildProbe(config.startupProbe),
								}),
								volumeMounts: config.volumes?.map(v => ({
									name: v.name,
									mountPath: v.mountPath,
									readOnly: v.readOnly,
								})),
							},
						],
						volumes: config.volumes?.map(v => ({
							name: v.name,
							...(v.pvcName && {
								persistentVolumeClaim: { claimName: v.pvcName },
							}),
							...(v.hostPath && {
								hostPath: { path: v.hostPath },
							}),
						})),
					},
				},
			},
		};
	}

	private buildProbe(config: DeploymentConfig["livenessProbe"]): k8s.V1Probe {
		if (!config) {
			return {};
		}

		return {
			...(config.httpGet && {
				httpGet: {
					path: config.httpGet.path,
					port: config.httpGet.port,
					scheme: config.httpGet.scheme,
				},
			}),
			...(config.tcpSocket && {
				tcpSocket: {
					port: config.tcpSocket.port,
				},
			}),
			...(config.exec && {
				exec: {
					command: config.exec.command,
				},
			}),
			initialDelaySeconds: config.initialDelaySeconds,
			periodSeconds: config.periodSeconds,
			timeoutSeconds: config.timeoutSeconds,
			failureThreshold: config.failureThreshold,
			successThreshold: config.successThreshold,
		};
	}

	private async configureTraefikIngress(
		config: DeploymentConfig,
		namespace: string,
	): Promise<Ingress> {
		// Create Traefik IngressRoute CRD
		const ingressRoute = {
			apiVersion: "traefik.io/v1alpha1",
			kind: "IngressRoute",
			metadata: {
				name: `${config.name}-ingress`,
				namespace,
			},
			spec: {
				entryPoints: ["web", "websecure"],
				routes: [
					{
						match: `Host(\`${config.domain}\`)`,
						kind: "Rule",
						services: [
							{
								name: config.name,
								port: config.ports[0]?.containerPort || 80,
							},
						],
					},
				],
				...(config.ssl && {
					tls: {
						certResolver: "letsencrypt",
					},
				}),
			},
		};

		await this.createCustomResource(ingressRoute as CustomResource);

		return {
			name: `${config.name}-ingress`,
			namespace,
			hosts: [config.domain!],
			tls: config.ssl,
			rules: [
				{
					host: config.domain!,
					paths: [
						{
							path: "/",
							pathType: "Prefix",
							serviceName: config.name,
							servicePort: config.ports[0]?.containerPort || 80,
						},
					],
				},
			],
		};
	}

	private async configurePodDisruptionBudget(
		name: string,
		namespace: string,
		config: { minAvailable?: number; maxUnavailable?: number },
	): Promise<void> {
		const policyApi = this.kc.makeApiClient(k8s.PolicyV1Api);

		const pdb: k8s.V1PodDisruptionBudget = {
			apiVersion: "policy/v1",
			kind: "PodDisruptionBudget",
			metadata: {
				name: `${name}-pdb`,
				namespace,
			},
			spec: {
				selector: {
					matchLabels: { app: name },
				},
				...(config.minAvailable !== undefined && {
					minAvailable: config.minAvailable,
				}),
				...(config.maxUnavailable !== undefined && {
					maxUnavailable: config.maxUnavailable,
				}),
			},
		};

		try {
			await policyApi.readNamespacedPodDisruptionBudget({
				name: `${name}-pdb`,
				namespace,
			});

			// Update existing
			await policyApi.replaceNamespacedPodDisruptionBudget({
				name: `${name}-pdb`,
				namespace,
				body: pdb,
			});
		} catch {
			// Create new
			await policyApi.createNamespacedPodDisruptionBudget({
				namespace,
				body: pdb,
			});
		}
	}

	private mapK8sDeployment(deployment: k8s.V1Deployment): Deployment {
		const status = deployment.status;
		let deploymentStatus: DeploymentStatus = "pending";

		if (status?.availableReplicas === status?.replicas) {
			deploymentStatus = "running";
		} else if (status?.updatedReplicas !== status?.replicas) {
			deploymentStatus = "updating";
		} else if ((status?.availableReplicas || 0) < (status?.replicas || 0)) {
			deploymentStatus = "scaling";
		}

		// Check conditions for failures
		const failedCondition = status?.conditions?.find(
			c => c.type === "Available" && c.status === "False"
		);
		if (failedCondition) {
			deploymentStatus = "failed";
		}

		return {
			name: deployment.metadata?.name || "",
			namespace: deployment.metadata?.namespace,
			status: deploymentStatus,
			replicas: {
				desired: deployment.spec?.replicas || 0,
				ready: status?.readyReplicas || 0,
				available: status?.availableReplicas || 0,
				unavailable: status?.unavailableReplicas,
			},
			image: deployment.spec?.template?.spec?.containers?.[0]?.image || "",
			createdAt: deployment.metadata?.creationTimestamp
				? new Date(deployment.metadata.creationTimestamp)
				: undefined,
			conditions: status?.conditions?.map(c => ({
				type: c.type || "",
				status: c.status as "True" | "False" | "Unknown",
				reason: c.reason,
				message: c.message,
				lastTransitionTime: c.lastTransitionTime
					? new Date(c.lastTransitionTime)
					: undefined,
			})),
		};
	}

	private parseCPUUsage(cpu: string): number {
		// Parse K8s CPU format (e.g., "100m", "0.5", "1000n")
		const match = cpu.match(/^(\d+(?:\.\d+)?)(n|u|m)?$/);
		if (!match) return 0;

		const value = Number.parseFloat(match[1]);
		const unit = match[2];

		switch (unit) {
			case "n":
				return value; // nanocores
			case "u":
				return value * 1000; // microcores to nanocores
			case "m":
				return value * 1000000; // millicores to nanocores
			default:
				return value * 1000000000; // cores to nanocores
		}
	}

	private parseMemoryUsage(memory: string): number {
		// Parse K8s memory format (e.g., "128Mi", "1Gi", "1000Ki")
		const match = memory.match(/^(\d+(?:\.\d+)?)(Ki|Mi|Gi|Ti)?$/);
		if (!match) return 0;

		const value = Number.parseFloat(match[1]);
		const unit = match[2];

		switch (unit) {
			case "Ki":
				return value * 1024;
			case "Mi":
				return value * 1024 * 1024;
			case "Gi":
				return value * 1024 * 1024 * 1024;
			case "Ti":
				return value * 1024 * 1024 * 1024 * 1024;
			default:
				return value;
		}
	}
}
