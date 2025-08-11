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
import { Copy, HelpCircle, Server } from "lucide-react";
import { useTranslation } from "next-i18next";
import { toast } from "sonner";

interface Props {
	domain: {
		host: string;
		https: boolean;
		path?: string;
	};
	serverIp?: string;
}

export const DnsHelperModal = ({ domain, serverIp }: Props) => {
	const { t } = useTranslation("dashboard");
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success(t("dashboard.domain.copiedToClipboard"));
	};

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
						{t("dashboard.domain.dnsConfigurationGuide")}
					</DialogTitle>
					<DialogDescription>
						{t("dashboard.domain.followStepsToConfigureDns", {
							host: domain.host,
						})}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<AlertBlock type="info">
						{t("dashboard.domain.dnsConfigurationInfo")}
					</AlertBlock>

					<div className="flex flex-col gap-6">
						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">
								{t("dashboard.domain.addARecord")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("dashboard.domain.createARecordDescription")}
								</p>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-2 bg-muted p-3 rounded-md">
										<div>
											<p className="text-sm font-medium">
												{t("dashboard.domain.type")}: A
											</p>
											<p className="text-sm">
												{t("dashboard.domain.name")}: @ or{" "}
												{domain.host.split(".")[0]}
											</p>
											<p className="text-sm">
												{t("dashboard.domain.value")}:{" "}
												{serverIp || t("dashboard.domain.yourServerIp")}
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
							<h3 className="font-medium mb-2">
								{t("dashboard.domain.verifyConfiguration")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("dashboard.domain.afterConfiguringDns")}:
								</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>{t("dashboard.domain.waitForDnsPropagation")}</li>
									<li>
										{t("dashboard.domain.testYourDomain")}:{" "}
										{domain.https ? "https://" : "http://"}
										{domain.host}
										{domain.path || "/"}
									</li>
									<li>{t("dashboard.domain.useDnsLookupTool")}</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
