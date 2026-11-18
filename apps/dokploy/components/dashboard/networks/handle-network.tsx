"use client";

import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Network, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useFieldArray, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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

// Only bridge and overlay can be created: "host"/"none" are Docker
// singletons and macvlan/ipvlan need driver options we don't expose.
const networkDriverEnum = ["bridge", "overlay"] as const;

const ipamConfigEntrySchema = z.object({
	subnet: z.string().optional(),
	ipRange: z.string().optional(),
	gateway: z.string().optional(),
});

const networkFormSchema = z
	.object({
		name: z.string().min(1, "networks.errors.nameRequired"),
		driver: z.enum(networkDriverEnum),
		internal: z.boolean(),
		attachable: z.boolean(),
		enableIPv4: z.boolean(),
		enableIPv6: z.boolean(),
		mtu: z
			.string()
			.refine(
				(value) =>
					value === "" ||
					(/^\d+$/.test(value) && +value >= 68 && +value <= 65535),
				{ message: "MTU must be a number between 68 and 65535" },
			),
		ipamDriver: z.string().optional(),
		ipamConfig: z.array(ipamConfigEntrySchema),
	})
	.superRefine((input, ctx) => {
		if (!input.enableIPv4 && !input.enableIPv6) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ["enableIPv4"],
				message: "IPv4 or IPv6 must be enabled",
			});
		}
		for (const [index, entry] of input.ipamConfig.entries()) {
			if (!entry.subnet && (entry.gateway || entry.ipRange)) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ["ipamConfig", index, "subnet"],
					message: "networks.errors.gatewayIpRangeRequireSubnet",
				});
			}
		}
	});

type NetworkFormValues = z.infer<typeof networkFormSchema>;

const defaultValues: NetworkFormValues = {
	name: "",
	driver: "bridge",
	internal: false,
	attachable: false,
	enableIPv4: true,
	enableIPv6: false,
	mtu: "",
	ipamDriver: "",
	ipamConfig: [],
};

const toggleOptions = [
	{
		name: "internal",
		labelKey: "networks.opt.internal",
		descriptionKey: "networks.opt.internalDesc",
	},
	{
		name: "attachable",
		labelKey: "networks.opt.attachable",
		descriptionKey:
			"networks.opt.attachableDesc",
	},
	{
		name: "enableIPv4",
		labelKey: "networks.opt.ipv4",
		descriptionKey: "networks.opt.ipv4Desc",
	},
	{
		name: "enableIPv6",
		labelKey: "networks.opt.ipv6",
		descriptionKey: "networks.opt.ipv6Desc",
	},
] as const;

interface HandleNetworkProps {
	/** Target server; undefined creates on the local Dokploy server */
	serverId?: string;
	children?: React.ReactNode;
}

