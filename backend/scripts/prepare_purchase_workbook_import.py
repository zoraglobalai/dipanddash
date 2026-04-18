#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": NS_MAIN, "r": NS_REL}

INGREDIENT_HEADERS = [
    "category_name",
    "category_description",
    "category_kind",
    "ingredient_name",
    "unit",
    "min_stock",
]

PURCHASE_HEADERS = [
    "supplier_name",
    "purchase_date",
    "purchase_note",
    "line_type",
    "item_name",
    "quantity",
    "quantity_unit",
    "unit_price",
    "expiry_date",
    "line_note",
]

DEFAULT_CATEGORY_NAME = "Imported Purchase Ingredients"
DEFAULT_CATEGORY_DESCRIPTION = "Auto-created from purchase.xlsx ingredient purchase workbook"
DEFAULT_CATEGORY_KIND = "additional"
DEFAULT_SUPPLIER_NAME = "Workbook Supplier"
DEFAULT_PURCHASE_NOTE = "Purchase workbook import"


@dataclass(frozen=True)
class ParsedPurchaseRow:
    supplier_name: str
    purchase_date: str
    purchase_note: str
    ingredient_name: str
    quantity: float
    quantity_unit: str
    unit_price: float
    line_note: str


def normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value).lower())


def column_index(cell_ref: str) -> int:
    match = re.match(r"([A-Z]+)", cell_ref or "")
    if not match:
        return 0
    index = 0
    for ch in match.group(1):
        index = index * 26 + (ord(ch) - 64)
    return index - 1


def read_workbook_sheets(workbook_path: Path) -> dict[str, list[list[str]]]:
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for node in root.findall("m:si", NS):
                parts = [part.text or "" for part in node.findall(".//m:t", NS)]
                shared_strings.append("".join(parts))

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        rels = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {
            rel.attrib["Id"]: rel.attrib["Target"] for rel in rels.findall(f"{{{NS_PKG_REL}}}Relationship")
        }

        sheet_targets: list[tuple[str, str]] = []
        for sheet in workbook.findall("m:sheets/m:sheet", NS):
            rel_id = sheet.attrib.get(f"{{{NS_REL}}}id", "")
            target = rel_map.get(rel_id)
            if target:
                sheet_targets.append((sheet.attrib.get("name", ""), f"xl/{target}"))

        output: dict[str, list[list[str]]] = {}
        for sheet_name, sheet_path in sheet_targets:
            root = ET.fromstring(archive.read(sheet_path))
            rows: list[list[str]] = []
            for row_node in root.findall("m:sheetData/m:row", NS):
                values: dict[int, str] = {}
                for cell_node in row_node.findall("m:c", NS):
                    idx = column_index(cell_node.attrib.get("r", ""))
                    raw_type = cell_node.attrib.get("t", "")
                    value_node = cell_node.find("m:v", NS)
                    if value_node is None:
                        continue
                    raw = value_node.text or ""
                    if raw_type == "s":
                        if raw.isdigit() and int(raw) < len(shared_strings):
                            values[idx] = shared_strings[int(raw)]
                        else:
                            values[idx] = raw
                    else:
                        values[idx] = raw
                if not values:
                    rows.append([])
                    continue
                max_idx = max(values.keys())
                rows.append([values.get(i, "") for i in range(max_idx + 1)])
            output[sheet_name] = rows
        return output


def to_number(value: str) -> float:
    text = normalize_text(value).replace(",", "")
    if not text:
        return 0.0
    try:
        parsed = float(text)
        return parsed if parsed == parsed else 0.0
    except ValueError:
        return 0.0


def to_fixed(value: float, digits: int = 3) -> str:
    rounded = round(value, digits)
    if abs(rounded - int(round(rounded))) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.{digits}f}".rstrip("0").rstrip(".")


