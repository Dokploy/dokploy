import { CloudflareConfigForm } from "./cloudflare-config-form";
import { CloudflareZoneList } from "./cloudflare-zone-list";

export const ShowCloudflare = () => {
	return (
		<div className="flex flex-col gap-6 w-full">
			<CloudflareConfigForm />
			<CloudflareZoneList />
		</div>
	);
};
