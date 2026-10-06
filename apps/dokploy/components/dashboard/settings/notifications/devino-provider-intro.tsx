import { NotiflyIcon, SendlyIcon } from "@/components/icons/notification-icons";
import { LearnMoreLink } from "@/components/shared/learn-more-link";
import { INTEGRATION_LEARN_MORE_URLS } from "../integrations/integration-links";

const PROVIDERS = {
	sendly: {
		Icon: SendlyIcon,
		description: "Send alerts as email through your Sendly instance.",
	},
	notifly: {
		Icon: NotiflyIcon,
		description: "Trigger a Notifly workflow for each alert.",
	},
} as const;

/** Logo, one-line summary and "Learn more" link atop the Sendly/Notifly forms. */
export const DevinoProviderIntro = ({
	provider,
}: {
	provider: keyof typeof PROVIDERS;
}) => {
	const { Icon, description } = PROVIDERS[provider];
	return (
		<div className="flex flex-row items-center gap-3 rounded-lg border p-3">
			<Icon className="size-8 shrink-0" />
			<div className="flex flex-col gap-0.5">
				<span className="text-sm text-muted-foreground">{description}</span>
				<LearnMoreLink
					href={INTEGRATION_LEARN_MORE_URLS[provider]}
					className="w-fit"
				/>
			</div>
		</div>
	);
};
