import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { FiSearch, FiUserPlus } from "react-icons/fi";

import type { CustomerRecord } from "@/types/pos";

type CustomerLookupCardProps = {
  selectedCustomer: CustomerRecord | null;
  onAttachCustomer: (customer: CustomerRecord | null) => void;
  onSearch: (query: string) => Promise<CustomerRecord[]>;
  onQuickCreate: (input: { name: string; phone: string; email?: string }) => Promise<CustomerRecord>;
};

export const CustomerLookupCard = ({
  selectedCustomer,
  onAttachCustomer,
  onSearch,
  onQuickCreate
}: CustomerLookupCardProps) => {
  const [phoneSearch, setPhoneSearch] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [searchResults, setSearchResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const canCreate = useMemo(
    () => nameInput.trim().length >= 2 && phoneSearch.trim().length >= 8,
    [nameInput, phoneSearch]
  );

  const handleSearch = async () => {
    if (!phoneSearch.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await onSearch(phoneSearch);
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  };

  const handleQuickCreate = async () => {
    if (!canCreate) {
      return;
    }
    setIsCreating(true);
    try {
      const created = await onQuickCreate({
        name: nameInput,
        phone: phoneSearch,
        email: emailInput || undefined
      });
      setNameInput("");
      setEmailInput("");
      setSearchResults([]);
      onAttachCustomer(created);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <VStack
      align="stretch"
      spacing={3}
      p={4}
      borderRadius="14px"
      border="1px solid"
      borderColor="rgba(132, 79, 52, 0.2)"
      bg="white"
      boxShadow="sm"
    >
      <Text fontWeight={800} color="#2A1A14">
        Customer Lookup
      </Text>
      <FormControl>
        <FormLabel mb={1}>Phone Number</FormLabel>
        <InputGroup>
          <Input
            id="customer-phone-input"
            value={phoneSearch}
            onChange={(event) => setPhoneSearch(event.target.value)}
            placeholder="Enter phone and press search"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleSearch();
              }
            }}
          />
          <InputRightElement>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleSearch()}
              isLoading={isSearching}
              leftIcon={<FiSearch />}
            >
              Search
            </Button>
          </InputRightElement>
        </InputGroup>
      </FormControl>

      {searchResults.length ? (
        <VStack align="stretch" spacing={2}>
          {searchResults.map((customer) => (
            <HStack
              key={customer.localId}
              p={2}
              borderRadius="10px"
              justify="space-between"
              border="1px solid"
              borderColor="rgba(132, 79, 52, 0.15)"
            >
              <VStack align="start" spacing={0}>
                <Text fontWeight={700}>{customer.name}</Text>
                <Text fontSize="sm" color="#7A6258">
                  {customer.phone}
                </Text>
              </VStack>
              <Button size="sm" onClick={() => onAttachCustomer(customer)}>
                Select
              </Button>
            </HStack>
          ))}
        </VStack>
      ) : null}

      <Box borderTop="1px dashed" borderColor="rgba(132, 79, 52, 0.2)" pt={3}>
        <Text fontWeight={700} mb={2}>
          Quick Add Customer
        </Text>
        <VStack spacing={2} align="stretch">
          <Input
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
            placeholder="Customer name"
          />
          <Input
            value={emailInput}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="Email (optional)"
          />
          <Button
            leftIcon={<FiUserPlus />}
            onClick={() => void handleQuickCreate()}
            isLoading={isCreating}
            isDisabled={!canCreate}
          >
            Create & Attach
          </Button>
        </VStack>
      </Box>

      <Box p={3} borderRadius="10px" bg="rgba(241, 236, 229, 0.65)">
        <Text fontSize="sm" color="#6A5248">
          Active customer:{" "}
          <Text as="span" fontWeight={800} color="#2A1A14">
            {selectedCustomer ? `${selectedCustomer.name} (${selectedCustomer.phone})` : "Walk-in"}
          </Text>
        </Text>
      </Box>
    </VStack>
  );
};
