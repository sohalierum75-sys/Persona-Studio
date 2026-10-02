// Original Persona Studio artwork for the public homepage.
// Hand-built flat-vector illustrations — no stock imagery, no bitmaps.
// All samples describe the same demo cast as the page copy (Maya Chen).

/** Bust portrait of the sample character: long black wavy hair, warm medium
 *  skin tone, expressive dark eyes, cream linen shirt, gold earrings. */
export function CharacterPortrait({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 300 380" fill="none" role="img" aria-label="Illustrated portrait of Maya Chen" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="psp-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e0eefe" />
          <stop offset="1" stopColor="#f6fbff" />
        </linearGradient>
        <linearGradient id="psp-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2b2b35" />
          <stop offset="1" stopColor="#1c1c24" />
        </linearGradient>
        <linearGradient id="psp-linen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f7f0e0" />
          <stop offset="1" stopColor="#e9dabb" />
        </linearGradient>
      </defs>

      {/* backdrop */}
      <rect width="300" height="380" fill="url(#psp-bg)" />
      <circle cx="252" cy="66" r="72" fill="#d5e8fc" />
      <circle cx="36" cy="332" r="60" fill="#ddeefb" opacity="0.85" />
      <circle cx="266" cy="228" r="4" fill="#b9d6f4" />
      <circle cx="30" cy="118" r="3" fill="#c4dcf6" />
      <circle cx="272" cy="320" r="3" fill="#c4dcf6" />

      {/* hair — back mass */}
      <path
        d="M150 26 C93 26 58 70 58 133 C58 178 55 228 47 284 C43 314 56 338 79 344 Q102 356 124 346 Q150 358 176 346 Q198 356 221 344 C244 338 257 314 253 284 C245 228 242 178 242 133 C242 70 207 26 150 26 Z"
        fill="url(#psp-hair)"
      />

      {/* neck */}
      <path d="M129 190 L129 246 C129 260 138 268 150 268 C162 268 171 260 171 246 L171 190 Z" fill="#c98e63" />
      <path d="M131 196 Q150 220 169 196 L169 210 Q150 228 131 210 Z" fill="#b3794f" />

      {/* cream linen shirt */}
      <path
        d="M150 250 C118 250 94 259 80 272 C62 288 54 314 52 348 L52 380 L248 380 L248 348 C246 314 238 288 220 272 C206 259 182 250 150 250 Z"
        fill="url(#psp-linen)"
      />
      <path d="M133 252 L150 286 L167 252 Q150 245 133 252 Z" fill="#b9855a" />
      <path d="M133 251 L150 286 L134 294 L121 264 Z" fill="#f8f1e2" />
      <path d="M167 251 L150 286 L166 294 L179 264 Z" fill="#f1e7d2" />
      <path d="M86 278 C72 294 63 318 61 346" stroke="#e3d3b4" strokeWidth="2" fill="none" />
      <path d="M214 278 C228 294 237 318 239 346" stroke="#e3d3b4" strokeWidth="2" fill="none" />

      {/* face */}
      <ellipse cx="150" cy="152" rx="50" ry="62" fill="#c98e63" />
      <ellipse cx="119" cy="172" rx="10" ry="6" fill="#d89a6e" opacity="0.5" />
      <ellipse cx="181" cy="172" rx="10" ry="6" fill="#d89a6e" opacity="0.5" />

      {/* right ear + gold hoop (left side is covered by hair) */}
      <ellipse cx="201" cy="160" rx="8" ry="12" fill="#c98e63" />
      <path d="M199 155 C203 153 206 157 204 162" stroke="#b3794f" strokeWidth="1.5" fill="none" />
      <circle cx="201" cy="179" r="4.5" fill="#e0a83f" stroke="#c08a2a" strokeWidth="1" />
      <circle cx="199.5" cy="177.5" r="1.2" fill="#f7d98c" />

      {/* brows */}
      <path d="M119 136 C125 130 137 130 142 135" stroke="#2c2c35" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M158 135 C163 130 175 130 181 136" stroke="#2c2c35" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* eyes */}
      <ellipse cx="130" cy="154" rx="10" ry="7" fill="#fff" />
      <circle cx="130.5" cy="155" r="5.4" fill="#4a2e1f" />
      <circle cx="130.5" cy="155" r="2.5" fill="#20130c" />
      <circle cx="128.8" cy="152.8" r="1.5" fill="#fff" />
      <path d="M119 152 C124 146.5 137 146.5 141 151.5" stroke="#23232b" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M122 163 C126 165.5 135 165.5 139 163" stroke="#b3794f" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <ellipse cx="170" cy="154" rx="10" ry="7" fill="#fff" />
      <circle cx="169.5" cy="155" r="5.4" fill="#4a2e1f" />
      <circle cx="169.5" cy="155" r="2.5" fill="#20130c" />
      <circle cx="167.8" cy="152.8" r="1.5" fill="#fff" />
      <path d="M159 151.5 C163 146.5 176 146.5 181 152" stroke="#23232b" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M161 163 C165 165.5 174 165.5 178 163" stroke="#b3794f" strokeWidth="1.5" strokeLinecap="round" fill="none" />

      {/* nose + lips */}
      <path d="M150 158 C149 168 147 174 145 177 C147 180 152 180 155 178" stroke="#b3794f" strokeWidth="2" strokeLinecap="round" fill="none" />
      <path d="M137 191 C142 187 147 188 150 190 C153 188 158 187 163 191 C158 198 142 198 137 191 Z" fill="#b5634e" />
      <path d="M141 193.5 C146 195.5 154 195.5 159 193.5" stroke="#9c4f3d" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" fill="none" />

      {/* hair — front curtain fringe */}
      <path
        d="M150 30 C98 30 70 68 70 122 L70 152 C73 158 78 161 83 160 C79 132 86 110 98 99 C110 116 130 124 150 122 C170 124 190 116 202 99 C214 110 221 132 217 160 C222 161 227 158 230 152 L230 122 C230 68 202 30 150 30 Z"
        fill="#26262f"
      />
      {/* left strand falling over the shoulder */}
      <path
        d="M72 118 C62 170 60 226 68 278 C73 306 84 328 98 342 C106 350 117 352 121 346 C111 326 104 298 102 266 C100 228 103 180 108 140 C96 136 82 130 72 118 Z"
        fill="url(#psp-hair)"
      />
      {/* right strand tucked behind the ear */}
      <path d="M228 116 C237 146 239 164 237 174 C230 165 224 152 222 140 C224 130 226 122 228 116 Z" fill="#26262f" />

      {/* wave highlights */}
      <path d="M96 62 C124 46 176 46 204 62" stroke="#3c3c49" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M80 132 C78 182 80 232 88 280" stroke="#383844" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M220 132 C222 176 221 210 216 240" stroke="#383844" strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M76 160 C74 208 76 254 84 300" stroke="#34343f" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M112 344 C118 348 124 349 128 346" stroke="#3c3c49" strokeWidth="2.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export type VignetteId = "flower-shop" | "rooftop" | "night-market";

const VIGNETTE_LABELS: Record<VignetteId, string> = {
  "flower-shop": "Illustrated preview of a flower shop in soft morning light",
  rooftop: "Illustrated preview of a rooftop garden at golden hour",
  "night-market": "Illustrated preview of a night market under warm lanterns",
};

/** Small illustrated scene thumbnails — the locations used by the sample episode. */
export function SceneVignette({ id, className = "" }: { id: VignetteId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 160 100" fill="none" role="img" aria-label={VIGNETTE_LABELS[id]} preserveAspectRatio="xMidYMid slice">
      {id === "flower-shop" && <FlowerShopArt />}
      {id === "rooftop" && <RooftopArt />}
      {id === "night-market" && <NightMarketArt />}
    </svg>
  );
}

function FlowerShopArt() {
  return (
    <>
      <defs>
        <linearGradient id="psv-fs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8f3fd" />
          <stop offset="1" stopColor="#fdf4e4" />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill="url(#psv-fs-sky)" />
      <circle cx="122" cy="24" r="26" fill="#fff1c9" opacity="0.7" />
      <circle cx="122" cy="24" r="13" fill="#ffe49a" />
      {/* window */}
      <rect x="12" y="14" width="56" height="46" rx="4" fill="#ffffff" stroke="#d9e7f5" strokeWidth="2" />
      <path d="M40 14 V60 M12 37 H68" stroke="#d9e7f5" strokeWidth="2" />
      {/* counter */}
      <rect x="0" y="72" width="160" height="28" fill="#dccba9" />
      <rect x="0" y="70" width="160" height="4" fill="#ecdfc0" />
      {/* buckets with blooms */}
      <g>
        <path d="M26 52 h22 l-3 20 h-16 Z" fill="#a9b2bf" />
        <path d="M66 52 h22 l-3 20 h-16 Z" fill="#98a3b1" />
        <path d="M106 52 h22 l-3 20 h-16 Z" fill="#a9b2bf" />
        <path d="M31 40 C29 46 29 50 31 54 M37 38 C36 46 36 50 37 54 M43 40 C45 46 45 50 43 54" stroke="#6f9b5c" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M71 40 C69 46 69 50 71 54 M77 38 C76 46 76 50 77 54 M83 40 C85 46 85 50 83 54" stroke="#6f9b5c" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M111 40 C109 46 109 50 111 54 M117 38 C116 46 116 50 117 54 M123 40 C125 46 125 50 123 54" stroke="#6f9b5c" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="31" cy="38" r="5" fill="#ef8fa3" /><circle cx="38" cy="34" r="4" fill="#f6c66d" /><circle cx="44" cy="39" r="4.5" fill="#e77f8f" />
        <circle cx="71" cy="38" r="5" fill="#f6c66d" /><circle cx="78" cy="34" r="4" fill="#ef8fa3" /><circle cx="84" cy="39" r="4.5" fill="#fff" stroke="#e8d9c4" />
        <circle cx="111" cy="38" r="5" fill="#e77f8f" /><circle cx="118" cy="34" r="4" fill="#f6c66d" /><circle cx="124" cy="39" r="4.5" fill="#ef8fa3" />
      </g>
      {/* hanging bunch, top right */}
      <path d="M144 0 v10" stroke="#8a7a5c" strokeWidth="1.5" />
      <path d="M144 10 l-7 8 M144 10 l7 8 M144 10 v11" stroke="#6f9b5c" strokeWidth="1.5" />
      <circle cx="137" cy="19" r="3" fill="#ef8fa3" /><circle cx="151" cy="19" r="3" fill="#f6c66d" /><circle cx="144" cy="22" r="3.2" fill="#e77f8f" />
    </>
  );
}

function RooftopArt() {
  return (
    <>
      <defs>
        <linearGradient id="psv-rt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd9a3" />
          <stop offset="1" stopColor="#ff9e6d" />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill="url(#psv-rt-sky)" />
      <circle cx="80" cy="42" r="30" fill="#ffe9bd" opacity="0.65" />
      <circle cx="80" cy="42" r="16" fill="#fff3d2" />
      {/* skyline */}
      <path d="M0 66 h20 v-16 h14 v10 h18 v-22 h16 v14 h20 v-8 h18 v12 h16 v-16 h20 v26 h18 V100 H0 Z" fill="#d98a5c" opacity="0.8" />
      <path d="M0 74 h160 v26 h-160 Z" fill="#c07a50" opacity="0.55" />
      {/* railing */}
      <path d="M0 76 H160" stroke="#a86a44" strokeWidth="3" />
      <path d="M14 76 v10 M46 76 v10 M78 76 v10 M110 76 v10 M142 76 v10" stroke="#a86a44" strokeWidth="2.5" />
      {/* planters with shrubs */}
      <rect x="6" y="84" width="34" height="14" rx="2" fill="#b5714a" />
      <circle cx="13" cy="82" r="6" fill="#6f9e5a" /><circle cx="23" cy="79" r="7" fill="#8db46e" /><circle cx="33" cy="82" r="6" fill="#6f9e5a" />
      <rect x="118" y="84" width="34" height="14" rx="2" fill="#b5714a" />
      <circle cx="125" cy="82" r="6" fill="#8db46e" /><circle cx="135" cy="79" r="7" fill="#6f9e5a" /><circle cx="145" cy="82" r="6" fill="#8db46e" />
      {/* small tree */}
      <path d="M64 98 v-16" stroke="#8a5a38" strokeWidth="3" />
      <circle cx="64" cy="74" r="12" fill="#5d8f52" /><circle cx="55" cy="80" r="8" fill="#6f9e5a" /><circle cx="73" cy="80" r="8" fill="#7cab63" />
    </>
  );
}

function NightMarketArt() {
  return (
    <>
      <defs>
        <linearGradient id="psv-nm-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2c3352" />
          <stop offset="1" stopColor="#4d588a" />
        </linearGradient>
      </defs>
      <rect width="160" height="100" fill="url(#psv-nm-sky)" />
      <circle cx="22" cy="14" r="1.4" fill="#cdd6f0" /><circle cx="58" cy="8" r="1.2" fill="#cdd6f0" />
      <circle cx="104" cy="12" r="1.4" fill="#cdd6f0" /><circle cx="142" cy="7" r="1.2" fill="#cdd6f0" />
      {/* lantern strings */}
      <path d="M0 16 C40 28 120 28 160 14" stroke="#8891b5" strokeWidth="1.5" fill="none" />
      <path d="M0 40 C50 50 110 50 160 38" stroke="#8891b5" strokeWidth="1.5" fill="none" opacity="0.7" />
      {/* lanterns */}
      {[
        { x: 28, y: 26, r: "on" }, { x: 60, y: 31, r: "off" }, { x: 96, y: 31, r: "on" }, { x: 130, y: 24, r: "off" },
        { x: 44, y: 48, r: "off" }, { x: 88, y: 50, r: "on" }, { x: 126, y: 46, r: "off" },
      ].map((l, i) => (
        <g key={i}>
          <path d={`M${l.x} ${l.y - 12} v6`} stroke="#6b749a" strokeWidth="1.2" />
          <circle cx={l.x} cy={l.y} r="10" fill={l.r === "on" ? "#ff9d5c" : "#e2884e"} opacity={l.r === "on" ? 0.3 : 0.18} />
          <ellipse cx={l.x} cy={l.y} rx="6" ry="7" fill={l.r === "on" ? "#ffb35c" : "#d98a4e"} stroke="#e07f3f" strokeWidth="1" />
          <rect x={l.x - 3} y={l.y - 9} width="6" height="2.5" rx="1" fill="#c76a35" />
        </g>
      ))}
      {/* stall silhouette */}
      <path d="M0 72 h160 v28 h-160 Z" fill="#20263f" />
      <path d="M10 72 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 q7 -8 14 0 l0 -2 h-140 Z" fill="#39446b" />
      <rect x="58" y="78" width="44" height="22" rx="2" fill="#ff9d5c" opacity="0.85" />
      <rect x="64" y="84" width="12" height="16" fill="#ffd9a3" opacity="0.8" />
      <rect x="82" y="84" width="12" height="10" fill="#ffd9a3" opacity="0.6" />
      <ellipse cx="80" cy="97" rx="46" ry="3.5" fill="#ff9d5c" opacity="0.25" />
    </>
  );
}

export type OutfitKind = "shirt" | "dress" | "casual";

/** Tiny garment glyphs used on wardrobe swatch cards. */
export function OutfitGlyph({ kind, className = "" }: { kind: OutfitKind; className?: string }) {
  if (kind === "dress") {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M19 6 C19 10 29 10 29 6 L31.5 13 L27 18.5 L33.5 42 L14.5 42 L21 18.5 L16.5 13 Z" fill="#cdb9e8" stroke="#ab8fd4" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M27 18.5 L19.5 37" stroke="#ab8fd4" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M21 18.5 L28.5 33" stroke="#ab8fd4" strokeWidth="1.4" strokeLinecap="round" opacity="0.6" />
      </svg>
    );
  }
  if (kind === "casual") {
    return (
      <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path d="M17 7 L10 11 L5 19 L10.5 22.5 L13.5 18.5 L13.5 41 L34.5 41 L34.5 18.5 L37.5 22.5 L43 19 L38 11 L31 7 C29.5 10.5 18.5 10.5 17 7 Z" fill="#7c9cc9" stroke="#54719e" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M17 7 C19 11.5 29 11.5 31 7" stroke="#54719e" strokeWidth="1.4" fill="none" />
        <path d="M20 41 v-8 M28 41 v-8" stroke="#54719e" strokeWidth="1.2" opacity="0.7" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M17 7 L10 11 L5 19 L10.5 22.5 L13.5 18.5 L13.5 41 L34.5 41 L34.5 18.5 L37.5 22.5 L43 19 L38 11 L31 7 C29.5 10.5 18.5 10.5 17 7 Z" fill="#f4ecd9" stroke="#d3c19c" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M17 7 C19 11.5 29 11.5 31 7" stroke="#d3c19c" strokeWidth="1.4" fill="none" />
      <path d="M24 12 v6 M21 18 h6" stroke="#d3c19c" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
