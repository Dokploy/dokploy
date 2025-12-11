import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, Plus } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
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
import { authClient } from "@/lib/auth-client";
import { api } from "@/utils/api";

const organizationSchema = (t: (key: string) => string) =>
	z.object({
		name: z.string().min(1, {
			message: t("organization.form.nameRequired"),
		}),
		logo: z.string().optional(),
	});

type OrganizationFormValues = z.infer<ReturnType<typeof organizationSchema>>;

interface Props {
	organizationId?: string;
	children?: React.ReactNode;
}

export function AddOrganization({ organizationId }: Props) {
	const [open, setOpen] = useState(false);
	const { t } = useTranslation("common");
	const utils = api.useUtils();
	const { data: organization } = api.organization.one.useQuery(
		{
			organizationId: organizationId ?? "",
		},
		{
			enabled: !!organizationId,
		},
	);
	const { mutateAsync, isLoading } = organizationId
		? api.organization.update.useMutation()
		: api.organization.create.useMutation();
	const { refetch: refetchActiveOrganization } =
		authClient.useActiveOrganization();

	const form = useForm<OrganizationFormValues>({
		resolver: zodResolver(organizationSchema(t)),
		defaultValues: {
			name: "",
			logo: "",
		},
	});

	useEffect(() => {
		if (organization) {
			form.reset({
				name: organization.name,
				logo: organization.logo || "",
			});
		}
	}, [organization, form]);

	const onSubmit = async (values: OrganizationFormValues) => {
		await mutateAsync({
			name: values.name,
			logo: values.logo,
			organizationId: organizationId ?? "",
		})
			.then(() => {
				form.reset();
				toast.success(
					organizationId
						? t("organization.toast.update.success")
						: t("organization.toast.create.success"),
				);
				utils.organization.all.invalidate();
				if (organizationId) {
					utils.organization.one.invalidate({ organizationId });
					refetchActiveOrganization();
				}
				setOpen(false);
			})
			.catch((error) => {
				console.error(error);
				toast.error(
					organizationId
						? t("organization.toast.update.error")
						: t("organization.toast.create.error"),
				);
			});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				{organizationId ? (
					<DropdownMenuItem
						className="group cursor-pointer hover:bg-blue-500/10"
						onSelect={(e) => e.preventDefault()}
					>
						<PenBoxIcon className="size-3.5 text-primary group-hover:text-blue-500" />
					</DropdownMenuItem>
				) : (
					<DropdownMenuItem
						className="gap-2 p-2"
						onSelect={(e) => e.preventDefault()}
					>
						<div className="flex size-6 items-center justify-center rounded-md border bg-background">
							<Plus className="size-4" />
						</div>
						<div className="font-medium text-muted-foreground">
							{t("organization.menu.add")}
						</div>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{organizationId
							? t("organization.dialog.update.title")
							: t("organization.dialog.create.title")}
					</DialogTitle>
					<DialogDescription>
						{organizationId
							? t("organization.dialog.update.description")
							: t("organization.dialog.create.description")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid gap-4 py-4"
					>
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem className="tems-center gap-4">
									<FormLabel className="text-right">
										{t("organization.form.nameLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("organization.form.namePlaceholder")}
											{...field}
											className="col-span-3"
										/>
									</FormControl>
									<FormMessage className="" />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="logo"
							render={({ field }) => (
								<FormItem className="gap-4">
									<FormLabel className="text-right">
										{t("organization.form.logoLabel")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t("organization.form.logoPlaceholder")}
											{...field}
											value={field.value || ""}
											className="col-span-3"
										/>
									</FormControl>
									<FormMessage className="col-span-3 col-start-2" />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="submit" isLoading={isLoading}>
								{organizationId ? t("button.update") : t("button.create")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
