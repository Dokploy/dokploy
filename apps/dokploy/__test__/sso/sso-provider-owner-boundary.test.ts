import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	deleteReturning: vi.fn(),
	deleteWhere: vi.fn(),
	hasValidLicense: vi.fn(),
	registerSSOProvider: vi.fn(),
	requestToHeaders: vi.fn(),
	ssoProviderFindFirst: vi.fn(),
	ssoProviderFindMany: vi.fn(),
	updateSSOProvider: vi.fn(),
	updateSet: vi.fn(),
	updateWhere: vi.fn(),
	userFindFirst: vi.fn(),
}));

vi.mock("@dokploy/server", () => ({
	getOrganizationOwnerId: vi.fn().mockResolvedValue("owner-1"),
	normalizeTrustedOrigin: (origin: string) => origin,
	requestToHeaders: mocks.requestToHeaders,
}));

vi.mock("@dokploy/server/constants", () => ({
	IS_CLOUD: false,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			member: {
				findFirst: vi.fn(),
			},
			ssoProvider: {
				findFirst: mocks.ssoProviderFindFirst,
				findMany: mocks.ssoProviderFindMany,
			},
			user: {
				findFirst: mocks.userFindFirst,
			},
		},
		delete: vi.fn(() => ({
			where: mocks.deleteWhere.mockReturnValue({
				returning: mocks.deleteReturning,
			}),
		})),
		update: vi.fn(() => ({
			set: mocks.updateSet.mockReturnValue({
				where: mocks.updateWhere,
			}),
		})),
	},
}));

vi.mock("@dokploy/server/index", () => ({
	getOrganizationOwnerId: vi.fn().mockResolvedValue("owner-1"),
	normalizeTrustedOrigin: (origin: string) => origin,
	requestToHeaders: mocks.requestToHeaders,
}));

vi.mock("@dokploy/server/lib/auth", () => ({
	auth: {
		registerSSOProvider: mocks.registerSSOProvider,
		updateSSOProvider: mocks.updateSSOProvider,
	},
}));

vi.mock("@dokploy/server/services/proprietary/license-key", () => ({
	hasValidLicense: mocks.hasValidLicense,
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getWebServerSettings: vi.fn(),
}));

const { ssoRouter } = await import("../../server/api/routers/proprietary/sso");

const providerInput = {
	providerId: "acme-sso",
	issuer: "https://8.8.8.8",
	domains: ["example.com"],
	oidcConfig: {
		clientId: "client-id",
		clientSecret: "client-secret",
	},
};

const REDACTED_SECRET_VALUE = "__DOKPLOY_REDACTED_SECRET__";

const samlSecretConfig = {
	entryPoint: "https://idp.example.com/saml",
	cert: "idp-signing-cert",
	callbackUrl:
		"https://dokploy.example.com/api/auth/sso/saml2/callback/acme-sso",
	audience: "https://dokploy.example.com",
	idpMetadata: {
		metadata: "<EntityDescriptor>secret metadata</EntityDescriptor>",
		entityID: "https://idp.example.com",
		cert: "idp-public-cert",
		privateKey: "idp-private-key",
		privateKeyPass: "idp-private-pass",
		encPrivateKey: "idp-enc-private-key",
		encPrivateKeyPass: "idp-enc-private-pass",
	},
	spMetadata: {
		metadata: "<EntityDescriptor>sp metadata</EntityDescriptor>",
		entityID: "https://dokploy.example.com",
		privateKey: "sp-private-key",
		privateKeyPass: "sp-private-pass",
		encPrivateKey: "sp-enc-private-key",
		encPrivateKeyPass: "sp-enc-private-pass",
	},
	privateKey: "top-private-key",
	decryptionPvk: "top-decryption-key",
	mapping: {
		id: "nameID",
		email: "email",
		name: "displayName",
	},
};

const cloneSamlConfig = () =>
	JSON.parse(JSON.stringify(samlSecretConfig)) as typeof samlSecretConfig;

const createCaller = (role: "owner" | "admin" = "admin") =>
	ssoRouter.createCaller({
		db: {},
		req: {},
		res: {},
		session: {
			userId: "user-1",
			activeOrganizationId: "org-1",
		},
		user: {
			id: "user-1",
			role,
		},
	} as never);

