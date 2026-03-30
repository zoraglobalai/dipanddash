import {
  Table,
  TableContainer,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Box,
  Text
} from "@chakra-ui/react";
import { memo, type ReactNode } from "react";

type Column<T> = {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
};

type DataTableProps<T> = {
  columns: Column<T>[];
  rows: T[];
  emptyState?: ReactNode;
};

function DataTableComponent<T extends { id?: string }>({ columns, rows, emptyState }: DataTableProps<T>) {
  if (!rows.length && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <TableContainer
      border="1px solid"
      borderColor="rgba(133, 78, 48, 0.22)"
      borderRadius="16px"
      bg="linear-gradient(180deg, #FFFFFF 0%, #FFFCF5 100%)"
      boxShadow="0 8px 20px rgba(43, 16, 7, 0.05)"
    >
      <Table variant="simple">
        <Thead bg="rgba(218, 164, 56, 0.1)">
          <Tr>
            {columns.map((column) => (
              <Th key={String(column.key)} color="#634E45" fontWeight={800} textTransform="none" fontSize="sm">
                {column.header}
              </Th>
            ))}
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((row, index) => (
            <Tr key={row.id ?? `row-${index}`}>
              {columns.map((column) => (
                <Td key={`${String(column.key)}-${row.id ?? index}`} color="#2D1D17">
                  {column.render ? (
                    column.render(row)
                  ) : (
                    <Text>{String(row[column.key as keyof T] ?? "-")}</Text>
                  )}
                </Td>
              ))}
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableContainer>
  );
}

export const DataTable = memo(DataTableComponent) as typeof DataTableComponent;
