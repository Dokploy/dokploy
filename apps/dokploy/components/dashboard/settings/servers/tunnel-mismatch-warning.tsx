import { AlertBlock } from "@/components/shared/alert-block";
import { api } from "@/utils/api";

interface Props {
	serverId: string;
	tunnelAccountId: string | null;
}

export const TunnelMismatchWarning = ({ serverId, tunnelAccountId }: Props) => {
	const { data: mismatches } = api.cloudflare.listMismatchedDomains.useQuery(
		{ serverId },
		{ enabled: !!tunnelAccountId },
	);

	if (!tunnelAccountId) return null;
	if (!mismatches || mismatches.length === 0) return null;

	return (
		<AlertBlock type="warning">
			<p className="font-medium">Cloudflare account mismatch</p>
			<p className="text-xs">
				This server's tunnel is in account{" "}
				<code className="font-mono">{tunnelAccountId.slice(0, 8)}</code>, but
				the following domains route through zones in a different account.
				Requests to these hosts will return Cloudflare error 1033 until the
				tunnel is recreated in the correct account (Repair flow coming soon):
			</p>
			<ul className="list-disc pl-5 text-xs">
				{mismatches.map((m) => (
					<li key={m.domainId}>
						<code className="font-mono">{m.host}</code> (zone{" "}
						<code className="font-mono">{m.zoneName}</code>, account{" "}
						<code className="font-mono">{m.zoneAccountId.slice(0, 8)}</code>)
					</li>
				))}
			</ul>
		</AlertBlock>
	);
};
