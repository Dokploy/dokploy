import { ProxyList } from "@/components/dashboard/proxy/proxy-list";
import { DashboardLayout } from "@/components/layouts/dashboard-layout";

export default function ProxyPage() {
	return (
		<DashboardLayout>
			<ProxyList />
		</DashboardLayout>
	);
}