// Docker networks are immutable, so this dialog only creates them;
// changing a network means deleting and recreating it.
export const HandleNetwork = ({ serverId, children }: HandleNetworkProps) => {
	const { t } = useTranslation();
	const [isOpen, setIsOpen] = useState(false);
	const utils = api.useUtils();

	const { mutateAsync, isPending } = api.network.create.useMutation();

	const form = useForm<NetworkFormValues>({
		resolver: zodResolver(networkFormSchema),
		defaultValues,
	});

	const ipamConfigFieldArray = useFieldArray({
		control: form.control,
		name: "ipamConfig",
	});

	const onSubmit = async (data: NetworkFormValues) => {
		try {
			await mutateAsync({
				name: data.name,
				driver: data.driver,
				serverId,
				internal: data.internal,
				attachable: data.attachable,
				enableIPv4: data.enableIPv4,
				enableIPv6: data.enableIPv6,
				mtu: data.mtu ? Number(data.mtu) : undefined,
				ipam: {
					driver: data.ipamDriver || undefined,
					config: data.ipamConfig,
				},
			});

			toast.success(t("networks.created"));
			await utils.network.all.invalidate();
			setIsOpen(false);
			form.reset(defaultValues);
		} catch (error) {
			toast.error(t("networks.createError"), {
				description: error instanceof Error ? error.message : "Unknown error",
			});
		}
	};

	const trigger = children ?? (
		<Button>
			<Plus className=" size-4" />
			{t("networks.addNetwork")}
		</Button>
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Network className="size-5 text-muted-foreground" />
						{t("networks.addTitle")}
					</DialogTitle>
					<DialogDescription>
						{t("networks.addDescription")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="flex w-full flex-col gap-6"
					>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("networks.colName")}</FormLabel>
										<FormControl>
											<Input placeholder="my-network" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="driver"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("networks.colDriver")}</FormLabel>
										<Select onValueChange={field.onChange} value={field.value}>
											<FormControl>
												<SelectTrigger>
													<SelectValue placeholder={t("networks.selectDriver")} />
												</SelectTrigger>
											</FormControl>
											<SelectContent>
												{networkDriverEnum.map((d) => (
													<SelectItem key={d} value={d}>
														{d}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<FormDescription className="text-muted-foreground">
											bridge for single-server containers; overlay for Swarm
											services.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="mtu"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("networks.mtuOptional")}</FormLabel>
										<FormControl>
											<Input
												placeholder="1500"
												inputMode="numeric"
												{...field}
											/>
										</FormControl>
										<FormDescription className="text-muted-foreground">
											Maximum transmission unit. Leave empty to use Docker's
											default.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
						</div>
						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{toggleOptions.map((option) => (
								<FormField
									key={option.name}
									control={form.control}
									name={option.name}
									render={({ field }) => (
										<FormItem className="flex flex-row items-start justify-between gap-3 space-y-0 rounded-lg border p-4">
											<div className="space-y-1 pr-1">
												<FormLabel>{t(option.labelKey)}</FormLabel>
												<FormDescription className="text-muted-foreground">
													{t(option.descriptionKey)}
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
							))}
						</div>
						<div className="space-y-4 rounded-lg border p-4">
							<div className="space-y-1">
								<FormLabel>{t("networks.ipam")}</FormLabel>
								<p className="text-sm text-muted-foreground">
									IP address management settings for this network.
								</p>
							</div>
							<FormField
								control={form.control}
								name="ipamDriver"
								render={({ field }) => (
									<FormItem>
										<FormLabel className="text-muted-foreground">
											Driver (optional)
										</FormLabel>
										<FormControl>
											<Input {...field} placeholder="default" />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="space-y-2">
								<FormLabel className="text-muted-foreground">
									Config (subnet / gateway / IP range)
								</FormLabel>
								{ipamConfigFieldArray.fields.map((field, index) => (
									<div key={field.id} className="flex flex-wrap gap-2">
										<FormField
											control={form.control}
											name={`ipamConfig.${index}.subnet`}
											render={({ field: f }) => (
												<FormItem className="min-w-[140px] flex-1">
													<FormControl>
														<Input
															{...f}
															placeholder={t("networks.subnetPlaceholder")}
														/>
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name={`ipamConfig.${index}.ipRange`}
											render={({ field: f }) => (
												<FormItem className="min-w-[120px] flex-1">
													<FormControl>
														<Input {...f} placeholder={t("networks.ipRangePlaceholder")} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<FormField
											control={form.control}
											name={`ipamConfig.${index}.gateway`}
											render={({ field: f }) => (
												<FormItem className="min-w-[120px] flex-1">
													<FormControl>
														<Input {...f} placeholder={t("networks.gatewayPlaceholder")} />
													</FormControl>
													<FormMessage />
												</FormItem>
											)}
										/>
										<Button
											type="button"
											variant="outline"
											size="icon"
											aria-label={t("networks.removeIpam")}
											onClick={() => ipamConfigFieldArray.remove(index)}
										>
											<Trash2 className="size-4" />
										</Button>
									</div>
								))}
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										ipamConfigFieldArray.append({
											subnet: "",
											ipRange: "",
											gateway: "",
										})
									}
								>
									<Plus className="size-4" />
									{t("networks.addIpam")}
								</Button>
							</div>
						</div>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setIsOpen(false)}
							>
								{t("common.cancel")}
							</Button>
							<Button type="submit" isLoading={isPending}>
								{t("networks.createNetwork")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
