import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
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
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sshKeyCreate, type sshKeyType } from "@/server/db/validations";
import { api } from "@/utils/api";

type SSHKey = z.infer<typeof sshKeyCreate>;

interface Props {
	sshKeyId?: string;
}

export const HandleSSHKeys = ({ sshKeyId }: Props) => {
	const utils = api.useUtils();
	const { t } = useTranslation("settings");

	const [isOpen, setIsOpen] = useState(false);

	const { data } = api.sshKey.one.useQuery(
		{
			sshKeyId: sshKeyId || "",
		},
		{
			enabled: !!sshKeyId,
		},
	);

	const { mutateAsync, isError, error, isLoading } = sshKeyId
		? api.sshKey.update.useMutation()
		: api.sshKey.create.useMutation();

	const generateMutation = api.sshKey.generate.useMutation();

	const form = useForm<SSHKey>({
		resolver: zodResolver(sshKeyCreate),
		defaultValues: {
			name: "",
			description: "",
			publicKey: "",
			privateKey: "",
		},
	});

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				description: data.description || undefined,
			});
		} else {
			form.reset();
		}
	}, [data, form, form.reset]);

	const onSubmit = async (data: SSHKey) => {
		await mutateAsync({
			...data,
			organizationId: "",
			sshKeyId: sshKeyId || "",
		})
			.then(async () => {
				toast.success(
					sshKeyId
						? t("settings.sshKeys.update.success")
						: t("settings.sshKeys.create.success"),
				);
				await utils.sshKey.all.invalidate();
				form.reset();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					sshKeyId
						? t("settings.sshKeys.update.error")
						: t("settings.sshKeys.create.error"),
				);
			});
	};

	const onGenerateSSHKey = (type: z.infer<typeof sshKeyType>) =>
		generateMutation
			.mutateAsync(type)
			.then(async (data) => {
				toast.success(t("settings.sshKeys.generate.success"));
				form.setValue("privateKey", data.privateKey);
				form.setValue("publicKey", data.publicKey);
			})
			.catch(() => {
				toast.error(t("settings.sshKeys.generate.error"));
			});

	const downloadKey = (content: string, keyType: "private" | "public") => {
		const keyName = form.watch("name");
		const publicKey = form.watch("publicKey");

		// Extract algorithm type from public key
		const isEd25519 = publicKey.startsWith("ssh-ed25519");
		const defaultName = isEd25519 ? "id_ed25519" : "id_rsa";

		const filename = keyName
			? `${keyName}${sshKeyId ? `_${sshKeyId}` : ""}_${keyType}_${defaultName}${keyType === "public" ? ".pub" : ""}`
			: `${defaultName}${keyType === "public" ? ".pub" : ""}`;
		const blob = new Blob([content], { type: "text/plain" });
		const url = window.URL.createObjectURL(blob);
		const a = document.createElement("a");
		a.href = url;
		a.download = filename;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		window.URL.revokeObjectURL(url);
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{sshKeyId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button className="cursor-pointer space-x-3">
						<PlusIcon className="h-4 w-4" />
						{t("settings.sshKeys.handle.add")}
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{t("settings.sshKeys.handle.title")}</DialogTitle>
					<DialogDescription className="space-y-4">
						<div>
							{t("settings.sshKeys.handle.description")}
						</div>
						{!sshKeyId && (
							<div className="flex gap-4">
								<Button
									variant={"secondary"}
									disabled={generateMutation.isLoading}
									className="max-sm:w-full"
									onClick={() =>
										onGenerateSSHKey({
											type: "rsa",
										})
									}
									type="button"
								>
									{t("settings.sshKeys.handle.generateRsa")}
								</Button>
								<Button
									variant={"secondary"}
									disabled={generateMutation.isLoading}
									className="max-sm:w-full"
									onClick={() =>
										onGenerateSSHKey({
											type: "ed25519",
										})
									}
									type="button"
								>
									{t("settings.sshKeys.handle.generateEd25519")}
								</Button>
							</div>
						)}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						className="grid w-full gap-4 "
						onSubmit={form.handleSubmit(onSubmit)}
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>
											{t("settings.sshKeys.handle.form.name")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.sshKeys.handle.form.namePlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>

						<FormField
							control={form.control}
							name="description"
							render={({ field }) => {
								return (
									<FormItem>
										<FormLabel>
											{t("settings.sshKeys.handle.form.description")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"settings.sshKeys.handle.form.descriptionPlaceholder",
												)}
												{...field}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								);
							}}
						/>
						<FormField
							control={form.control}
							name="privateKey"
							render={({ field }) => (
								<FormItem>
									<div className="space-y-0.5">
										<FormLabel>
											{t("settings.sshKeys.handle.form.privateKey")}
										</FormLabel>
									</div>
									<FormControl>
										<Textarea
											placeholder={t(
												"settings.sshKeys.handle.form.privateKeyPlaceholder",
											)}
											rows={5}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="publicKey"
							render={({ field }) => (
								<FormItem>
									<div className="space-y-0.5">
										<FormLabel>
											{t("settings.sshKeys.handle.form.publicKey")}
										</FormLabel>
									</div>
									<FormControl>
										<Input
											placeholder={t(
												"settings.sshKeys.handle.form.publicKeyPlaceholder",
											)}
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter className="flex items-center justify-between">
							<div className="flex items-center gap-4">
								{form.watch("privateKey") && (
									<Button
										type="button"
										variant="outline"
										size="default"
										onClick={() =>
											downloadKey(form.watch("privateKey"), "private")
										}
										className="flex items-center gap-2"
									>
										<DownloadIcon className="h-4 w-4" />
										{t("settings.sshKeys.handle.downloadPrivate")}
									</Button>
								)}
								{form.watch("publicKey") && (
									<Button
										type="button"
										variant="outline"
										size="default"
										onClick={() =>
											downloadKey(form.watch("publicKey"), "public")
										}
										className="flex items-center gap-2"
									>
										<DownloadIcon className="h-4 w-4" />
										{t("settings.sshKeys.handle.downloadPublic")}
									</Button>
								)}
							</div>
							<Button isLoading={isLoading} type="submit">
								{sshKeyId
									? t("settings.common.update")
									: t("settings.common.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
