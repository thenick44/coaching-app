"use client";

export type TrendLineSeries = {
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
};

type TrendLineChartProps = {
  title: string;
  caption?: string;
  xLabels: string[];
  series: TrendLineSeries[];
  units: string;
  formatValue?: (value: number) => string;
  highlightIndex?: number;
  highlightLabel?: string;
  pointTooltips?: string[];
  width?: number;
  height?: number;
};

const PADDING_LEFT = 44;
const PADDING_RIGHT = 12;
const PADDING_TOP = 12;
const PADDING_BOTTOM = 24;

function getNiceStep(max: number, tickCount: number) {
  if (max <= 0) return 1;
  const rawStep = max / tickCount;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const residual = rawStep / magnitude;
  let niceResidual;
  if (residual > 5) niceResidual = 10;
  else if (residual > 2) niceResidual = 5;
  else if (residual > 1) niceResidual = 2;
  else niceResidual = 1;
  return niceResidual * magnitude;
}

export default function TrendLineChart({
  title,
  caption,
  xLabels,
  series,
  units,
  formatValue,
  highlightIndex,
  highlightLabel,
  pointTooltips,
  width = 700,
  height = 220,
}: TrendLineChartProps) {
  const format = formatValue ?? ((value: number) => value.toFixed(1));

  const allValues = series.flatMap((s) => s.values);
  const dataMax = Math.max(...allValues, 0);
  const step = getNiceStep(dataMax || 1, 4);
  const yMax = Math.max(step, Math.ceil((dataMax || 1) / step) * step);
  const ticks = Array.from({ length: Math.round(yMax / step) + 1 }, (_, i) => i * step);

  const pointCount = Math.max(xLabels.length, 1);
  const svgWidth = width + PADDING_LEFT + PADDING_RIGHT;
  const svgHeight = height + PADDING_TOP + PADDING_BOTTOM;

  const xForIndex = (index: number) =>
    PADDING_LEFT + (pointCount > 1 ? (index / (pointCount - 1)) * width : width / 2);

  const yForValue = (value: number) => PADDING_TOP + height - (value / yMax) * height;

  const buildPath = (values: number[]) =>
    values
      .map((value, index) => `${index === 0 ? "M" : "L"}${xForIndex(index).toFixed(2)} ${yForValue(value).toFixed(2)}`)
      .join(" ");

  const xLabelStep = pointCount > 10 ? 2 : 1;
  const primary = series[0];

  return (
    <div className="rounded-2xl bg-slate-950/80 p-4 text-sm text-slate-300">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs uppercase tracking-[0.28em] text-slate-500">{title}</p>
        {caption && <p className="text-xs text-slate-500">{caption}</p>}
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg width={svgWidth} height={svgHeight} className="block">
          {ticks.map((tick) => {
            const y = yForValue(tick);
            return (
              <g key={tick}>
                <line
                  x1={PADDING_LEFT}
                  x2={PADDING_LEFT + width}
                  y1={y}
                  y2={y}
                  stroke="rgba(148,163,184,0.18)"
                  strokeWidth="1"
                />
                <text x={PADDING_LEFT - 8} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                  {format(tick)}
                </text>
              </g>
            );
          })}

          <line
            x1={PADDING_LEFT}
            x2={PADDING_LEFT}
            y1={PADDING_TOP}
            y2={PADDING_TOP + height}
            stroke="rgba(148,163,184,0.3)"
            strokeWidth="1"
          />
          <line
            x1={PADDING_LEFT}
            x2={PADDING_LEFT + width}
            y1={PADDING_TOP + height}
            y2={PADDING_TOP + height}
            stroke="rgba(148,163,184,0.3)"
            strokeWidth="1"
          />

          {series.map((s) => (
            <path
              key={s.label}
              d={buildPath(s.values)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 2 : 3}
              strokeDasharray={s.dashed ? "8 6" : undefined}
            />
          ))}

          {primary?.values.map((value, index) => (
            <circle
              key={index}
              cx={xForIndex(index)}
              cy={yForValue(value)}
              r={index === highlightIndex ? 5 : 3}
              fill={index === highlightIndex ? primary.color : "#ffffff"}
              stroke={primary.color}
              strokeWidth={index === highlightIndex ? 2 : 1.5}
            >
              {pointTooltips?.[index] ? <title>{pointTooltips[index]}</title> : null}
            </circle>
          ))}

          {xLabels.map((label, index) =>
            index % xLabelStep === 0 ? (
              <text
                key={index}
                x={xForIndex(index)}
                y={PADDING_TOP + height + 18}
                textAnchor="middle"
                fontSize="10"
                fill="#94a3b8"
              >
                {label}
              </text>
            ) : null
          )}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-xs text-slate-400">
            <span
              className="inline-block h-1.5 w-5 rounded-full"
              style={{ backgroundColor: s.color, opacity: s.dashed ? 0.7 : 1 }}
            />
            <span>
              {s.label}
              {units ? ` (${units})` : ""}
            </span>
          </div>
        ))}
        {highlightLabel && primary && highlightIndex != null && highlightIndex >= 0 && (
          <div className="ml-auto text-xs text-slate-400">
            {highlightLabel}:{" "}
            <span className="font-semibold text-white">
              {format(primary.values[highlightIndex] ?? 0)} {units}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
