import { Box, Heading, Text } from "@chakra-ui/react";
import { memo, type ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  action?: ReactNode;
};

export const PageHeader = memo(({ title, subtitle, action }: PageHeaderProps) => {
  return (
    <Box
      display="flex"
      justifyContent="space-between"
      alignItems={{ base: "start", md: "center" }}
      gap={4}
      pb={2}
    >
      <Box>
        <Heading fontSize={{ base: "xl", md: "2xl" }} color="#231611">
          {title}
        </Heading>
        {subtitle ? (
          <Text mt={1} color="#705B52">
            {subtitle}
          </Text>
        ) : null}
      </Box>
      {action}
    </Box>
  );
});

PageHeader.displayName = "PageHeader";