def parse_excel_serial_date(raw: str) -> str:
    text = normalize_text(raw)
    if not text:
        return ""
    if re.fullmatch(r"\d+(?:\.\d+)?", text):
        serial = int(float(text))
        if serial <= 0:
            return ""
        base = dt.date(1899, 12, 30)
        return (base + dt.timedelta(days=serial)).isoformat()

    ymd = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if ymd:
        return text

    dmy = re.fullmatch(r"(\d{2})[-/](\d{2})[-/](\d{4})", text)
    if dmy:
        day = int(dmy.group(1))
        month = int(dmy.group(2))
        year = int(dmy.group(3))
        try:
            return dt.date(year, month, day).isoformat()
        except ValueError:
            return ""

    return ""


def parse_pack_size_to_base(raw_alt_qty: str) -> tuple[float, str]:
    text = normalize_text(raw_alt_qty).lower()
    if not text or text == "0":
        return 1.0, "count"

    number_match = re.search(r"(\d+(?:\.\d+)?)", text)
    value = float(number_match.group(1)) if number_match else 1.0
    if value <= 0:
        value = 1.0

    if re.search(r"\bkg\b|kgs?\b|k\.g\b", text):
        # Some rows use "1000 Kg" to represent 1000 g packet size.
        if value >= 50:
            return value, "g"
        return value * 1000.0, "g"

    if re.search(r"grm|grms|grams?|gm\b|\bg\b", text):
        return value, "g"

    if re.search(r"\bml\b", text):
        return value, "ml"

    if re.search(r"lit|litre|ltr|lt\b|\bl\b", text):
        # Some rows use "1000 Lt" for 1000 ml.
        if value >= 50:
            return value, "ml"
        return value * 1000.0, "ml"

    return value, "count"


def find_header_row(rows: list[list[str]]) -> tuple[int, dict[str, int]]:
    header_aliases = {
        "vendorname": "supplier_name",
        "vendor": "supplier_name",
        "vendorinvoicen": "invoice_no",
        "vendorinvoicen#": "invoice_no",
        "vendorinvoiceno": "invoice_no",
        "purchasedate": "purchase_date",
        "description": "description",
        "altqty": "alt_qty",
        "purchaseqty": "purchase_qty",
        "unitprice": "unit_price",
        "amount": "amount",
        "projectname": "project_name",
    }

    required = {"supplier_name", "purchase_date", "description", "purchase_qty", "unit_price"}

    for row_index, row in enumerate(rows):
        if not row:
            continue
        index_map: dict[str, int] = {}
        for idx, cell in enumerate(row):
            alias = header_aliases.get(normalize_key(cell))
            if alias and alias not in index_map:
                index_map[alias] = idx
        if required.issubset(index_map.keys()):
            return row_index, index_map

    raise ValueError("Unable to locate purchase header row in workbook.")


def read_cell(row: list[str], index_map: dict[str, int], key: str) -> str:
    idx = index_map.get(key)
    if idx is None or idx >= len(row):
        return ""
    return normalize_text(row[idx])


def parse_purchase_rows(sheet_rows: list[list[str]]) -> list[ParsedPurchaseRow]:
    header_row_index, index_map = find_header_row(sheet_rows)
    parsed_rows: list[ParsedPurchaseRow] = []

    for raw_row in sheet_rows[header_row_index + 1 :]:
        description = read_cell(raw_row, index_map, "description")
        description_key = normalize_key(description)
        if not description:
            continue
        if description_key in {"total", "grandtotal"}:
            continue

        supplier_name = read_cell(raw_row, index_map, "supplier_name") or DEFAULT_SUPPLIER_NAME
        invoice_no = read_cell(raw_row, index_map, "invoice_no")
        purchase_date = parse_excel_serial_date(read_cell(raw_row, index_map, "purchase_date"))
        if not purchase_date:
            continue

        purchase_qty = to_number(read_cell(raw_row, index_map, "purchase_qty"))
        if purchase_qty <= 0:
            continue

        unit_price = to_number(read_cell(raw_row, index_map, "unit_price"))
        if unit_price <= 0:
            amount = to_number(read_cell(raw_row, index_map, "amount"))
            if amount > 0 and purchase_qty > 0:
                unit_price = amount / purchase_qty
        if unit_price <= 0:
            continue

        pack_qty, base_unit = parse_pack_size_to_base(read_cell(raw_row, index_map, "alt_qty"))
        total_quantity = purchase_qty * pack_qty
        if total_quantity <= 0:
            continue

        ingredient_name = description
        purchase_note = f"{DEFAULT_PURCHASE_NOTE} - {invoice_no}" if invoice_no else DEFAULT_PURCHASE_NOTE
        line_note = f"Workbook row import ({invoice_no or 'no-invoice'})"

        parsed_rows.append(
            ParsedPurchaseRow(
                supplier_name=supplier_name,
                purchase_date=purchase_date,
                purchase_note=purchase_note,
                ingredient_name=ingredient_name,
                quantity=total_quantity,
                quantity_unit=base_unit,
                unit_price=unit_price,
                line_note=line_note,
            )
        )

    return parsed_rows


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        writer.writerows(rows)


