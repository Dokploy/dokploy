import { AlertBlock } from "@dokploy/components/shared/alert-block";
import { Button } from "@dokploy/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@dokploy/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@dokploy/components/ui/form";
import { Input } from "@dokploy/components/ui/input";
import { Textarea } from "@dokploy/components/ui/textarea";
import { sshKeyCreate, type sshKeyType } from "@dokploy/server/db/validations";
import { api } from "@dokploy/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useState } from "react";
import { flushSync } from "react-dom";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

type SSHKey = z.infer<typeof sshKeyCreate>;

interface Props {
	children: ReactNode;
}

export const AddSSHKey = ({ children }: Props) => {
	const utils = api.useUtils();

	const [isOpen, setIsOpen] = useState(false);

	const { mutateAsync, isError, error, isLoading } =
		api.sshKey.create.useMutation();

	const generateMutation = api.sshKey.generate.useMutation();

	const form = useForm<SSHKey>({
		resolver: zodResolver(sshKeyCreate),
	});

	const onSubmit = async (data: SSHKey) => {
		await mutateAsync(data)
			.then(async () => {
				toast.success("SSH key created successfully");
				await utils.sshKey.all.invalidate();
				/*
					Flushsync is needed for a bug witht he react-hook-form reset method
					https://github.com/orgs/react-hook-form/discussions/7589#discussioncomment-10060621
				*/
				flushSync(() => form.reset());
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to create the SSH key");
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
				toast.error("Error to generate the SSH Key");
			});

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>SSH Key</DialogTitle>
					<DialogDescription className="space-y-4">
						<div>
							In this section you can add one of your keys or generate a new
							one.
						</div>
						<div className="flex gap-4">
							<Button
								variant={"secondary"}
								disabled={generateMutation.isLoading}
								className="max-sm:w-full"
								onClick={() => onGenerateSSHKey("rsa")}
								type="button"
							>
								Generate RSA SSH Key
							</Button>
							<Button
								variant={"secondary"}
								disabled={generateMutation.isLoading}
								className="max-sm:w-full"
								onClick={() => onGenerateSSHKey("ed25519")}
								type="button"
							>
								Generate ED25519 SSH Key
							</Button>
						</div>
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
						<DialogFooter>
							<Button isLoading={isLoading} type="submit">
								Create
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
