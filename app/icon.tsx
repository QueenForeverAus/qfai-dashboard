import { ImageResponse } from 'next/og'

export const size = { width: 32, height: 32 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0f172a',
          borderRadius: 6,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg width="20" height="18" viewBox="0 0 20 18" fill="none">
          {/* Crown shape */}
          <path
            d="M1 14 L3 6 L7 10 L10 2 L13 10 L17 6 L19 14 Z"
            fill="#f59e0b"
          />
          <rect x="1" y="15" width="18" height="2.5" rx="1" fill="#f59e0b" />
        </svg>
      </div>
    ),
    { ...size }
  )
}
