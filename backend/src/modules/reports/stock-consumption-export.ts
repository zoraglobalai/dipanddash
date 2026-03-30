type ExportColumn = {
  key: string;
  label: string;
};

type ExportStat = {
  label: string;
  value: string | number;
  hint?: string;
};

type ExportRow = Record<string, string | number | null>;

type StockConsumptionExportPayload = {
  title: string;
  outletLabel: string;
  dateFrom: string;
  dateTo: string;
  generatedAt: string;
  columns: ExportColumn[];
  rows: ExportRow[];
  stats: ExportStat[];
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const escapeXml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const formatCell = (value: string | number | null) => (value === null || value === undefined ? "-" : String(value));

const escapeCsv = (value: unknown) => {
  const text = String(value ?? "");
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, "\"\"")}"`;
};

const toExcelTextCell = (value: unknown) => {
  const text = String(value ?? "").replace(/"/g, "\"\"");
  return `="${text}"`;
};

const toPdfSafeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const toPdfBuffer = (pageStreams: string[], pageWidth = 842, pageHeight = 595) => {
  if (!pageStreams.length) {
    pageStreams = ["BT /F1 10 Tf 40 560 Td (No data) Tj ET"];
  }

  const objectCount = 4 + pageStreams.length * 2;
  const fontRegularObjectId = objectCount - 1;
  const fontBoldObjectId = objectCount;
  const objects = new Map<number, string>();

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pageStreams.map((_page, index) => 3 + index * 2);
  objects.set(
    2,
    `<< /Type /Pages /Count ${pageStreams.length} /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] >>`
  );

  pageStreams.forEach((content, index) => {
    const pageObjectId = 3 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects.set(
      pageObjectId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontRegularObjectId} 0 R /F2 ${fontBoldObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`
    );
    objects.set(contentObjectId, `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  objects.set(fontRegularObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.set(fontBoldObjectId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const orderedIds = Array.from({ length: objectCount }, (_value, index) => index + 1);
  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];

  orderedIds.forEach((id) => {
    offsets[id] = Buffer.byteLength(output, "utf8");
    output += `${id} 0 obj\n${objects.get(id) ?? ""}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(output, "utf8");
  output += `xref\n0 ${objectCount + 1}\n`;
  output += "0000000000 65535 f \n";

  orderedIds.forEach((id) => {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  });

  output += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(output, "utf8");
};

export const buildStockConsumptionHtmlDocument = (payload: StockConsumptionExportPayload) => {
  const statCards = payload.stats
    .map(
      (stat) => `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(stat.label)}</div>
          <div class="stat-value">${escapeHtml(stat.value)}</div>
          ${stat.hint ? `<div class="stat-hint">${escapeHtml(stat.hint)}</div>` : ""}
        </div>
      `
    )
    .join("");

  const headerCells = payload.columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const bodyRows = payload.rows
    .map(
      (row) => `
      <tr>
        ${payload.columns.map((column) => `<td>${escapeHtml(formatCell(row[column.key] ?? null))}</td>`).join("")}
      </tr>
    `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      :root {
        --brand-primary: #c69233;
        --brand-primary-dark: #9a6f22;
        --brand-ink: #2d201b;
        --brand-muted: #705b52;
        --brand-border: #dbc6af;
        --brand-soft: #fff8ed;
        --brand-bg: #f8f6f2;
      }
      body {
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        margin: 20px;
        color: var(--brand-ink);
        background: var(--brand-bg);
      }
      .brand {
        border: 1px solid var(--brand-border);
        border-radius: 14px;
        background: #fffdf9;
        padding: 16px 18px;
        margin-bottom: 14px;
        box-shadow: 0 4px 14px rgba(77, 53, 22, 0.06);
      }
      .brand-row {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: center;
        flex-wrap: wrap;
      }
      .logo-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 144px;
        height: 42px;
        border-radius: 10px;
        background: linear-gradient(135deg, var(--brand-primary), var(--brand-primary-dark));
        color: #fff;
        font-weight: 800;
        letter-spacing: 0.6px;
        font-size: 14px;
      }
      .brand h1 {
        margin: 0 0 6px 0;
        font-size: 22px;
      }
      .brand p {
        margin: 4px 0 0;
        color: var(--brand-muted);
        font-size: 14px;
      }
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 10px;
        margin-bottom: 14px;
      }
      .stat-card {
        border: 1px solid var(--brand-border);
        border-radius: 10px;
        background: var(--brand-soft);
        padding: 10px 12px;
      }
      .stat-label {
        color: var(--brand-muted);
        font-size: 12px;
        font-weight: 600;
      }
      .stat-value {
        font-size: 22px;
        font-weight: 700;
        margin-top: 4px;
      }
      .stat-hint {
        color: #8f7a6b;
        font-size: 12px;
        margin-top: 2px;
      }
      .table-shell {
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid var(--brand-border);
        background: #fff;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        border-bottom: 1px solid #ecdcc9;
        padding: 9px 10px;
        text-align: left;
        font-size: 12px;
      }
      th {
        background: #f3e8d8;
        font-weight: 700;
        color: #5e473b;
      }
      tr:nth-child(even) td {
        background: #fffaf5;
      }
    </style>
  </head>
  <body>
    <section class="brand">
      <div class="brand-row">
        <div>
          <h1>Stock Consumption Report</h1>
          <p>Outlet: ${escapeHtml(payload.outletLabel)}</p>
          <p>Date Range: ${escapeHtml(payload.dateFrom)} to ${escapeHtml(payload.dateTo)}</p>
          <p>Generated At: ${escapeHtml(payload.generatedAt)}</p>
        </div>
        <div class="logo-badge">DIP &amp; DASH</div>
      </div>
    </section>
    <section class="stats">
      ${statCards || "<div class=\"stat-card\"><div class=\"stat-label\">Rows</div><div class=\"stat-value\">0</div></div>"}
    </section>
    <section>
      <div class="table-shell">
        <table>
          <thead>
            <tr>${headerCells}</tr>
          </thead>
          <tbody>
            ${bodyRows || `<tr><td colspan="${payload.columns.length}">No rows available in the selected range.</td></tr>`}
          </tbody>
        </table>
      </div>
    </section>
  </body>
</html>`;
};

export const buildStockConsumptionExcelXml = (payload: StockConsumptionExportPayload) => {
  const lines: string[] = [];
  lines.push("Stock Consumption Report");
  lines.push(`Outlet,${escapeCsv(payload.outletLabel)}`);
  lines.push(`Date Range,${escapeCsv(`${payload.dateFrom} to ${payload.dateTo}`)}`);
  lines.push(`Generated At,${escapeCsv(payload.generatedAt)}`);
  lines.push("");
  lines.push(payload.columns.map((column) => escapeCsv(column.label)).join(","));

  if (!payload.rows.length) {
    lines.push("No rows available in the selected range.");
  } else {
    payload.rows.forEach((row) => {
      lines.push(
        payload.columns
          .map((column) => {
            const value = formatCell(row[column.key] ?? null);
            if (column.key === "date") {
              return toExcelTextCell(value);
            }
            return escapeCsv(value);
          })
          .join(",")
      );
    });
  }

  // BOM helps Excel open UTF-8 CSV safely on Windows.
  return Buffer.from(`\uFEFF${lines.join("\r\n")}`, "utf8");
};

export const buildStockConsumptionPdf = (payload: StockConsumptionExportPayload) => {
  const pageWidth = 842;
  const pageHeight = 595;
  const margin = 24;
  const tableX = margin;
  const tableWidth = pageWidth - margin * 2;
  const rowHeight = 20;
  const maxRowsPerPage = 14;

  const color = {
    header: "0.776 0.573 0.2",
    headerDark: "0.447 0.318 0.129",
    cardBg: "0.996 0.973 0.937",
    tableHeaderBg: "0.953 0.882 0.804",
    border: "0.843 0.745 0.639",
    text: "0.176 0.125 0.106",
    muted: "0.439 0.357 0.321"
  };

  const widthByKey: Record<string, number> = {
    date: 64,
    ingredient: 120,
    unit: 46,
    openingStock: 76,
    purchase: 62,
    dump: 56,
    consumption: 76,
    transferredIn: 72,
    transferredOut: 76,
    totalStock: 78,
    stockHealth: 72
  };

  const columns = payload.columns.map((column) => ({
    ...column,
    width: widthByKey[column.key] ?? 70
  }));

  const totalColumnWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const scale = totalColumnWidth > tableWidth ? tableWidth / totalColumnWidth : 1;
  const scaledColumns = columns.map((column) => ({
    ...column,
    width: Math.max(45, Math.floor(column.width * scale))
  }));

  const truncate = (value: string, maxLength: number) => {
    if (value.length <= maxLength) {
      return value;
    }
    if (maxLength <= 3) {
      return value.slice(0, maxLength);
    }
    return `${value.slice(0, maxLength - 3)}...`;
  };

  const topToBottomY = (topOffset: number) => pageHeight - topOffset;
  const toText = (
    x: number,
    y: number,
    text: string,
    options?: { bold?: boolean; size?: number; colorRgb?: string }
  ) => {
    const font = options?.bold ? "F2" : "F1";
    const size = options?.size ?? 9;
    const colorRgb = options?.colorRgb ?? color.text;
    return `${colorRgb} rg\nBT\n/${font} ${size} Tf\n1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm\n(${toPdfSafeText(text)}) Tj\nET`;
  };

  const dataRows = payload.rows.length
    ? payload.rows
    : [
        payload.columns.reduce<Record<string, string | number | null>>((entry, column, index) => {
          entry[column.key] = index === 0 ? "No rows available in selected range." : "";
          return entry;
        }, {})
      ];

  const rowChunks: ExportRow[][] = [];
  for (let index = 0; index < dataRows.length; index += maxRowsPerPage) {
    rowChunks.push(dataRows.slice(index, index + maxRowsPerPage));
  }

  if (!rowChunks.length) {
    rowChunks.push([]);
  }

  const pageStreams = rowChunks.map((chunk, pageIndex) => {
    const commands: string[] = [];

    commands.push(`${color.header} rg`);
    commands.push(`${margin} ${topToBottomY(84)} ${tableWidth} 58 re f`);
    commands.push(`${color.headerDark} rg`);
    commands.push(`${margin + 12} ${topToBottomY(70)} 124 30 re f`);
    commands.push(toText(margin + 21, topToBottomY(50), "DIP & DASH", { bold: true, size: 11, colorRgb: "1 1 1" }));
    commands.push(toText(margin + 152, topToBottomY(45), "Stock Consumption Report", {
      bold: true,
      size: 16,
      colorRgb: "1 1 1"
    }));
    commands.push(
      toText(margin + 152, topToBottomY(62), `Outlet: ${payload.outletLabel}`, {
        size: 9,
        colorRgb: "1 1 1"
      })
    );
    commands.push(
      toText(margin + 152, topToBottomY(74), `Range: ${payload.dateFrom} to ${payload.dateTo}`, {
        size: 9,
        colorRgb: "1 1 1"
      })
    );

    const visibleStats = payload.stats.slice(0, 6);
    const statWidth = (tableWidth - 20) / 3;
    const statHeight = 40;
    visibleStats.forEach((stat, index) => {
      const rowIndex = Math.floor(index / 3);
      const columnIndex = index % 3;
      const x = margin + columnIndex * (statWidth + 10);
      const yBottom = topToBottomY(95 + rowIndex * (statHeight + 8) + statHeight);
      commands.push(`${color.cardBg} rg`);
      commands.push(`${x.toFixed(2)} ${yBottom.toFixed(2)} ${statWidth.toFixed(2)} ${statHeight} re f`);
      commands.push(`${color.border} RG`);
      commands.push(`${x.toFixed(2)} ${yBottom.toFixed(2)} ${statWidth.toFixed(2)} ${statHeight} re S`);
      commands.push(toText(x + 8, yBottom + statHeight - 14, truncate(String(stat.label), 34), { bold: true, size: 8 }));
      commands.push(toText(x + 8, yBottom + statHeight - 28, truncate(String(stat.value), 36), { bold: true, size: 10 }));
      if (stat.hint) {
        commands.push(
          toText(x + 8, yBottom + statHeight - 38, truncate(String(stat.hint), 38), { size: 7, colorRgb: color.muted })
        );
      }
    });

    const tableTop = 198;
    const tableHeaderHeight = 22;
    const headerBottomY = topToBottomY(tableTop + tableHeaderHeight);
    commands.push(`${color.tableHeaderBg} rg`);
    commands.push(`${tableX} ${headerBottomY} ${tableWidth} ${tableHeaderHeight} re f`);
    commands.push(`${color.border} RG`);
    commands.push(`${tableX} ${headerBottomY} ${tableWidth} ${tableHeaderHeight} re S`);

    let cursorX = tableX;
    scaledColumns.forEach((column) => {
      commands.push(`${color.border} RG`);
      commands.push(`${cursorX.toFixed(2)} ${topToBottomY(tableTop + tableHeaderHeight + chunk.length * rowHeight)} m ${cursorX.toFixed(2)} ${topToBottomY(tableTop)} l S`);
      const maxChars = Math.max(4, Math.floor((column.width - 8) / 5));
      commands.push(toText(cursorX + 4, headerBottomY + 7, truncate(column.label, maxChars), { bold: true, size: 8 }));
      cursorX += column.width;
    });
    commands.push(`${color.border} RG`);
    commands.push(`${(tableX + tableWidth).toFixed(2)} ${topToBottomY(tableTop + tableHeaderHeight + chunk.length * rowHeight)} m ${(tableX + tableWidth).toFixed(2)} ${topToBottomY(tableTop)} l S`);

    chunk.forEach((row, rowIndex) => {
      const rowTop = tableTop + tableHeaderHeight + rowIndex * rowHeight;
      const rowBottomY = topToBottomY(rowTop + rowHeight);

      if (rowIndex % 2 === 1) {
        commands.push("0.996 0.980 0.957 rg");
        commands.push(`${tableX} ${rowBottomY} ${tableWidth} ${rowHeight} re f`);
      }

      commands.push(`${color.border} RG`);
      commands.push(`${tableX} ${rowBottomY} ${tableWidth} ${rowHeight} re S`);

      let x = tableX;
      scaledColumns.forEach((column) => {
        const value = formatCell(row[column.key] ?? null);
        const maxChars = Math.max(4, Math.floor((column.width - 8) / 4.8));
        commands.push(toText(x + 4, rowBottomY + 6, truncate(value, maxChars), { size: 8 }));
        x += column.width;
      });
    });

    commands.push(
      toText(
        margin,
        18,
        `Generated: ${payload.generatedAt}   |   Page ${pageIndex + 1} of ${rowChunks.length}`,
        { size: 8, colorRgb: color.muted }
      )
    );

    return commands.join("\n");
  });

  return toPdfBuffer(pageStreams, pageWidth, pageHeight);
};

export type { StockConsumptionExportPayload };
