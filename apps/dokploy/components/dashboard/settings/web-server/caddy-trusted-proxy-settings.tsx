import { Cloud, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/utils/api";

type TrustedProxyMode = "disabled" | "cloudflare" | "static";

interface Props {
	serverId?: string;
	children?: React.ReactNode;
}

const splitList = (value: string) =>
	Array.from(
		new Set(
			value
				.split(/[\n,]+/)
				.map((item) => item.trim())
				.filter((item) => item.length > 0),
		),
	);

const joinList = (values?: string[] | null) => (values ?? []).join("\n");

const modeLabel = (mode?: TrustedProxyMode) => {
	switch (mode) {
		case "cloudflare":
			return "Cloudflare";
		case "static":
			return "Static CIDRs";
		default:
			return "Disabled";
	}
};

export const CaddyTrustedProxySettings = ({ serverId, children }: Props) => {
	const [isOpen, setIsOpen] = useState(false);
	const [mode, setMode] = useState<TrustedProxyMode>("disabled");
	const [ranges, setRanges] = useState("");
	const [headers, setHeaders] = useState("");
	const [strict, setStrict] = useState(true);

	const { data: settings, refetch } =
		api.settings.getCaddyTrustedProxySettings.useQuery({ serverId });
	const { mutateAsync: updateSettings, isPending } =
		api.settings.updateCaddyTrustedProxySettings.useMutation();

	useEffect(() => {
		if (!settings) return;
		setMode(settings.mode);
		setRanges(joinList(settings.ranges));
		setHeaders(joinList(settings.clientIpHeaders));
		setStrict(settings.strict !== false);
	}, [settings]);

	const save = async () => {
		try {
			await updateSettings({
				serverId,
				mode,
				ranges: mode === "static" ? splitList(ranges) : [],
				clientIpHeaders: splitList(headers),
				strict,
			});
			await refetch();
			toast.success("Caddy trusted proxy settings updated");
			setIsOpen(false);
		} catch (error) {
			toast.error(
				error instanceof Error
					? error.message
					: "Error updating Caddy trusted proxy settings",
			);
		}
	};

	const trigger = children ?? (
		<button
			type="button"
			className="flex w-full flex-col gap-4 rounded-lg border p-4 text-left transition-colors hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
		>
			<div className="flex gap-3">
				<ShieldCheck className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
				<div className="space-y-1">
					<div className="font-medium">Caddy trusted proxies</div>
					<div className="text-sm text-muted-foreground">
						Mode: {modeLabel(settings?.mode)}
					</div>
				</div>
			</div>
			<span className="inline-flex h-8 items-center justify-center rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm">
				Configure
			</span>
		</button>
	);

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>{trigger}</DialogTrigger>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>Caddy trusted proxies</DialogTitle>
					<DialogDescription>
						Configure which proxy IPs Caddy trusts for client IP headers.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-5">
					<div className="space-y-2">
						<Label>Mode</Label>
						<Select
							value={mode}
							onValueChange={(value) => setMode(value as TrustedProxyMode)}
						>
							<SelectTrigger>
								<SelectValue placeholder="Select mode" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="disabled">Disabled</SelectItem>
								<SelectItem value="cloudflare">Cloudflare</SelectItem>
								<SelectItem value="static">Static CIDRs</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{mode === "cloudflare" && (
						<AlertBlock type="info">
							<div className="flex gap-2">
								<Cloud className="mt-0.5 size-4 shrink-0" />
								<span>
									Caddy will trust Cloudflare IP ranges and use CF-Connecting-IP
									before X-Forwarded-For. Use DNS-only or Full (strict) SSL mode
									for origin traffic; Flexible SSL is not recommended.
								</span>
							</div>
						</AlertBlock>
					)}

					{mode === "static" && (
						<div className="space-y-2">
							<Label>Trusted CIDR ranges</Label>
							<Textarea
								value={ranges}
								onChange={(event) => setRanges(event.target.value)}
								placeholder={"192.0.2.0/24\n2001:db8::/32"}
								rows={5}
							/>
						</div>
					)}

					{mode !== "disabled" && (
						<>
							<div className="space-y-2">
								<Label>Client IP headers</Label>
								<Textarea
									value={headers}
									onChange={(event) => setHeaders(event.target.value)}
									placeholder={
										mode === "cloudflare"
											? "CF-Connecting-IP\nX-Forwarded-For"
											: "X-Forwarded-For"
									}
									rows={3}
								/>
							</div>
							<div className="flex items-center justify-between rounded-lg border p-3">
								<div className="space-y-0.5">
									<Label>Strict proxy order</Label>
									<div className="text-sm text-muted-foreground">
										Require the trusted proxy chain to be ordered.
									</div>
								</div>
								<Switch checked={strict} onCheckedChange={setStrict} />
							</div>
						</>
					)}
				</div>

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsOpen(false)}
					>
						Cancel
					</Button>
					<Button type="button" onClick={save} isLoading={isPending}>
						Save
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
