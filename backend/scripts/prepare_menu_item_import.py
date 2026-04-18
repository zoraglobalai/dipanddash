#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path

NS_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_PKG_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": NS_MAIN, "r": NS_REL}

DEFAULT_INGREDIENT_CATEGORY_DESCRIPTION = "Imported from incredients.xlsx recipe workbook"
DEFAULT_ITEM_CATEGORY_DESCRIPTION = "Imported from menus.xlsx menu workbook"
DEFAULT_ITEM_GST = "0"

INGREDIENT_HEADERS = [
    "category_name",
    "category_description",
    "category_kind",
    "ingredient_name",
    "unit",
    "min_stock",
]

ITEM_HEADERS = [
    "category_name",
    "category_description",
    "item_name",
    "selling_price",
    "gst_percentage",
    "note",
    "ingredient_name",
    "ingredient_quantity",
    "ingredient_unit",
]


@dataclass
class RecipeLine:
    ingredient_name: str
    quantity: float
    unit: str


@dataclass
class RecipeCard:
    title: str
    lines: list[RecipeLine]


@dataclass
class MenuItem:
    category_name: str
    item_name: str
    selling_price: float
    note: str


def normalize_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip())


def normalize_key(value: object) -> str:
    return re.sub(r"[^a-z0-9]+", "", normalize_text(value).lower())


def to_title_case(value: str) -> str:
    text = normalize_text(value)
    if not text:
        return text
    words = text.split(" ")
    out: list[str] = []
    for word in words:
        if word.upper() in {"OG", "BBQ", "XL"}:
            out.append(word.upper())
        elif any(char.isdigit() for char in word):
            out.append(word.upper() if len(word) <= 4 else word.capitalize())
        else:
            out.append(word.capitalize())
    return " ".join(out)


def to_fixed_string(value: float, digits: int = 3) -> str:
    rounded = round(value, digits)
    if abs(rounded - int(round(rounded))) < 1e-9:
        return str(int(round(rounded)))
    return f"{rounded:.{digits}f}".rstrip("0").rstrip(".")


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
                row_values = [values.get(i, "") for i in range(max_idx + 1)]
                rows.append(row_values)
            output[sheet_name] = rows
        return output


def parse_quantity_unit(raw_quantity: str) -> tuple[float, str]:
    text = normalize_text(raw_quantity).lower()
    if not text:
        return 1.0, "count"

    if "/" in text:
        text = normalize_text(text.split("/")[0])
    if " to " in text:
        text = normalize_text(text.split(" to ")[0])

    number_match = re.search(r"(\d+(?:\.\d+)?)", text)
    quantity = float(number_match.group(1)) if number_match else 1.0

    unit = "count"
    if re.search(r"\bkg\b|kgs?\b|k\.g", text):
        unit = "g"
        quantity *= 1000
    elif re.search(r"grm|grms|grams?|gm\b|\bg\b", text):
        unit = "g"
    elif re.search(r"gml|ml\b", text):
        unit = "ml"
    elif re.search(r"lit|litre|ltr|\bl\b", text) and not re.search(r"gml|ml\b", text):
        unit = "ml"
        quantity *= 1000
    elif any(token in text for token in ("nos", "no", "pc", "pcs", "piece", "slice", "sachet")):
        unit = "count"

    if quantity <= 0:
        quantity = 1.0

    return quantity, unit


