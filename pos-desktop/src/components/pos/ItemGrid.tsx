import {
  Box,
  Button,
  Grid,
  HStack,
  Input,
  Tooltip,
  Text,
  VStack
} from "@chakra-ui/react";
import { useMemo, useState } from "react";
import { FiPlus } from "react-icons/fi";

import { formatINR } from "@/utils/currency";
import type { CatalogCombo, CatalogItem, CatalogProduct, CatalogSnapshot } from "@/types/pos";

type ItemGridProps = {
  snapshot: CatalogSnapshot | null;
  onAddItem: (item: CatalogItem) => void;
  onAddCombo: (combo: CatalogCombo) => void;
  onAddProduct: (product: CatalogProduct) => void;
  isOrderLocked?: boolean;
};

const INITIAL_VISIBLE_COUNT = 6;

export const ItemGrid = ({
  snapshot,
  onAddItem,
  onAddCombo,
  onAddProduct,
  isOrderLocked = false
}: ItemGridProps) => {
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string>("all");

  const activeCategories = useMemo(
    () => snapshot?.categories.filter((category) => category.isActive) ?? [],
    [snapshot]
  );

  const filteredItems = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return snapshot.items.filter((item) => {
      if (!item.isActive) {
        return false;
      }
      const categoryMatch = activeCategoryId === "all" || item.categoryId === activeCategoryId;
      if (!categoryMatch) {
        return false;
      }
      if (!query) {
        return true;
      }
      return item.name.toLowerCase().includes(query);
    });
  }, [activeCategoryId, search, snapshot]);

  const visibleItems = useMemo(() => {
    if (search.trim()) {
      return filteredItems;
    }
    return filteredItems.slice(0, INITIAL_VISIBLE_COUNT);
  }, [filteredItems, search]);

  const filteredCombos = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return snapshot.combos.filter((combo) => {
      if (!combo.isActive) {
        return false;
      }
      if (!query) {
        return true;
      }
      return combo.name.toLowerCase().includes(query);
    });
  }, [search, snapshot]);

  const visibleCombos = useMemo(() => {
    if (search.trim()) {
      return filteredCombos;
    }
    return filteredCombos.slice(0, INITIAL_VISIBLE_COUNT);
  }, [filteredCombos, search]);

  const filteredProducts = useMemo(() => {
    if (!snapshot) {
      return [];
    }
    const query = search.trim().toLowerCase();
    return (snapshot.products ?? []).filter((product) => {
      if (!product.isActive) {
        return false;
      }
      if (!query) {
        return true;
      }
      return (
        product.name.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    });
  }, [search, snapshot]);

  const visibleProducts = useMemo(() => {
    if (search.trim()) {
      return filteredProducts;
    }
    return filteredProducts.slice(0, INITIAL_VISIBLE_COUNT);
  }, [filteredProducts, search]);

  const canShowQuickHint =
    !search.trim() && (filteredItems.length > INITIAL_VISIBLE_COUNT || filteredCombos.length > INITIAL_VISIBLE_COUNT);

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
      minH="540px"
    >
      <HStack justify="space-between" flexWrap="wrap" gap={2}>
        <Text fontWeight={800} color="#2A1A14">
          Menu
        </Text>
        <Input
          id="item-search-input"
          maxW={{ base: "full", md: "280px" }}
          w={{ base: "full", md: "auto" }}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search items or combos"
        />
      </HStack>

      {canShowQuickHint ? (
        <Text fontSize="xs" color="#7A6258">
          Showing 6 quick items by default. Use search to find more.
        </Text>
      ) : null}

      <HStack spacing={2} overflowX="auto" pb={1}>
        <Button
          size="sm"
          borderRadius="full"
          variant={activeCategoryId === "all" ? "solid" : "outline"}
          onClick={() => setActiveCategoryId("all")}
        >
          All
        </Button>
        {activeCategories.map((category) => (
          <Button
            key={category.id}
            size="sm"
            borderRadius="full"
            variant={activeCategoryId === category.id ? "solid" : "outline"}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.name}
          </Button>
        ))}
      </HStack>

      <Text fontWeight={700}>Items</Text>
      <Grid templateColumns="repeat(auto-fill, minmax(170px, 1fr))" gap={3}>
        {visibleItems.map((item) => (
          <Tooltip key={item.id} label={isOrderLocked ? "Select customer to start order" : ""} isDisabled={!isOrderLocked}>
            <Button
              h="90px"
              borderRadius="14px"
              variant="outline"
              onClick={() => onAddItem(item)}
              justifyContent="space-between"
              flexDir="column"
              alignItems="start"
              px={3}
              py={2}
              leftIcon={<FiPlus />}
              isDisabled={isOrderLocked}
            >
              <Text fontWeight={700} textAlign="left" whiteSpace="normal">
                {item.name}
              </Text>
              <Text fontSize="sm" color="#785F54">
                {formatINR(item.sellingPrice)}
              </Text>
            </Button>
          </Tooltip>
        ))}
      </Grid>

      <Text fontWeight={700} mt={2}>
        Combos
      </Text>
      <Grid templateColumns="repeat(auto-fill, minmax(170px, 1fr))" gap={3}>
        {visibleCombos.map((combo) => (
          <Tooltip key={combo.id} label={isOrderLocked ? "Select customer to start order" : ""} isDisabled={!isOrderLocked}>
            <Button
              h="90px"
              borderRadius="14px"
              variant="outline"
              onClick={() => onAddCombo(combo)}
              justifyContent="space-between"
              flexDir="column"
              alignItems="start"
              px={3}
              py={2}
              leftIcon={<FiPlus />}
              isDisabled={isOrderLocked}
            >
              <Text fontWeight={700} textAlign="left" whiteSpace="normal">
                {combo.name}
              </Text>
              <Text fontSize="sm" color="#785F54">
                {formatINR(combo.sellingPrice)}
              </Text>
            </Button>
          </Tooltip>
        ))}
      </Grid>

      <Text fontWeight={700} mt={2}>
        Products
      </Text>
      <Grid templateColumns="repeat(auto-fill, minmax(170px, 1fr))" gap={3}>
        {visibleProducts.map((product) => (
          <Tooltip key={product.id} label={isOrderLocked ? "Select customer to start order" : ""} isDisabled={!isOrderLocked}>
            <Button
              h="90px"
              borderRadius="14px"
              variant="outline"
              onClick={() => onAddProduct(product)}
              justifyContent="space-between"
              flexDir="column"
              alignItems="start"
              px={3}
              py={2}
              leftIcon={<FiPlus />}
              isDisabled={isOrderLocked}
            >
              <Text fontWeight={700} textAlign="left" whiteSpace="normal">
                {product.name}
              </Text>
              <Text fontSize="sm" color="#785F54">
                {formatINR(product.sellingPrice)}
              </Text>
            </Button>
          </Tooltip>
        ))}
      </Grid>
    </VStack>
  );
};
