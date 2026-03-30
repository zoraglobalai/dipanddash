import { HStack, Spinner, Text } from "@chakra-ui/react";

type ButtonLoaderProps = {
  text?: string;
};

export const ButtonLoader = ({ text = "Please wait..." }: ButtonLoaderProps) => {
  return (
    <HStack spacing={2} justify="center">
      <Spinner size="sm" />
      <Text>{text}</Text>
    </HStack>
  );
};

