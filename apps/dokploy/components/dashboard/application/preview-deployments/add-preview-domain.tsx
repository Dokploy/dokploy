import { zodResolver } from "@hookform/resolvers/zod";
import { Dices } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type z from "zod";
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
	FormDescription,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input, NumberInput } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { domain } from "@/server/db/validations/domain";
import { api } from "@/utils/api";

type Domain = z.infer<typeof domain>;

interface Props {
	previewDeploymentId: string;
	domainId?: string;
	children: React.ReactNode;
}

export const AddPreviewDomain = ({
	previewDeploymentId,
	domainId = "",
	children,
}: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();
	const { data, refetch } = api.domain.one.useQuery(
		{
			domainId,
		},
		{
			enabled: !!domainId,
		},
	);

	const { data: previewDeployment } = api.previewDeployment.one.useQuery(
		{
			previewDeploymentId,
		},
		{
			enabled: !!previewDeploymentId,
		},
	);

	const { mutateAsync, isError, error, isLoading } = domainId
		? api.domain.update.useMutation()
		: api.domain.create.useMutation();

	const { mutateAsync: generateDomain, isLoading: isLoadingGenerate } =
		api.domain.generateDomain.useMutation();

	const form = useForm<Domain>({
		resolver: zodResolver(domain),
	});

	useEffect(() => {
		if (data) {
			form.reset({
				...data,
				/* Convert null to undefined */
				path: data?.path || undefined,
				port: data?.port || undefined,
				customCertResolver: data?.customCertResolver || undefined,
			});
		}

		if (!domainId) {
			form.reset({});
		}
	}, [form, form.reset, data, isLoading]);

	const dictionary = {
		success: domainId ? "Domain Updated" : "Domain Created",
		error: domainId ? "Error updating the domain" : "Error creating the domain",
		submit: domainId ? "Update" : "Create",
		dialogDescription: domainId
			? "In this section you can edit a domain"
			: "In this section you can add domains",
	};

	const onSubmit = async (data: Domain) => {
		await mutateAsync({
			domainId,
			previewDeploymentId,
			...data,
		})
			.then(async () => {
				toast.success(dictionary.success);
				await utils.previewDeployment.all.invalidate({
					applicationId: previewDeployment?.applicationId,
				});

				if (domainId) {
					refetch();
				}
				setIsOpen(false);
			})
			.catch(() => {
				toast.error(dictionary.error);
			});
	};
	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger className="" asChild>
				{children}
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Domain</DialogTitle>
					<DialogDescription>{dictionary.dialogDescription}</DialogDescription>
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
											<div className="flex gap-2">
												<FormControl>
													<Input placeholder="api.dokploy.com" {...field} />
												</FormControl>
												<TooltipProvider delayDuration={0}>
													<Tooltip>
														<TooltipTrigger asChild>
															<Button
																variant="secondary"
																type="button"
																isLoading={isLoadingGenerate}
																onClick={() => {
																	generateDomain({
																		appName: previewDeployment?.appName || "",
																		serverId:
																			previewDeployment?.application
																				?.serverId || "",
																	})
																		.then((domain) => {
																			field.onChange(domain);
																		})
																		.catch((err) => {
																			toast.error(err.message);
																		});
																}}
															>
																<Dices className="size-4 text-muted-foreground" />
															</Button>
														</TooltipTrigger>
														<TooltipContent
															side="left"
															sideOffset={5}
															className="max-w-[10rem]"
														>
															<p>Generate traefik.me domain</p>
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											</div>

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
													<NumberInput placeholder={"3000"} {...field} />
												</FormControl>
												<FormMessage />
											</FormItem>
										);
									}}
								/>

								<FormField
									control={form.control}
									name="https"
									render={({ field }) => (
										<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
											<div className="space-y-0.5">
												<FormLabel>HTTPS</FormLabel>
												<FormDescription>
													Automatically provision SSL Certificate.
												</FormDescription>
												<FormMessage />
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

								{form.getValues().https && (
									<FormField
										control={form.control}
										name="certificateType"
										render={({ field }) => (
											<FormItem className="col-span-2">
												<FormLabel>Certificate Provider</FormLabel>
												<Select
													onValueChange={field.onChange}
													defaultValue={field.value || ""}
												>
													<FormControl>
														<SelectTrigger>
															<SelectValue placeholder="Select a certificate provider" />
														</SelectTrigger>
													</FormControl>

													<SelectContent>
														<SelectItem value="none">None</SelectItem>
														<SelectItem value={"letsencrypt"}>
															Let's Encrypt
														</SelectItem>
													</SelectContent>
												</Select>
												<FormMessage />
											</FormItem>
										)}
									/>
								)}
							</div>
						</div>
					</form>

					<DialogFooter>
						<Button isLoading={isLoading} form="hook-form" type="submit">
							{dictionary.submit}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
