import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

type Allowlist = {
	emails: string[] | null;
	groups: string[] | null;
	emailDomains: string[] | null;
};

const toText = (values: string[] | null) => (values ?? []).join("\n");

const toList = (text: string) =>
	text
		.split(/[\n,]/)
		.map((v) => v.trim())
		.filter(Boolean);

const SsoAllowlistForm = ({
	applicationId,
	initial,
}: {
	applicationId: string;
	initial: Allowlist;
}) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [emails, setEmails] = useState(toText(initial.emails));
	const [groups, setGroups] = useState(toText(initial.groups));
	const [emailDomains, setEmailDomains] = useState(
		toText(initial.emailDomains),
	);

	const { mutateAsync: setAllowlist, isPending } =
		api.forwardAuth.setAllowlist.useMutation();

	const handleSave = async () => {
		try {
			await setAllowlist({
				applicationId,
				emails: toList(emails),
				groups: toList(groups),
				emailDomains: toList(emailDomains),
			});
			await utils.application.one.invalidate({ applicationId });
			await utils.application.readTraefikConfig.invalidate({ applicationId });
			toast.success(t("application.domains.allowlistUpdated"));
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("application.domains.allowlistUpdateError"),
			);
		}
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col">
				<span className="text-sm font-medium">
					{t("application.domains.accessRestrictions")}
				</span>
				<span className="text-xs text-muted-foreground">
					{t("application.domains.accessRestrictionsDescription")}
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-emails">
					{t("application.domains.allowedEmails")}
				</Label>
				<Textarea
					id="sso-allowed-emails"
					placeholder={"jane@acme.com\njohn@acme.com"}
					value={emails}
					onChange={(e) => setEmails(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					{t("application.domains.allowedEmailsHint")}
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-groups">
					{t("application.domains.allowedGroups")}
				</Label>
				<Textarea
					id="sso-allowed-groups"
					placeholder={"engineering\ndevops"}
					value={groups}
					onChange={(e) => setGroups(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					{t("application.domains.allowedGroupsHint")}
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-email-domains">
					{t("application.domains.allowedEmailDomains")}
				</Label>
				<Textarea
					id="sso-allowed-email-domains"
					placeholder={"acme.com"}
					value={emailDomains}
					onChange={(e) => setEmailDomains(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					{t("application.domains.allowedEmailDomainsHint")}
				</span>
			</div>

			<div className="flex justify-end">
				<Button onClick={handleSave} isLoading={isPending}>
					{t("application.domains.save")}
				</Button>
			</div>
		</div>
	);
};

interface Props {
	domainId: string;
	applicationId: string;
}

export const HandleForwardAuth = ({ domainId, applicationId }: Props) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);

	const { data: haveValidLicense } =
		api.licenseKey.haveValidLicenseKey.useQuery();

	const utils = api.useUtils();

	const { data: status } = api.forwardAuth.status.useQuery(
		{ domainId },
		{ enabled: isOpen },
	);

	const { data: application } = api.application.one.useQuery(
		{ applicationId },
		{ enabled: isOpen },
	);

	const { mutateAsync: enable, isPending: isEnabling } =
		api.forwardAuth.enable.useMutation();
	const { mutateAsync: disable, isPending: isDisabling } =
		api.forwardAuth.disable.useMutation();

	if (!haveValidLicense) {
		return null;
	}

	const isEnabled = !!status?.enabled;
	const isPending = isEnabling || isDisabling;

	const refresh = async () => {
		await utils.forwardAuth.status.invalidate({ domainId });
		await utils.domain.byApplicationId.invalidate({ applicationId });
		await utils.application.readTraefikConfig.invalidate({ applicationId });
	};

	const handleToggle = async (next: boolean) => {
		try {
			if (next) {
				await enable({ domainId });
				toast.success(t("application.domains.ssoEnabled"));
			} else {
				await disable({ domainId });
				toast.success(t("application.domains.ssoDisabled"));
			}
			await refresh();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: t("application.domains.ssoUpdateError"),
			);
		}
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-emerald-500/10"
					title={t("application.domains.ssoAuthTitle")}
				>
					<ShieldCheck
						className={`size-4 ${
							isEnabled
								? "text-emerald-500"
								: "text-primary group-hover:text-emerald-500"
						}`}
					/>
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{t("application.domains.ssoAuthTitle")}</DialogTitle>
					<DialogDescription>
						{t("application.domains.ssoAuthDescription")}
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="warning">
					<div className="flex flex-col gap-1">
						<span className="font-medium">
							{t("application.domains.ssoRequirements")}
						</span>
						<ol className="list-decimal pl-4 text-sm">
							<li>
								{t("application.domains.ssoRequirementProxy")}{" "}
								<span className="font-medium">
									{t("application.domains.ssoSettingsPath")}
								</span>
								.
							</li>
							<li>{t("application.domains.ssoRequirementBaseDomain")}</li>
						</ol>
					</div>
				</AlertBlock>

				<div className="flex items-center justify-between rounded-lg border p-4 mt-2">
					<div className="flex flex-col">
						<span className="text-sm font-medium">
							{t("application.domains.protectWithSso")}
						</span>
						<span className="text-xs text-muted-foreground">
							{isEnabled
								? t("application.domains.ssoEnabledHint")
								: t("application.domains.ssoDisabledHint")}
						</span>
					</div>
					<Switch
						checked={isEnabled}
						disabled={isPending}
						onCheckedChange={handleToggle}
					/>
				</div>

				{isEnabled && application && (
					<SsoAllowlistForm
						key={JSON.stringify([
							application.ssoAllowedEmails,
							application.ssoAllowedGroups,
							application.ssoAllowedEmailDomains,
						])}
						applicationId={applicationId}
						initial={{
							emails: application.ssoAllowedEmails,
							groups: application.ssoAllowedGroups,
							emailDomains: application.ssoAllowedEmailDomains,
						}}
					/>
				)}

				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)}>
						{t("application.domains.close")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
