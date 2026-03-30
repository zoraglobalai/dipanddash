import {
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Text,
  VStack
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CustomerRecord } from "@/types/pos";

type CustomerStartModalProps = {
  isOpen: boolean;
  onClose: () => void;
  orderTypeLabel: string;
  onSearchCustomers: (query: string) => Promise<CustomerRecord[]>;
  onFindByPhone: (phone: string) => Promise<CustomerRecord | null>;
  onCreateCustomer: (input: { name: string; phone: string }) => Promise<CustomerRecord>;
  onSelectCustomer: (customer: CustomerRecord) => void;
};

const normalizePhone = (value: string) => value.replace(/\D/g, "");

export const CustomerStartModal = ({
  isOpen,
  onClose,
  orderTypeLabel,
  onSearchCustomers,
  onFindByPhone,
  onCreateCustomer,
  onSelectCustomer
}: CustomerStartModalProps) => {
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [searchResults, setSearchResults] = useState<CustomerRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchCacheRef = useRef<Map<string, CustomerRecord[]>>(new Map());
  const phoneCacheRef = useRef<Map<string, CustomerRecord | null>>(new Map());
  const activeLookupRef = useRef(0);

  const normalizedPhone = useMemo(() => normalizePhone(phone), [phone]);
  const exactMatch = useMemo(
    () => searchResults.find((entry) => normalizePhone(entry.phone) === normalizedPhone) ?? null,
    [normalizedPhone, searchResults]
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPhone("");
    setCustomerName("");
    setPhoneTouched(false);
    setSearchResults([]);
    setIsSearching(false);
    setIsSubmitting(false);
    activeLookupRef.current += 1;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const query = normalizedPhone.trim();
    if (query.length < 4) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        const lookupId = activeLookupRef.current + 1;
        activeLookupRef.current = lookupId;
        setIsSearching(true);
        try {
          if (query.length >= 10) {
            const cachedExact = phoneCacheRef.current.get(query);
            if (cachedExact !== undefined) {
              if (activeLookupRef.current === lookupId) {
                setSearchResults(cachedExact ? [cachedExact] : []);
              }
              return;
            }
            const matched = await onFindByPhone(query);
            phoneCacheRef.current.set(query, matched);
            if (activeLookupRef.current === lookupId) {
              setSearchResults(matched ? [matched] : []);
            }
            return;
          }

          const cachedResults = searchCacheRef.current.get(query);
          if (cachedResults !== undefined) {
            if (activeLookupRef.current === lookupId) {
              setSearchResults(cachedResults);
            }
            return;
          }

          const results = await onSearchCustomers(query);
          searchCacheRef.current.set(query, results);
          if (activeLookupRef.current === lookupId) {
            setSearchResults(results);
          }
        } finally {
          if (activeLookupRef.current === lookupId) {
            setIsSearching(false);
          }
        }
      })();
    }, 420);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isOpen, normalizedPhone, onFindByPhone, onSearchCustomers]);

  const isValidPhone = normalizedPhone.length === 10;
  const showPhoneError = phoneTouched && normalizedPhone.length > 0 && !isValidPhone;
  const canCreate = isValidPhone && customerName.trim().length >= 2;

  const handleStart = async () => {
    setPhoneTouched(true);
    if (!isValidPhone) {
      return;
    }

    setIsSubmitting(true);
    try {
      let matched = exactMatch ?? phoneCacheRef.current.get(normalizedPhone) ?? null;
      if (!matched) {
        matched = await onFindByPhone(normalizedPhone);
        phoneCacheRef.current.set(normalizedPhone, matched);
      }
      if (matched) {
        onSelectCustomer(matched);
        return;
      }
      if (!canCreate) {
        return;
      }
      const created = await onCreateCustomer({
        name: customerName.trim(),
        phone: normalizedPhone
      });
      onSelectCustomer(created);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} isCentered closeOnOverlayClick={false} closeOnEsc={true}>
      <ModalOverlay />
      <ModalContent borderRadius="16px">
        <ModalHeader>Start {orderTypeLabel} Order</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack align="stretch" spacing={3}>
            <Text fontSize="sm" color="#6F5A50">
              Enter customer phone number. If customer exists, select and continue. If not found, add name and start.
            </Text>

            <FormControl>
              <FormLabel mb={1}>Customer Phone Number</FormLabel>
              <Input
                id="customer-phone-input"
                value={phone}
                onChange={(event) => setPhone(normalizePhone(event.target.value).slice(0, 10))}
                placeholder="Enter phone number"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                autoFocus
                onBlur={() => setPhoneTouched(true)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleStart();
                  }
                }}
              />
              {showPhoneError ? (
                <Text mt={1} fontSize="xs" color="red.500">
                  Invalid phone number. Enter exactly 10 digits.
                </Text>
              ) : null}
            </FormControl>

            <Box minH="56px">
              {isSearching ? (
                <Text fontSize="sm" color="#6F5A50">
                  Checking customer...
                </Text>
              ) : null}

              {!isSearching && normalizedPhone.length === 10 && !searchResults.length ? (
                <Text fontSize="sm" color="#6F5A50">
                  No existing customer found for this number.
                </Text>
              ) : null}

              {searchResults.length ? (
                <VStack align="stretch" spacing={2} maxH="220px" overflowY="auto" pr={1}>
                  {searchResults.map((customer) => (
                    <HStack
                      key={customer.localId}
                      justify="space-between"
                      p={2.5}
                      borderRadius="10px"
                      border="1px solid"
                      borderColor="rgba(132, 79, 52, 0.18)"
                    >
                      <VStack align="start" spacing={0}>
                        <Text fontWeight={700}>{customer.name}</Text>
                        <Text fontSize="sm" color="#6F5A50">
                          {customer.phone}
                        </Text>
                      </VStack>
                      <Button size="sm" onClick={() => onSelectCustomer(customer)}>
                        Use
                      </Button>
                    </HStack>
                  ))}
                </VStack>
              ) : null}
            </Box>

            {!exactMatch ? (
              <Box borderTop="1px dashed" borderColor="rgba(132, 79, 52, 0.2)" pt={3}>
                <FormControl>
                  <FormLabel mb={1}>New Customer Name</FormLabel>
                  <Input
                    value={customerName}
                    onChange={(event) => setCustomerName(event.target.value)}
                    placeholder="Enter customer name"
                  />
                </FormControl>
              </Box>
            ) : null}
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button variant="outline" mr={2} onClick={onClose}>
            Close
          </Button>
            <Button
              onClick={() => void handleStart()}
              isLoading={isSubmitting}
              isDisabled={!isValidPhone || (!exactMatch && !canCreate)}
            >
              {exactMatch ? "Start Order" : "Create & Start"}
            </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};
