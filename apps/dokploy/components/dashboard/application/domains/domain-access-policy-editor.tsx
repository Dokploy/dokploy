import { Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { CLOUDFLARE_SESSION_DURATIONS } from "../../settings/cloudflare/session-durations";

interface Props {
	domainId: string;
	host: string;
}

/**
 * Per published-domain Cloudflare Access editor: enables a self-hosted Access
 * application with a configurable allow policy (email + email-domain include
 * rules). Backed by the admin-gated `cloudflareAccess` router.
 */
export const DomainAccessPolicyEditor = ({ domainId, host }: Props) => {
	const [open, setOpen] = useState(false);
	const utils = api.useUtils();

	const { data: access, isLoading } = api.cloudflareAccess.byDomainId.useQuery(
		{ domainId },
		{ enabled: open },
	);
	const { data: orgDefaults } = api.cloudflare.accessDefaults.useQuery(
		undefined,
		{ enabled: open },
	);
	const upsert = api.cloudflareAccess.upsert.useMutation();
	const remove = api.cloudflareAccess.remove.useMutation();

	const [sessionDuration, setSessionDuration] = useState("168h");
	const [emails, setEmails] = useState<string[]>([]);
	const [emailDomains, setEmailDomains] = useState<string[]>([]);
	const [emailInput, setEmailInput] = useState("");
	const [emailDomainInput, setEmailDomainInput] = useState("");

	useEffect(() => {
		if (access) {
			setSessionDuration(access.sessionDuration);
			setEmails(access.allowEmails);
			setEmailDomains(access.allowEmailDomains);
		} else {
			// No Access yet — prefill the org defaults so a new policy starts from
			// the organization's standard identities/duration (falls back to 1 week
			// / empty when none are configured).
			setSessionDuration(orgDefaults?.defaultSessionDuration ?? "168h");
			setEmails(orgDefaults?.defaultAllowEmails ?? []);
			setEmailDomains(orgDefaults?.defaultAllowEmailDomains ?? []);
		}
	}, [access, orgDefaults]);

	const isEnabled = !!access;

	const isValidEmail = (value: string) =>
		/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

	const addEmail = () => {
		const value = emailInput.trim();
		if (!value) {
			setEmailInput("");
			return;
		}
		if (!isValidEmail(value)) {
			toast.error("Enter a valid email address");
			return;
		}
		if (!emails.includes(value)) {
			setEmails([...emails, value]);
		}
		setEmailInput("");
	};

	const addEmailDomain = () => {
		const value = emailDomainInput.trim();
		if (value && !emailDomains.includes(value)) {
			setEmailDomains([...emailDomains, value]);
		}
		setEmailDomainInput("");
	};

	const handleSave = async () => {
		// Flush a value typed but not yet "Added" so it isn't silently dropped on
		// save (only a valid pending email; the server validates email format).
		const pendingEmail = emailInput.trim();
		const pendingDomain = emailDomainInput.trim();
		const finalEmails =
			pendingEmail &&
			isValidEmail(pendingEmail) &&
			!emails.includes(pendingEmail)
				? [...emails, pendingEmail]
				: emails;
		const finalEmailDomains =
			pendingDomain && !emailDomains.includes(pendingDomain)
				? [...emailDomains, pendingDomain]
				: emailDomains;
		if (finalEmails.length === 0 && finalEmailDomains.length === 0) {
			toast.error("Add at least one allowed email or email domain");
			return;
		}
		await upsert
			.mutateAsync({
				domainId,
				sessionDuration: sessionDuration || "24h",
				allowEmails: finalEmails,
				allowEmailDomains: finalEmailDomains,
			})
			.then(async () => {
				toast.success("Cloudflare Access saved");
				await utils.cloudflareAccess.byDomainId.invalidate({ domainId });
				await utils.domain.invalidate();
				setOpen(false);
			})
			.catch((e) =>
				toast.error("Error saving Access", { description: e.message }),
			);
	};

	const handleDisable = async () => {
		await remove
			.mutateAsync({ domainId })
			.then(async () => {
				toast.success("Cloudflare Access disabled");
				await utils.cloudflareAccess.byDomainId.invalidate({ domainId });
				await utils.domain.invalidate();
				setOpen(false);
			})
			.catch((e) =>
				toast.error("Error disabling Access", { description: e.message }),
			);
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="ghost"
					size="icon"
					className="group hover:bg-green-500/10"
				>
					<ShieldCheck className="size-4 text-primary group-hover:text-green-500" />
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Cloudflare Access — {host}</DialogTitle>
					<DialogDescription>
						Require visitors to authenticate with Cloudflare Access before they
						can reach this domain. Only the identities you allow below will be
						let through.
					</DialogDescription>
				</DialogHeader>

				<AlertBlock type="info">
					Cloudflare Zero Trust's free plan includes 50 users. Add more allowed
					identities than that and Cloudflare will require a paid seat.
				</AlertBlock>

				{isLoading ? (
					<div className="flex items-center justify-center py-8 text-muted-foreground">
						<Loader2 className="size-4 animate-spin" />
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label>Session Duration</Label>
							<Select
								value={sessionDuration}
								onValueChange={setSessionDuration}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{CLOUDFLARE_SESSION_DURATIONS.map((duration) => (
										<SelectItem key={duration.value} value={duration.value}>
											{duration.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="flex flex-col gap-2">
							<Label>Allowed Emails</Label>
							<div className="flex flex-wrap gap-2">
								{emails.map((email) => (
									<Badge key={email} variant="secondary">
										{email}
										<X
											className="ml-1 size-3 cursor-pointer"
											onClick={() =>
												setEmails(emails.filter((e) => e !== email))
											}
										/>
									</Badge>
								))}
							</div>
							<div className="flex gap-2">
								<Input
									placeholder="user@example.com"
									value={emailInput}
									onChange={(e) => setEmailInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addEmail();
										}
									}}
								/>
								<Button type="button" variant="secondary" onClick={addEmail}>
									Add
								</Button>
							</div>
						</div>

						<div className="flex flex-col gap-2">
							<Label>Allowed Email Domains</Label>
							<div className="flex flex-wrap gap-2">
								{emailDomains.map((domain) => (
									<Badge key={domain} variant="secondary">
										{domain}
										<X
											className="ml-1 size-3 cursor-pointer"
											onClick={() =>
												setEmailDomains(
													emailDomains.filter((d) => d !== domain),
												)
											}
										/>
									</Badge>
								))}
							</div>
							<div className="flex gap-2">
								<Input
									placeholder="example.com"
									value={emailDomainInput}
									onChange={(e) => setEmailDomainInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											e.preventDefault();
											addEmailDomain();
										}
									}}
								/>
								<Button
									type="button"
									variant="secondary"
									onClick={addEmailDomain}
								>
									Add
								</Button>
							</div>
						</div>
					</div>
				)}

				<DialogFooter className="flex w-full !justify-between gap-4 flex-row">
					{isEnabled ? (
						<Button
							type="button"
							variant="destructive"
							isLoading={remove.isPending}
							onClick={handleDisable}
						>
							Disable Access
						</Button>
					) : (
						<span />
					)}
					<Button
						type="button"
						isLoading={upsert.isPending}
						onClick={handleSave}
					>
						{isEnabled ? "Update" : "Enable Access"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
