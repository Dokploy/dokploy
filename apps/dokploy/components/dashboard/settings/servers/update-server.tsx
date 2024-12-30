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
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
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
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

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
	serverId: string;
}

export const UpdateServer = ({ serverId }: Props) => {
	const { t } = useTranslation("settings");

	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data, isLoading } = api.server.one.useQuery(
		{
			serverId,
		},
		{
			enabled: !!serverId,
		},
	);
	const { data: sshKeys } = api.sshKey.all.useQuery();
	const { mutateAsync, error, isError } = api.server.update.useMutation();
	const form = useForm<Schema>({
		defaultValues: {
			description: "",
			name: "",
			ipAddress: "",
			port: 22,
			username: "root",
			sshKeyId: "",
		},
		resolver: zodResolver(Schema),
	});

	useEffect(() => {
		form.reset({
			description: data?.description || "",
			name: data?.name || "",
			ipAddress: data?.ipAddress || "",
			port: data?.port || 22,
			username: data?.username || "root",
			sshKeyId: data?.sshKeyId || "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (formData: Schema) => {
		await mutateAsync({
			name: formData.name,
			description: formData.description || "",
			ipAddress: formData.ipAddress || "",
			port: formData.port || 22,
			username: formData.username || "root",
			sshKeyId: formData.sshKeyId || "",
			serverId: serverId,
		})
			.then(async (data) => {
				await utils.server.all.invalidate();
				toast.success("Server Updated");
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error updating a server");
			});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<DropdownMenuItem
					className="w-full cursor-pointer "
					onSelect={(e) => e.preventDefault()}
				>
					Edit Server
				</DropdownMenuItem>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl ">
				<DialogHeader>
					<DialogTitle>Update Server</DialogTitle>
					<DialogDescription>
						Update a server to deploy your applications remotely.
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}
				<Form {...form}>
					<form
						id="hook-form-update-server"
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
										<FormLabel>{t("settings.terminal.ipAddress")}</FormLabel>
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
										<FormLabel>{t("settings.terminal.port")}</FormLabel>
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
									<FormLabel>{t("settings.terminal.username")}</FormLabel>
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
							form="hook-form-update-server"
							type="submit"
						>
							{t("settings.common.save")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
