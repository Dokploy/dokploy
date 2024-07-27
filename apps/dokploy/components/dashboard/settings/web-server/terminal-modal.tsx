import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
	Form,
	FormControl,
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import dynamic from "next/dynamic";
import type React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { RemoveSSHPrivateKey } from "./remove-ssh-private-key";

const Terminal = dynamic(() => import("./terminal").then((e) => e.Terminal), {
	ssr: false,
});

const addSSHPrivateKey = z.object({
	sshPrivateKey: z
		.string({
			required_error: "SSH private key is required",
		})
		.min(1, "SSH private key is required"),
});

type AddSSHPrivateKey = z.infer<typeof addSSHPrivateKey>;

interface Props {
	children?: React.ReactNode;
}

export const TerminalModal = ({ children }: Props) => {
	const { data, refetch } = api.admin.one.useQuery();
	const [user, setUser] = useState("root");
	const [terminalUser, setTerminalUser] = useState("root");

	const { mutateAsync, isLoading } =
		api.settings.saveSSHPrivateKey.useMutation();

	const form = useForm<AddSSHPrivateKey>({
		defaultValues: {
			sshPrivateKey: "",
		},
		resolver: zodResolver(addSSHPrivateKey),
	});

	useEffect(() => {
		if (data) {
			form.reset({});
		}
	}, [data, form, form.reset]);

	const onSubmit = async (formData: AddSSHPrivateKey) => {
		await mutateAsync({
			sshPrivateKey: formData.sshPrivateKey,
		})
			.then(async () => {
				toast.success("SSH Key Updated");
				await refetch();
			})
			.catch(() => {
				toast.error("Error to Update the ssh key");
			});
	};
	return (
		<Dialog>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer space-x-3"
					onSelect={(e) => e.preventDefault()}
				>
					{children}
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-7xl">
				<DialogHeader className="flex flex-row justify-between pt-4">
					<div>
						<DialogTitle>Terminal</DialogTitle>
						<DialogDescription>Easy way to access the server</DialogDescription>
					</div>
					{data?.haveSSH && (
						<div>
							<RemoveSSHPrivateKey />
						</div>
					)}
				</DialogHeader>
				{!data?.haveSSH ? (
					<div>
						<div className="flex flex-col gap-4">
							<Form {...form}>
								<form
									id="hook-form"
									onSubmit={form.handleSubmit(onSubmit)}
									className="grid w-full gap-8 "
								>
									<div className="grid w-full">
										<FormField
											control={form.control}
											name="sshPrivateKey"
											render={({ field }) => {
												return (
													<FormItem>
														<FormLabel>SSH Private Key</FormLabel>
														<FormDescription>
															In order to access the server you need to add an
															ssh private key
														</FormDescription>
														<FormControl>
															<Textarea
																placeholder={
																	"-----BEGIN CERTIFICATE-----\nMIIFRDCCAyygAwIBAgIUEPOR47ys6VDwMVB9tYoeEka83uQwDQYJKoZIhvcNAQELBQAwGTEXMBUGA1UEAwwObWktZG9taW5pby5jb20wHhcNMjQwMzExMDQyNzU3WhcN\n------END CERTIFICATE-----"
																}
																className="h-32"
																{...field}
															/>
														</FormControl>
														<FormMessage />
													</FormItem>
												);
											}}
										/>
									</div>
									<div className="flex w-full justify-end">
										<Button isLoading={isLoading} type="submit">
											Save
										</Button>
									</div>
								</form>
							</Form>
						</div>
					</div>
				) : (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Label>Log in as</Label>
							<div className="flex flex-row gap-4">
								<Input value={user} onChange={(e) => setUser(e.target.value)} />
								<Button onClick={() => setTerminalUser(user)}>Login</Button>
							</div>
						</div>

						<Terminal id="terminal" userSSH={terminalUser} />
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
};