def build_ingredient_rows(purchase_rows: list[ParsedPurchaseRow]) -> list[dict[str, str]]:
    unit_by_name: dict[str, str] = {}
    for row in purchase_rows:
        key = normalize_key(row.ingredient_name)
        if key and key not in unit_by_name:
            unit_by_name[key] = row.quantity_unit

    unique_names: dict[str, str] = {}
    for row in purchase_rows:
        key = normalize_key(row.ingredient_name)
        if key and key not in unique_names:
            unique_names[key] = row.ingredient_name

    output: list[dict[str, str]] = []
    for key, ingredient_name in sorted(unique_names.items(), key=lambda item: item[1].lower()):
        output.append(
            {
                "category_name": DEFAULT_CATEGORY_NAME,
                "category_description": DEFAULT_CATEGORY_DESCRIPTION,
                "category_kind": DEFAULT_CATEGORY_KIND,
                "ingredient_name": ingredient_name,
                "unit": unit_by_name.get(key, "count"),
                "min_stock": "0",
            }
        )
    return output


def build_purchase_rows(purchase_rows: list[ParsedPurchaseRow]) -> list[dict[str, str]]:
    output: list[dict[str, str]] = []
    for row in purchase_rows:
        output.append(
            {
                "supplier_name": row.supplier_name,
                "purchase_date": row.purchase_date,
                "purchase_note": row.purchase_note,
                "line_type": "ingredient",
                "item_name": row.ingredient_name,
                "quantity": to_fixed(row.quantity),
                "quantity_unit": row.quantity_unit,
                "unit_price": to_fixed(row.unit_price, 3),
                "expiry_date": "",
                "line_note": row.line_note,
            }
        )
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare ingredient purchase import CSV from purchase.xlsx workbook")
    parser.add_argument("--workbook", required=True, help="Path to purchase workbook (.xlsx)")
    parser.add_argument("--outdir", required=True, help="Output directory for generated CSV files")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    workbook_path = Path(args.workbook).resolve()
    if not workbook_path.exists():
        raise FileNotFoundError(f"Workbook not found: {workbook_path}")

    sheets = read_workbook_sheets(workbook_path)
    if not sheets:
        raise ValueError("Workbook has no readable sheets.")

    first_sheet_name = next(iter(sheets.keys()))
    purchase_rows = parse_purchase_rows(sheets[first_sheet_name])

    ingredient_rows = build_ingredient_rows(purchase_rows)
    purchase_csv_rows = build_purchase_rows(purchase_rows)

    outdir = Path(args.outdir).resolve()
    write_csv(outdir / "ingredients.csv", INGREDIENT_HEADERS, ingredient_rows)
    write_csv(outdir / "purchases.csv", PURCHASE_HEADERS, purchase_csv_rows)

    print(
        "Prepared purchase workbook import CSV files:",
        f"sheet={first_sheet_name}",
        f"ingredients={len(ingredient_rows)}",
        f"purchase_lines={len(purchase_csv_rows)}",
        f"outdir={outdir}",
    )


if __name__ == "__main__":
    main()
