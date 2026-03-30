import { Box, IconButton, Tooltip, type IconButtonProps, type TooltipProps } from "@chakra-ui/react";

type ActionIconButtonProps = IconButtonProps & {
  tooltip?: string;
  tooltipProps?: Omit<TooltipProps, "children" | "label">;
};

const getTooltipLabel = (tooltip?: string, ariaLabel?: IconButtonProps["aria-label"]) => {
  if (tooltip && tooltip.trim()) {
    return tooltip;
  }

  if (typeof ariaLabel === "string") {
    return ariaLabel;
  }

  return "";
};

export const ActionIconButton = ({ tooltip, tooltipProps, ...props }: ActionIconButtonProps) => {
  const label = getTooltipLabel(tooltip, props["aria-label"]);

  if (!label) {
    return <IconButton {...props} />;
  }

  return (
    <Tooltip label={label} hasArrow openDelay={180} placement="top" {...tooltipProps}>
      <Box as="span" display="inline-flex">
        <IconButton {...props} />
      </Box>
    </Tooltip>
  );
};
