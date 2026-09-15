// 共通キャラクターの静止素材。状態の表現と音声同期は呼出し側で扱う。
export function VoiceAvatarArtwork() {
  return (
    <svg viewBox="0 0 320 260" className="h-full max-w-full" aria-hidden="true">
      <ellipse cx="160" cy="238" rx="76" ry="9" fill="#e7e5df" />
      <path
        d="M116 220v17h-21M204 220v17h21"
        fill="none"
        stroke="#bd803f"
        strokeWidth="10"
        strokeLinecap="round"
      />
      <path
        d="M98 150c-28 14-39 44-28 50 12 6 31-8 44-24M222 150c28 14 39 44 28 50-12 6-31-8-44-24"
        fill="#e5ceb0"
      />
      <path
        d="M111 145h98c20 34 27 67 1 82-23 13-77 13-100 0-26-15-19-48 1-82"
        fill="#f7ead5"
        stroke="#dcc8ab"
        strokeWidth="2"
      />
      <path d="m125 158-12 61c20 14 74 14 94 0l-12-61-15 10h-40z" fill="#32695d" />
      <path d="M125 160l15 8m55-8-15 8" stroke="#f9f4e8" strokeWidth="5" />
      <path d="M145 192h30v12c0 15-30 15-30 0z" fill="#528677" />
      <path d="M157 197v10m-4-7h8" stroke="#f5edda" strokeWidth="2" strokeLinecap="round" />
      <g>
        <path d="M115 48c-3-18 11-30 29-19 10-19 31-12 31 5 23-8 33 5 30 18" fill="#e1c49d" />
        <path
          d="M79 101c0-46 30-67 81-67s81 21 81 67v15c0 42-31 65-81 65s-81-23-81-65z"
          fill="#fff5e5"
          stroke="#dcc8ab"
          strokeWidth="2"
        />
        <ellipse cx="110" cy="128" rx="13" ry="8" fill="#edb8a0" opacity="0.6" />
        <ellipse cx="210" cy="128" rx="13" ry="8" fill="#edb8a0" opacity="0.6" />
        <g>
          <ellipse cx="125" cy="107" rx="6" ry="9" fill="#373c35" />
          <ellipse cx="195" cy="107" rx="6" ry="9" fill="#373c35" />
          <circle cx="127" cy="104" r="2" fill="white" />
          <circle cx="197" cy="104" r="2" fill="white" />
        </g>
        <ellipse cx="160" cy="133" rx="16" ry="5" fill="#653c28" />
        <path d="M140 123q20-18 40 0-20 14-40 0" fill="#e1a64e" />
        <path
          d="M147 141q13 8 26 0"
          fill="none"
          stroke="#e1a64e"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
