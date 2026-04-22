import Script from "next/script";

export const HubSpotWidget = () => {
	return (
		<Script
			id="hs-script-loader"
			type="text/javascript"
			src="//js-eu1.hs-scripts.com/147033433.js"
			strategy="lazyOnload"
			async
			defer
		/>
	);
};
