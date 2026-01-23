import { Head, Html, Main, NextScript } from "next/document";

export default function Document() {
	return (
		<Html lang="en" className="font-sans">
			<Head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
				<link rel="icon" href="/icon.svg" />
			</Head>
			<body className="flex h-full w-full flex-col font-sans">
				<Main />
				<NextScript />
			</body>
		</Html>
	);
}
