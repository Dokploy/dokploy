import { Badge } from "@/components/ui/badge";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import type { RouterOutputs } from "@/utils/api";

type Member = RouterOutputs["user"]["all"][number];

const PROVIDER_NAMES: Record<string, string> = {
	github: "GitHub",
	google: "Google",
};

const describeProviders = (providers: string[]) => {
	const names = providers
		.filter((p) => p !== "credential")
		.map((p) => PROVIDER_NAMES[p] ?? `SSO (${p})`);
	return names.length ? names.join(", ") : "a single sign-on provider";
};

interface Props {
	status: Member["twoFactorStatus"];
	providers: string[];
}

export const TwoFactorStatus = ({ status, providers }: Props) => {
	if (status === "enabled") return <>Enabled</>;
	if (status === "pending") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<Badge variant="yellow" className="cursor-help">
						2FA Setup pending
					</Badge>
				</TooltipTrigger>
				<TooltipContent>Must set up 2FA before using Dokploy.</TooltipContent>
			</Tooltip>
		);
	}
	if (status === "sso") {
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span className="cursor-help underline decoration-dotted">SSO</span>
				</TooltipTrigger>
				<TooltipContent>
					Signs in with {describeProviders(providers)}. 2FA is handled by the
					provider.
				</TooltipContent>
			</Tooltip>
		);
	}
	return <>Disabled</>;
};
