#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": NS_MAIN, "r": NS_REL}

LEGACY_SUPPLIER_NAME = "Legacy Sheet Supplier"
ADDITIONAL_CATEGORY_NAME = "Additional Supplies"
ADDITIONAL_CATEGORY_DESC = "Imported from Dip & Dash legacy monthly sheet"


def normalize_text(value: object) -> str:
    text = str(value or "").strip()
    return re.sub(r"\s+", " ", text)


def to_number(value: object, default: float = 0.0) -> float:
    text = normalize_text(value).replace(",", "")
    if not text:
        return default
    try:
        return float(text)
    except ValueError:
        return default


def to_int_string(value: float) -> str:
    if abs(value - round(value)) < 1e-9:
        return str(int(round(value)))
    return f"{value:.3f}".rstrip("0").rstrip(".")


def normalize_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value).lower())


def excel_serial_to_date_text(serial_value: object) -> str:
    number = to_number(serial_value, default=float("nan"))
    if number != number:
        return ""
    # Excel serial origin for .xlsx date system
    base = dt.datetime(1899, 12, 30)
    converted = base + dt.timedelta(days=int(number))
    return converted.date().isoformat()


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
                    cell_ref = cell_node.attrib.get("r", "")
                    idx = column_index(cell_ref)
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
                row_values = [values.get(i, "") for i in range(max_idx + 1)]
                rows.append(row_values)
            output[sheet_name] = rows
        return output


def discover_purchase_columns(date_row: list[str], marker_row: list[str]) -> list[tuple[int, str]]:
    purchase_columns: list[tuple[int, str]] = []
    for idx, marker in enumerate(marker_row):
        if normalize_key(marker) != "purchase":
            continue
        purchase_date = excel_serial_to_date_text(date_row[idx] if idx < len(date_row) else "")
        if not purchase_date:
            continue
        purchase_columns.append((idx, purchase_date))
    return purchase_columns


def find_primary_header_index(sheet_rows: list[list[str]]) -> int:
    for idx, row in enumerate(sheet_rows):
        if not row:
            continue
        normalized = [normalize_key(value) for value in row]
        has_sno = "sno" in normalized
        has_desc = "description" in normalized or "iteams" in normalized or "items" in normalized
        if has_sno and has_desc:
            return idx
    return -1


