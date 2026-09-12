import type { Control } from "react-hook-form";
import {
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@/components/ui/form";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AddCommandForm } from "./add-command";

interface CustomShellFieldsProps {
	control: Control<AddCommandForm>;
}

export const CustomShellFields = ({ control }: CustomShellFieldsProps) => {
	return (
		<>
			<FormField
				control={control}
				name="customShell"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Shell</FormLabel>
						<Select onValueChange={field.onChange} value={field.value ?? "sh"}>
							<FormControl>
								<SelectTrigger>
									<SelectValue placeholder="Select a shell" />
								</SelectTrigger>
							</FormControl>
							<SelectContent>
								<SelectItem value="sh">sh</SelectItem>
								<SelectItem value="bash">bash</SelectItem>
							</SelectContent>
						</Select>
						<FormMessage />
					</FormItem>
				)}
			/>
			<FormField
				control={control}
				name="customCommand"
				render={({ field }) => (
					<FormItem>
						<FormLabel>Script</FormLabel>
						<FormControl>
							<Textarea
								placeholder="npx prisma migrate deploy && node server.js"
								className="font-mono"
								{...field}
								value={field.value ?? ""}
							/>
						</FormControl>
						<p className="text-sm text-muted-foreground">
							Example: php artisan migrate --force && apache2-foreground
						</p>
						<FormMessage />
					</FormItem>
				)}
			/>
			<p className="text-sm text-muted-foreground">
				Dokploy ignores Args in this mode. Stored args stay saved.
			</p>
		</>
	);
};
