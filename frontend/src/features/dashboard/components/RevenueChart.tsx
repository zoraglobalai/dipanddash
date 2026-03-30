import { Box } from "@chakra-ui/react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";

type RevenueChartProps = {
  data: Array<{ month: string; value: number }>;
};

export const RevenueChart = ({ data }: RevenueChartProps) => {
  return (
    <Box w="100%" h="280px">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="month" stroke="#7D6358" />
          <YAxis stroke="#7D6358" />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#C2912F"
            strokeWidth={3}
            dot={{ fill: "#8E0909", stroke: "#F8E8C4", strokeWidth: 2 }}
            activeDot={{ fill: "#8E0909", stroke: "#FFE7AE", strokeWidth: 2, r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
};
