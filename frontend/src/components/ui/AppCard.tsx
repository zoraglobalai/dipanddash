import { Box, Heading, Text, type BoxProps } from "@chakra-ui/react";
import { memo, type ReactNode } from "react";

type AppCardProps = BoxProps & {
  title?: string;
  subtitle?: string;
  rightContent?: ReactNode;
};

export const AppCard = memo(({ title, subtitle, rightContent, children, ...props }: AppCardProps) => {
  return (
    <Box
      className="premium-card"
      p={{ base: 4, md: 5 }}
      borderColor="rgba(133, 78, 48, 0.2)"
      background="linear-gradient(180deg, #FFFFFF 0%, #FFFBF4 100%)"
      boxShadow="0 14px 30px rgba(63, 23, 8, 0.08)"
      {...props}
    >
      {(title || subtitle || rightContent) && (
        <Box mb={4} display="flex" justifyContent="space-between" gap={3} alignItems="start">
          <Box>
            {title ? (
              <Heading size="md" fontSize="lg" color="#241813">
                {title}
              </Heading>
            ) : null}
            {subtitle ? (
              <Text mt={1} color="#725D53" fontSize="sm">
                {subtitle}
              </Text>
            ) : null}
          </Box>
          {rightContent}
        </Box>
      )}
      {children}
    </Box>
  );
});

AppCard.displayName = "AppCard";
