import { useEffect, useState } from "react";

export const useUrl = () => {
	const [url, setUrl] = useState("");

	useEffect(() => {
		const protocolAndHost = `${window.location.protocol}//${window.location.host}`;

		setUrl(`${protocolAndHost}`);
	}, []);

	return url;
};
