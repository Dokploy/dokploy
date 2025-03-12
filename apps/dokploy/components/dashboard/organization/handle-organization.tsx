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
import { api } from "@/utils/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, Plus } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const organizationSchema = z.object({
	name: z.string().min(1, {
		message: "Organization name is required",
	}),
	logo: z.string().optional(),
});

type OrganizationFormValues = z.infer<typeof organizationSchema>;

interface Props {
	organizationId?: string;
	children?: React.ReactNode;
}

export function AddOrganization({ organizationId }: Props) {
	const { t } = useTranslation("common");
	const [open, setOpen] = useState(false);
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

	const form = useForm<OrganizationFormValues>({
		resolver: zodResolver(organizationSchema),
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
						? t("common.side.organizations.updateSuccess")
						: t("common.side.organizations.createSuccess"),
				);
				utils.organization.all.invalidate();
				setOpen(false);
			})
			.catch((error) => {
				console.error(error);
				toast.error(
					organizationId
						? t("common.side.organizations.updateFailed")
						: t("common.side.organizations.createFailed"),
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
							{t("common.side.organizations.createOrganization")}
						</div>
					</DropdownMenuItem>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>
						{organizationId
							? t("common.side.organizations.updateOrganization")
							: t("common.side.organizations.createOrganization")}
					</DialogTitle>
					<DialogDescription>
						{organizationId
							? t("common.side.organizations.updateOrganizationDescription")
							: t("common.side.organizations.createOrganizationDescription")}
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
										{t("common.side.organizations.name")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder={t(
												"common.side.organizations.name.placeholder",
											)}
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
								<FormItem className=" gap-4">
									<FormLabel className="text-right">
										{t("common.side.organizations.logoURL")}
									</FormLabel>
									<FormControl>
										<Input
											placeholder="https://example.com/logo.png"
											{...field}
											value={field.value || ""}
											className="col-span-3"
										/>
									</FormControl>
									<FormMessage className="col-span-3 col-start-2" />
								</FormItem>
							)}
						/>
						<DialogFooter className="mt-4">
							<Button type="submit" isLoading={isLoading}>
								{organizationId
									? t("common.side.organizations.updateOrganization")
									: t("common.side.organizations.createOrganization")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
