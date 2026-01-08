import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, PenBoxIcon, PlusIcon } from "lucide-react";
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
						? "SSH key updated successfully"
						: "SSH key created successfully",
				);
				await utils.sshKey.all.invalidate();
				form.reset();
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(
					sshKeyId
						? "Error updating the SSH key"
						: "Error creating the SSH key",
				);
			});
	};

	const onGenerateSSHKey = (type: z.infer<typeof sshKeyType>) =>
		generateMutation
			.mutateAsync(type)
			.then(async (data) => {
				toast.success("SSH Key Generated");
				form.setValue("privateKey", data.privateKey);
				form.setValue("publicKey", data.publicKey);
			})
			.catch(() => {
				toast.error("Error generating the SSH Key");
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
						Add SSH Key
					</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>SSH Key</DialogTitle>
					<DialogDescription className="space-y-4">
						<div>
							In this section you can add one of your keys or generate a new
							one.
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
									Generate RSA SSH Key
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
									Generate ED25519 SSH Key
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
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder={"Personal projects"} {...field} />
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
										<FormLabel>Description</FormLabel>
										<FormControl>
											<Input
												placeholder={"Used on my personal Hetzner VPS"}
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
										<FormLabel>Private Key</FormLabel>
									</div>
									<FormControl>
										<Textarea
											placeholder={"-----BEGIN RSA PRIVATE KEY-----"}
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
										<FormLabel>Public Key</FormLabel>
									</div>
									<FormControl>
										<Input placeholder={"ssh-rsa AAAAB3NzaC1yc2E"} {...field} />
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
										Private Key
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
										Public Key
									</Button>
								)}
							</div>
							<Button isLoading={isLoading} type="submit">
								{sshKeyId ? "Update" : "Create"}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
