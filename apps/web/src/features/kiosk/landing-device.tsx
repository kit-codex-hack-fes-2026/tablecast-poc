import { useId } from "react";

/** 実画面の縦横比を保ち、金属の縁・ベゼル・カメラ・底面で端末を描き分ける。 */
export function LandingDevice({
  device,
  src,
  alt,
  width,
  height,
  loading = "lazy",
}: {
  alt: string;
  device: "laptop" | "phone" | "tablet";
  height: number;
  loading?: "eager" | "lazy";
  src: string;
  width: number;
}) {
  const metal = useId();
  const laptop = device === "laptop";
  const phone = device === "phone";
  return (
    <div
      data-device={device}
      className={
        laptop
          ? "relative aspect-1600/1100"
          : phone
            ? "relative aspect-430/960"
            : "relative aspect-1120/864"
      }
    >
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox={laptop ? "0 0 1600 1100" : phone ? "0 0 430 960" : "0 0 1120 864"}
        className="pointer-events-none absolute inset-0 size-full overflow-visible drop-shadow-lg"
      >
        <defs>
          <linearGradient id={metal} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className="[stop-color:var(--color-muted-foreground)]" />
            <stop offset="0.35" className="[stop-color:var(--color-muted)]" />
            <stop offset="0.65" className="[stop-color:var(--color-control-edge)]" />
            <stop offset="1" className="[stop-color:var(--color-muted-foreground)]" />
          </linearGradient>
        </defs>
        {laptop ? (
          <>
            <rect x="96" y="4" width="1408" height="900" rx="30" fill={`url(#${metal})`} />
            <rect x="102" y="10" width="1396" height="890" rx="26" className="fill-primary" />
            <path d="M102 900H1498L1596 1068H4Z" fill={`url(#${metal})`} />
            <path
              d="M4 1068H1596V1080Q1560 1096 1500 1096H100Q40 1096 4 1080Z"
              fill={`url(#${metal})`}
            />
            <path d="M200 920H1400L1428 1000H172Z" className="fill-primary" />
            {[0, 1, 2, 3].map((row) =>
              Array.from({ length: 14 }, (_, column) => (
                <rect
                  key={`${row}-${column}`}
                  x={214 + column * 84 - row * 4}
                  y={925 + row * 18}
                  width={73 + row * 0.5}
                  height="12"
                  rx="3"
                  className="fill-muted-foreground/40"
                />
              )),
            )}
            <path
              d="M620 1012H980L994 1056H606Z"
              fill={`url(#${metal})`}
              className="stroke-muted-foreground"
              strokeWidth="2"
            />
            <path d="M704 1068H896L882 1078H718Z" className="fill-muted-foreground" />
            <path d="M118 900H1482" className="stroke-control-edge" strokeWidth="5" />
          </>
        ) : phone ? (
          <>
            <path
              d="M1 168V204M1 236V294M1 316V374M429 260V358"
              className="stroke-muted-foreground"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect x="3" y="3" width="424" height="954" rx="65" fill={`url(#${metal})`} />
            <rect x="9" y="9" width="412" height="942" rx="60" className="fill-primary" />
            <rect x="16" y="16" width="398" height="928" rx="51" className="fill-background" />
            <rect x="152" y="29" width="126" height="35" rx="17.5" className="fill-primary" />
            <circle cx="260" cy="46" r="5" className="fill-muted-foreground/40" />
            <text x="52" y="54" fontSize="17" fontWeight="600" className="fill-foreground">
              9:41
            </text>
            <path d="M330 45h4v10h-4zm7-4h4v14h-4zm7-4h4v18h-4z" className="fill-foreground" />
            <rect
              x="365"
              y="39"
              width="25"
              height="13"
              rx="3"
              className="fill-none stroke-foreground"
              strokeWidth="2"
            />
            <rect x="368" y="42" width="18" height="7" rx="1" className="fill-foreground" />
            <path d="M393 43v5" className="stroke-foreground" strokeWidth="2" />
            <rect x="148" y="929" width="134" height="5" rx="2.5" className="fill-primary" />
          </>
        ) : (
          <>
            <path
              d="M846 1H920M1119 120V182M1119 200V262"
              className="stroke-muted-foreground"
              strokeWidth="6"
              strokeLinecap="round"
            />
            <rect x="3" y="3" width="1114" height="858" rx="48" fill={`url(#${metal})`} />
            <rect x="8" y="8" width="1104" height="848" rx="44" className="fill-primary" />
            <circle cx="560" cy="24" r="5" className="fill-muted-foreground" />
            <rect x="440" y="838" width="240" height="4" rx="2" className="fill-muted" />
          </>
        )}
      </svg>
      <div
        className={
          laptop
            ? "absolute top-[2.73%] left-[7.5%] w-[85%] overflow-hidden rounded-t-[1%]"
            : phone
              ? "absolute top-[8.33%] left-[3.72%] w-[92.56%] overflow-hidden"
              : "absolute top-[5.56%] left-[4.29%] w-[91.43%] overflow-hidden rounded-[2%]"
        }
      >
        <img
          src={src}
          width={width}
          height={height}
          loading={loading}
          alt={alt}
          className="w-full"
        />
      </div>
      {laptop && (
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 1600 1100"
          className="pointer-events-none absolute inset-0 size-full"
        >
          <path d="M720 28H880V52Q880 62 870 62H730Q720 62 720 52Z" className="fill-primary" />
          <circle cx="800" cy="44" r="4" className="fill-muted-foreground/50" />
        </svg>
      )}
    </div>
  );
}
