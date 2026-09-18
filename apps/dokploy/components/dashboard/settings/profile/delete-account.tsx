import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { toast } from "sonner";
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

const errorMessage = (error: unknown, fallback: string) =>
	error instanceof Error ? error.message : fallback;

export const DeleteAccount = () => {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<"request" | "confirm">("request");
	const [password, setPassword] = useState("");
	const [code, setCode] = useState("");
	const [expiresInMinutes, setExpiresInMinutes] = useState(10);
	const { data } = api.user.get.useQuery();
	const { data: isCloud } = api.settings.isCloud.useQuery();
	const { data: hasPassword } = api.user.hasPassword.useQuery();
	const requestCode = api.user.requestAccountDeletionCode.useMutation();
	const deleteAccount = api.user.deleteAccount.useMutation();

	const email = data?.user?.email ?? "";
	const isBusy = requestCode.isPending || deleteAccount.isPending;

	if (!isCloud || !data || data.role !== "owner" || hasPassword === undefined) {
		return null;
	}

	const reset = () => {
		setStep("request");
		setPassword("");
		setCode("");
	};

	const handleRequestCode = async () => {
		try {
			const result = await requestCode.mutateAsync(
				hasPassword ? { password } : {},
			);
			setExpiresInMinutes(result.expiresInMinutes);
			setCode("");
			setStep("confirm");
			toast.success(`We sent a confirmation code to ${email}`);
		} catch (error) {
			toast.error(errorMessage(error, "Error sending the confirmation code"));
		}
	};

	const handleDelete = async () => {
		try {
			await deleteAccount.mutateAsync({ code });
			toast.success("Your account has been deleted");
			await authClient.signOut().catch(() => undefined);
			router.push("/");
		} catch (error) {
			toast.error(errorMessage(error, "Error deleting account"));
		}
	};

	return (
		<Card className="bg-transparent border-destructive/40">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2 text-destructive">
					<Trash2 className="size-5" />
					Delete account
				</CardTitle>
				<CardDescription>
					Permanently remove your account and all the data associated with it.
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
					<li>
						Active subscriptions are cancelled immediately. Invoices already
						issued are kept for accounting.
					</li>
					<li>
						Every organization you own is deleted, including its projects,
						services, environments, domains and server connections.
					</li>
					<li>
						In organizations you belong to but do not own, only your membership,
						API keys and the Git providers you connected are removed.
						Applications using those providers keep running but must be
						reconnected to redeploy.
					</li>
					<li>Containers already running on your servers are not touched.</li>
					<li>
						We will email a confirmation code to{" "}
						<span className="font-medium text-foreground">{email}</span> before
						anything is deleted.
					</li>
					<li>This action cannot be undone.</li>
				</ul>
				<div>
					<AlertDialog
						open={open}
						onOpenChange={(next) => {
							setOpen(next);
							if (!next) reset();
						}}
					>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Delete account</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Delete your account?</AlertDialogTitle>
								<AlertDialogDescription>
									{step === "request"
										? `This will permanently delete your account and every organization you own. We will send a confirmation code to ${email}.`
										: `Enter the ${expiresInMinutes}-minute code we sent to ${email} to confirm the deletion.`}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<div className="flex flex-col gap-2">
								{step === "request" && hasPassword && (
									<>
										<Label htmlFor="delete-account-password">Password</Label>
										<Input
											id="delete-account-password"
											type="password"
											autoComplete="current-password"
											placeholder="Enter your password"
											value={password}
											onChange={(e) => setPassword(e.target.value)}
										/>
									</>
								)}
								{step === "confirm" && (
									<>
										<Label htmlFor="delete-account-code">
											Confirmation code
										</Label>
										<Input
											id="delete-account-code"
											inputMode="numeric"
											autoComplete="one-time-code"
											maxLength={6}
											placeholder="123456"
											value={code}
											onChange={(e) =>
												setCode(e.target.value.replace(/\D/g, ""))
											}
										/>
										<Button
											type="button"
											variant="link"
											size="sm"
											className="self-start px-0"
											disabled={isBusy}
											onClick={handleRequestCode}
										>
											Resend code
										</Button>
									</>
								)}
							</div>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isBusy}>Cancel</AlertDialogCancel>
								{step === "request" ? (
									<Button
										type="button"
										variant="destructive"
										disabled={isBusy || (hasPassword && password.length === 0)}
										onClick={handleRequestCode}
									>
										{requestCode.isPending && (
											<Loader2 className="size-4 animate-spin" />
										)}
										Send confirmation code
									</Button>
								) : (
									<Button
										type="button"
										variant="destructive"
										disabled={isBusy || code.length !== 6}
										onClick={handleDelete}
									>
										{deleteAccount.isPending && (
											<Loader2 className="size-4 animate-spin" />
										)}
										Delete account
									</Button>
								)}
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</div>
			</CardContent>
		</Card>
	);
};
