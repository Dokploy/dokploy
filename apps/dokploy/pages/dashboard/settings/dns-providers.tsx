import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { ShowDnsProviders } from "@/components/dashboard/settings/dns-providers/show-dns-providers";

const DnsProvidersPage = () => {
	return (
		<DashboardLayout>
			<div className="w-full">
				<ShowDnsProviders />
			</div>
		</DashboardLayout>
	);
};

export default DnsProvidersPage;