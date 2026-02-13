import {cn} from "@/lib/utils";

interface Props {
    className?: string;
    logoUrl?: string;
}

export const Logo = ({className = "size-14", logoUrl}: Props) => {
    if (logoUrl) {
        return (
            <img
                src={logoUrl}
                alt="Organization Logo"
                className={cn(className, "object-contain rounded-sm")}
            />
        );
    }

    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="PC circuit logo">
            <defs>
                <linearGradient id="g" x1="80" y1="80" x2="432" y2="432" gradientUnits="userSpaceOnUse">
                    <stop offset="0" stop-color="#0EA5E9"/>
                    <stop offset="1" stop-color="#22C55E"/>
                </linearGradient>
                <filter id="soft" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#0B1220" flood-opacity="0.25"/>
                </filter>
            </defs>

            <rect x="64" y="64" width="384" height="384" rx="96" fill="#0B1220" filter="url(#soft)"/>
            <rect x="84" y="84" width="344" height="344" rx="80" fill="none" stroke="url(#g)" stroke-width="10"
                  opacity="0.9"/>

            <path d="M256 152
           c-54 0-96 36-96 88
           c0 30 14 55 36 70
           v34 c0 14 12 26 26 26
           h12 v-36 h44 v36 h12
           c14 0 26-12 26-26
           v-34 c22-15 36-40 36-70
           c0-52-42-88-96-88z"
                  fill="none" stroke="url(#g)" stroke-width="12" stroke-linejoin="round"/>

            <circle cx="192" cy="238" r="7" fill="#22C55E"/>
            <circle cx="320" cy="238" r="7" fill="#0EA5E9"/>
            <circle cx="256" cy="198" r="7" fill="#22C55E"/>
            <circle cx="256" cy="278" r="7" fill="#0EA5E9"/>


            <path d="M256 198 V168" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>
            <path d="M192 238 H152" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>
            <path d="M320 238 H360" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>
            <path d="M256 278 V308" stroke="url(#g)" stroke-width="10" stroke-linecap="round"/>


            <g fill="none" stroke="#E6F0FF" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">
                <path d="M172 352 V254 h56 c28 0 44 16 44 38 s-16 38-44 38 h-56"/>
                <path d="M352 268
             c-14-14-30-20-52-20
             c-40 0-68 28-68 64
             s28 64 68 64
             c22 0 38-6 52-20"/>
            </g>
        </svg>
    );
};
