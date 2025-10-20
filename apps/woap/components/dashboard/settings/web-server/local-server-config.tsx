import { zodResolver } from "@hookform/resolvers/zod";
import { Settings } from "lucide-react";
import { useTranslation } from "next-i18next";
import { useForm } from "react-hook-form";
import { z } from "zod";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const Schema = z.object({
	port: z.number().min(1, "Port must be higher than 0"),
	username: z.string().min(1, "Username is required"),
});

type Schema = z.infer<typeof Schema>;

const DEFAULT_LOCAL_SERVER_DATA: Schema = {
	port: 22,
	username: "root",
};

/** Returns local server data for use with local server terminal */
export const getLocalServerData = () => {
	try {
		const localServerData = localStorage.getItem("localServerData");
		const parsedLocalServerData = localServerData
			? (JSON.parse(localServerData) as typeof DEFAULT_LOCAL_SERVER_DATA)
			: DEFAULT_LOCAL_SERVER_DATA;

		return parsedLocalServerData;
	} catch {
		return DEFAULT_LOCAL_SERVER_DATA;
	}
};

interface Props {
	onSave: () => void;
}

const LocalServerConfig = ({ onSave }: Props) => {
	const { t } = useTranslation("settings");

	const form = useForm<Schema>({
		defaultValues: getLocalServerData(),
		resolver: zodResolver(Schema),
	});

	const onSubmit = (data: Schema) => {
		localStorage.setItem("localServerData", JSON.stringify(data));
		form.reset(data);
		onSave();
	};

	return (
		<Accordion collapsible type="single">
			<AccordionItem value="connectionSettings">
				<AccordionTrigger
					className={cn(
						buttonVariants({ variant: "ghost" }),
						"hover:no-underline px-1 mb-2 active:hover:transform-none",
					)}
				>
					<div className="flex flex-row items-center gap-2 justify-between w-full">
						<div className="flex flex-row gap-2 items-center">
							<Settings className="h-4 w-4" />
							<span className="dark:hover:text-white">
								{t("settings.terminal.connectionSettings")}
							</span>
						</div>
					</div>
				</AccordionTrigger>

				<AccordionContent className="px-1 flex flex-col gap-2">
					<Form {...form}>
						<form
							id="hook-form-add-server"
							onSubmit={form.handleSubmit(onSubmit)}
							className="w-full grid grid-cols-2 gap-4"
						>
							<FormField
								control={form.control}
								name="port"
								render={({ field }) => (
									<FormItem>
										<FormLabel>{t("settings.terminal.port")}</FormLabel>
										<FormControl>
											<Input
												{...field}
												onChange={(e) => {
													const value = e.target.value;
													if (value === "") {
														field.onChange(1);
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
					</Form>

					<Button
						form="hook-form-add-server"
						type="submit"
						className="ml-auto"
						disabled={!form.formState.isDirty}
					>
						{t("settings.common.save")}
					</Button>
				</AccordionContent>
			</AccordionItem>
		</Accordion>
	);
};

export default LocalServerConfig;
