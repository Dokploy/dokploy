/* eslint-disable */

/**
 * The Services are responsible for configuring how to reach the actual services that will eventually handle the incoming requests.
 */

/**
 * Traefik v2 Dynamic Configuration File Provider
 */
export interface FileConfig {
	http?: {
		routers?: {
			[k: string]: HttpRouter;
		};
		services?: {
			[k: string]: HttpService;
		};
		/**
		 * Attached to the routers, pieces of middleware are a means of tweaking the requests before they are sent to your service (or before the answer from the services are sent to the clients).
		 *
		 * There are several available middleware in Traefik, some can modify the request, the headers, some are in charge of redirections, some add authentication, and so on.
		 *
		 * Pieces of middleware can be combined in chains to fit every scenario.
		 */
		middlewares?: {
			[k: string]: HttpMiddleware;
		};
		[k: string]: unknown;
	};
	tcp?: {
		routers?: {
			[k: string]: TcpRouter;
		};
		/**
		 * Each of the fields of the service section represents a kind of service. Which means, that for each specified service, one of the fields, and only one, has to be enabled to define what kind of service is created. Currently, the two available kinds are LoadBalancer, and Weighted.
		 */
		services?: {
			[k: string]: TcpService;
		};
		[k: string]: unknown;
	};
	udp?: {
		/**
		 * Similarly to TCP, as UDP is the transport layer, there is no concept of a request, so there is no notion of an URL path prefix to match an incoming UDP packet with. Furthermore, as there is no good TLS support at the moment for multiple hosts, there is no Host SNI notion to match against either. Therefore, there is no criterion that could be used as a rule to match incoming packets in order to route them. So UDP "routers" at this time are pretty much only load-balancers in one form or another.
		 */
		routers?: {
			[k: string]: UdpRouter;
		};
		/**
		 * Each of the fields of the service section represents a kind of service. Which means, that for each specified service, one of the fields, and only one, has to be enabled to define what kind of service is created. Currently, the two available kinds are LoadBalancer, and Weighted.
		 */
		services?: {
			[k: string]: UdpService;
		};
	};
	/**
	 * Configures the TLS connection, TLS options, and certificate stores.
	 */
	tls?: {
		certificates?: {
			certFile?: string;
			keyFile?: string;
			/**
			 * A list of stores can be specified here to indicate where the certificates should be stored. Although the stores list will actually be ignored and automatically set to ["default"].
			 */
			stores?: string[];
			[k: string]: unknown;
		}[];
		/**
		 * The TLS options allow one to configure some parameters of the TLS connection.
		 */
		options?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "[a-zA-Z0-9-_]+".
			 */
			[k: string]: {
				/**
				 * Minimum TLS Version
				 */
				minVersion?: string;
				/**
				 * Maximum TLS Version. It is discouraged to use of this setting to disable TLS1.3. The recommended approach is to update the clients to support TLS1.3.
				 */
				maxVersion?: string;
				/**
				 * Cipher suites defined for TLS 1.2 and below cannot be used in TLS 1.3, and vice versa. With TLS 1.3, the cipher suites are not configurable (all supported cipher suites are safe in this case).
				 */
				cipherSuites?: string[];
				/**
				 * This option allows to set the preferred elliptic curves in a specific order.
				 *
				 * The names of the curves defined by crypto (e.g. CurveP521) and the RFC defined names (e.g. secp521r1) can be used.
				 */
				curvePreferences?: string[];
				/**
				 * With strict SNI checking enabled, Traefik won't allow connections from clients that do not specify a server_name extension or don't match any certificate configured on the tlsOption.
				 */
				sniStrict?: boolean;
				/**
				 * This option allows the server to choose its most preferred cipher suite instead of the client's. Please note that this is enabled automatically when minVersion or maxVersion are set.
				 */
				preferServerCipherSuites?: boolean;
				/**
				 * Traefik supports mutual authentication, through the clientAuth section.
				 */
				clientAuth?: {
					/**
					 * For authentication policies that require verification of the client certificate, the certificate authority for the certificate should be set here.
					 */
					caFiles?: string[];
					clientAuthType?: string;
					[k: string]: unknown;
				};
				[k: string]: unknown;
			};
		};
		/**
		 * Any store definition other than the default one (named default) will be ignored, and there is therefore only one globally available TLS store.
		 */
		stores?: {
			/**
			 * This interface was referenced by `undefined`'s JSON-Schema definition
			 * via the `patternProperty` "[a-zA-Z0-9-_]+".
			 */
			[k: string]: {
				/**
				 * Traefik can use a default certificate for connections without a SNI, or without a matching domain. If no default certificate is provided, Traefik generates and uses a self-signed certificate.
				 */
				defaultCertificate?: {
					certFile?: string;
					keyFile?: string;
				};
				/**
				 * GeneratedCert defines the default generated certificate configuration.
				 */
				defaultGeneratedCert?: {
					/**
					 * Resolver is the name of the resolver that will be used to issue the DefaultCertificate.
					 */
					resolver?: string;
					/**
					 * Domain is the domain definition for the DefaultCertificate.
					 */
					domain?: {
						/**
						 * Main defines the main domain name.
						 */
						main?: string;
						/**
						 * SANs defines the subject alternative domain names.
						 */
						sans?: string[];
						[k: string]: unknown;
					};
				};
			};
		};
	};
}