def build_additional_rows(sheet_rows: list[list[str]]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    header_idx = find_primary_header_index(sheet_rows)
    if header_idx < 0:
        return [], []

    date_row = sheet_rows[header_idx + 2] if len(sheet_rows) > header_idx + 2 else []
    marker_row = sheet_rows[header_idx + 3] if len(sheet_rows) > header_idx + 3 else []
    summary_header_row = sheet_rows[header_idx] if len(sheet_rows) > header_idx else []
    purchase_columns = discover_purchase_columns(date_row, marker_row)
    summary_purchase_idx = find_column_index(summary_header_row, "purchased")
    opening_stock_idx = find_column_index_contains(summary_header_row, "openingstock")
    summary_purchase_date = purchase_columns[-1][1] if purchase_columns else ""
    opening_stock_date = purchase_columns[0][1] if purchase_columns else dt.date.today().isoformat()

    seen_names: set[str] = set()
    ingredient_rows: list[dict[str, str]] = []
    purchase_rows: list[dict[str, str]] = []

    for row in sheet_rows[header_idx + 4:]:
        description = normalize_text(row[1] if len(row) > 1 else "")
        if not description or normalize_key(description) in {"", "0"}:
            continue
        if not re.search(r"[A-Za-z]", description):
            continue

        name_key = normalize_key(description)
        if name_key not in seen_names:
            seen_names.add(name_key)
            ingredient_rows.append(
                {
                    "category_name": ADDITIONAL_CATEGORY_NAME,
                    "category_description": ADDITIONAL_CATEGORY_DESC,
                    "category_kind": "additional",
                    "ingredient_name": description,
                    "unit": "pcs",
                    "min_stock": "0",
                }
            )

        opening_stock_qty = (
            to_number(row[opening_stock_idx] if opening_stock_idx >= 0 and opening_stock_idx < len(row) else "")
            if opening_stock_idx >= 0
            else 0.0
        )
        if opening_stock_qty > 0:
            purchase_rows.append(
                {
                    "supplier_name": LEGACY_SUPPLIER_NAME,
                    "purchase_date": opening_stock_date,
                    "purchase_note": "Legacy workbook import - additional opening stock",
                    "line_type": "ingredient",
                    "item_name": description,
                    "quantity": to_int_string(opening_stock_qty),
                    "quantity_unit": "pcs",
                    "unit_price": "0",
                    "expiry_date": "",
                    "line_note": "Imported from Dip&dash opening stock column",
                }
            )

        has_daily_purchase = False
        for col_idx, purchase_date in purchase_columns:
            quantity = to_number(row[col_idx] if col_idx < len(row) else "")
            if quantity <= 0:
                continue
            has_daily_purchase = True
            purchase_rows.append(
                {
                    "supplier_name": LEGACY_SUPPLIER_NAME,
                    "purchase_date": purchase_date,
                    "purchase_note": "Legacy workbook import - additional supplies",
                    "line_type": "ingredient",
                    "item_name": description,
                    "quantity": to_int_string(quantity),
                    "quantity_unit": "pcs",
                    "unit_price": "0",
                    "expiry_date": "",
                    "line_note": "Imported from Dip&dash sheet",
                }
            )

        if not has_daily_purchase and summary_purchase_idx >= 0:
            summary_qty = to_number(row[summary_purchase_idx] if summary_purchase_idx < len(row) else "")
            if summary_qty > 0 and summary_purchase_date:
                purchase_rows.append(
                    {
                        "supplier_name": LEGACY_SUPPLIER_NAME,
                        "purchase_date": summary_purchase_date,
                        "purchase_note": "Legacy workbook import - additional supplies",
                        "line_type": "ingredient",
                        "item_name": description,
                        "quantity": to_int_string(summary_qty),
                        "quantity_unit": "pcs",
                        "unit_price": "0",
                        "expiry_date": "",
                        "line_note": "Imported from Dip&dash summary purchased column",
                    }
                )

    return ingredient_rows, purchase_rows


def find_column_index(header_row: list[str], expected_key: str) -> int:
    for idx, value in enumerate(header_row):
        if normalize_key(value) == expected_key:
            return idx
    return -1


def find_column_index_contains(header_row: list[str], expected_fragment: str) -> int:
    fragment = normalize_key(expected_fragment)
    if not fragment:
        return -1
    for idx, value in enumerate(header_row):
        if fragment in normalize_key(value):
            return idx
    return -1


def build_snooker_rows(
    sheet_rows: list[list[str]],
) -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    header_idx = find_primary_header_index(sheet_rows)
    if header_idx < 0:
        return [], [], []

    date_row = sheet_rows[header_idx + 2] if len(sheet_rows) > header_idx + 2 else []
    marker_row = sheet_rows[header_idx + 3] if len(sheet_rows) > header_idx + 3 else []
    purchase_columns = discover_purchase_columns(date_row, marker_row)
    opening_stock_idx = 3
    opening_stock_date = purchase_columns[0][1] if purchase_columns else dt.date.today().isoformat()
    fallback_summary_date = purchase_columns[-1][1] if purchase_columns else dt.date.today().isoformat()
    latest_observed_purchase_date = ""

    summary_sno_idx = -1
    for idx, value in enumerate(marker_row):
        if normalize_key(value) == "sno":
            summary_sno_idx = idx
            break

    summary_index_map: dict[str, int] = {}
    if summary_sno_idx >= 0:
        for idx in range(summary_sno_idx, len(marker_row)):
            key = normalize_key(marker_row[idx])
            if key and key not in summary_index_map:
                summary_index_map[key] = idx

    seen_names: set[str] = set()
    product_rows: list[dict[str, str]] = []
    purchase_rows: list[dict[str, str]] = []
    summary_rows: list[dict[str, str]] = []
    best_summary_by_name: dict[
        str,
        dict[str, object],
    ] = {}

    for row in sheet_rows[header_idx + 4:]:
        description = normalize_text(row[1] if len(row) > 1 else "")
        if not description or normalize_key(description) in {"", "0"}:
            continue
        if not re.search(r"[A-Za-z]", description):
            continue

        selling_price = max(to_number(row[2] if len(row) > 2 else ""), 0.0)
        summary_selling_rate = (
            max(
                to_number(
                    row[summary_index_map["rates"]]
                    if "rates" in summary_index_map and summary_index_map["rates"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "rates" in summary_index_map
            else 0.0
        )
        purchase_rate = (
            max(
                to_number(
                    row[summary_index_map["purchaserate"]]
                    if "purchaserate" in summary_index_map and summary_index_map["purchaserate"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "purchaserate" in summary_index_map
            else 0.0
        )
        opening_stock = max(to_number(row[opening_stock_idx] if opening_stock_idx < len(row) else ""), 0.0)
        purchase_qty = (
            max(
                to_number(
                    row[summary_index_map["purchase"]]
                    if "purchase" in summary_index_map and summary_index_map["purchase"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "purchase" in summary_index_map
            else 0.0
        )
        sales_qty = (
            max(
                to_number(
                    row[summary_index_map["sales"]]
                    if "sales" in summary_index_map and summary_index_map["sales"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "sales" in summary_index_map
            else 0.0
        )
        sales_value = (
            max(
                to_number(
                    row[summary_index_map["salesvalue"]]
                    if "salesvalue" in summary_index_map and summary_index_map["salesvalue"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "salesvalue" in summary_index_map
            else 0.0
        )
        closing_stock = (
            max(
                to_number(
                    row[summary_index_map["closingstock"]]
                    if "closingstock" in summary_index_map and summary_index_map["closingstock"] < len(row)
                    else ""
                ),
                0.0,
            )
            if "closingstock" in summary_index_map
            else 0.0
        )

        unit_price = purchase_rate if purchase_rate > 0 else selling_price
        name_key = normalize_key(description)

        if name_key not in seen_names:
            seen_names.add(name_key)
            product_rows.append(
                {
                    "product_name": description,
                    "category": "Snooker",
                    "sku": "",
                    "pack_size": "",
                    "unit": "pcs",
                    "default_supplier_name": LEGACY_SUPPLIER_NAME,
                    "min_stock": "0",
                    "selling_price": to_int_string(selling_price),
                    "target_section": "gaming",
                    "is_active": "true",
                }
            )

        signal_score = opening_stock + purchase_qty + sales_qty + closing_stock
        existing = best_summary_by_name.get(name_key)
        if existing is None or signal_score > float(existing["signal_score"]):
            best_summary_by_name[name_key] = {
                "signal_score": signal_score,
                "description": description,
                "opening_stock": opening_stock,
                "purchase_rate": purchase_rate,
                "purchase_qty": purchase_qty,
                "selling_rate": summary_selling_rate if summary_selling_rate > 0 else selling_price,
                "sales_qty": sales_qty,
                "sales_value": sales_value,
                "closing_stock": closing_stock,
                "unit_price": unit_price,
            }

        for col_idx, purchase_date in purchase_columns:
            quantity = to_number(row[col_idx] if col_idx < len(row) else "")
            if quantity <= 0:
                continue
            if not latest_observed_purchase_date or purchase_date > latest_observed_purchase_date:
                latest_observed_purchase_date = purchase_date

    summary_date = latest_observed_purchase_date or fallback_summary_date
    today_iso = dt.date.today().isoformat()
    if summary_date > today_iso:
        summary_date = today_iso

    for entry in best_summary_by_name.values():
        description = str(entry["description"])
        opening_stock = float(entry["opening_stock"])
        purchase_qty = float(entry["purchase_qty"])
        purchase_rate = float(entry["purchase_rate"])
        selling_rate = float(entry["selling_rate"])
        sales_qty = float(entry["sales_qty"])
        sales_value = float(entry["sales_value"])
        closing_stock = float(entry["closing_stock"])
        unit_price = float(entry["unit_price"])

        if opening_stock > 0:
            purchase_rows.append(
                {
                    "supplier_name": LEGACY_SUPPLIER_NAME,
                    "purchase_date": opening_stock_date,
                    "purchase_note": "Legacy workbook import - snooker opening stock",
                    "line_type": "product",
                    "item_name": description,
                    "quantity": to_int_string(opening_stock),
                    "quantity_unit": "pcs",
                    "unit_price": to_int_string(unit_price),
                    "expiry_date": "",
                    "line_note": "Imported from snooker opening stock column",
                }
            )

        if purchase_qty > 0:
            purchase_rows.append(
                {
                    "supplier_name": LEGACY_SUPPLIER_NAME,
                    "purchase_date": summary_date,
                    "purchase_note": "Legacy workbook import - snooker summary purchase",
                    "line_type": "product",
                    "item_name": description,
                    "quantity": to_int_string(purchase_qty),
                    "quantity_unit": "pcs",
                    "unit_price": to_int_string(unit_price),
                    "expiry_date": "",
                    "line_note": "Imported from snooker summary purchase column",
                }
            )

        summary_rows.append(
            {
                "product_name": description,
                "opening_stock": to_int_string(opening_stock),
                "purchase_rate": to_int_string(purchase_rate),
                "purchase_qty": to_int_string(purchase_qty),
                "selling_rate": to_int_string(selling_rate),
                "sales_qty": to_int_string(sales_qty),
                "sales_value": to_int_string(sales_value),
                "closing_stock": to_int_string(closing_stock),
                "summary_date": summary_date,
            }
        )

    return product_rows, purchase_rows, summary_rows


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in headers})


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare legacy workbook import CSV files.")
    parser.add_argument("--workbook", required=True, help="Absolute or relative path to legacy XLSX workbook.")
    parser.add_argument("--outdir", required=True, help="Output directory for generated CSV files.")
    args = parser.parse_args()

    workbook_path = Path(args.workbook).expanduser().resolve()
    outdir = Path(args.outdir).expanduser().resolve()

    if not workbook_path.exists():
        print(f"Workbook not found: {workbook_path}", file=sys.stderr)
        return 1

    sheets = read_workbook_sheets(workbook_path)
    dip_rows = sheets.get("Dip&dash", [])
    snooker_rows = sheets.get("147 soonkers stock details", [])

    additional_rows, additional_purchase_rows = build_additional_rows(dip_rows)
    product_rows, product_purchase_rows, snooker_summary_rows = build_snooker_rows(snooker_rows)

    purchase_rows = additional_purchase_rows + product_purchase_rows
    purchase_rows.sort(key=lambda row: (row["purchase_date"], row["line_type"], row["item_name"]))

    write_csv(
        outdir / "additional_ingredients.csv",
        [
            "category_name",
            "category_description",
            "category_kind",
            "ingredient_name",
            "unit",
            "min_stock",
        ],
        additional_rows,
    )
    write_csv(
        outdir / "products.csv",
        [
            "product_name",
            "category",
            "sku",
            "pack_size",
            "unit",
            "default_supplier_name",
            "min_stock",
            "selling_price",
            "target_section",
            "is_active",
        ],
        product_rows,
    )
    write_csv(
        outdir / "purchases.csv",
        [
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
        ],
        purchase_rows,
    )
    write_csv(
        outdir / "snooker_summary.csv",
        [
            "product_name",
            "opening_stock",
            "purchase_rate",
            "purchase_qty",
            "selling_rate",
            "sales_qty",
            "sales_value",
            "closing_stock",
            "summary_date",
        ],
        snooker_summary_rows,
    )

    print(
        "Prepared CSV files:",
        f"additional={len(additional_rows)}",
        f"products={len(product_rows)}",
        f"purchases={len(purchase_rows)}",
        f"snooker_summary={len(snooker_summary_rows)}",
    )
    print(f"Output directory: {outdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
