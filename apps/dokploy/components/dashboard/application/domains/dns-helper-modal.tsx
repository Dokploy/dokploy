import { Copy, HelpCircle, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
	domain: {
		host: string;
		https: boolean;
		path?: string;
	};
	serverIp?: string;
}

export const DnsHelperModal = ({ domain, serverIp }: Props) => {
	const t = useTranslations("applicationDomains");

	const visitUrl = useMemo(
		() =>
			`${domain.https ? "https" : "http"}://${domain.host}${domain.path || "/"}`,
		[domain.https, domain.host, domain.path],
	);

	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success(t("dnsHelper.copiedToast"));
	};

	const subdomain = domain.host.split(".")[0] ?? domain.host;
	const valueDisplay = serverIp || t("dnsHelper.serverIpPlaceholder");

	return (
		<Dialog>
			<DialogTrigger>
				<Button variant="ghost" size="icon" className="group">
					<HelpCircle className="size-4" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Server className="size-5" />
						{t("dnsHelper.title")}
					</DialogTitle>
					<DialogDescription>
						{t("dnsHelper.description", { host: domain.host })}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<AlertBlock type="info">{t("dnsHelper.intro")}</AlertBlock>

					<div className="flex flex-col gap-6">
						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">{t("dnsHelper.step1Title")}</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("dnsHelper.step1Body")}
								</p>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-2 bg-muted p-3 rounded-md">
										<div>
											<p className="text-sm font-medium">
												{t("dnsHelper.typeA")}
											</p>
											<p className="text-sm">
												{t("dnsHelper.nameLabel", { subdomain })}
											</p>
											<p className="text-sm">
												{t("dnsHelper.valueLabel", { ip: valueDisplay })}
											</p>
										</div>
										<Button
											variant="ghost"
											size="icon"
											onClick={() => copyToClipboard(serverIp || "")}
											disabled={!serverIp}
										>
											<Copy className="size-4" />
										</Button>
									</div>
								</div>
							</div>
						</div>

						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">{t("dnsHelper.step2Title")}</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("dnsHelper.step2Intro")}
								</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>{t("dnsHelper.step2Wait")}</li>
									<li>{t("dnsHelper.step2Visit", { url: visitUrl })}</li>
									<li>{t("dnsHelper.step2Lookup")}</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