export type HttpService =
	| {
			loadBalancer?: HttpLoadBalancerService;
	  }
	| {
			weighted?: HttpWeightedService;
	  }
	| {
			mirroring?: HttpMirroringService;
	  }
	| {
			failover?: HttpFailoverService;
	  };
export type HttpMiddleware =
	| {
			addPrefix?: AddPrefixMiddleware;
	  }
	| {
			basicAuth?: BasicAuthMiddleware;
	  }
	| {
			buffering?: BufferingMiddleware;
	  }
	| {
			chain?: ChainMiddleware;
	  }
	| {
			circuitBreaker?: CircuitBreakerMiddleware;
	  }
	| {
			compress?: CompressMiddleware;
	  }
	| {
			contentType?: ContentTypeMiddleware;
	  }
	| {
			digestAuth?: DigestAuthMiddleware;
	  }
	| {
			errors?: ErrorsMiddleware;
	  }
	| {
			forwardAuth?: ForwardAuthMiddleware;
	  }
	| {
			headers?: HeadersMiddleware;
	  }
	| {
			ipWhiteList?: IpWhiteListMiddleware;
	  }
	| {
			inFlightReq?: InFlightReqMiddleware;
	  }
	| {
			passTLSClientCert?: PassTLSClientCertMiddleware;
	  }
	| {
			plugin?: PluginMiddleware;
	  }
	| {
			rateLimit?: RateLimitMiddleware;
	  }
	| {
			redirectRegex?: RedirectRegexMiddleware;
	  }
	| {
			redirectScheme?: RedirectSchemeMiddleware;
	  }
	| {
			replacePath?: ReplacePathMiddleware;
	  }
	| {
			replacePathRegex?: ReplacePathRegexMiddleware;
	  }
	| {
			retry?: RetryMiddleware;
	  }
	| {
			stripPrefix?: StripPrefixMiddleware;
	  }
	| {
			stripPrefixRegex?: StripPrefixRegexMiddleware;
	  };
export type TcpService =
	| {
			loadBalancer?: TcpLoadBalancerService;
	  }
	| {
			weighted?: TcpWeightedService;
	  };
export type UdpService =
	| {
			loadBalancer?: UdpLoadBalancerService;
	  }
	| {
			weighted?: UdpWeightedService;
	  };

/**
 * A router is in charge of connecting incoming requests to the services that can handle them. In the process, routers may use pieces of middleware to update the request, or act before forwarding the request to the service.
 */
export interface HttpRouter {
	/**
	 * If not specified, HTTP routers will accept requests from all defined entry points. If you want to limit the router scope to a set of entry points, set the entryPoints option.
	 */
	entryPoints?: string[];
	/**
	 * Rules are a set of matchers configured with values, that determine if a particular request matches specific criteria. If the rule is verified, the router becomes active, calls middlewares, and then forwards the request to the service.
	 */
	rule: string;
	/**
	 * To avoid path overlap, routes are sorted, by default, in descending order using rules length. The priority is directly equal to the length of the rule, and so the longest length has the highest priority. A value of 0 for the priority is ignored: priority = 0 means that the default rules length sorting is used.
	 */
	priority?: number;
	/**
	 * You can attach a list of middlewares to each HTTP router. The middlewares will take effect only if the rule matches, and before forwarding the request to the service. Middlewares are applied in the same order as their declaration in router.
	 */
	middlewares?: string[];
	/**
	 * Each request must eventually be handled by a service, which is why each router definition should include a service target, which is basically where the request will be passed along to. HTTP routers can only target HTTP services (not TCP services).
	 */
	service: string;
	/**
	 * When a TLS section is specified, it instructs Traefik that the current router is dedicated to HTTPS requests only (and that the router should ignore HTTP (non TLS) requests). Traefik will terminate the SSL connections (meaning that it will send decrypted data to the services). If you need to define the same route for both HTTP and HTTPS requests, you will need to define two different routers: one with the tls section, one without.
	 */
	tls?: {
		/**
		 * The options field enables fine-grained control of the TLS parameters. It refers to a TLS Options and will be applied only if a Host rule is defined.
		 */
		options?: string;
		/**
		 * If certResolver is defined, Traefik will try to generate certificates based on routers Host & HostSNI rules.
		 */
		certResolver?: string;
		/**
		 * You can set SANs (alternative domains) for each main domain. Every domain must have A/AAAA records pointing to Traefik. Each domain & SAN will lead to a certificate request.
		 */
		domains?: {
			/**
			 * Main defines the main domain name.
			 */
			main?: string;
			/**
			 * SANs defines the subject alternative domain names.
			 */
			sans?: string[];
			[k: string]: unknown;
		}[];
		[k: string]: unknown;
	};
}
/**
 * The load balancers are able to load balance the requests between multiple instances of your programs.
 *
 * Each service has a load-balancer, even if there is only one server to forward traffic to.
 */
