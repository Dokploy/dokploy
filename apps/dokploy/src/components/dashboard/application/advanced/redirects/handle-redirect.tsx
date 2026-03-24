import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { api } from "@/utils/api";

interface Props {
	applicationId: string;
	redirectId?: string;
	children?: React.ReactNode;
}

export const HandleRedirect = ({
	applicationId,
	redirectId,
	children = <PlusIcon className="w-4 h-4" />,
}: Props) => {
	const t = useTranslations("applicationAdvancedRedirects.form");
	const [isOpen, setIsOpen] = useState(false);
	const [presetSelected, setPresetSelected] = useState("");

	const redirectPresets = useMemo(
		() => [
			{
				id: "to-www",
				label: t("presetToWww"),
				redirect: {
					regex: "^https?://(?:www.)?(.+)",
					permanent: true,
					replacement: "https://www.${1}",
				},
			},
			{
				id: "to-non-www",
				label: t("presetToNonWww"),
				redirect: {
					regex: "^https?://www.(.+)",
					permanent: true,
					replacement: "https://${1}",
				},
			},
		],
		[t],
	);

	const addRedirectSchema = useMemo(
		() =>
			z.object({
				regex: z.string().min(1, t("validation.regex")),
				permanent: z.boolean().default(false),
				replacement: z.string().min(1, t("validation.replacement")),
			}),
		[t],
	);

	type AddRedirect = z.infer<typeof addRedirectSchema>;

	const { data, refetch } = api.redirects.one.useQuery(
		{
			redirectId: redirectId || "",
		},
		{
			enabled: !!redirectId,
		},
	);

	const utils = api.useUtils();

	const { mutateAsync, isPending, error, isError } = redirectId
		? api.redirects.update.useMutation()
		: api.redirects.create.useMutation();

	const form = useForm({
		defaultValues: {
			permanent: false,
			regex: "",
			replacement: "",
		},
		resolver: zodResolver(addRedirectSchema),
	});

	useEffect(() => {
		form.reset({
			permanent: data?.permanent || false,
			regex: data?.regex || "",
			replacement: data?.replacement || "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (submitData: AddRedirect) => {
		await mutateAsync({
			applicationId,
			...submitData,
			redirectId: redirectId || "",
		})
			.then(async () => {
				toast.success(redirectId ? t("toast.updated") : t("toast.created"));
				await utils.application.one.invalidate({
					applicationId,
				});
				refetch();
				await utils.application.readTraefikConfig.invalidate({
					applicationId,
				});
				onDialogToggle(false);
			})
			.catch(() => {
				toast.error(
					redirectId ? t("toast.errorUpdate") : t("toast.errorCreate"),
				);
			});
	};

	const onDialogToggle = (open: boolean) => {
		setIsOpen(open);
	};

	const onPresetSelect = (presetId: string) => {
		const redirectPreset = redirectPresets.find(
			(preset) => preset.id === presetId,
		)?.redirect;
		if (!redirectPreset) return;
		const { regex, permanent, replacement } = redirectPreset;
		form.reset({ regex, permanent, replacement }, { keepDefaultValues: true });
		setPresetSelected(presetId);
	};

	return (
		<Dialog open={isOpen} onOpenChange={onDialogToggle}>
			<DialogTrigger asChild>
				{redirectId ? (
					<Button
						variant="ghost"
						size="icon"
						className="group hover:bg-blue-500/10 "
					>
						<PenBoxIcon className="size-3.5  text-primary group-hover:text-blue-500" />
					</Button>
				) : (
					<Button>{children}</Button>
				)}
			</DialogTrigger>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{t("title")}</DialogTitle>
					<DialogDescription>{t("description")}</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="md:col-span-2">
					<Label>{t("presets")}</Label>
					<Select onValueChange={onPresetSelect} value={presetSelected}>
						<SelectTrigger>
							<SelectValue placeholder={t("noPreset")} />
						</SelectTrigger>
						<SelectContent>
							{redirectPresets.map((preset) => (
								<SelectItem key={preset.id} value={preset.id}>
									{preset.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>

				<Separator />

				<Form {...form}>
					<form
						id="hook-form-add-redirect"
						onSubmit={form.handleSubmit(onSubmit)}
						className="grid w-full gap-4"
					>
						<div className="flex flex-col gap-4">
							<FormField
								control={form.control}
								name="regex"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("regex")}</FormLabel>
										<FormControl>
											<Input placeholder="^http://localhost/(.*)" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="replacement"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("replacement")}</FormLabel>
										<FormControl>
											<Input placeholder="http://mydomain/$${1}" {...field} />
										</FormControl>

										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="permanent"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between p-3 mt-4 border rounded-lg shadow-sm">
										<div className="space-y-0.5">
											<FormLabel>{t("permanent")}</FormLabel>
											<FormDescription>{t("permanentDesc")}</FormDescription>
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
					</form>

					<DialogFooter>
						<Button
							isLoading={isPending}
							form="hook-form-add-redirect"
							type="submit"
						>
							{redirectId ? t("actions.update") : t("actions.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
