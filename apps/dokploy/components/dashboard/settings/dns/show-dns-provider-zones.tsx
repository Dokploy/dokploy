import {
	ChevronDown,
	ChevronRight,
	Globe,
	Loader2,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { DialogAction } from "@/components/shared/dialog-action";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/utils/api";
import { HandleDnsRecord } from "./handle-dns-record";

interface ZoneRecordsProps {
	dnsProviderId: string;
	zoneId: string;
	zoneName: string;
}

const ZoneRecords = ({ dnsProviderId, zoneId, zoneName }: ZoneRecordsProps) => {
	const utils = api.useUtils();
	const { data, isLoading, isError, error } =
		api.dnsProvider.listRecords.useQuery({ dnsProviderId, zoneId });
	const { data: permissions } = api.user.getPermissions.useQuery();
	const { mutateAsync: deleteRecord, isPending: isDeleting } =
		api.dnsProvider.deleteRecord.useMutation();

	const canWrite = !!permissions?.dnsProvider.update;
	const canDelete = !!permissions?.dnsProvider.delete;

	return (
		<div className="flex flex-col gap-1 pl-8 pb-2 pr-3">
			{isLoading && (
				<div className="flex flex-row gap-2 items-center text-sm text-muted-foreground py-3">
					<span>Loading records...</span>
					<Loader2 className="animate-spin size-4" />
				</div>
			)}
			{isError && (
				<p className="text-sm text-destructive py-2">{error?.message}</p>
			)}
			{data && data.length === 0 && (
				<p className="text-sm text-muted-foreground py-2">
					No records found in this zone.
				</p>
			)}
			{data?.map((record) => {
				const isEditable = record.type === "A" || record.type === "CNAME";
				return (
					<div
						key={record.id}
						className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs"
					>
						<Badge variant="outline" className="shrink-0">
							{record.type}
						</Badge>
						<span className="font-medium truncate">{record.name}</span>
						<span className="text-muted-foreground truncate flex-1">
							→ {record.content}
						</span>
						{canWrite && isEditable && (
							<HandleDnsRecord
								dnsProviderId={dnsProviderId}
								zoneId={zoneId}
								zoneName={zoneName}
								record={record}
							/>
						)}
						{canDelete && (
							<DialogAction
								title="Delete Record"
								description={`Delete the ${record.type} record "${record.name}"? This removes it from the DNS provider, not just from Dokploy.`}
								type="destructive"
								onClick={async () => {
									await deleteRecord({
										dnsProviderId,
										zoneId,
										recordId: record.id,
									})
										.then(() => {
											toast.success("Record deleted");
											utils.dnsProvider.listRecords.invalidate({
												dnsProviderId,
												zoneId,
											});
										})
										.catch(() => {
											toast.error("Error deleting the record");
										});
								}}
							>
								<Button
									variant="ghost"
									size="icon"
									className="group hover:bg-red-500/10 size-6"
									isLoading={isDeleting}
								>
									<Trash2 className="size-3.5 text-primary group-hover:text-red-500" />
								</Button>
							</DialogAction>
						)}
					</div>
				);
			})}
			{canWrite && (
				<div className="pt-1">
					<HandleDnsRecord
						dnsProviderId={dnsProviderId}
						zoneId={zoneId}
						zoneName={zoneName}
					/>
				</div>
			)}
		</div>
	);
};

interface Props {
	dnsProviderId: string;
	providerName: string;
}

export const ShowDnsProviderZones = ({
	dnsProviderId,
	providerName,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [expandedZoneId, setExpandedZoneId] = useState<string | null>(null);

	const { data, isLoading, isError, error } =
		api.dnsProvider.listZones.useQuery({ dnsProviderId }, { enabled: isOpen });

	return (
		<Dialog
			open={isOpen}
			onOpenChange={(open) => {
				setIsOpen(open);
				if (!open) {
					setExpandedZoneId(null);
				}
			}}
		>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					<Globe className="size-3.5 mr-1.5" />
					View Domains
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Domains for {providerName}</DialogTitle>
					<DialogDescription>
						Zones this provider's API token can manage. Click a zone to see and
						manage its records.
					</DialogDescription>
				</DialogHeader>
				{isLoading && (
					<div className="flex flex-row gap-2 items-center justify-center text-sm text-muted-foreground py-6">
						<span>Loading...</span>
						<Loader2 className="animate-spin size-4" />
					</div>
				)}
				{isError && (
					<p className="text-sm text-destructive py-2">{error?.message}</p>
				)}
				{data && data.length === 0 && (
					<p className="text-sm text-muted-foreground py-2">
						No zones found for this token. Make sure it has access to at least
						one zone.
					</p>
				)}
				{data && data.length > 0 && (
					<div className="flex flex-col gap-1.5 max-h-[60vh] overflow-y-auto">
						{data.map((zone) => {
							const isExpanded = expandedZoneId === zone.id;
							return (
								<div key={zone.id} className="rounded-md border">
									<button
										type="button"
										className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left"
										onClick={() =>
											setExpandedZoneId(isExpanded ? null : zone.id)
										}
									>
										{isExpanded ? (
											<ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
										) : (
											<ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
										)}
										<Globe className="size-3.5 text-muted-foreground shrink-0" />
										{zone.name}
									</button>
									{isExpanded && (
										<ZoneRecords
											dnsProviderId={dnsProviderId}
											zoneId={zone.id}
											zoneName={zone.name}
										/>
									)}
								</div>
							);
						})}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