def parse_recipe_cards(sheet_rows: list[list[str]], title_col: int, qty_col: int) -> dict[str, RecipeCard]:
    cards: dict[str, RecipeCard] = {}
    current_title = ""

    for row in sheet_rows:
        title_raw = normalize_text(row[title_col] if len(row) > title_col else "")
        qty_raw = normalize_text(row[qty_col] if len(row) > qty_col else "")

        if not title_raw and not qty_raw:
            continue

        title_key = normalize_key(title_raw)
        if "ingrident" in title_key or "ingredient" in title_key or title_key == "qty":
            continue

        if qty_raw:
            if not current_title or not title_raw:
                continue
            ingredient_name = to_title_case(title_raw)
            quantity, unit = parse_quantity_unit(qty_raw)
            card = cards.setdefault(current_title, RecipeCard(title=current_title, lines=[]))
            card.lines.append(RecipeLine(ingredient_name=ingredient_name, quantity=quantity, unit=unit))
            continue

        current_title = to_title_case(title_raw)
        cards.setdefault(current_title, RecipeCard(title=current_title, lines=[]))

    return {title: card for title, card in cards.items() if card.lines}


def parse_menu_items(sheet_rows: list[list[str]]) -> list[MenuItem]:
    items: list[MenuItem] = []
    current_category = "General"
    last_item_index = -1

    for row in sheet_rows:
        text = normalize_text(row[4] if len(row) > 4 else "")
        if not text:
            continue

        if text.startswith("(") and text.endswith(")") and 0 <= last_item_index < len(items):
            note = text.strip("()").strip()
            if note:
                existing = items[last_item_index]
                existing.note = note if not existing.note else f"{existing.note} {note}".strip()
            continue

        match = re.match(r"^\*?\s*(.+?)\s+(\d+(?:\.\d+)?)\s*$", text)
        if match:
            name = to_title_case(match.group(1))
            price = float(match.group(2))
            items.append(
                MenuItem(
                    category_name=to_title_case(current_category.rstrip(":")),
                    item_name=name,
                    selling_price=price,
                    note="",
                )
            )
            last_item_index = len(items) - 1
            continue

        current_category = text
        last_item_index = -1

    return items


def match_menu_to_recipe(menu_items: list[MenuItem], recipe_map: dict[str, RecipeCard]) -> tuple[dict[str, RecipeCard], list[str]]:
    by_key = {normalize_key(name): card for name, card in recipe_map.items()}
    alias_map = {
        normalize_key("Peri peri fires"): normalize_key("Peri peri fries"),
        normalize_key("Nashville chicken wings"): normalize_key("Nashville fried wings"),
        normalize_key("Mexican chicken wings"): normalize_key("Mexican fried wings"),
        normalize_key("Buffalo wings"): normalize_key("Bufflow fried wings"),
        normalize_key("Korean wings"): normalize_key("Korean fried wings"),
        normalize_key("Original loaded fires"): normalize_key("Original loaded"),
        normalize_key("Nashville loaded fries"): normalize_key("Nashville loaded"),
        normalize_key("Korean chicken loaded fires"): normalize_key("Korean chicken loaded"),
        normalize_key("Mexican loaded"): normalize_key("Mexican chicken loaded"),
        normalize_key("Vegan fried burger"): normalize_key("Crispy fried veg burger"),
        normalize_key("Slaw chicken burger"): normalize_key("Slaw fried chicken burger"),
        normalize_key("Nashville chicken burger"): normalize_key("Nashville fried chicken burger"),
        normalize_key("Buffalo chicken burger"): normalize_key("Bufflow fried chicken burger"),
        normalize_key("Mexican chicken burger"): normalize_key("Mexican fried chicken burger"),
        normalize_key("Og smashed double beef"): normalize_key("Og smash double beef burger"),
        normalize_key("God's own beef burger"): normalize_key("Gods own beef burger"),
        normalize_key("Signature no bun chicken burger"): normalize_key("Sig no bun buregr"),
        normalize_key("Silky biscoff shake"): normalize_key("Biscoff 350 ml"),
        normalize_key("Cold mocha"): normalize_key("Mocha 350 ml"),
        normalize_key("Ice tea"): normalize_key("Ice tea 350 ml"),
        normalize_key("Mango ice tea"): normalize_key("Mango ice tea 350 ml"),
        normalize_key("Lemon mint mojito"): normalize_key("Mint mojito 350 ml"),
        normalize_key("Blue curacao mojito"): normalize_key("Blue curacuo 350 ml"),
        normalize_key("Thick cold milo"): normalize_key("Thick cold milo 350 ml"),
    }

    addon_fallback = {
        normalize_key("Fried egg"): [RecipeLine("Egg", 1, "count")],
        normalize_key("Coleslaw"): [RecipeLine("Coleslaw", 30, "g")],
        normalize_key("Sauce"): [RecipeLine("Dip Sauce", 10, "ml")],
        normalize_key("Cheese"): [RecipeLine("Cheese Sauce", 20, "g")],
        normalize_key("Fires"): [RecipeLine("9mm Fries", 100, "g")],
        normalize_key("Nacho"): [RecipeLine("Nachos Chips", 100, "g")],
        normalize_key("Make it double Patty"): [RecipeLine("Chicken Thigh Fillet", 1, "count")],
    }

    mapped: dict[str, RecipeCard] = {}
    unmatched: list[str] = []

    for item in menu_items:
        key = normalize_key(item.item_name)
        recipe_card = None

        candidate_key = alias_map.get(key, key)
        if candidate_key in by_key:
            recipe_card = by_key[candidate_key]

        if recipe_card is None and key in addon_fallback:
            recipe_card = RecipeCard(title=item.item_name, lines=addon_fallback[key])

        if recipe_card is None:
            unmatched.append(item.item_name)
            continue

        mapped[item.item_name] = recipe_card

    return mapped, unmatched


