import { Input, InputGroup, InputLeftElement } from "@chakra-ui/react";
import { Search } from "lucide-react";
import { memo, useEffect, useState } from "react";

type SearchInputProps = {
  placeholder?: string;
  defaultValue?: string;
  delay?: number;
  onDebouncedChange: (value: string) => void;
};

export const SearchInput = memo(
  ({ placeholder = "Search...", defaultValue = "", delay = 400, onDebouncedChange }: SearchInputProps) => {
    const [value, setValue] = useState(defaultValue);

    useEffect(() => {
      const timeout = window.setTimeout(() => onDebouncedChange(value.trim()), delay);
      return () => window.clearTimeout(timeout);
    }, [delay, onDebouncedChange, value]);

    return (
      <InputGroup maxW="360px">
        <InputLeftElement pointerEvents="none">
          <Search size={16} color="#8A6A58" />
        </InputLeftElement>
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          bg="white"
          borderColor="rgba(142, 9, 9, 0.16)"
          _hover={{ borderColor: "rgba(142, 9, 9, 0.32)" }}
          focusBorderColor="brand.400"
          placeholder={placeholder}
        />
      </InputGroup>
    );
  }
);

SearchInput.displayName = "SearchInput";
