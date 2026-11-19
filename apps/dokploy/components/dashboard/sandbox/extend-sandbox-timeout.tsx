import { standardSchemaResolver as zodResolver } from "@hookform/resolvers/standard-schema";
import { Clock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";

const schema = z.object({
	minutes: z.number().min(1).max(1440),
});

interface Props {
	sandboxId: string;
	currentTimeoutMs: number;
}

export const ExtendSandboxTimeout = ({
	sandboxId,
	currentTimeoutMs,
}: Props) => {
	const { t } = useTranslation();
	const utils = api.useUtils();
	const [open, setOpen] = useState(false);
	const { mutateAsync, isPending } = api.sandbox.setTimeout.useMutation();
	const form = useForm<z.infer<typeof schema>>({
		defaultValues: {
			minutes: Math.max(1, Math.round(currentTimeoutMs / 60_000)),
		},
		resolver: zodResolver(schema),
	});

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">
					<Clock className="size-4" />
					{t("sandbox.extendTimeout")}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{t("sandbox.extendTimeout")}</DialogTitle>
					<DialogDescription>
						{t("sandbox.extendTimeoutDescription")}
					</DialogDescription>
				</DialogHeader>
				<Form {...form}>
					<form
						id="extend-sandbox-form"
						className="grid gap-4"
						onSubmit={form.handleSubmit(async (values) => {
							await mutateAsync({
								sandboxId,
								timeoutMs: Math.round(values.minutes * 60_000),
							})
								.then(async () => {
									toast.success(t("sandbox.timeoutUpdated"));
									await utils.sandbox.one.invalidate({ sandboxId });
									setOpen(false);
								})
								.catch(() => toast.error(t("sandbox.timeoutUpdateError")));
						})}
					>
						<FormField
							control={form.control}
							name="minutes"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("sandbox.labelTimeout")}</FormLabel>
									<FormControl>
										<Input
											type="number"
											min={1}
											step={1}
											{...field}
											onChange={(event) =>
												field.onChange(event.target.valueAsNumber)
											}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
					</form>
				</Form>
				<DialogFooter>
					<Button
						type="submit"
						form="extend-sandbox-form"
						isLoading={isPending}
						disabled={isPending}
					>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
