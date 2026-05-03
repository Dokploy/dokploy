import { CloudflareConfigForm } from "./cloudflare-config-form";
import { CloudflareZoneList } from "./cloudflare-zone-list";
import { LocalTunnelSection } from "./local-tunnel-section";

export const ShowCloudflare = () => {
	return (
		<div className="flex flex-col gap-6 w-full">
			<CloudflareConfigForm />
			<CloudflareZoneList />
			<LocalTunnelSection />
		</div>
	);
};