export interface HttpLoadBalancerService {
	/**
	 * Servers declare a single instance of your program.
	 *
	 * @minItems 1
	 */
	servers: [
		{
			/**
			 * The url option point to a specific instance. Paths in the servers' url have no effect. If you want the requests to be sent to a specific path on your servers, configure your routers to use a corresponding middleware (e.g. the AddPrefix or ReplacePath) middlewares.
			 */
			url: string;
			[k: string]: unknown;
		},
		...{
			/**
			 * The url option point to a specific instance. Paths in the servers' url have no effect. If you want the requests to be sent to a specific path on your servers, configure your routers to use a corresponding middleware (e.g. the AddPrefix or ReplacePath) middlewares.
			 */
			url: string;
			[k: string]: unknown;
		}[],
	];
	/**
	 * When sticky sessions are enabled, a cookie is set on the initial request and response to let the client know which server handles the first response. On subsequent requests, to keep the session alive with the same server, the client should resend the same cookie.
	 */
	sticky?: {
		cookie?: {
			/**
			 * The default cookie name is an abbreviation of a sha1 (ex: _1d52e).
			 */
			name?: string;
			secure?: boolean;
			httpOnly?: boolean;
			/**
			 * Can be none, lax, strict or empty.
			 */
			sameSite?: string;
			[k: string]: unknown;
		};
		[k: string]: unknown;
	};
	/**
	 * Configure health check to remove unhealthy servers from the load balancing rotation. Traefik will consider your servers healthy as long as they return status codes between 2XX and 3XX to the health check requests (carried out every interval). Traefik keeps monitoring the health of unhealthy servers. If a server has recovered (returning 2xx -> 3xx responses again), it will be added back to the load balancer rotation pool.
	 */
	healthCheck?: {
		/**
		 * If defined, will apply this Method for the health check request.
		 */
		method?: string;
		/**
		 * path is appended to the server URL to set the health check endpoint.
		 */
		path?: string;
		/**
		 * If defined, will replace the server URL scheme for the health check endpoint
		 */
		scheme?: string;
		/**
		 * If defined, will apply Host header hostname to the health check request.
		 */
		hostname?: string;
		/**
		 * If defined, will replace the server URL port for the health check endpoint.
		 */
		port?: number;
		/**
		 * Defines the frequency of the health check calls. Interval is to be given in a format understood by `time.ParseDuration`. The interval must be greater than the timeout. If configuration doesn't reflect this, the interval will be set to timeout + 1 second.
		 */
		interval?: string;
		/**
		 * Defines the maximum duration Traefik will wait for a health check request before considering the server failed (unhealthy). Timeout is to be given in a format understood by `time.ParseDuration`.
		 */
		timeout?: string;
		/**
		 * Defines custom headers to be sent to the health check endpoint.
		 */
		headers?: {
			[k: string]: string;
		};
		/**
		 * Defines whether redirects should be followed during the health check calls (default: true).
		 */
		followRedirects?: boolean;
		[k: string]: unknown;
	};
	/**
	 * The passHostHeader allows to forward client Host header to server. By default, passHostHeader is true.
	 */
	passHostHeader?: boolean;
	/**
	 * Defines how Traefik forwards the response from the backend server to the client.
	 */
	responseForwarding?: {
		/**
		 * Specifies the interval in between flushes to the client while copying the response body. It is a duration in milliseconds, defaulting to 100. A negative value means to flush immediately after each write to the client. The flushInterval is ignored when ReverseProxy recognizes a response as a streaming response; for such responses, writes are flushed to the client immediately.
		 */
		flushInterval?: string;
		[k: string]: unknown;
	};
	serversTransport?: string;
}
/**
 * The WRR is able to load balance the requests between multiple services based on weights.
 *
 * This strategy is only available to load balance between services and not between servers.
 */
export interface HttpWeightedService {
	services?: {
		name?: string;
		weight?: number;
		[k: string]: unknown;
	}[];
	/**
	 * When sticky sessions are enabled, a cookie is set on the initial request and response to let the client know which server handles the first response. On subsequent requests, to keep the session alive with the same server, the client should resend the same cookie.
	 */
	sticky?: {
		cookie?: {
			/**
			 * The default cookie name is an abbreviation of a sha1 (ex: _1d52e).
			 */
			name?: string;
			secure?: boolean;
			httpOnly?: boolean;
			/**
			 * Can be none, lax, strict or empty.
			 */
			sameSite?: string;
			[k: string]: unknown;
		};
		[k: string]: unknown;
	};
	healthCheck?: {
		[k: string]: unknown;
	};
}
/**
 * The mirroring is able to mirror requests sent to a service to other services. Please note that by default the whole request is buffered in memory while it is being mirrored. See the maxBodySize option for how to modify this behaviour.
 */
export interface HttpMirroringService {
	service?: string;
	/**
	 * maxBodySize is the maximum size allowed for the body of the request. If the body is larger, the request is not mirrored. Default value is -1, which means unlimited size.
	 */
	maxBodySize?: number;
	mirrors?: {
		name?: string;
		percent?: number;
		[k: string]: unknown;
	}[];
	healthCheck?: {
		[k: string]: unknown;
	};
}
export interface HttpFailoverService {
	service?: string;
	fallback?: string;
	healthCheck?: {
		[k: string]: unknown;
	};
}
/**
 * The AddPrefix middleware updates the URL Path of the request before forwarding it.
 */
export interface AddPrefixMiddleware {
	/**
	 * prefix is the string to add before the current path in the requested URL. It should include the leading slash (/).
	 */
	prefix?: string;
}
/**
 * The BasicAuth middleware is a quick way to restrict access to your services to known users. If both users and usersFile are provided, the two are merged. The contents of usersFile have precedence over the values in users.
 */
