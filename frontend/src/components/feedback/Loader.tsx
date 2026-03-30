import { Center, Spinner } from "@chakra-ui/react";

type LoaderProps = {
  minHeight?: string | number;
};

export const Loader = ({ minHeight = "180px" }: LoaderProps) => {
  return (
    <Center minH={minHeight}>
      <Spinner size="lg" color="brand.400" thickness="4px" />
    </Center>
  );
};

