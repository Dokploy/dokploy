import { Copy, HelpCircle, Server } from "lucide-react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success(t("application.domains.copied"));
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
						{t("application.domains.dnsGuideTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("application.domains.dnsGuideDescription", {
							host: domain.host,
						})}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<AlertBlock type="info">
						{t("application.domains.dnsGuideInfo")}
					</AlertBlock>

					<div className="flex flex-col gap-6">
						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">
								{t("application.domains.addARecord")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("application.domains.aRecordHint")}
								</p>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-2 bg-muted p-3 rounded-md">
										<div>
											<p className="text-sm font-medium">Type: A</p>
											<p className="text-sm">
												Name: @ or {domain.host.split(".")[0]}
											</p>
											<p className="text-sm">
												Value:{" "}
												{serverIp || t("application.domains.yourServerIp")}
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
								{t("application.domains.verifyConfig")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("application.domains.afterConfiguring")}
								</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>{t("application.domains.waitPropagation")}</li>
									<li>
										{t("application.domains.testDomain")}{" "}
										{domain.https ? "https://" : "http://"}
										{domain.host}
										{domain.path || "/"}
									</li>
									<li>{t("application.domains.useDnsTool")}</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