export interface BasicAuthMiddleware {
	/**
	 * The users option is an array of authorized users. Each user will be declared using the `name:hashed-password` format.
	 */
	users?: string[];
	/**
	 * The usersFile option is the path to an external file that contains the authorized users for the middleware.
	 *
	 * The file content is a list of `name:hashed-password`.
	 */
	usersFile?: string;
	/**
	 * You can customize the realm for the authentication with the realm option. The default value is traefik.
	 */
	realm?: string;
	/**
	 * You can define a header field to store the authenticated user using the headerField option.
	 */
	headerField?: string;
	/**
	 * Set the removeHeader option to true to remove the authorization header before forwarding the request to your service. (Default value is false.)
	 */
	removeHeader?: boolean;
	[k: string]: unknown;
}
/**
 * The Buffering middleware gives you control on how you want to read the requests before sending them to services.
 *
 * With Buffering, Traefik reads the entire request into memory (possibly buffering large requests into disk), and rejects requests that are over a specified limit.
 *
 * This can help services deal with large data (multipart/form-data for example), and can minimize time spent sending data to a service.
 */
export interface BufferingMiddleware {
	/**
	 * With the maxRequestBodyBytes option, you can configure the maximum allowed body size for the request (in Bytes).
	 *
	 * If the request exceeds the allowed size, it is not forwarded to the service and the client gets a 413 (Request Entity Too Large) response.
	 */
	maxRequestBodyBytes?: number;
	/**
	 * You can configure a threshold (in Bytes) from which the request will be buffered on disk instead of in memory with the memRequestBodyBytes option.
	 */
	memRequestBodyBytes?: number;
	/**
	 * With the maxResponseBodyBytes option, you can configure the maximum allowed response size from the service (in Bytes).
	 *
	 * If the response exceeds the allowed size, it is not forwarded to the client. The client gets a 413 (Request Entity Too Large) response instead.
	 */
	maxResponseBodyBytes?: number;
	/**
	 * You can configure a threshold (in Bytes) from which the response will be buffered on disk instead of in memory with the memResponseBodyBytes option.
	 */
	memResponseBodyBytes?: number;
	/**
	 * You can have the Buffering middleware replay the request with the help of the retryExpression option.
	 */
	retryExpression?: string;
}
/**
 * The Chain middleware enables you to define reusable combinations of other pieces of middleware. It makes reusing the same groups easier.
 */
export interface ChainMiddleware {
	/**
	 * @minItems 1
	 */
	middlewares?: [string, ...string[]];
}
/**
 * The circuit breaker protects your system from stacking requests to unhealthy services (resulting in cascading failures).
 *
 * When your system is healthy, the circuit is closed (normal operations). When your system becomes unhealthy, the circuit becomes open and the requests are no longer forwarded (but handled by a fallback mechanism).
 *
 * To assess if your system is healthy, the circuit breaker constantly monitors the services.
 */
export interface CircuitBreakerMiddleware {
	/**
	 * You can specify an expression that, once matched, will trigger the circuit breaker (and apply the fallback mechanism instead of calling your services).
	 */
	expression?: string;
	/**
	 * The interval between successive checks of the circuit breaker condition (when in standby state)
	 */
	checkPeriod?: string;
	/**
	 * The duration for which the circuit breaker will wait before trying to recover (from a tripped state).
	 */
	fallbackDuration?: string;
	/**
	 * The duration for which the circuit breaker will try to recover (as soon as it is in recovering state).
	 */
	recoveryDuration?: string;
}
/**
 * The Compress middleware enables the gzip compression.
 */
export interface CompressMiddleware {
	/**
	 * excludedContentTypes specifies a list of content types to compare the Content-Type header of the incoming requests to before compressing.
	 *
	 * The requests with content types defined in excludedContentTypes are not compressed.
	 *
	 * Content types are compared in a case-insensitive, whitespace-ignored manner.
	 */
	excludedContentTypes?: string[];
	/**
	 * specifies the minimum amount of bytes a response body must have to be compressed.
	 */
	minResponseBodyBytes?: number;
}
/**
 * The Content-Type middleware - or rather its unique autoDetect option - specifies whether to let the Content-Type header, if it has not been set by the backend, be automatically set to a value derived from the contents of the response.
 *
 * As a proxy, the default behavior should be to leave the header alone, regardless of what the backend did with it. However, the historic default was to always auto-detect and set the header if it was nil, and it is going to be kept that way in order to support users currently relying on it. This middleware exists to enable the correct behavior until at least the default one can be changed in a future version.
 */
export interface ContentTypeMiddleware {
	/**
	 * autoDetect specifies whether to let the Content-Type header, if it has not been set by the backend, be automatically set to a value derived from the contents of the response.
	 */
	autoDetect?: boolean;
}
/**
 * The DigestAuth middleware is a quick way to restrict access to your services to known users. If both users and usersFile are provided, the two are merged. The contents of usersFile have precedence over the values in users.
 */
export interface DigestAuthMiddleware {
	/**
	 * The users option is an array of authorized users. Each user will be declared using the `name:realm:encoded-password` format.
	 */
	users?: string[];
	/**
	 * The usersFile option is the path to an external file that contains the authorized users for the middleware.
	 *
	 * The file content is a list of `name:realm:encoded-password`.
	 */
	usersFile?: string;
	/**
	 * You can customize the realm for the authentication with the realm option. The default value is traefik.
	 */
	realm?: string;
	/**
	 * You can customize the header field for the authenticated user using the headerField option.
	 */
	headerField?: string;
	/**
	 * Set the removeHeader option to true to remove the authorization header before forwarding the request to your service. (Default value is false.)
	 */
	removeHeader?: boolean;
}
/**
 * The ErrorPage middleware returns a custom page in lieu of the default, according to configured ranges of HTTP Status codes. The error page itself is not hosted by Traefik.
 */
