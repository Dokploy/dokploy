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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";
import { AlertBlock } from "@/components/shared/alert-block";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9\.-]*\.[a-zA-Z]{2,}$/;

const updateDomain = z.object({
	host: z.string().regex(hostnameRegex, { message: "Invalid hostname" }),
	path: z.string().min(1),
	port: z
		.number()
		.min(1, { message: "Port must be at least 1" })
		.max(65535, { message: "Port must be 65535 or below" }),
	https: z.boolean(),
	certificateType: z.enum(["letsencrypt", "none"]),
});

type UpdateDomain = z.infer<typeof updateDomain>;

interface Props {
	domainId: string;
}

export const UpdateDomain = ({ domainId }: Props) => {
	const utils = api.useUtils();
	const [isOpen, setIsOpen] = useState(false);
	const { data, refetch } = api.domain.one.useQuery(
		{ domainId },
		{ enabled: isOpen },
	);
	const { mutateAsync, isError, error } = api.domain.update.useMutation();

	const form = useForm<UpdateDomain>({
		defaultValues: {
			host: "",
			https: true,
			path: "/",
			port: 3000,
			certificateType: "none",
		},
		resolver: zodResolver(updateDomain),
	});

	useEffect(() => {
		if (data && isOpen) {
			form.reset({
				host: data.host || "",
				port: data.port || 3000,
				path: data.path || "/",
				https: data.https,
				certificateType: data.certificateType,
			});
		}
	}, [isOpen, form.reset, data]);

	const onSubmit = async (data: UpdateDomain) => {
		await mutateAsync({
			domainId,
			host: data.host,
			https: data.https,
			path: data.path,
			port: data.port,
			certificateType: data.certificateType,
		})
			.then(async (data) => {
				toast.success("Domain Updated");
				await refetch();
				await utils.domain.byApplicationId.invalidate({
					applicationId: data?.applicationId,
				});
				await utils.application.readTraefikConfig.invalidate({
					applicationId: data?.applicationId,
				});
				setIsOpen(false);
			})
			.catch(() => {
				toast.error("Error to update the domain");
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				<Button variant="ghost">
					<PenBoxIcon className="size-4 text-muted-foreground" />
				</Button>
			</DialogTrigger>
			<DialogContent className="max-h-screen  overflow-y-auto sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center space-x-2">
						<div>Domain</div>
						{isLoading && (
							<Loader2 className="inline-block w-4 h-4 animate-spin" />
						)}
					</DialogTitle>
					<DialogDescription>
						In this section you can add custom domains
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<Form {...form}>
					<form
						id="hook-form"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-8 "
					>
						<div className="flex flex-col gap-4">
							<div className="flex flex-col gap-2">
								<FormField
									control={form.control}
									name="host"
									render={({ field }) => (
										<FormItem>
											<FormLabel>Host</FormLabel>
											<FormControl>
												<Input placeholder="api.dokploy.com" {...field} />
											</FormControl>

											<FormMessage />
										</FormItem>
									)}
								/>

								<FormField
									control={form.control}
									name="path"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Path</FormLabel>
												<FormControl>
													<Input placeholder={"/"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="port"
									render={({ field }) => {
										return (
											<FormItem>
												<FormLabel>Container Port</FormLabel>
												<FormControl>
													<Input
														placeholder={"3000"}
														{...field}
														onChange={(e) => {
															field.onChange(Number.parseInt(e.target.value));
														}}
													/>
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>
								<FormField
									control={form.control}
									name="certificateType"
									render={({ field }) => (
										<FormItem className="col-span-2">
											<FormLabel>Certificate</FormLabel>
											<Select
												onValueChange={field.onChange}
												value={field.value}
											>
												<FormControl>
													<SelectTrigger>
														<SelectValue placeholder="Select a certificate" />
													</SelectTrigger>
												</FormControl>
												<SelectContent>
													<SelectItem value={"none"}>None</SelectItem>
													<SelectItem value={"letsencrypt"}>
														Letsencrypt
													</SelectItem>
												</SelectContent>
											</Select>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="https"
									render={({ field }) => (
										<FormItem className="mt-4 flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>HTTPS</FormLabel>
												<FormDescription>
													Automatically provision SSL Certificate.
												</FormDescription>
											</div>
											<FormControl>
												<Switch
													checked={field.value}
													onCheckedChange={field.onChange}
												/>
											</FormControl>
										</FormItem>
									)}
								/>
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button
							isLoading={form.formState.isSubmitting}
							form="hook-form"
							type="submit"
						>
							Update
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
