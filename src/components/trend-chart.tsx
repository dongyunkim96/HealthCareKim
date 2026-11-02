'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
export default function TrendChart({
  data,
}: {
  data: { date: string; opened: number; completed: number }[];
}) {
  return (
    <div className="trend-chart" aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          accessibilityLayer={false}
          data={data}
          margin={{ left: -24, right: 8, top: 15, bottom: 0 }}
        >
          <defs>
            <linearGradient id="opened-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity={0.14} />
              <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#e9edf2" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => d.slice(5).replace('-', '/')}
            axisLine={false}
            tickLine={false}
            fontSize={11}
            tickMargin={12}
            minTickGap={28}
          />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} fontSize={11} />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              borderColor: '#e2e8f0',
              fontSize: 12,
            }}
          />
          <Area
            isAnimationActive={false}
            name="Opened"
            type="monotone"
            dataKey="opened"
            stroke="#0f766e"
            strokeWidth={2.5}
            fill="url(#opened-fill)"
          />
          <Area
            isAnimationActive={false}
            name="Completed"
            type="monotone"
            dataKey="completed"
            stroke="#789db6"
            strokeWidth={2}
            strokeDasharray="4 3"
            fill="transparent"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