export interface ErrorsMiddleware {
	/**
	 * The status that will trigger the error page.
	 *
	 * The status code ranges are inclusive (500-599 will trigger with every code between 500 and 599, 500 and 599 included). You can define either a status code like 500 or ranges with a syntax like 500-599.
	 */
	status?: string[];
	/**
	 * The service that will serve the new requested error page.
	 */
	service?: string;
	/**
	 * The URL for the error page (hosted by service). You can use {status} in the query, that will be replaced by the received status code.
	 */
	query?: string;
}
/**
 * The ForwardAuth middleware delegate the authentication to an external service. If the service response code is 2XX, access is granted and the original request is performed. Otherwise, the response from the authentication server is returned.
 */
export interface ForwardAuthMiddleware {
	/**
	 * The address option defines the authentication server address.
	 */
	address?: string;
	/**
	 * The tls option is the TLS configuration from Traefik to the authentication server.
	 */
	tls?: {
		/**
		 * Certificate Authority used for the secured connection to the authentication server.
		 */
		ca?: string;
		/**
		 * Policy used for the secured connection with TLS Client Authentication to the authentication server. Requires tls.ca to be defined.
		 */
		caOptional?: boolean;
		/**
		 * Public certificate used for the secured connection to the authentication server.
		 */
		cert?: string;
		/**
		 * Private certificate used for the secure connection to the authentication server.
		 */
		key?: string;
		/**
		 * If insecureSkipVerify is true, TLS for the connection to authentication server accepts any certificate presented by the server and any host name in that certificate.
		 */
		insecureSkipVerify?: boolean;
		[k: string]: unknown;
	};
	/**
	 * Set the trustForwardHeader option to true to trust all the existing X-Forwarded-* headers.
	 */
	trustForwardHeader?: boolean;
	/**
	 * The authResponseHeaders option is the list of the headers to copy from the authentication server to the request.
	 */
	authResponseHeaders?: string[];
	/**
	 * The authResponseHeadersRegex option is the regex to match headers to copy from the authentication server response and set on forwarded request, after stripping all headers that match the regex.
	 */
	authResponseHeadersRegex?: string;
	/**
	 * The authRequestHeaders option is the list of the headers to copy from the request to the authentication server.
	 */
	authRequestHeaders?: string[];
}
/**
 * The Headers middleware can manage the requests/responses headers.
 */
export interface HeadersMiddleware {
	/**
	 * The customRequestHeaders option lists the Header names and values to apply to the request.
	 */
	customRequestHeaders?: {
		[k: string]: string;
	};
	/**
	 * The customResponseHeaders option lists the Header names and values to apply to the response.
	 */
	customResponseHeaders?: {
		[k: string]: string;
	};
	/**
	 * The accessControlAllowCredentials indicates whether the request can include user credentials.
	 */
	accessControlAllowCredentials?: boolean;
	/**
	 * The accessControlAllowHeaders indicates which header field names can be used as part of the request.
	 */
	accessControlAllowHeaders?: string[];
	/**
	 * The accessControlAllowMethods indicates which methods can be used during requests.
	 */
	accessControlAllowMethods?: string[];
	/**
	 * The accessControlAllowOriginList indicates whether a resource can be shared by returning different values.
	 *
	 * A wildcard origin * can also be configured, and will match all requests. If this value is set by a backend server, it will be overwritten by Traefik
	 *
	 * This value can contain a list of allowed origins.
	 */
	accessControlAllowOriginList?: string[];
	/**
	 * The accessControlAllowOriginListRegex option is the counterpart of the accessControlAllowOriginList option with regular expressions instead of origin values.
	 */
	accessControlAllowOriginListRegex?: string[];
	/**
	 * The accessControlExposeHeaders indicates which headers are safe to expose to the api of a CORS API specification.
	 */
	accessControlExposeHeaders?: string[];
	/**
	 * The accessControlMaxAge indicates how long (in seconds) a preflight request can be cached.
	 */
	accessControlMaxAge?: number;
	/**
	 * The addVaryHeader is used in conjunction with accessControlAllowOriginList to determine whether the vary header should be added or modified to demonstrate that server responses can differ based on the value of the origin header.
	 */
	addVaryHeader?: boolean;
	/**
	 * The allowedHosts option lists fully qualified domain names that are allowed.
	 */
	allowedHosts?: string[];
	/**
	 * The hostsProxyHeaders option is a set of header keys that may hold a proxied hostname value for the request.
	 */
	hostsProxyHeaders?: string[];
	/**
	 * The sslRedirect is set to true, then only allow https requests.
	 */
	sslRedirect?: boolean;
	/**
	 * Set the sslTemporaryRedirect to true to force an SSL redirection using a 302 (instead of a 301).
	 */
	sslTemporaryRedirect?: boolean;
	/**
	 * The sslHost option is the host name that is used to redirect http requests to https.
	 */
	sslHost?: string;
	/**
	 * The sslProxyHeaders option is set of header keys with associated values that would indicate a valid https request. Useful when using other proxies with header like: "X-Forwarded-Proto": "https".
	 */
	sslProxyHeaders?: {
		[k: string]: string;
	};
	/**
	 * Set sslForceHost to true and set SSLHost to forced requests to use SSLHost even the ones that are already using SSL.
	 */
	sslForceHost?: boolean;
	/**
	 * The stsSeconds is the max-age of the Strict-Transport-Security header. If set to 0, would NOT include the header.
	 */
	stsSeconds?: number;
	/**
	 * The stsIncludeSubdomains is set to true, the includeSubDomains directive will be appended to the Strict-Transport-Security header.
	 */
	stsIncludeSubdomains?: boolean;
	/**
	 * Set stsPreload to true to have the preload flag appended to the Strict-Transport-Security header.
	 */
	stsPreload?: boolean;
	/**
	 * Set forceSTSHeader to true, to add the STS header even when the connection is HTTP.
	 */
	forceSTSHeader?: boolean;
	/**
	 * Set frameDeny to true to add the X-Frame-Options header with the value of DENY.
	 */
	frameDeny?: boolean;
	/**
	 * The customFrameOptionsValue allows the X-Frame-Options header value to be set with a custom value. This overrides the FrameDeny option.
	 */
	customFrameOptionsValue?: string;
	/**
	 * Set contentTypeNosniff to true to add the X-Content-Type-Options header with the value nosniff.
	 */
	contentTypeNosniff?: boolean;
	/**
	 * Set browserXssFilter to true to add the X-XSS-Protection header with the value 1; mode=block.
	 */
	browserXssFilter?: boolean;
	/**
	 * The customBrowserXssValue option allows the X-XSS-Protection header value to be set with a custom value. This overrides the BrowserXssFilter option.
	 */
	customBrowserXSSValue?: string;
	/**
	 * The contentSecurityPolicy option allows the Content-Security-Policy header value to be set with a custom value.
	 */
	contentSecurityPolicy?: string;
	/**
	 * The publicKey implements HPKP to prevent MITM attacks with forged certificates.
	 */
	publicKey?: string;
	/**
	 * The referrerPolicy allows sites to control when browsers will pass the Referer header to other sites.
	 */
	referrerPolicy?: string;
	/**
	 * The featurePolicy allows sites to control browser features.
	 */
	featurePolicy?: string;
	/**
	 * The permissionsPolicy allows sites to control browser features.
	 */
	permissionsPolicy?: string;
	/**
	 * Set isDevelopment to true when developing. The AllowedHosts, SSL, and STS options can cause some unwanted effects. Usually testing happens on http, not https, and on localhost, not your production domain.
	 * If you would like your development environment to mimic production with complete Host blocking, SSL redirects, and STS headers, leave this as false.
	 */
	isDevelopment?: boolean;
}
/**
 * IPWhitelist accepts / refuses requests based on the client IP.
 */
