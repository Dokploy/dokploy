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
