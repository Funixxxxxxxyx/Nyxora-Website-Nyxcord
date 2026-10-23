export default function BrandMark({ size = 34 }: {
    size?: number;
}) {
    return <span className="brand-mark" style={{ width: size, height: size }} aria-hidden="true">
    <svg width={size * .71} height={size * .71} viewBox="0 0 64 64" fill="none">
      <path d="M15 48V16L49 48V16" stroke="white" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M15 16L49 48" stroke="#C2C7FF" strokeWidth="3" strokeLinecap="round" opacity=".55"/>
    </svg>
  </span>;
}