export interface IpWhiteListMiddleware {
	/**
	 * The sourceRange option sets the allowed IPs (or ranges of allowed IPs by using CIDR notation).
	 */
	sourceRange?: string[];
	ipStrategy?: IpStrategy;
}
/**
 * The ipStrategy option defines parameters that set how Traefik will determine the client IP.
 */
export interface IpStrategy {
	/**
	 * The depth option tells Traefik to use the X-Forwarded-For header and take the IP located at the depth position (starting from the right). If depth is greater than the total number of IPs in X-Forwarded-For, then the client IP will be empty. depth is ignored if its value is lesser than or equal to 0.
	 */
	depth?: number;
	/**
	 * excludedIPs tells Traefik to scan the X-Forwarded-For header and pick the first IP not in the list. If depth is specified, excludedIPs is ignored.
	 */
	excludedIPs?: string[];
}
/**
 * To proactively prevent services from being overwhelmed with high load, a limit on the number of simultaneous in-flight requests can be applied.
 */
export interface InFlightReqMiddleware {
	/**
	 * The amount option defines the maximum amount of allowed simultaneous in-flight request. The middleware will return an HTTP 429 Too Many Requests if there are already amount requests in progress (based on the same sourceCriterion strategy).
	 */
	amount?: number;
	sourceCriterion?: SourceCriterion;
}
/**
 * SourceCriterion defines what criterion is used to group requests as originating from a common source. The precedence order is ipStrategy, then requestHeaderName, then requestHost. If none are set, the default is to use the requestHost.
 */
export interface SourceCriterion {
	ipStrategy?: IpStrategy;
	/**
	 * Requests having the same value for the given header are grouped as coming from the same source.
	 */
	requestHeaderName?: string;
	/**
	 * Whether to consider the request host as the source.
	 */
	requestHost?: boolean;
}
/**
 * PassTLSClientCert adds in header the selected data from the passed client tls certificate.
 */
