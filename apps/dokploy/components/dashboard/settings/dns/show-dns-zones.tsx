import { ArrowLeft, Globe, Loader2 } from "lucide-react";
import Link from "next/link";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { api } from "@/utils/api";

interface Props {
	dnsProviderId: string;
}

const RecordCount = ({
	dnsProviderId,
	zoneId,
}: {
	dnsProviderId: string;
	zoneId: string;
}) => {
	const { data, isPending, isError } = api.dnsProvider.listRecords.useQuery({
		dnsProviderId,
		zoneId,
	});

	if (isPending) {
		return <Loader2 className="animate-spin size-4 text-muted-foreground" />;
	}

	if (isError) {
		return (
			<span className="text-xs text-muted-foreground">Records unavailable</span>
		);
	}

	return (
		<span className="text-xs text-muted-foreground tabular-nums">
			{data.length === 0
				? "No records"
				: `${data.length} record${data.length === 1 ? "" : "s"}`}
		</span>
	);
};

export const ShowDnsZones = ({ dnsProviderId }: Props) => {
	const { data: provider } = api.dnsProvider.one.useQuery({ dnsProviderId });
	const { data, isPending, isError, error } =
		api.dnsProvider.listZones.useQuery({ dnsProviderId });

	return (
		<div className="w-full max-w-5xl mx-auto">
			<Card className="h-full bg-sidebar p-2.5 rounded-xl">
				<div className="rounded-xl bg-background shadow-md">
					<div className="flex flex-wrap items-center justify-between gap-4 p-6">
						<div className="flex flex-1 flex-row items-center gap-3">
							<Button variant="ghost" size="icon" asChild>
								<Link href="/dashboard/settings/dns">
									<ArrowLeft className="size-4" />
									<span className="sr-only">Back to DNS providers</span>
								</Link>
							</Button>
							<CardHeader className="flex-1 p-0">
								<CardTitle className="text-xl">
									{provider?.name ?? "Domains"}
								</CardTitle>
								<CardDescription>
									Domains this provider's credentials can manage. Open one to
									see and edit its DNS records.
								</CardDescription>
							</CardHeader>
						</div>
					</div>

					<CardContent className="flex min-h-[60vh] flex-col gap-4 border-t py-8">
						{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
						{isPending ? (
							<div className="flex flex-1 flex-row items-center justify-center gap-2 text-sm text-muted-foreground">
								<span>Loading...</span>
								<Loader2 className="animate-spin size-4" />
							</div>
						) : data?.length === 0 ? (
							<div className="flex min-h-[45vh] w-full flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8">
								<div className="rounded-full bg-muted p-4">
									<Globe className="size-10 text-muted-foreground" />
								</div>
								<div className="space-y-1 text-center">
									<p className="text-sm font-medium">No domains found</p>
									<p className="max-w-sm text-sm text-muted-foreground">
										These credentials can't reach any zone. Check that the token
										has access to at least one domain.
									</p>
								</div>
							</div>
						) : (
							<div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
								{data?.map((zone) => (
									<Link
										key={zone.id}
										href={`/dashboard/settings/dns/${dnsProviderId}/${zone.id}`}
										className="group flex flex-col justify-between gap-6 rounded-xl border bg-background p-4 outline-none transition-colors duration-150 ease-out hover:border-foreground/20 hover:bg-muted/40 focus-visible:border-ring"
									>
										<div className="flex items-start gap-3">
											<span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors duration-150 group-hover:text-foreground">
												<Globe className="size-4" />
											</span>
											<span
												className="min-w-0 flex-1 truncate pt-2 text-sm font-medium"
												title={zone.name}
											>
												{zone.name}
											</span>
										</div>
										<div className="flex min-h-4 items-center justify-end">
											<RecordCount
												dnsProviderId={dnsProviderId}
												zoneId={zone.id}
											/>
										</div>
									</Link>
								))}
							</div>
						)}
					</CardContent>
				</div>
			</Card>
		</div>
	);
};