def write_csv(path: Path, headers: list[str], rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow({header: row.get(header, "") for header in headers})


def build_rows(ingredients_sheet_rows: list[list[str]], menu_sheet_rows: list[list[str]]) -> tuple[list[dict[str, str]], list[dict[str, str]], list[str]]:
    left_cards = parse_recipe_cards(ingredients_sheet_rows, 4, 6)
    right_cards = parse_recipe_cards(ingredients_sheet_rows, 9, 11)
    all_cards = {**right_cards, **left_cards}

    menu_items = parse_menu_items(menu_sheet_rows)
    mapping, unmatched_items = match_menu_to_recipe(menu_items, all_cards)

    ingredient_unit_by_name: dict[str, str] = {}
    ingredient_category_by_name: dict[str, str] = {}
    ingredient_rows_by_name: dict[str, dict[str, str]] = {}
    raw_item_rows: list[dict[str, object]] = []

    for menu_item in menu_items:
        recipe = mapping.get(menu_item.item_name)
        if recipe is None:
            continue

        category_name = menu_item.category_name or "General"
        for line in recipe.lines:
            ingredient_name = to_title_case(line.ingredient_name)
            quantity = max(line.quantity, 0.001)
            unit = line.unit if line.unit in {"g", "ml", "count"} else "count"

            existing_unit = ingredient_unit_by_name.get(ingredient_name)
            if existing_unit is None:
                ingredient_unit_by_name[ingredient_name] = unit
            elif existing_unit != unit:
                # Keep deterministic compatible unit for import.
                if {existing_unit, unit} == {"g", "count"}:
                    ingredient_unit_by_name[ingredient_name] = "g"
                elif {existing_unit, unit} == {"ml", "count"}:
                    ingredient_unit_by_name[ingredient_name] = "ml"

            ingredient_category_by_name.setdefault(ingredient_name, category_name)

            raw_item_rows.append(
                {
                    "category_name": category_name,
                    "category_description": DEFAULT_ITEM_CATEGORY_DESCRIPTION,
                    "item_name": menu_item.item_name,
                    "selling_price": to_fixed_string(menu_item.selling_price, 2),
                    "gst_percentage": DEFAULT_ITEM_GST,
                    "note": menu_item.note,
                    "ingredient_name": ingredient_name,
                    "ingredient_quantity": quantity,
                    "ingredient_unit": unit,
                }
            )

    for ingredient_name, unit in ingredient_unit_by_name.items():
        category_name = ingredient_category_by_name.get(ingredient_name, "General")
        ingredient_rows_by_name[normalize_key(ingredient_name)] = {
            "category_name": category_name,
            "category_description": DEFAULT_INGREDIENT_CATEGORY_DESCRIPTION,
            "category_kind": "core",
            "ingredient_name": ingredient_name,
            "unit": unit,
            "min_stock": "0",
        }

    ingredient_rows = sorted(
        ingredient_rows_by_name.values(),
        key=lambda row: (normalize_key(row["category_name"]), normalize_key(row["ingredient_name"])),
    )

    item_rows: list[dict[str, str]] = []
    for row in raw_item_rows:
        ingredient_name = str(row["ingredient_name"])
        ingredient_unit = str(row["ingredient_unit"])
        ingredient_quantity = float(row["ingredient_quantity"])
        preferred_unit = ingredient_unit_by_name.get(ingredient_name, ingredient_unit)

        final_unit = ingredient_unit
        if preferred_unit != ingredient_unit:
            if ingredient_unit == "count" and preferred_unit in {"g", "ml"}:
                final_unit = preferred_unit
            elif ingredient_unit in {"g", "ml"} and preferred_unit == "count":
                final_unit = "count"
            else:
                final_unit = preferred_unit

        item_rows.append(
            {
                "category_name": str(row["category_name"]),
                "category_description": str(row["category_description"]),
                "item_name": str(row["item_name"]),
                "selling_price": str(row["selling_price"]),
                "gst_percentage": str(row["gst_percentage"]),
                "note": str(row["note"]),
                "ingredient_name": ingredient_name,
                "ingredient_quantity": to_fixed_string(max(ingredient_quantity, 0.001)),
                "ingredient_unit": final_unit,
            }
        )

    return ingredient_rows, item_rows, unmatched_items


def main() -> int:
    parser = argparse.ArgumentParser(description="Prepare ingredient + menu CSVs from root XLSX files.")
    parser.add_argument("--ingredients-workbook", required=True, help="Path to incredients.xlsx")
    parser.add_argument("--menus-workbook", required=True, help="Path to menus.xlsx")
    parser.add_argument("--outdir", required=True, help="Output directory for generated CSV files")
    args = parser.parse_args()

    ingredients_path = Path(args.ingredients_workbook).expanduser().resolve()
    menus_path = Path(args.menus_workbook).expanduser().resolve()
    outdir = Path(args.outdir).expanduser().resolve()

    if not ingredients_path.exists():
        print(f"Ingredients workbook not found: {ingredients_path}", file=sys.stderr)
        return 1
    if not menus_path.exists():
        print(f"Menus workbook not found: {menus_path}", file=sys.stderr)
        return 1

    ingredients_sheets = read_workbook_sheets(ingredients_path)
    menus_sheets = read_workbook_sheets(menus_path)

    ingredient_sheet_rows = ingredients_sheets.get("Sheet1", [])
    menu_sheet_rows = menus_sheets.get("Sheet1", [])
    if not ingredient_sheet_rows or not menu_sheet_rows:
        print("Workbook sheet 'Sheet1' missing or empty.", file=sys.stderr)
        return 1

    ingredient_rows, item_rows, unmatched_items = build_rows(ingredient_sheet_rows, menu_sheet_rows)
    if not item_rows:
        print("No item rows could be generated from workbook.", file=sys.stderr)
        return 1

    write_csv(outdir / "ingredients.csv", INGREDIENT_HEADERS, ingredient_rows)
    write_csv(outdir / "items.csv", ITEM_HEADERS, item_rows)
    write_csv(
        outdir / "unmatched_menu_items.csv",
        ["item_name"],
        [{"item_name": name} for name in unmatched_items],
    )

    print(
        "Prepared menu import CSV files:",
        f"ingredients={len(ingredient_rows)}",
        f"item_rows={len(item_rows)}",
        f"unmatched_menu_items={len(unmatched_items)}",
    )
    print(f"Output directory: {outdir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
