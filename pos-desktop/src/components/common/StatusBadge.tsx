import { Badge } from "@chakra-ui/react";

type StatusBadgeProps = {
  label: string;
  tone?: "success" | "warning" | "danger" | "neutral" | "info";
};

const colorMap: Record<NonNullable<StatusBadgeProps["tone"]>, { bg: string; color: string }> = {
  success: { bg: "green.100", color: "green.700" },
  warning: { bg: "orange.100", color: "orange.700" },
  danger: { bg: "red.100", color: "red.700" },
  neutral: { bg: "gray.100", color: "gray.700" },
  info: { bg: "blue.100", color: "blue.700" }
};

export const StatusBadge = ({ label, tone = "neutral" }: StatusBadgeProps) => (
  <Badge
    px={2.5}
    py={1}
    borderRadius="full"
    textTransform="none"
    bg={colorMap[tone].bg}
    color={colorMap[tone].color}
    fontWeight={700}
  >
    {label}
  </Badge>
);