export interface PassTLSClientCertMiddleware {
	/**
	 * The pem option sets the X-Forwarded-Tls-Client-Cert header with the escape certificate.
	 */
	pem?: boolean;
	/**
	 * The info option select the specific client certificate details you want to add to the X-Forwarded-Tls-Client-Cert-Info header. The value of the header will be an escaped concatenation of all the selected certificate details.
	 */
	info?: {
		/**
		 * Set the notAfter option to true to add the Not After information from the Validity part.
		 */
		notAfter?: boolean;
		/**
		 * Set the notBefore option to true to add the Not Before information from the Validity part.
		 */
		notBefore?: boolean;
		/**
		 * Set the sans option to true to add the Subject Alternative Name information from the Subject Alternative Name part.
		 */
		sans?: boolean;
		/**
		 * The subject select the specific client certificate subject details you want to add to the X-Forwarded-Tls-Client-Cert-Info header.
		 */
		subject?: {
			/**
			 * Set the country option to true to add the country information into the subject.
			 */
			country?: boolean;
			/**
			 * Set the province option to true to add the province information into the subject.
			 */
			province?: boolean;
			/**
			 * Set the locality option to true to add the locality information into the subject.
			 */
			locality?: boolean;
			/**
			 * Set the organization option to true to add the organization information into the subject.
			 */
			organization?: boolean;
			/**
			 * Set the commonName option to true to add the commonName information into the subject.
			 */
			commonName?: boolean;
			/**
			 * Set the serialNumber option to true to add the serialNumber information into the subject.
			 */
			serialNumber?: boolean;
			/**
			 * Set the domainComponent option to true to add the domainComponent information into the subject.
			 */
			domainComponent?: boolean;
			[k: string]: unknown;
		};
		/**
		 * The issuer select the specific client certificate issuer details you want to add to the X-Forwarded-Tls-Client-Cert-Info header.
		 */
		issuer?: {
			/**
			 * Set the country option to true to add the country information into the issuer.
			 */
			country?: boolean;
			/**
			 * Set the province option to true to add the province information into the issuer.
			 */
			province?: boolean;
			/**
			 * Set the locality option to true to add the locality information into the issuer.
			 */
			locality?: boolean;
			/**
			 * Set the organization option to true to add the organization information into the issuer.
			 */
			organization?: boolean;
			/**
			 * Set the commonName option to true to add the commonName information into the issuer.
			 */
			commonName?: boolean;
			/**
			 * Set the serialNumber option to true to add the serialNumber information into the issuer.
			 */
			serialNumber?: boolean;
			/**
			 * Set the domainComponent option to true to add the domainComponent information into the issuer.
			 */
			domainComponent?: boolean;
			[k: string]: unknown;
		};
		[k: string]: unknown;
	};
}
/**
 * Some plugins will need to be configured by adding a dynamic configuration.
 */
export interface PluginMiddleware {
	[k: string]: {
		[k: string]: unknown;
	};
}
/**
 * The RateLimit middleware ensures that services will receive a fair number of requests, and allows one to define what fair is.
 */
export interface RateLimitMiddleware {
	/**
	 * average is the maximum rate, by default in requests by second, allowed for the given source.
	 *
	 * It defaults to 0, which means no rate limiting.
	 *
	 * The rate is actually defined by dividing average by period. So for a rate below 1 req/s, one needs to define a period larger than a second.
	 */
	average?: string | number;
	/**
	 * period, in combination with average, defines the actual maximum rate.
	 *
	 * It defaults to 1 second.
	 */
	period?: string | number;
	/**
	 * burst is the maximum number of requests allowed to go through in the same arbitrarily small period of time.
	 *
	 * It defaults to 1.
	 */
	burst?: number;
	sourceCriterion?: SourceCriterion;
}
/**
 * RegexRedirect redirect a request from an url to another with regex matching and replacement.
 */
export interface RedirectRegexMiddleware {
	/**
	 * Set the permanent option to true to apply a permanent redirection.
	 */
	permanent?: boolean;
	/**
	 * The regex option is the regular expression to match and capture elements from the request URL.
	 */
	regex?: string;
	/**
	 * The replacement option defines how to modify the URL to have the new target URL. Care should be taken when defining replacement expand variables: $1x is equivalent to ${1x}, not ${1}x (see Regexp.Expand), so use ${1} syntax.
	 */
	replacement?: string;
}
/**
 * RedirectScheme redirect request from a scheme to another.
 */
export interface RedirectSchemeMiddleware {
	/**
	 * Set the permanent option to true to apply a permanent redirection.
	 */
	permanent?: boolean;
	/**
	 * The scheme option defines the scheme of the new url.
	 */
	scheme?: string;
	/**
	 * The port option defines the port of the new url. Port in this configuration is a string, not a numeric value.
	 */
	port?: string;
}
/**
 * Replace the path of the request url. It will replace the actual path by the specified one and will store the original path in a X-Replaced-Path header.
 */
export interface ReplacePathMiddleware {
	/**
	 * The path option defines the path to use as replacement in the request url.
	 */
	path?: string;
}
/**
 * The ReplaceRegex replace a path from an url to another with regex matching and replacement. It will replace the actual path by the specified one and store the original path in a X-Replaced-Path header.
 */
export interface ReplacePathRegexMiddleware {
	/**
	 * The regex option is the regular expression to match and capture the path from the request URL.
	 */
	regex?: string;
	/**
	 * The replacement option defines how to modify the path to have the new target path. Care should be taken when defining replacement expand variables: $1x is equivalent to ${1x}, not ${1}x (see Regexp.Expand), so use ${1} syntax.
	 */
	replacement?: string;
}
/**
 * The Retry middleware is in charge of reissuing a request a given number of times to a backend server if that server does not reply. To be clear, as soon as the server answers, the middleware stops retrying, regardless of the response status.
 */
export interface RetryMiddleware {
	/**
	 * The attempts option defines how many times the request should be retried.
	 */
	attempts: number;
	/**
	 * The initialInterval option defines the first wait time in the exponential backoff series.
	 */
	initialInterval?: string;
}
/**
 * Remove the specified prefixes from the URL path. It will strip the matching path prefix and will store the matching path prefix in a X-Forwarded-Prefix header.
 */
export interface StripPrefixMiddleware {
	/**
	 * The prefixes option defines the prefixes to strip from the request URL
	 */
	prefixes?: string[];
	/**
	 * The forceSlash option makes sure that the resulting stripped path is not the empty string, by replacing it with / when necessary.
	 *
	 * This option was added to keep the initial (non-intuitive) behavior of this middleware, in order to avoid introducing a breaking change.
	 *
	 * It's recommended to explicitly set forceSlash to false.
	 */
	forceSlash?: boolean;
}
/**
 * Remove the matching prefixes from the URL path. It will strip the matching path prefix and will store the matching path prefix in a X-Forwarded-Prefix header.
 */
