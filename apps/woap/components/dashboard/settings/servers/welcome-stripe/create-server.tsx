import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AlertBlock } from "@/components/shared/alert-block";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DialogFooter } from "@/components/ui/dialog";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

const Schema = z.object({
	name: z.string().min(1, {
		message: "Name is required",
	}),
	description: z.string().optional(),
	ipAddress: z.string().min(1, {
		message: "IP Address is required",
	}),
	port: z.number().optional(),
	username: z.string().optional(),
	sshKeyId: z.string().min(1, {
		message: "SSH Key is required",
	}),
});

type Schema = z.infer<typeof Schema>;

interface Props {
	stepper: any;
}

export const CreateServer = ({ stepper }: Props) => {
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const [isOpen, _setIsOpen] = useState(false);
	const { data: canCreateMoreServers, refetch } =
		api.stripe.canCreateMoreServers.useQuery();
	const { mutateAsync } = api.server.create.useMutation();
	const cloudSSHKey = sshKeys?.find(
		(sshKey) => sshKey.name === "dokploy-cloud-ssh-key",
	);

	const form = useForm<Schema>({
		defaultValues: {
			description: "Dokploy Cloud Server",
			name: "My First Server",
			ipAddress: "",
			port: 22,
			username: "root",
			sshKeyId: cloudSSHKey?.sshKeyId || "",
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			description: "Dokploy Cloud Server",
			name: "My First Server",
			ipAddress: "",
			port: 22,
			username: "root",
			sshKeyId: cloudSSHKey?.sshKeyId || "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, sshKeys]);

	useEffect(() => {
		refetch();
	}, [isOpen]);

	const onSubmit = async (data: Schema) => {
		await mutateAsync({
			name: data.name,
			description: data.description || "",
			ipAddress: data.ipAddress?.trim() || "",
			port: data.port || 22,
			username: data.username || "root",
			sshKeyId: data.sshKeyId || "",
		})
			.then(async (_data) => {
				toast.success("Server Created");
				stepper.next();
			})
			.catch(() => {
				toast.error("Error creating a server");
			});
	};
	return (
		<Card className="bg-background flex flex-col gap-4">
			<div className="flex flex-col gap-2 pt-5 px-4">
				{!canCreateMoreServers && (
					<AlertBlock type="warning" className="mt-2">
						You cannot create more servers,{" "}
						<Link href="/dashboard/settings/billing" className="text-primary">
							Please upgrade your plan
						</Link>
					</AlertBlock>
				)}
			</div>

			<CardContent className="flex flex-col">
				<Form {...form}>
					<form
						id="hook-form-add-server"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4 ">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="Hostinger Server" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<FormField
							control={form.control}
							name="description"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Description</FormLabel>
									<FormControl>
										<Textarea
											placeholder="This server is for databases..."
											className="resize-none"
											{...field}
										/>
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="sshKeyId"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Select a SSH Key</FormLabel>
									{!cloudSSHKey && (
										<AlertBlock>
											Looks like you didn't have the SSH Key yet, you can create
											one{" "}
											<Link
												href="/dashboard/settings/ssh-keys"
												className="text-primary"
											>
												here
											</Link>
										</AlertBlock>
									)}

									<Select
										onValueChange={field.onChange}
										defaultValue={field.value}
									>
										<SelectTrigger>
											<SelectValue placeholder="Select a SSH Key" />
										</SelectTrigger>
										<SelectContent>
											<SelectGroup>
												{sshKeys?.map((sshKey) => (
													<SelectItem
														key={sshKey.sshKeyId}
														value={sshKey.sshKeyId}
													>
														{sshKey.name}
													</SelectItem>
												))}
												<SelectLabel>
													Registries ({sshKeys?.length})
												</SelectLabel>
											</SelectGroup>
										</SelectContent>
									</Select>
									<FormMessage />
								</FormItem>
							)}
						/>
						<div className="grid grid-cols-2 gap-4">
							<FormField
								control={form.control}
								name="ipAddress"
								render={({ field }) => (
									<FormItem>
										<FormLabel>IP Address</FormLabel>
										<FormControl>
											<Input placeholder="192.168.1.100" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="port"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Port</FormLabel>
										<FormControl>
											<Input
												placeholder="22"
												{...field}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														field.onChange(0);
													} else {
														const number = Number.parseInt(value, 10);
														if (!Number.isNaN(number)) {
															field.onChange(number);
														}
													}
												}}
											/>
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
						</div>

						<FormField
							control={form.control}
							name="username"
							render={({ field }) => (
								<FormItem>
									<FormLabel>Username</FormLabel>
									<FormControl>
										<Input placeholder="root" {...field} />
									</FormControl>

									<FormMessage />
								</FormItem>
							)}
						/>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							disabled={!canCreateMoreServers}
							form="hook-form-add-server"
							type="submit"
						>
							Create
						</Button>
					</DialogFooter>
				</Form>
			</CardContent>
		</Card>
	);
};
