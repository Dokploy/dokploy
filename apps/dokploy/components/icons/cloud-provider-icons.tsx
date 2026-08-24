export const HetznerIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="currentColor"
			className={className}
		>
			<path d="M21.286 14.286H16.5v2.143h4.786v2.143H16.5v2.142h4.786V23H14.357V1h6.929v13.286zM2.714 14.286H7.5v2.143H2.714v2.143H7.5v2.142H2.714V23H.571V1h2.143v13.286zm9.429-12.143v20.714H9.857V2.143h2.286z" />
		</svg>
	);
};

export const AwsIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
		>
			<rect width="24" height="24" rx="6" fill="#232F3E" />
			<path
				d="M6.25 15.75L12 6.75l5.75 9"
				fill="none"
				stroke="#FF9900"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
			<path
				d="M7 15.25c1.2 1.1 2.9 1.75 5 1.75s3.8-.65 5-1.75"
				fill="none"
				stroke="#FF9900"
				strokeWidth="1.3"
				strokeLinecap="round"
			/>
		</svg>
	);
};

export const DigitalOceanIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
		>
			<rect width="24" height="24" rx="6" fill="#0080FF" />
			<path
				d="M12 18v-2.6a3.4 3.4 0 1 0-3.4-3.4H6.5A5.5 5.5 0 1 1 12 18Z"
				fill="#fff"
			/>
			<circle cx="12" cy="18" r="1.1" fill="#fff" />
		</svg>
	);
};

export const VultrIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
		>
			<rect width="24" height="24" rx="6" fill="#007BFC" />
			<path
				d="M7 7h3.1l1.9 7.1L13.9 7H17l-3.8 10H10.8L7 7Z"
				fill="#fff"
			/>
		</svg>
	);
};

export const LinodeIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			className={className}
		>
			<rect width="24" height="24" rx="6" fill="#0F1F3D" />
			<path d="M8 7h3v10H8V7Zm5 0h3v10h-3V7Z" fill="#53C0FF" />
		</svg>
	);
};

export const CloudProviderIcon = ({ className }: { className?: string }) => {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
		</svg>
	);
};

export const CloudProviderLogo = ({
	icon,
	className,
}: {
	icon: "hetzner" | "aws" | "digitalocean" | "vultr" | "linode";
	className?: string;
}) => {
	switch (icon) {
		case "hetzner":
			return <HetznerIcon className={className} />;
		case "aws":
			return <AwsIcon className={className} />;
		case "digitalocean":
			return <DigitalOceanIcon className={className} />;
		case "vultr":
			return <VultrIcon className={className} />;
		case "linode":
			return <LinodeIcon className={className} />;
		default:
			return <CloudProviderIcon className={className} />;
	}
};
