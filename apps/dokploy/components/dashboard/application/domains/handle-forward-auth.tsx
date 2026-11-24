import { ShieldCheck } from "lucide-react";
import { useState } from "react";
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
			toast.success("Access restrictions updated");
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating access restrictions",
			);
		}
	};

	return (
		<div className="flex flex-col gap-4 rounded-lg border p-4">
			<div className="flex flex-col">
				<span className="text-sm font-medium">Access restrictions</span>
				<span className="text-xs text-muted-foreground">
					Applies to every SSO-protected domain of this application and its
					preview deployments. Leave all empty to allow any authenticated user.
					If more than one list is set, users must match all of them.
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-emails">Allowed emails</Label>
				<Textarea
					id="sso-allowed-emails"
					placeholder={"jane@acme.com\njohn@acme.com"}
					value={emails}
					onChange={(e) => setEmails(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					Must match exactly what your identity provider sends (case-sensitive).
					Only reliable if your identity provider verifies emails; prefer groups
					when possible.
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-groups">Allowed groups</Label>
				<Textarea
					id="sso-allowed-groups"
					placeholder={"engineering\ndevops"}
					value={groups}
					onChange={(e) => setGroups(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					Requires your identity provider to send a <code>groups</code> claim
					(add the <code>groups</code> scope to the SSO provider).
				</span>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="sso-allowed-email-domains">Allowed email domains</Label>
				<Textarea
					id="sso-allowed-email-domains"
					placeholder={"acme.com"}
					value={emailDomains}
					onChange={(e) => setEmailDomains(e.target.value)}
				/>
				<span className="text-xs text-muted-foreground">
					<code>acme.com</code> matches only that domain; <code>.acme.com</code>{" "}
					also matches its subdomains.
				</span>
			</div>

			<div className="flex justify-end">
				<Button onClick={handleSave} isLoading={isPending}>
					Save
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
				toast.success("SSO authentication enabled for this domain");
			} else {
				await disable({ domainId });
				toast.success("SSO authentication disabled for this domain");
			}
			await refresh();
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating SSO authentication",
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
					title="SSO authentication"
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
					<DialogTitle>SSO Authentication</DialogTitle>
					<DialogDescription>
						Require visitors to authenticate against your identity provider
						before reaching this application.
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="warning">
					<div className="flex flex-col gap-1">
						<span className="font-medium">Requirements</span>
						<ol className="list-decimal pl-4 text-sm">
							<li>
								The authentication proxy container must be deployed and running
								on this app's server. Configure it under{" "}
								<span className="font-medium">
									Settings → SSO → Application Authentication
								</span>
								.
							</li>
							<li>
								This domain must share the same base domain as the
								authentication domain (e.g. <code>app.acme.com</code> and{" "}
								<code>auth.acme.com</code>).
							</li>
						</ol>
					</div>
				</AlertBlock>

				<div className="flex items-center justify-between rounded-lg border p-4 mt-2">
					<div className="flex flex-col">
						<span className="text-sm font-medium">
							Protect this domain with SSO
						</span>
						<span className="text-xs text-muted-foreground">
							{isEnabled
								? "Visitors must log in via your identity provider."
								: "The domain is publicly accessible."}
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
						Close
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
