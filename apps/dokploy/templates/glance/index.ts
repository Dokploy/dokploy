import {
	type DomainSchema,
	type Schema,
	type Template,
	generateRandomDomain,
} from "../utils";

export function generate(schema: Schema): Template {
	const mainDomain = generateRandomDomain(schema);
	const domains: DomainSchema[] = [
		{
			host: mainDomain,
			port: 8080,
			serviceName: "glance",
		},
	];

	const mounts: Template["mounts"] = [
		{
			filePath: "/app/glance.yml",
			content: `
branding:
  hide-footer: true
  logo-text: P

pages:
  - name: Home
    columns:
      - size: small
        widgets:
          - type: calendar

          - type: releases
            show-source-icon: true
            repositories:
              - Dokploy/dokploy
              - n8n-io/n8n
              - Budibase/budibase
              - home-assistant/core
              - tidbyt/pixlet

          - type: twitch-channels
            channels:
              - nmplol
              - extraemily
              - qtcinderella
              - ludwig
              - timthetatman
              - mizkif

      - size: full
        widgets:
          - type: hacker-news

          - type: videos
            style: grid-cards
            channels:
              - UC3GzdWYwUYI1ACxuP9Nm-eg
              - UCGbg3DjQdcqWwqOLHpYHXIg
              - UC24RSoLcjiNZbQcT54j5l7Q
            limit: 3

          - type: rss
            limit: 10
            collapse-after: 3
            cache: 3h
            feeds:
              - url: https://daringfireball.net/feeds/main
                title: Daring Fireball
        
      - size: small
        widgets:
          - type: weather
            location: Gansevoort, New York, United States
            show-area-name: false
            units: imperial
            hour-format: 12h

          - type: markets
            markets:
              - symbol: SPY
                name: S&P 500
              - symbol: VOO
                name: Vanguard
              - symbol: BTC-USD
                name: Bitcoin
              - symbol: ETH-USD
                name: Etherium
              - symbol: NVDA
                name: NVIDIA
              - symbol: AAPL
                name: Apple
              - symbol: MSFT
                name: Microsoft
              - symbol: GOOGL
                name: Google
              - symbol: AMD
                name: AMD
              - symbol: TSLA
                name: Tesla`,
		},
	];

	return {
		domains,
		mounts,
	};
}