describe("SSO provider owner boundary", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.hasValidLicense.mockResolvedValue(true);
		mocks.requestToHeaders.mockReturnValue(new Headers());
		mocks.ssoProviderFindFirst.mockResolvedValue({
			id: "provider-row-1",
			issuer: "https://idp.example.com",
			domain: "example.com",
			oidcConfig: JSON.stringify({ clientSecret: "stored-secret" }),
			samlConfig: null,
			userId: "user-1",
		});
		mocks.ssoProviderFindMany.mockResolvedValue([]);
		mocks.deleteReturning.mockResolvedValue([{ id: "provider-row-1" }]);
		mocks.userFindFirst.mockResolvedValue({
			trustedOrigins: ["https://8.8.8.8"],
		});
	});

	it.each([
		["register", () => createCaller("admin").register(providerInput)],
		["update", () => createCaller("admin").update(providerInput)],
		[
			"deleteProvider",
			() => createCaller("admin").deleteProvider({ providerId: "acme-sso" }),
		],
	])("denies org admins from %s before SSO side effects", async (_, call) => {
		await expect(call()).rejects.toMatchObject({ code: "UNAUTHORIZED" });

		expect(mocks.registerSSOProvider).not.toHaveBeenCalled();
		expect(mocks.updateSSOProvider).not.toHaveBeenCalled();
		expect(mocks.deleteReturning).not.toHaveBeenCalled();
	});

	it("allows enterprise owners to register SSO providers", async () => {
		await expect(
			createCaller("owner").register(providerInput),
		).resolves.toEqual({
			success: true,
		});

		expect(mocks.hasValidLicense).toHaveBeenCalledWith("org-1");
		expect(mocks.registerSSOProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					organizationId: "org-1",
					domain: "example.com",
				}),
			}),
		);
	});

	it("rejects SSO provider registration when the issuer is not tenant trusted", async () => {
		mocks.userFindFirst.mockResolvedValue({ trustedOrigins: [] });

		await expect(
			createCaller("owner").register(providerInput),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"The Issuer URL is not in the organization's trusted origins list. Please add it in Manage origins before registering.",
		});

		expect(mocks.registerSSOProvider).not.toHaveBeenCalled();
	});

	it("allows SSO provider registration when the issuer path uses a trusted origin", async () => {
		mocks.userFindFirst.mockResolvedValue({
			trustedOrigins: ["https://8.8.8.8"],
		});

		await expect(
			createCaller("owner").register({
				...providerInput,
				issuer: "https://8.8.8.8/realms/acme",
			}),
		).resolves.toEqual({ success: true });

		expect(mocks.registerSSOProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					issuer: "https://8.8.8.8/realms/acme",
				}),
			}),
		);
	});

	it("does not let unverified SSO provider domains reserve ownership", async () => {
		mocks.ssoProviderFindMany.mockResolvedValue([
			{
				domain: "example.com",
				domainVerified: false,
			},
		]);

		await expect(
			createCaller("owner").register(providerInput),
		).resolves.toEqual({
			success: true,
		});

		expect(mocks.registerSSOProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					domain: "example.com",
				}),
			}),
		);
	});

	it("redacts SAML private-key material from provider reads", async () => {
		const provider = {
			id: "provider-row-1",
			providerId: "acme-sso",
			issuer: "https://idp.example.com",
			domain: "example.com",
			oidcConfig: null,
			samlConfig: JSON.stringify(samlSecretConfig),
			organizationId: "org-1",
		};
		mocks.ssoProviderFindMany.mockResolvedValue([provider]);
		mocks.ssoProviderFindFirst.mockResolvedValue(provider);

		const providers = await createCaller("admin").listProviders();
		const listedSamlConfig = JSON.parse(providers[0]?.samlConfig ?? "{}");
		expect(listedSamlConfig.cert).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.decryptionPvk).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.idpMetadata.metadata).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.idpMetadata.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.idpMetadata.privateKeyPass).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.idpMetadata.encPrivateKey).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.idpMetadata.encPrivateKeyPass).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.spMetadata.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(listedSamlConfig.spMetadata.privateKeyPass).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.spMetadata.encPrivateKey).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.spMetadata.encPrivateKeyPass).toBe(
			REDACTED_SECRET_VALUE,
		);
		expect(listedSamlConfig.entryPoint).toBe(samlSecretConfig.entryPoint);
		expect(listedSamlConfig.idpMetadata.cert).toBe(
			samlSecretConfig.idpMetadata.cert,
		);

		const oneProvider = await createCaller("admin").one({
			providerId: "acme-sso",
		});
		const oneSamlConfig = JSON.parse(oneProvider.samlConfig ?? "{}");
		expect(oneSamlConfig.spMetadata.privateKey).toBe(REDACTED_SECRET_VALUE);
		expect(oneSamlConfig.decryptionPvk).toBe(REDACTED_SECRET_VALUE);
	});

	it("preserves stored SAML private-key material when update submits redacted placeholders", async () => {
		const existingSamlConfig = cloneSamlConfig();
		mocks.ssoProviderFindFirst.mockResolvedValue({
			id: "provider-row-1",
			issuer: "https://idp.example.com",
			domain: "example.com",
			oidcConfig: null,
			samlConfig: JSON.stringify(existingSamlConfig),
			userId: "user-1",
		});

		const nextSamlConfig = cloneSamlConfig();
		nextSamlConfig.entryPoint = "https://idp.example.com/updated-saml";
		nextSamlConfig.cert = REDACTED_SECRET_VALUE;
		nextSamlConfig.privateKey = REDACTED_SECRET_VALUE;
		nextSamlConfig.decryptionPvk = REDACTED_SECRET_VALUE;
		nextSamlConfig.idpMetadata.metadata = REDACTED_SECRET_VALUE;
		nextSamlConfig.idpMetadata.privateKey = REDACTED_SECRET_VALUE;
		nextSamlConfig.idpMetadata.privateKeyPass = REDACTED_SECRET_VALUE;
		nextSamlConfig.idpMetadata.encPrivateKey = REDACTED_SECRET_VALUE;
		nextSamlConfig.idpMetadata.encPrivateKeyPass = REDACTED_SECRET_VALUE;
		nextSamlConfig.spMetadata.privateKey = REDACTED_SECRET_VALUE;
		nextSamlConfig.spMetadata.privateKeyPass = REDACTED_SECRET_VALUE;
		nextSamlConfig.spMetadata.encPrivateKey = REDACTED_SECRET_VALUE;
		nextSamlConfig.spMetadata.encPrivateKeyPass = REDACTED_SECRET_VALUE;

		await expect(
			createCaller("owner").update({
				providerId: "acme-sso",
				issuer: "https://idp.example.com",
				domains: ["example.com"],
				samlConfig: nextSamlConfig,
			}),
		).resolves.toEqual({ success: true });

		const updateBody = mocks.updateSSOProvider.mock.calls[0]?.[0]?.body;
		expect(updateBody.samlConfig.entryPoint).toBe(
			"https://idp.example.com/updated-saml",
		);
		expect(updateBody.samlConfig.cert).toBe(existingSamlConfig.cert);
		expect(updateBody.samlConfig.privateKey).toBe(
			existingSamlConfig.privateKey,
		);
		expect(updateBody.samlConfig.decryptionPvk).toBe(
			existingSamlConfig.decryptionPvk,
		);
		expect(updateBody.samlConfig.idpMetadata.metadata).toBe(
			existingSamlConfig.idpMetadata.metadata,
		);
		expect(updateBody.samlConfig.idpMetadata.privateKey).toBe(
			existingSamlConfig.idpMetadata.privateKey,
		);
		expect(updateBody.samlConfig.idpMetadata.privateKeyPass).toBe(
			existingSamlConfig.idpMetadata.privateKeyPass,
		);
		expect(updateBody.samlConfig.idpMetadata.encPrivateKey).toBe(
			existingSamlConfig.idpMetadata.encPrivateKey,
		);
		expect(updateBody.samlConfig.idpMetadata.encPrivateKeyPass).toBe(
			existingSamlConfig.idpMetadata.encPrivateKeyPass,
		);
		expect(updateBody.samlConfig.spMetadata.privateKey).toBe(
			existingSamlConfig.spMetadata.privateKey,
		);
		expect(updateBody.samlConfig.spMetadata.privateKeyPass).toBe(
			existingSamlConfig.spMetadata.privateKeyPass,
		);
		expect(updateBody.samlConfig.spMetadata.encPrivateKey).toBe(
			existingSamlConfig.spMetadata.encPrivateKey,
		);
		expect(updateBody.samlConfig.spMetadata.encPrivateKeyPass).toBe(
			existingSamlConfig.spMetadata.encPrivateKeyPass,
		);
	});

	it("rejects SSO provider updates that reuse a domain from another organization", async () => {
		mocks.ssoProviderFindFirst.mockResolvedValue({
			id: "provider-row-1",
			issuer: "https://idp.example.com",
			domain: "example.com",
			oidcConfig: JSON.stringify({ clientSecret: "stored-secret" }),
			samlConfig: null,
			userId: "user-1",
		});
		mocks.ssoProviderFindMany.mockResolvedValue([
			{
				id: "provider-row-1",
				domain: "example.com",
				domainVerified: true,
			},
			{
				id: "other-org-provider",
				domain: "shared.example.com",
				domainVerified: true,
			},
		]);

		await expect(
			createCaller("owner").update({
				...providerInput,
				domains: ["shared.example.com"],
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"Domain shared.example.com is already registered for another provider",
		});

		expect(mocks.updateSSOProvider).not.toHaveBeenCalled();
	});

	it("allows SSO provider updates to keep domains from the same provider row", async () => {
		mocks.ssoProviderFindFirst.mockResolvedValue({
			id: "provider-row-1",
			issuer: "https://idp.example.com",
			domain: "example.com",
			oidcConfig: JSON.stringify({ clientSecret: "stored-secret" }),
			samlConfig: null,
			userId: "user-1",
		});
		mocks.ssoProviderFindMany.mockResolvedValue([
			{
				id: "provider-row-1",
				domain: "example.com",
				domainVerified: true,
			},
		]);

		await expect(createCaller("owner").update(providerInput)).resolves.toEqual({
			success: true,
		});

		expect(mocks.updateSSOProvider).toHaveBeenCalledWith(
			expect.objectContaining({
				body: expect.objectContaining({
					domain: "example.com",
				}),
			}),
		);
	});

	it("rejects private tenant trusted origins before storing them", async () => {
		await expect(
			createCaller("owner").addTrustedOrigin({
				origin: "https://127.0.0.1:8443",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringMatching(/Trusted origin/i),
		});

		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("stores only public HTTPS tenant trusted origins", async () => {
		mocks.userFindFirst.mockResolvedValue({ trustedOrigins: [] });

		await expect(
			createCaller("owner").addTrustedOrigin({
				origin: "https://8.8.8.8",
			}),
		).resolves.toEqual({ success: true });

		expect(mocks.updateSet).toHaveBeenCalledWith({
			trustedOrigins: ["https://8.8.8.8"],
		});
	});

	it("rejects private tenant trusted origin updates before storing them", async () => {
		mocks.userFindFirst.mockResolvedValue({
			trustedOrigins: ["https://8.8.8.8"],
		});

		await expect(
			createCaller("owner").updateTrustedOrigin({
				oldOrigin: "https://8.8.8.8",
				newOrigin: "https://127.0.0.1:8443",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: expect.stringMatching(/Trusted origin/i),
		});

		expect(mocks.updateSet).not.toHaveBeenCalled();
	});

	it("filters private legacy trusted origins from tenant reads", async () => {
		mocks.userFindFirst.mockResolvedValue({
			trustedOrigins: ["https://8.8.8.8", "https://127.0.0.1:8443"],
		});

		await expect(createCaller("owner").getTrustedOrigins()).resolves.toEqual([
			"https://8.8.8.8",
		]);
	});

	it("does not allow legacy private trusted origins to approve issuer changes", async () => {
		mocks.userFindFirst.mockResolvedValue({
			trustedOrigins: ["https://127.0.0.1:8443"],
		});

		await expect(
			createCaller("owner").update({
				...providerInput,
				issuer: "https://127.0.0.1:8443",
			}),
		).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message:
				"The new Issuer URL is not in the organization's trusted origins list. Please add it in Manage origins before saving.",
		});

		expect(mocks.updateSSOProvider).not.toHaveBeenCalled();
	});
});
