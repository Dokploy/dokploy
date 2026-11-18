import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
	const { t } = useTranslation();
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
			toast.success(t("settings.profile.codeSent", { email }));
		} catch (error) {
			toast.error(errorMessage(error, t("settings.profile.sendCodeError")));
		}
	};

	const handleDelete = async () => {
		try {
			await deleteAccount.mutateAsync({ code });
			toast.success(t("settings.profile.accountDeleted"));
			await authClient.signOut().catch(() => undefined);
			router.push("/");
		} catch (error) {
			toast.error(errorMessage(error, t("settings.profile.deleteError")));
		}
	};

	return (
		<Card className="bg-transparent border-destructive/40">
			<CardHeader>
				<CardTitle className="text-xl flex items-center gap-2 text-destructive">
					<Trash2 className="size-5" />
					{t("settings.profile.deleteAccount")}
				</CardTitle>
				<CardDescription>
					{t("settings.profile.deleteAccountDescription")}
				</CardDescription>
			</CardHeader>
			<CardContent className="flex flex-col gap-4">
				<ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
					<li>{t("settings.profile.bulletSubscriptions")}</li>
					<li>{t("settings.profile.bulletOrganizations")}</li>
					<li>{t("settings.profile.bulletMembership")}</li>
					<li>{t("settings.profile.bulletContainers")}</li>
					<li>
						{t("settings.profile.emailCodePrefix")}{" "}
						<span className="font-medium text-foreground">{email}</span>{" "}
						{t("settings.profile.emailCodeSuffix")}
					</li>
					<li>{t("settings.profile.bulletIrreversible")}</li>
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
							<Button variant="destructive">
								{t("settings.profile.deleteAccount")}
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>
									{t("settings.profile.deleteConfirmTitle")}
								</AlertDialogTitle>
								<AlertDialogDescription>
									{step === "request"
										? t("settings.profile.deleteConfirmRequest", { email })
										: t("settings.profile.deleteConfirmCode", {
												email,
												minutes: expiresInMinutes,
											})}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<div className="flex flex-col gap-2">
								{step === "request" && hasPassword && (
									<>
										<Label htmlFor="delete-account-password">
											{t("settings.profile.password")}
										</Label>
										<Input
											id="delete-account-password"
											type="password"
											autoComplete="current-password"
											placeholder={t("settings.profile.enterPassword")}
											value={password}
											onChange={(e) => setPassword(e.target.value)}
										/>
									</>
								)}
								{step === "confirm" && (
									<>
										<Label htmlFor="delete-account-code">
											{t("settings.profile.confirmationCode")}
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
											{t("settings.profile.resendCode")}
										</Button>
									</>
								)}
							</div>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isBusy}>
									{t("settings.profile.cancel")}
								</AlertDialogCancel>
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
										{t("settings.profile.sendCode")}
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
										{t("settings.profile.deleteAccount")}
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
