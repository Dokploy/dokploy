import { Copy, HelpCircle, Server } from "lucide-react";
import { useTranslation } from "next-i18next";
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
	const { t } = useTranslation("common");
	const copyToClipboard = (text: string) => {
		navigator.clipboard.writeText(text);
		toast.success(t("application.domains.dns.toast.clipboard"));
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
						{t("application.domains.dns.title")}
					</DialogTitle>
					<DialogDescription>
						{t("application.domains.dns.description", { host: domain.host })}
					</DialogDescription>
				</DialogHeader>

				<div className="flex flex-col gap-4">
					<AlertBlock type="info">
						{t("application.domains.dns.overview")}
					</AlertBlock>

					<div className="flex flex-col gap-6">
						<div className="rounded-lg border p-4">
							<h3 className="font-medium mb-2">
								{t("application.domains.dns.step1.title")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("application.domains.dns.step1.description")}
								</p>
								<div className="flex flex-col gap-2">
									<div className="flex items-center justify-between gap-2 bg-muted p-3 rounded-md">
										<div>
											<p className="text-sm font-medium">
												{t("application.domains.dns.step1.type")}
											</p>
											<p className="text-sm">
												{t("application.domains.dns.step1.name", {
													name: domain.host.split(".")[0],
												})}
											</p>
											<p className="text-sm">
												{t("application.domains.dns.step1.value", {
													ip: serverIp || t("application.domains.dns.step1.valueFallback"),
												})}
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
								{t("application.domains.dns.step2.title")}
							</h3>
							<div className="flex flex-col gap-3">
								<p className="text-sm text-muted-foreground">
									{t("application.domains.dns.step2.description")}
								</p>
								<ul className="list-disc list-inside space-y-1 text-sm">
									<li>
										{t("application.domains.dns.step2.item1")}
									</li>
									<li>
										{t("application.domains.dns.step2.item2", {
											url: `${domain.https ? "https://" : "http://"}${domain.host}${domain.path || "/"}`,
										})}
									</li>
									<li>
										{t("application.domains.dns.step2.item3")}
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
};