export interface StripPrefixRegexMiddleware {
	/**
	 * The regex option is the regular expression to match the path prefix from the request URL.
	 */
	regex?: string[];
}
/**
 * If both HTTP routers and TCP routers listen to the same entry points, the TCP routers will apply before the HTTP routers. If no matching route is found for the TCP routers, then the HTTP routers will take over.
 */
export interface TcpRouter {
	/**
	 * If not specified, TCP routers will accept requests from all defined entry points. If you want to limit the router scope to a set of entry points, set the entry points option.
	 */
	entryPoints?: string[];
	middlewares?: string[];
	/**
	 * It is important to note that the Server Name Indication is an extension of the TLS protocol. Hence, only TLS routers will be able to specify a domain name with that rule. However, non-TLS routers will have to explicitly use that rule with * (every domain) to state that every non-TLS request will be handled by the router.
	 */
	rule: string;
	/**
	 * You must attach a TCP service per TCP router. Services are the target for the router. TCP routers can only target TCP services (not HTTP services).
	 */
	service: string;
	/**
	 * To avoid path overlap, routes are sorted, by default, in descending order using rules length. The priority is directly equal to the length of the rule, and so the longest length has the highest priority. A value of 0 for the priority is ignored: priority = 0 means that the default rules length sorting is used.
	 */
	priority?: number;
	/**
	 * When a TLS section is specified, it instructs Traefik that the current router is dedicated to TLS requests only (and that the router should ignore non-TLS requests).
	 *
	 * By default, a router with a TLS section will terminate the TLS connections, meaning that it will send decrypted data to the services.
	 */
	tls?: {
		/**
		 * A TLS router will terminate the TLS connection by default. However, the passthrough option can be specified to set whether the requests should be forwarded "as is", keeping all data encrypted.
		 */
		passthrough?: boolean;
		/**
		 * The options field enables fine-grained control of the TLS parameters. It refers to a TLS Options and will be applied only if a Host rule is defined.
		 */
		options?: string;
		/**
		 * If certResolver is defined, Traefik will try to generate certificates based on routers Host & HostSNI rules.
		 */
		certResolver?: string;
		/**
		 * You can set SANs (alternative domains) for each main domain. Every domain must have A/AAAA records pointing to Traefik. Each domain & SAN will lead to a certificate request.
		 */
		domains?: {
			/**
			 * Main defines the main domain name.
			 */
			main?: string;
			/**
			 * SANs defines the subject alternative domain names.
			 */
			sans?: string[];
			[k: string]: unknown;
		}[];
		[k: string]: unknown;
	};
}
export interface TcpLoadBalancerService {
	/**
	 * Servers declare a single instance of your program.
	 *
	 * @minItems 1
	 */
	servers: [
		{
			/**
			 * The address option (IP:Port) point to a specific instance.
			 */
			address: string;
			[k: string]: unknown;
		},
		...{
			/**
			 * The address option (IP:Port) point to a specific instance.
			 */
			address: string;
			[k: string]: unknown;
		}[],
	];
	/**
	 * As a proxy between a client and a server, it can happen that either side (e.g. client side) decides to terminate its writing capability on the connection (i.e. issuance of a FIN packet). The proxy needs to propagate that intent to the other side, and so when that happens, it also does the same on its connection with the other side (e.g. backend side).
	 *
	 * However, if for some reason (bad implementation, or malicious intent) the other side does not eventually do the same as well, the connection would stay half-open, which would lock resources for however long.
	 *
	 * To that end, as soon as the proxy enters this termination sequence, it sets a deadline on fully terminating the connections on both sides.
	 *
	 * The termination delay controls that deadline. It is a duration in milliseconds, defaulting to 100. A negative value means an infinite deadline (i.e. the connection is never fully terminated by the proxy itself).
	 */
	terminationDelay?: number;
	proxyProtocol?: {
		version?: number;
		[k: string]: unknown;
	};
}
export interface TcpWeightedService {
	/**
	 * @minItems 1
	 */
	services: [
		{
			name: string;
			weight: number;
		},
		...{
			name: string;
			weight: number;
		}[],
	];
}
export interface UdpRouter {
	/**
	 * If not specified, UDP routers will accept packets from all defined (UDP) entry points. If one wants to limit the router scope to a set of entry points, one should set the entry points option.
	 */
	entryPoints?: string[];
	/**
	 * There must be one (and only one) UDP service referenced per UDP router. Services are the target for the router.
	 */
	service: string;
}
/**
 * The servers load balancer is in charge of balancing the requests between the servers of the same service.
 */
export interface UdpLoadBalancerService {
	/**
	 * The servers field defines all the servers that are part of this load-balancing group, i.e. each address (IP:Port) on which an instance of the service's program is deployed.
	 *
	 * @minItems 1
	 */
	servers: [
		{
			address: string;
			[k: string]: unknown;
		},
		...{
			address: string;
			[k: string]: unknown;
		}[],
	];
}
export interface UdpWeightedService {
	/**
	 * @minItems 1
	 */
	services: [
		{
			name: string;
			weight: number;
		},
		...{
			name: string;
			weight: number;
		}[],
	];
}
