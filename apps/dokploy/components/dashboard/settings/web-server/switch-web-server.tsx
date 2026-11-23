import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AlertBlock } from "@/components/shared/alert-block";
import { CodeEditor } from "@/components/shared/code-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { api, type RouterOutputs } from "@/utils/api";

type Provider = RouterOutputs["settings"]["getWebServerProvider"]["provider"];

const names: Record<Provider, string> = { traefik: "Traefik", caddy: "Caddy" };

const list = (items: string[]) => (
	<ul className="list-disc pl-5 pt-1">
		{items.map((item) => (
			<li key={item}>{item}</li>
		))}
	</ul>
);

interface Props {
	children: React.ReactNode;
	serverId?: string;
	provider: Provider;
}

export const SwitchWebServer = ({ children, serverId, provider }: Props) => {
	const target: Provider = provider === "caddy" ? "traefik" : "caddy";
	const [open, setOpen] = useState(false);
	const [acknowledged, setAcknowledged] = useState(false);
	const [switching, setSwitching] = useState(false);
	const [failure, setFailure] = useState<string>();
	const utils = api.useUtils();

	const check = api.settings.checkWebServerSwitch.useQuery(
		{ provider: target, serverId },
		{ enabled: open && !switching, retry: false, refetchOnWindowFocus: false },
	);
	const { mutateAsync: switchWebServer } =
		api.settings.switchWebServer.useMutation();

	// On the Dokploy host the dashboard is served through the proxy being
	// replaced, so a request that fails means the switch is still running.
	// No record after a Dokploy restart: whatever serves now is the result.
	const pollSwitch = () =>
		utils.settings.getWebServerProvider
			.fetch({ serverId }, { staleTime: 0, retry: false })
			.then(
				({ provider: serving, lastSwitch }) => ({
					serving,
					status:
						lastSwitch?.status ?? (serving === target ? "done" : "failed"),
					message: lastSwitch?.message ?? "",
				}),
				() => undefined,
			);

	const onSwitch = async () => {
		setFailure(undefined);
		setSwitching(true);
		try {
			await switchWebServer({ provider: target, serverId, acknowledged });
			let outcome = await pollSwitch();
			// Ten minutes: longer than a switch takes, the image pull included.
			for (
				let polls = 0;
				polls < 300 && (!outcome || outcome.status === "running");
				polls++
			) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
				outcome = await pollSwitch();
			}
			if (!outcome || outcome.status === "running") {
				toast.error(
					"Dokploy has not reported how the switch ended. Reload the page to see which proxy serves",
				);
			} else if (outcome.status === "done") {
				toast.success(outcome.message || `${names[target]} is serving`);
				setOpen(false);
			} else {
				setFailure(outcome.message || `${names[outcome.serving]} is serving`);
			}
		} catch (error) {
			toast.error((error as Error).message);
		} finally {
			setSwitching(false);
		}
	};

	const blockers = check.data?.blockers ?? [];
	const acknowledge = check.data?.acknowledge ?? [];

	return (
		<Dialog
			open={open}
			onOpenChange={(value) => {
				if (switching) return;
				setOpen(value);
				setAcknowledged(false);
				setFailure(undefined);
			}}
		>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-2xl" showCloseButton={!switching}>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						Switch to {names[target]}
						{target === "caddy" && (
							<Badge variant="outline">Experimental</Badge>
						)}
					</DialogTitle>
					<DialogDescription>
						{target === "caddy"
							? "Caddy will replace Traefik as the reverse proxy on this server, with a configuration that Dokploy generates and keeps up to date. You can switch back from the same menu."
							: "Traefik will replace Caddy as the reverse proxy on this server."}
					</DialogDescription>
				</DialogHeader>

				<div className="flex min-h-0 flex-col gap-4 overflow-y-auto">
					{failure && (
						<AlertBlock type="error">
							The switch did not complete.
							<pre className="pt-2 font-mono text-xs whitespace-pre-wrap">
								{failure}
							</pre>
						</AlertBlock>
					)}
					{check.isFetching ? (
						<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
							<Loader2 className="size-4 shrink-0 animate-spin" />
							{target === "caddy"
								? "Checking what the switch would change. The first check can take a while, because the Caddy image is downloaded."
								: "Checking what the switch would change."}
						</div>
					) : check.isError ? (
						<AlertBlock type="error">{check.error.message}</AlertBlock>
					) : (
						check.data && (
							<>
								{blockers.length > 0 && (
									<AlertBlock type="error">
										The switch is not possible until these are fixed:
										{list(blockers)}
									</AlertBlock>
								)}
								{acknowledge.length > 0 && (
									<>
										<AlertBlock type="warning">
											These will stop applying after the switch:
											{list(acknowledge)}
										</AlertBlock>
										<div className="flex items-center gap-2">
											<Checkbox
												id="acknowledge-switch"
												checked={acknowledged}
												disabled={switching}
												onCheckedChange={(checked) =>
													setAcknowledged(checked === true)
												}
											/>
											<Label
												htmlFor="acknowledge-switch"
												className="cursor-pointer font-normal"
											>
												I understand these will stop applying
											</Label>
										</div>
									</>
								)}
								{check.data.warnings.length > 0 && (
									<AlertBlock type="info">
										{list(check.data.warnings)}
									</AlertBlock>
								)}
								{check.data.caddyfile && (
									<div className="flex flex-col gap-2">
										<Label>Caddy will start with this configuration</Label>
										<CodeEditor
											readOnly
											language="shell"
											value={check.data.caddyfile}
											wrapperClassName="h-64 font-mono"
										/>
									</div>
								)}
							</>
						)
					)}
				</div>

				{switching && (
					<AlertBlock type="info">
						{serverId ? "Applications" : "The dashboard and applications"} on
						this server may be unreachable for a moment. If {names[target]} does
						not start, {names[provider]} comes back on its own.
					</AlertBlock>
				)}

				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline" disabled={switching}>
							Cancel
						</Button>
					</DialogClose>
					<Button
						isLoading={switching}
						disabled={
							!check.data ||
							check.isFetching ||
							blockers.length > 0 ||
							(acknowledge.length > 0 && !acknowledged)
						}
						onClick={onSwitch}
					>
						Switch to {names[target]}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};
