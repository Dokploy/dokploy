"use client";

import { CheckCircle2, Copy, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { api } from "@/utils/api";

interface VerifyDomainDialogProps {
	providerId: string;
	domainVerified: boolean;
	children: React.ReactNode;
}

export function VerifyDomainDialog({
	providerId,
	domainVerified,
	children,
}: VerifyDomainDialogProps) {
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const [record, setRecord] = useState<{
		domains: string[];
		recordName: string;
		recordValue: string;
	} | null>(null);

	const requestVerification = api.sso.requestDomainVerification.useMutation();
	const verifyDomain = api.sso.verifyDomain.useMutation();

	const copyValue = async (value: string) => {
		await navigator.clipboard.writeText(value);
		toast.success("Copied to clipboard");
	};

	const handleRequest = async () => {
		try {
			const result = await requestVerification.mutateAsync({ providerId });
			setRecord(result);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to create a domain verification record",
			);
		}
	};

	const handleVerify = async () => {
		try {
			await verifyDomain.mutateAsync({ providerId });
			toast.success("SSO domain verified");
			await Promise.all([
				utils.sso.listProviders.invalidate(),
				utils.sso.one.invalidate({ providerId }),
			]);
			setOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Domain verification failed",
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Verify SSO domain</DialogTitle>
					<DialogDescription>
						Domain ownership is the trust signal Dokploy uses to safely link SSO
						identities to existing and SCIM-provisioned users.
					</DialogDescription>
				</DialogHeader>

				{domainVerified ? (
					<div className="flex items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm">
						<CheckCircle2 className="size-5 text-green-600" />
						This provider&apos;s domains are verified for account linking.
					</div>
				) : record ? (
					<div className="space-y-4">
						<p className="text-sm text-muted-foreground">
							Create the following TXT record for every configured domain, wait
							for DNS propagation, then verify.
						</p>
						{record.domains.map((domain) => {
							const name = `${record.recordName}.${domain}`;
							return (
								<div className="space-y-2" key={domain}>
									<Label>TXT record name ({domain})</Label>
									<div className="flex gap-2">
										<Input readOnly value={name} />
										<Button
											aria-label={`Copy TXT record name for ${domain}`}
											onClick={() => copyValue(name)}
											size="icon"
											type="button"
											variant="outline"
										>
											<Copy className="size-4" />
										</Button>
									</div>
								</div>
							);
						})}
						<div className="space-y-2">
							<Label>TXT record value</Label>
							<div className="flex gap-2">
								<Input readOnly value={record.recordValue} />
								<Button
									aria-label="Copy TXT record value"
									onClick={() => copyValue(record.recordValue)}
									size="icon"
									type="button"
									variant="outline"
								>
									<Copy className="size-4" />
								</Button>
							</div>
						</div>
					</div>
				) : (
					<div className="rounded-md border p-3 text-sm text-muted-foreground">
						Generate a short-lived verification token to obtain the DNS TXT
						records for this provider.
					</div>
				)}

				<DialogFooter>
					<Button
						onClick={() => setOpen(false)}
						type="button"
						variant="outline"
					>
						Close
					</Button>
					{!domainVerified && !record && (
						<Button
							disabled={requestVerification.isPending}
							onClick={handleRequest}
							type="button"
						>
							{requestVerification.isPending ? (
								<Loader2 className="mr-2 size-4 animate-spin" />
							) : (
								<ShieldCheck className="mr-2 size-4" />
							)}
							Generate DNS record
						</Button>
					)}
					{!domainVerified && record && (
						<Button
							disabled={verifyDomain.isPending}
							onClick={handleVerify}
							type="button"
						>
							{verifyDomain.isPending && (
								<Loader2 className="mr-2 size-4 animate-spin" />
							)}
							Verify DNS
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
