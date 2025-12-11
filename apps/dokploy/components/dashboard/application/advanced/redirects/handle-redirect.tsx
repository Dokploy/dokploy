import { zodResolver } from "@hookform/resolvers/zod";
import { PenBoxIcon, PlusIcon } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useEffect, useState } from "react";
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

const createSchema = (t: (key: string) => string) =>
	z.object({
		regex: z
			.string()
			.min(1, t("redirects.validation.regexRequired")),
		permanent: z.boolean().default(false),
		replacement: z
			.string()
			.min(1, t("redirects.validation.replacementRequired")),
	});

type AddRedirect = z.infer<ReturnType<typeof createSchema>>;

// Default presets
const redirectPresets = [
	// {
	// 	label: "Allow www & non-www.",
	// 	redirect: {
	// 		regex: "",
	// 		permanent: false,
	// 		replacement: "",
	// 	},
	// },
	{
		id: "to-www",
		label: "redirects.presets.toWww",
		redirect: {
			regex: "^https?://(?:www.)?(.+)",
			permanent: true,
			replacement: "https://www.${1}",
		},
	},
	{
		id: "to-non-www",
		label: "redirects.presets.toNonWww",
		redirect: {
			regex: "^https?://www.(.+)",
			permanent: true,
			replacement: "https://${1}",
		},
	},
];

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
	const { t } = useTranslation("common");
	const [isOpen, setIsOpen] = useState(false);
	const [presetSelected, setPresetSelected] = useState("");

	const { data, refetch } = api.redirects.one.useQuery(
		{
			redirectId: redirectId || "",
		},
		{
			enabled: !!redirectId,
		},
	);

	const utils = api.useUtils();

	const { mutateAsync, isLoading, error, isError } = redirectId
		? api.redirects.update.useMutation()
		: api.redirects.create.useMutation();

	const AddRedirectchema = createSchema(t);

	const form = useForm<AddRedirect>({
		defaultValues: {
			permanent: false,
			regex: "",
			replacement: "",
		},
		resolver: zodResolver(AddRedirectchema),
	});

	useEffect(() => {
		form.reset({
			permanent: data?.permanent || false,
			regex: data?.regex || "",
			replacement: data?.replacement || "",
		});
	}, [form, form.reset, form.formState.isSubmitSuccessful, data]);

	const onSubmit = async (data: AddRedirect) => {
		await mutateAsync({
			applicationId,
			...data,
			redirectId: redirectId || "",
		})
			.then(async () => {
				toast.success(
					redirectId
						? t("redirects.toast.updateSuccess")
						: t("redirects.toast.createSuccess"),
				);
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
					redirectId
						? t("redirects.toast.updateError")
						: t("redirects.toast.createError"),
				);
			});
	};

	const onDialogToggle = (open: boolean) => {
		setIsOpen(open);
		// commented for the moment because not reseting the form if accidentally closed the dialog can be considered as a feature instead of a bug
		// setPresetSelected("");
		// form.reset();
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
					<DialogTitle>{t("redirects.dialog.title")}</DialogTitle>
					<DialogDescription>
						{t("redirects.dialog.description")}
					</DialogDescription>
				</DialogHeader>
				{isError && <AlertBlock type="error">{error?.message}</AlertBlock>}

				<div className="md:col-span-2">
					<Label>{t("redirects.form.presetsLabel")}</Label>
					<Select onValueChange={onPresetSelect} value={presetSelected}>
						<SelectTrigger>
							<SelectValue
								placeholder={t("redirects.form.presetsPlaceholder")}
							/>
						</SelectTrigger>
						<SelectContent>
							{redirectPresets.map((preset) => (
								<SelectItem key={preset.label} value={preset.id}>
									{t(preset.label)}
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
										<FormLabel>
											{t("redirects.form.regexLabel")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"redirects.form.regexPlaceholder",
												)}
												{...field}
											/>
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
										<FormLabel>
											{t("redirects.form.replacementLabel")}
										</FormLabel>
										<FormControl>
											<Input
												placeholder={t(
													"redirects.form.replacementPlaceholder",
												)}
												{...field}
											/>
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
											<FormLabel>
												{t("redirects.form.permanentLabel")}
											</FormLabel>
											<FormDescription>
												{t("redirects.form.permanentDescription")}
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
					</form>

					<DialogFooter>
						<Button
							isLoading={isLoading}
							form="hook-form-add-redirect"
							type="submit"
						>
							{redirectId
								? t("redirects.form.submit.update")
								: t("redirects.form.submit.create")}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	);
};
