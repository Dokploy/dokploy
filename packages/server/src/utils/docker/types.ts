export type DefinitionsInclude =
	| string
	| {
			path?: StringOrList;
			env_file?: StringOrList;
			project_directory?: string;
	  };
export type StringOrList = string | ListOfStrings;
export type ListOfStrings = string[];
export type DefinitionsDevelopment = {
	watch?: {
		ignore?: string[];
		path: string;
		action: "rebuild" | "sync" | "sync+restart";
		target?: string;
		[k: string]: unknown;
	}[];
	[k: string]: unknown;
} & Development;
export type Development = {
	watch?: {
		ignore?: string[];
		path: string;
		action: "rebuild" | "sync" | "sync+restart";
		target?: string;
		[k: string]: unknown;
	}[];
	[k: string]: unknown;
} | null;
export type DefinitionsDeployment = {
	mode?: string;
	endpoint_mode?: string;
	replicas?: number;
	labels?: ListOrDict;
	rollback_config?: {
		parallelism?: number;
		delay?: string;
		failure_action?: string;
		monitor?: string;
		max_failure_ratio?: number;
		order?: "start-first" | "stop-first";
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	update_config?: {
		parallelism?: number;
		delay?: string;
		failure_action?: string;
		monitor?: string;
		max_failure_ratio?: number;
		order?: "start-first" | "stop-first";
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	resources?: {
		limits?: {
			cpus?: number | string;
			memory?: string;
			pids?: number;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		};
		reservations?: {
			cpus?: number | string;
			memory?: string;
			generic_resources?: DefinitionsGenericResources;
			devices?: DefinitionsDevices;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		};
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	restart_policy?: {
		condition?: string;
		delay?: string;
		max_attempts?: number;
		window?: string;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	placement?: {
		constraints?: string[];
		preferences?: {
			spread?: string;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		}[];
		max_replicas_per_node?: number;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} & Deployment;
export type ListOrDict =
	| {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` ".+".
			 */
			[k: string]: string | number | boolean | null;
	  }
	| string[];
export type DefinitionsGenericResources = {
	discrete_resource_spec?: {
		kind?: string;
		value?: number;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}[];
export type DefinitionsDevices = {
	capabilities?: ListOfStrings;
	count?: string | number;
	device_ids?: ListOfStrings;
	driver?: string;
	options?: ListOrDict;
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}[];
type Deployment = {
	mode?: string;
	endpoint_mode?: string;
	replicas?: number;
	labels?: ListOrDict;
	rollback_config?: {
		parallelism?: number;
		delay?: string;
		failure_action?: string;
		monitor?: string;
		max_failure_ratio?: number;
		order?: "start-first" | "stop-first";
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	update_config?: {
		parallelism?: number;
		delay?: string;
		failure_action?: string;
		monitor?: string;
		max_failure_ratio?: number;
		order?: "start-first" | "stop-first";
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	resources?: {
		limits?: {
			cpus?: number | string;
			memory?: string;
			pids?: number;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		};
		reservations?: {
			cpus?: number | string;
			memory?: string;
			generic_resources?: DefinitionsGenericResources;
			devices?: DefinitionsDevices;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		};
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	restart_policy?: {
		condition?: string;
		delay?: string;
		max_attempts?: number;
		window?: string;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	placement?: {
		constraints?: string[];
		preferences?: {
			spread?: string;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		}[];
		max_replicas_per_node?: number;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} | null;
export type ServiceConfigOrSecret = (
	| string
	| {
			source?: string;
			target?: string;
			uid?: string;
			gid?: string;
			mode?: number;
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
	  }
)[];
export type Command = null | string | string[];
export type EnvFile =
	| string
	| (
			| string
			| {
					path: string;
					required?: boolean;
			  }
	  )[];
/**
 * This interface was referenced by `PropertiesNetworks`'s JSON-Schema definition
 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
 */
export type DefinitionsNetwork = {
	name?: string;
	driver?: string;
	driver_opts?: {
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^.+$".
		 */
		[k: string]: string | number;
	};
	ipam?: {
		driver?: string;
		config?: {
			subnet?: string;
			ip_range?: string;
			gateway?: string;
			aux_addresses?: {
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^.+$".
				 */
				[k: string]: string;
			};
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		}[];
		options?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^.+$".
			 */
			[k: string]: string;
		};
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	external?:
		| boolean
		| {
				name?: string;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
	internal?: boolean;
	enable_ipv6?: boolean;
	attachable?: boolean;
	labels?: ListOrDict;
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} & Network;
export type Network = {
	name?: string;
	driver?: string;
	driver_opts?: {
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^.+$".
		 */
		[k: string]: string | number;
	};
	ipam?: {
		driver?: string;
		config?: {
			subnet?: string;
			ip_range?: string;
			gateway?: string;
			aux_addresses?: {
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^.+$".
				 */
				[k: string]: string;
			};
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^x-".
			 */
			[k: string]: unknown;
		}[];
		options?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^.+$".
			 */
			[k: string]: string;
		};
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	external?:
		| boolean
		| {
				name?: string;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
	internal?: boolean;
	enable_ipv6?: boolean;
	attachable?: boolean;
	labels?: ListOrDict;
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} | null;
/**
 * This interface was referenced by `PropertiesVolumes`'s JSON-Schema definition
 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
 */
export type DefinitionsVolume = {
	name?: string;
	driver?: string;
	driver_opts?: {
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^.+$".
		 */
		[k: string]: string | number;
	};
	external?:
		| boolean
		| {
				name?: string;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
	labels?: ListOrDict;
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} & Volume;
export type Volume = {
	name?: string;
	driver?: string;
	driver_opts?: {
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^.+$".
		 */
		[k: string]: string | number;
	};
	external?:
		| boolean
		| {
				name?: string;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
	labels?: ListOrDict;
	/**
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 *
	 * This interface was referenced by `undefined`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
} | null;

/**
 * The Compose file is a YAML file defining a multi-containers based application.
 */
export interface ComposeSpecification {
	/**
	 * declared for backward compatibility, ignored.
	 */
	version?: string;
	/**
	 * define the Compose project name, until user defines one explicitly.
	 */
	name?: string;
	/**
	 * compose sub-projects to be included.
	 */
	include?: DefinitionsInclude[];
	services?: PropertiesServices;
	networks?: PropertiesNetworks;
	volumes?: PropertiesVolumes;
	secrets?: PropertiesSecrets;
	configs?: PropertiesConfigs;
	/**
	 * This interface was referenced by `ComposeSpecification`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}
export interface PropertiesServices {
	[k: string]: DefinitionsService;
}
/**
 * This interface was referenced by `PropertiesServices`'s JSON-Schema definition
 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
 */
export interface DefinitionsService {
	develop?: DefinitionsDevelopment;
	deploy?: DefinitionsDeployment;
	annotations?: ListOrDict;
	attach?: boolean;
	build?:
		| string
		| {
				context?: string;
				dockerfile?: string;
				dockerfile_inline?: string;
				entitlements?: string[];
				args?: ListOrDict;
				ssh?: ListOrDict;
				labels?: ListOrDict;
				cache_from?: string[];
				cache_to?: string[];
				no_cache?: boolean;
				additional_contexts?: ListOrDict;
				network?: string;
				pull?: boolean;
				target?: string;
				shm_size?: number | string;
				extra_hosts?: ListOrDict;
				isolation?: string;
				privileged?: boolean;
				secrets?: ServiceConfigOrSecret;
				tags?: string[];
				ulimits?: Ulimits;
				platforms?: string[];
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
	blkio_config?: {
		device_read_bps?: BlkioLimit[];
		device_read_iops?: BlkioLimit[];
		device_write_bps?: BlkioLimit[];
		device_write_iops?: BlkioLimit[];
		weight?: number;
		weight_device?: BlkioWeight[];
	};
	cap_add?: string[];
	cap_drop?: string[];
	cgroup?: "host" | "private";
	cgroup_parent?: string;
	command?: Command;
	configs?: ServiceConfigOrSecret;
	container_name?: string;
	cpu_count?: number;
	cpu_percent?: number;
	cpu_shares?: number | string;
	cpu_quota?: number | string;
	cpu_period?: number | string;
	cpu_rt_period?: number | string;
	cpu_rt_runtime?: number | string;
	cpus?: number | string;
	cpuset?: string;
	credential_spec?: {
		config?: string;
		file?: string;
		registry?: string;
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	depends_on?:
		| ListOfStrings
		| {
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
				 */
				[k: string]: {
					restart?: boolean;
					required?: boolean;
					condition:
						| "service_started"
						| "service_healthy"
						| "service_completed_successfully";
				};
		  };
	device_cgroup_rules?: ListOfStrings;
	devices?: string[];
	dns?: StringOrList;
	dns_opt?: string[];
	dns_search?: StringOrList;
	domainname?: string;
	entrypoint?: Command;
	env_file?: EnvFile;
	environment?: ListOrDict;
	expose?: (string | number)[];
	extends?:
		| string
		| {
				service: string;
				file?: string;
		  };
	external_links?: string[];
	extra_hosts?: ListOrDict;
	group_add?: (string | number)[];
	healthcheck?: DefinitionsHealthcheck;
	hostname?: string;
	image?: string;
	init?: boolean;
	ipc?: string;
	isolation?: string;
	labels?: ListOrDict;
	links?: string[];
	logging?: {
		driver?: string;
		options?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "^.+$".
			 */
			[k: string]: string | number | null;
		};
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^x-".
		 */
		[k: string]: unknown;
	};
	mac_address?: string;
	mem_limit?: number | string;
	mem_reservation?: string | number;
	mem_swappiness?: number;
	memswap_limit?: number | string;
	network_mode?: string;
	networks?:
		| ListOfStrings
		| {
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
				 */
				[k: string]: {
					aliases?: ListOfStrings;
					ipv4_address?: string;
					ipv6_address?: string;
					link_local_ips?: ListOfStrings;
					mac_address?: string;
					driver_opts?: {
						/**
						 * This interface was referenced by `undefined`'s JSON-Schema definition
						 * via the `patternProperty` "^.+$".
						 */
						[k: string]: string | number;
					};
					priority?: number;
					/**
					 * This interface was referenced by `undefined`'s JSON-Schema definition
					 * via the `patternProperty` "^x-".
					 */
					[k: string]: unknown;
				} | null;
		  };
	oom_kill_disable?: boolean;
	oom_score_adj?: number;
	pid?: string | null;
	pids_limit?: number | string;
	platform?: string;
	ports?: (
		| number
		| string
		| {
				name?: string;
				mode?: string;
				host_ip?: string;
				target?: number;
				published?: string | number;
				protocol?: string;
				app_protocol?: string;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  }
	)[];
	privileged?: boolean;
	profiles?: ListOfStrings;
	pull_policy?: "always" | "never" | "if_not_present" | "build" | "missing";
	read_only?: boolean;
	restart?: string;
	runtime?: string;
	scale?: number;
	security_opt?: string[];
	shm_size?: number | string;
	secrets?: ServiceConfigOrSecret;
	sysctls?: ListOrDict;
	stdin_open?: boolean;
	stop_grace_period?: string;
	stop_signal?: string;
	storage_opt?: {
		[k: string]: unknown;
	};
	tmpfs?: StringOrList;
	tty?: boolean;
	ulimits?: Ulimits;
	user?: string;
	uts?: string;
	userns_mode?: string;
	volumes?: (
		| string
		| {
				type: string;
				source?: string;
				target?: string;
				read_only?: boolean;
				consistency?: string;
				bind?: {
					propagation?: string;
					create_host_path?: boolean;
					selinux?: "z" | "Z";
					/**
					 * This interface was referenced by `undefined`'s JSON-Schema definition
					 * via the `patternProperty` "^x-".
					 */
					[k: string]: unknown;
				};
				volume?: {
					nocopy?: boolean;
					subpath?: string;
					/**
					 * This interface was referenced by `undefined`'s JSON-Schema definition
					 * via the `patternProperty` "^x-".
					 */
					[k: string]: unknown;
				};
				tmpfs?: {
					size?: number | string;
					mode?: number;
					/**
					 * This interface was referenced by `undefined`'s JSON-Schema definition
					 * via the `patternProperty` "^x-".
					 */
					[k: string]: unknown;
				};
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  }
	)[];
	volumes_from?: string[];
	working_dir?: string;
	/**
	 * This interface was referenced by `DefinitionsService`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}
export interface Ulimits {
	/**
	 * This interface was referenced by `Ulimits`'s JSON-Schema definition
	 * via the `patternProperty` "^[a-z]+$".
	 */
	[k: string]:
		| number
		| {
				hard: number;
				soft: number;
				/**
				 * This interface was referenced by `undefined`'s JSON-Schema definition
				 * via the `patternProperty` "^x-".
				 */
				[k: string]: unknown;
		  };
}
export interface BlkioLimit {
	path?: string;
	rate?: number | string;
}
export interface BlkioWeight {
	path?: string;
	weight?: number;
}
export interface DefinitionsHealthcheck {
	disable?: boolean;
	interval?: string;
	retries?: number;
	test?: string | string[];
	timeout?: string;
	start_period?: string;
	start_interval?: string;
	/**
	 * This interface was referenced by `DefinitionsHealthcheck`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}
export interface PropertiesNetworks {
	[k: string]: DefinitionsNetwork;
}
export interface PropertiesVolumes {
	[k: string]: DefinitionsVolume;
}
export interface PropertiesSecrets {
	[k: string]: DefinitionsSecret;
}
/**
 * This interface was referenced by `PropertiesSecrets`'s JSON-Schema definition
 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
 */
export interface DefinitionsSecret {
	name?: string;
	environment?: string;
	file?: string;
	external?:
		| boolean
		| {
				name?: string;
				[k: string]: unknown;
		  };
	labels?: ListOrDict;
	driver?: string;
	driver_opts?: {
		/**
		 * This interface was referenced by `undefined`'s JSON-Schema definition
		 * via the `patternProperty` "^.+$".
		 */
		[k: string]: string | number;
	};
	template_driver?: string;
	/**
	 * This interface was referenced by `DefinitionsSecret`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}
export interface PropertiesConfigs {
	[k: string]: DefinitionsConfig;
}
/**
 * This interface was referenced by `PropertiesConfigs`'s JSON-Schema definition
 * via the `patternProperty` "^[a-zA-Z0-9._-]+$".
 */
export interface DefinitionsConfig {
	name?: string;
	content?: string;
	environment?: string;
	file?: string;
	external?:
		| boolean
		| {
				name?: string;
				[k: string]: unknown;
		  };
	labels?: ListOrDict;
	template_driver?: string;
	/**
	 * This interface was referenced by `DefinitionsConfig`'s JSON-Schema definition
	 * via the `patternProperty` "^x-".
	 */
	[k: string]: unknown;
}
