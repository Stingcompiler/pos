import { barcodeBars, isEncodable } from '../utils/barcode';

/** باركود Code 128 كرسم SVG (يُطبع بدقة على أي طابعة). */
export default function Barcode({ value, height = 40, showText = true, className = '' }) {
  if (!isEncodable(value)) {
    return <span className="text-[10px]">{value || '—'}</span>;
  }
  const { bars, width } = barcodeBars(value);
  return (
    <svg
      viewBox={`0 0 ${width} ${height + (showText ? 12 : 0)}`}
      className={className}
      role="img"
      aria-label={`باركود ${value}`}
      preserveAspectRatio="none"
    >
      <rect width={width} height={height + (showText ? 12 : 0)} fill="#fff" />
      {bars.map((bar) => (
        <rect key={bar.x} x={bar.x} y={0} width={bar.width} height={height} fill="#000" />
      ))}
      {showText && (
        <text
          x={width / 2}
          y={height + 10}
          textAnchor="middle"
          fontSize="10"
          fontFamily="monospace"
          fill="#000"
        >
          {value}
        </text>
      )}
    </svg>
  );
}
