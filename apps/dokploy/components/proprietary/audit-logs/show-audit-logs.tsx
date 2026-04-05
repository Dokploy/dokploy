import { ClipboardList } from "lucide-react";
import React from "react";
import { EnterpriseFeatureGate } from "@/components/proprietary/enterprise-feature-gate";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";
import { columns } from "./columns";
import { type AuditLogFilters, DataTable } from "./data-table";

function AuditLogsContent() {
	const [pageIndex, setPageIndex] = React.useState(0);
	const [pageSize, setPageSize] = React.useState(50);
	const [filters, setFilters] = React.useState<AuditLogFilters>({
		userEmail: "",
		resourceName: "",
		action: "",
		resourceType: "",
		dateRange: undefined,
	});

	const [debouncedText, setDebouncedText] = React.useState({
		userEmail: "",
		resourceName: "",
	});

	React.useEffect(() => {
		const t = setTimeout(() => {
			setDebouncedText({
				userEmail: filters.userEmail,
				resourceName: filters.resourceName,
			});
			setPageIndex(0);
		}, 400);
		return () => clearTimeout(t);
	}, [filters.userEmail, filters.resourceName]);

	const handleFilterChange = <K extends keyof AuditLogFilters>(
		key: K,
		value: AuditLogFilters[K],
	) => {
		setFilters((prev) => ({ ...prev, [key]: value }));
		if (key !== "userEmail" && key !== "resourceName") {
			setPageIndex(0);
		}
	};

	const handlePageSizeChange = (size: number) => {
		setPageSize(size);
		setPageIndex(0);
	};

	const { data, isLoading } = api.auditLog.all.useQuery({
		userEmail: debouncedText.userEmail || undefined,
		resourceName: debouncedText.resourceName || undefined,
		action: filters.action || undefined,
		resourceType: filters.resourceType || undefined,
		from: filters.dateRange?.from,
		to: filters.dateRange?.to,
		limit: pageSize,
		offset: pageIndex * pageSize,
	});

	return (
		<DataTable
			columns={columns}
			data={data?.logs ?? []}
			total={data?.total ?? 0}
			pageIndex={pageIndex}
			pageSize={pageSize}
			filters={filters}
			onPageChange={setPageIndex}
			onPageSizeChange={handlePageSizeChange}
			onFilterChange={handleFilterChange}
			isLoading={isLoading}
		/>
	);
}

export function ShowAuditLogs() {
	return (
		<Card className="h-full bg-sidebar p-2.5 rounded-xl max-w-6xl w-full mx-auto">
			<div className="rounded-xl bg-background shadow-md ">
				<EnterpriseFeatureGate
					lockedProps={{
						title: "Audit Logs",
						description:
							"Get full visibility into every action performed across your organization. Audit logs are available as part of Gocker Enterprise.",
						ctaLabel: "Manage License",
					}}
				>
					<CardHeader>
						<CardTitle className="text-xl flex flex-row gap-2">
							<ClipboardList className="h-5 w-5 text-muted-foreground self-center" />
							Audit Logs
						</CardTitle>
						<CardDescription>
							Track all actions performed by members in your organization.
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2 py-8 border-t">
						<AuditLogsContent />
					</CardContent>
				</EnterpriseFeatureGate>
			</div>
		</Card>
	);
}
