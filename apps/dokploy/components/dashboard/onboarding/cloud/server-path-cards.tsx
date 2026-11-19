import { ServerCogIcon, ServerIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface Props {
	onHaveServer: () => void;
	onNeedServer: () => void;
}

const OPTIONS = [
	{
		id: "have",
		icon: ServerIcon,
		titleKey: "onboarding.cloud.haveServerTitle",
		descriptionKey: "onboarding.cloud.haveServerDescription",
		actionKey: "onboarding.cloud.haveServerAction",
	},
	{
		id: "need",
		icon: ServerCogIcon,
		titleKey: "onboarding.cloud.needServerTitle",
		descriptionKey: "onboarding.cloud.needServerDescription",
		actionKey: "onboarding.cloud.needServerAction",
	},
] as const;

export const ServerPathCards = ({ onHaveServer, onNeedServer }: Props) => {
	const { t } = useTranslation();
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-border rounded-2xl overflow-hidden border">
			{OPTIONS.map((option) => (
				<button
					key={option.id}
					type="button"
					onClick={option.id === "have" ? onHaveServer : onNeedServer}
					className={cn(
						"group flex flex-col items-start justify-between bg-background text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:bg-muted/60",
						"gap-10 p-7",
					)}
				>
					<div className="flex flex-col gap-3">
						<span className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
							<option.icon className="size-5" aria-hidden />
						</span>
						<div>
							<p className="font-medium">{t(option.titleKey)}</p>
							<p className="mt-1 text-sm text-muted-foreground">
								{t(option.descriptionKey)}
							</p>
						</div>
					</div>
					<span className="font-mono text-xs uppercase tracking-wider text-muted-foreground transition-colors group-hover:text-foreground">
						{t(option.actionKey)} →
					</span>
				</button>
			))}
		</div>
	);
};
