import { Input } from "@/components/ui/input";

const ADDRESS = /^[A-Za-z0-9.:[\]-]+$/;

/** Adds the address the new node should use for Swarm traffic. */
export const withJoinAddress = (
	command: string | undefined,
	address: string,
) =>
	command && address && ADDRESS.test(address)
		? `${command} --advertise-addr ${address} --data-path-addr ${address}`
		: (command ?? "");

export const JoinAddressField = ({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) => (
	<div className="flex flex-col gap-1.5 text-sm">
		<label htmlFor="join-address" className="font-medium">
			This node's private address (optional)
		</label>
		<Input
			id="join-address"
			placeholder="10.0.0.12"
			value={value}
			onChange={(event) => onChange(event.target.value.trim())}
		/>
		<span className="text-muted-foreground">
			Set it when the nodes share a private network (VPC or VPN), so Swarm
			traffic stays on it. For VMs connected over the internet, use Multi-VM
			networking above instead: it sets up WireGuard and joins the VM for you.
		</span>
		{value && !ADDRESS.test(value) && (
			<span className="text-red-600 dark:text-red-400">
				Enter an IP address or host name.
			</span>
		)}
	</div>
);
