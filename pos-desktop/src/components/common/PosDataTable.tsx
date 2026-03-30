import {
  Box,
  Button,
  HStack,
  Modal,
  ModalBody,
  ModalCloseButton,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
  VStack,
  type TableCellProps,
  type TableColumnHeaderProps
} from "@chakra-ui/react";
import { useMemo, useState, type ReactNode } from "react";

export type PosTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  alwaysVisible?: boolean;
  isNumeric?: boolean;
  thProps?: TableColumnHeaderProps;
  tdProps?: TableCellProps;
};

type PosDataTableProps<T> = {
  rows: T[];
  columns: PosTableColumn<T>[];
  getRowId: (row: T, index: number) => string;
  emptyMessage: string;
  loading?: boolean;
  loadingMessage?: string;
  maxColumns?: number;
  onRowClick?: (row: T) => void;
};

const MAX_DEFAULT_COLUMNS = 6;

export const PosDataTable = <T,>({
  rows,
  columns,
  getRowId,
  emptyMessage,
  loading = false,
  loadingMessage = "Loading records...",
  maxColumns = MAX_DEFAULT_COLUMNS,
  onRowClick
}: PosDataTableProps<T>) => {
  const [viewRow, setViewRow] = useState<T | null>(null);

  const { visibleColumns, hiddenColumns } = useMemo(() => {
    if (columns.length <= maxColumns) {
      return { visibleColumns: columns, hiddenColumns: [] as PosTableColumn<T>[] };
    }

    const slotsForColumns = Math.max(1, maxColumns - 1);
    const alwaysVisible = columns.filter((column) => column.alwaysVisible);
    const selectedKeys = new Set<string>();

    if (alwaysVisible.length >= slotsForColumns) {
      for (const column of alwaysVisible.slice(0, slotsForColumns)) {
        selectedKeys.add(column.key);
      }
    } else {
      for (const column of alwaysVisible) {
        selectedKeys.add(column.key);
      }
      for (const column of columns) {
        if (selectedKeys.size >= slotsForColumns) {
          break;
        }
        if (!selectedKeys.has(column.key)) {
          selectedKeys.add(column.key);
        }
      }
    }

    const visible = columns.filter((column) => selectedKeys.has(column.key));
    const hidden = columns.filter((column) => !selectedKeys.has(column.key));
    return { visibleColumns: visible, hiddenColumns: hidden };
  }, [columns, maxColumns]);

  const hasHiddenColumns = hiddenColumns.length > 0;

  return (
    <>
      <Box border="1px solid rgba(132, 79, 52, 0.16)" borderRadius="12px" overflowX="auto" overflowY="hidden">
        <Table variant="simple" size="sm" minW="680px">
          <Thead bg="rgba(218, 164, 56, 0.1)">
            <Tr>
              {visibleColumns.map((column) => (
                <Th
                  key={column.key}
                  isNumeric={column.isNumeric}
                  fontSize="sm"
                  fontWeight={800}
                  color="#634E45"
                  textTransform="none"
                  py={3}
                  {...column.thProps}
                >
                  {column.header}
                </Th>
              ))}
              {hasHiddenColumns ? (
                <Th fontSize="sm" fontWeight={800} color="#634E45" textTransform="none" py={3}>
                  View
                </Th>
              ) : null}
            </Tr>
          </Thead>
          <Tbody>
            {loading ? (
              <Tr>
                <Td colSpan={visibleColumns.length + (hasHiddenColumns ? 1 : 0)}>
                  <Text color="#6D584E">{loadingMessage}</Text>
                </Td>
              </Tr>
            ) : rows.length ? (
              rows.map((row, index) => (
                <Tr
                  key={getRowId(row, index)}
                  cursor={onRowClick ? "pointer" : "default"}
                  _hover={onRowClick ? { bg: "rgba(247, 238, 229, 0.45)" } : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {visibleColumns.map((column) => (
                    <Td key={column.key} isNumeric={column.isNumeric} {...column.tdProps}>
                      {column.render(row)}
                    </Td>
                  ))}
                  {hasHiddenColumns ? (
                    <Td>
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(event) => {
                          event.stopPropagation();
                          setViewRow(row);
                        }}
                      >
                        View
                      </Button>
                    </Td>
                  ) : null}
                </Tr>
              ))
            ) : (
              <Tr>
                <Td colSpan={visibleColumns.length + (hasHiddenColumns ? 1 : 0)}>
                  <Text color="#6D584E">{emptyMessage}</Text>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </Box>

      <Modal isOpen={Boolean(viewRow)} onClose={() => setViewRow(null)} isCentered size="lg">
        <ModalOverlay />
        <ModalContent borderRadius="16px">
          <ModalHeader>Details</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={3} align="stretch">
              {viewRow
                ? hiddenColumns.map((column) => (
                    <Box key={column.key} border="1px solid rgba(132, 79, 52, 0.16)" borderRadius="10px" p={3} bg="white">
                      <Text fontSize="xs" color="#725D53" fontWeight={700} textTransform="uppercase" mb={1}>
                        {column.header}
                      </Text>
                      <Box>{column.render(viewRow)}</Box>
                    </Box>
                  ))
                : null}
            </VStack>
          </ModalBody>
          <ModalFooter>
            <Button variant="outline" onClick={() => setViewRow(null)}>
              Close
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};
