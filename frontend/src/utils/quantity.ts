export const formatQuantity = (value: number, maximumFractionDigits = 3) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits
  }).format(Number(value ?? 0));

export const formatUnit = (unit?: string | null) => (unit ? unit.trim().toLowerCase() : "");

export const formatQuantityWithUnit = (
  value: number,
  unit?: string | null,
  maximumFractionDigits = 3
) => {
  const parsedUnit = formatUnit(unit);
  if (!parsedUnit) {
    return formatQuantity(value, maximumFractionDigits);
  }
  return `${formatQuantity(value, maximumFractionDigits)} ${parsedUnit}`;
};
