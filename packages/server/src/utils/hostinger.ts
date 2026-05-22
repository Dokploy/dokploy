import {
	BillingCatalogApi,
	BillingSubscriptionsApi,
	Configuration,
	VPSDataCentersApi,
	VPSVirtualMachineApi,
} from "hostinger-api-sdk";

export type {
	BillingV1CatalogCatalogItemResource as HostingerCatalogItem,
	VPSV1DataCenterDataCenterResource as HostingerDataCenter,
	VPSV1VirtualMachinePurchaseRequest as HostingerPurchaseRequest,
	VPSV1VirtualMachineVirtualMachineResource as HostingerVM,
} from "hostinger-api-sdk";

// Correct base URL — api.hostinger.com returns 530, developers.hostinger.com is the real gateway
const HOSTINGER_BASE_PATH = "https://developers.hostinger.com";

function getConfig() {
	const apiKey = process.env.HOSTINGER_API_KEY;
	if (!apiKey) throw new Error("HOSTINGER_API_KEY is not set");
	return new Configuration({
		basePath: HOSTINGER_BASE_PATH,
		accessToken: apiKey,
	});
}

function getVmApi() {
	return new VPSVirtualMachineApi(getConfig());
}

export async function getHostingerDataCenters() {
	try {
		const api = new VPSDataCentersApi(getConfig());
		const res = await api.getDataCenterListV1();
		return res.data;
	} catch (error) {
		console.log(error);
	}
}

export async function getHostingerVpsCatalog() {
	const api = new BillingCatalogApi(getConfig());
	const res = await api.getCatalogItemListV1("VPS");
	return res.data;
}

const FAKE_VM_ID = 999999;

export async function purchaseHostingerVps(
	body: import("hostinger-api-sdk").VPSV1VirtualMachinePurchaseRequest,
): Promise<import("hostinger-api-sdk").BillingV1OrderVirtualMachineOrderResource> {
	if (process.env.HOSTINGER_DRY_RUN === "true") {
		console.log("[hostinger dry-run] purchaseHostingerVps called, skipping real purchase");
		return {
			virtual_machine: {
				id: FAKE_VM_ID,
				hostname: body.setup.hostname,
				state: "initial",
				ipv4: [],
				subscription_id: "dry-run-sub-123",
			},
		} as never;
	}
	const api = getVmApi();
	const res = await api.purchaseNewVirtualMachineV1(body);
	return res.data;
}

export async function getHostingerVm(vmId: number) {
	if (process.env.HOSTINGER_DRY_RUN === "true") {
		console.log(`[hostinger dry-run] getHostingerVm(${vmId})`);
		return {
			id: vmId,
			hostname: "dry-run-vm",
			state: "running",
			ipv4: [{ address: "1.2.3.4" }],
			subscription_id: "dry-run-sub-123",
		} as never;
	}
	const api = getVmApi();
	const res = await api.getVirtualMachineDetailsV1(vmId);
	return res.data;
}

export async function stopHostingerVm(vmId: number) {
	if (process.env.HOSTINGER_DRY_RUN === "true") {
		console.log(`[hostinger dry-run] stopHostingerVm(${vmId})`);
		return;
	}
	const api = getVmApi();
	await api.stopVirtualMachineV1(vmId);
}

export async function cancelHostingerSubscription(subscriptionId: string) {
	if (process.env.HOSTINGER_DRY_RUN === "true") {
		console.log(`[hostinger dry-run] cancelHostingerSubscription(${subscriptionId})`);
		return;
	}
	const api = new BillingSubscriptionsApi(getConfig());
	await api.cancelSubscriptionV1(subscriptionId, {
		reason_code: "other",
		cancel_option: "immediately",
	});
}

/** Ubuntu 22.04 LTS template ID on Hostinger */
export const UBUNTU_22_TEMPLATE_ID = 1009;

/**
 * Markup multiplier applied to Hostinger's catalog price to get Dokploy's user price.
 * Hostinger KVM2 = ~$24.49/mo → Dokploy charges $45/mo (~84% markup).
 */
const MARKUP = 1.84;

export interface ManagedServerPlan {
	id: string;
	name: string;
	hostingerItemIdMonthly: string;
	hostingerItemIdAnnual: string;
	cpus: number;
	memoryMb: number;
	diskMb: number;
	bandwidthMb: number;
	/** Price in cents Hostinger charges us monthly */
	hostingerPriceCentsMonthly: number;
	/** Price in cents we charge the user monthly */
	dokployPriceCentsMonthly: number;
	/** Price in cents we charge the user annually */
	dokployPriceCentsAnnual: number;
}

/** KVM plan IDs offered through Dokploy (excludes Game Panel plans) */
const OFFERED_PLAN_IDS = [
	"hostingercom-vps-kvm1",
	"hostingercom-vps-kvm2",
	"hostingercom-vps-kvm4",
	"hostingercom-vps-kvm8",
];

/**
 * Fetches live VPS plans from Hostinger catalog and applies Dokploy markup.
 * Only returns standard KVM plans (not Game Panel variants).
 */
export async function getManagedServerPlans(): Promise<ManagedServerPlan[]> {
	const catalog = await getHostingerVpsCatalog();

	const plans: ManagedServerPlan[] = [];

	for (const item of catalog) {
		if (!OFFERED_PLAN_IDS.includes(item.id ?? "")) continue;

		const meta = item.metadata as Record<string, string> | null;
		const cpus = Number(meta?.cpus ?? 0);
		const memoryMb = Number(meta?.memory ?? 0);
		const diskMb = Number(meta?.disk_space ?? 0);
		const bandwidthMb = Number(meta?.bandwidth ?? 0);

		const monthlyPrice = item.prices?.find(
			(p) => p.period === 1 && p.period_unit === "month",
		);
		const annualPrice = item.prices?.find(
			(p) => p.period === 1 && p.period_unit === "year",
		);

		if (!monthlyPrice) continue;

		const hostingerMonthly = monthlyPrice.price ?? 0;
		const hostingerAnnual = annualPrice?.price ?? hostingerMonthly * 12;

		// Apply markup and round to nearest $0.50 (50 cents)
		const dokployMonthly = Math.ceil((hostingerMonthly * MARKUP) / 50) * 50;
		const dokployAnnual = Math.ceil((hostingerAnnual * MARKUP) / 50) * 50;

		// Derive hostinger item IDs for monthly and annual billing
		const hostingerItemIdMonthly = monthlyPrice.id ?? `${item.id}-usd-1m`;
		const hostingerItemIdAnnual = annualPrice?.id ?? `${item.id}-usd-1y`;

		// Map hostinger plan names to friendly names
		const friendlyNames: Record<string, string> = {
			"hostingercom-vps-kvm1": "Starter",
			"hostingercom-vps-kvm2": "Basic",
			"hostingercom-vps-kvm4": "Growth",
			"hostingercom-vps-kvm8": "Scale",
		};

		plans.push({
			id: item.id ?? "",
			name: friendlyNames[item.id ?? ""] ?? item.name ?? item.id ?? "",
			hostingerItemIdMonthly,
			hostingerItemIdAnnual,
			cpus,
			memoryMb,
			diskMb,
			bandwidthMb,
			hostingerPriceCentsMonthly: hostingerMonthly,
			dokployPriceCentsMonthly: dokployMonthly,
			dokployPriceCentsAnnual: dokployAnnual,
		});
	}

	return plans;
}

export type ManagedServerPlanId = string;
