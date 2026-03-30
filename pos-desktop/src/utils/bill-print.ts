import logo from "@/assets/logo.png";
import type { PosOrder } from "@/types/pos";

export const COMPANY_NAME = "Kensei Food & Beverages Private Limited";
export const COMPANY_BRANCH = "DIP & DASH PERUNGUDI CHENNAI";
export const COMPANY_ADDRESS = [
  "No. 144, Survey No-56/1A, Corporation Road, Seevaram Village, Perungudi,",
  "Chennai, Tamil Nadu - 600096",
  "Phone: 04424960610"
];
export const COMPANY_REGISTRY = [
  "CIN: U56301TZ2025PTC035161",
  "GSTIN: 33AACCA8432H1ZZ",
  "FSSAI: 22426550000259"
];

export const formatRs = (value: number) =>
  `Rs.${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(Math.round(Number.isFinite(value) ? value : 0))}`;

export const getLineBaseTotal = (line: PosOrder["lines"][number]) => line.unitPrice * line.quantity;

const formatPaymentMode = (mode: PosOrder["paymentMode"]) => (mode ? mode.toUpperCase() : "-");

export const buildBillDocumentHtml = (order: PosOrder, cashierName?: string | null) => {
  const totalDiscount =
    order.totals.couponDiscountAmount + order.totals.manualDiscountAmount + order.totals.itemDiscountAmount;
  const rows = order.lines.length
    ? order.lines
        .map((line) => {
          const addOnRows = line.addOns
            .map(
              (addOn) => `
                  <tr>
                    <td style="padding-left:16px;color:#355274;">+ ${addOn.name}</td>
                    <td style="text-align:center;">${Math.round(addOn.quantity * line.quantity)}</td>
                    <td style="text-align:right;">${formatRs(addOn.unitPrice)}</td>
                    <td style="text-align:right;">${formatRs(addOn.unitPrice * addOn.quantity * line.quantity)}</td>
                  </tr>
                `
            )
            .join("");
          return `
            <tr>
              <td>${line.name}</td>
              <td style="text-align:center;">${Math.round(line.quantity)}</td>
              <td style="text-align:right;">${formatRs(line.unitPrice)}</td>
              <td style="text-align:right;">${formatRs(getLineBaseTotal(line))}</td>
            </tr>
            ${addOnRows}
          `;
        })
        .join("")
    : `<tr><td colspan="4" style="padding-top:8px;color:#355274;">No items available in invoice payload.</td></tr>`;

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${order.invoiceNumber}</title>
        <style>
          body { font-family: "Courier New", monospace; background: #f8f8f8; margin: 0; padding: 18px; color: #11223B; }
          .bill { max-width: 780px; margin: 0 auto; background: #fff; border: 1px dashed #C5D2E3; border-radius: 12px; padding: 24px 28px; }
          .center { text-align: center; }
          .line { border-top: 1px dashed #A8BACF; margin-top: 14px; padding-top: 12px; }
          .row { display: flex; justify-content: space-between; gap: 16px; }
          .small { font-size: 13px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          th, td { padding: 3px 2px; vertical-align: top; }
          th { text-align: left; }
          .final { display:flex; justify-content:space-between; border-top:1px dashed #A8BACF; margin-top:8px; padding-top:8px; font-size:31px; font-weight:900; color:#001C45; }
        </style>
      </head>
      <body>
        <div class="bill">
          <div class="center">
            <div style="display:inline-flex;align-items:center;justify-content:center;border:1px solid #D4DDEB;background:#fff;border-radius:999px;padding:8px;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
              <img src="${logo}" alt="Dip & Dash logo" style="height:36px;width:36px;object-fit:contain;" />
            </div>
            <div style="font-weight:800;font-size:20px;letter-spacing:0.7px;margin-top:8px;">${COMPANY_NAME}</div>
            <div style="font-weight:700;font-size:14px;margin-top:4px;">${COMPANY_BRANCH}</div>
            <div class="small" style="line-height:1.35;margin-top:6px;">${COMPANY_ADDRESS.join("<br/>")}</div>
          </div>

          <div class="line center small">${COMPANY_REGISTRY.join("<br/>")}</div>

          <div class="line">
            <div class="center" style="font-weight:700;letter-spacing:0.8px;">TAX INVOICE</div>
            <div class="row small" style="margin-top:8px;">
              <div><b>Bill No:</b> ${order.invoiceNumber}</div>
              <div><b>Bill Dt:</b> ${new Date(order.createdAt).toISOString().slice(0, 10)}</div>
            </div>
            <div class="row small" style="margin-top:4px;">
              <div><b>Customer:</b> ${order.customer?.name ?? "Walk-in Customer"}</div>
              <div><b>Cashier:</b> ${cashierName ?? "-"}</div>
            </div>
            <div class="row small" style="margin-top:4px;">
              <div><b>Payment Mode:</b> ${formatPaymentMode(order.paymentMode)}</div>
              <div></div>
            </div>
            ${
              order.orderType === "dine_in"
                ? `<div class="row small" style="margin-top:4px;"><div><b>Table:</b> ${order.tableLabel ?? "-"}</div><div></div></div>`
                : ""
            }
          </div>

          <div class="line">
            <div style="font-weight:700;margin-bottom:6px;">Items List</div>
            <table>
              <thead>
                <tr>
                  <th style="width:50%;">Item</th>
                  <th style="width:16%;text-align:center;">Qty</th>
                  <th style="width:17%;text-align:right;">Price</th>
                  <th style="width:17%;text-align:right;">Total</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>

          <div class="line small">
            <div class="row"><div>Subtotal</div><div>${formatRs(order.totals.subtotal)}</div></div>
            <div class="row"><div>Total GST</div><div>${formatRs(order.totals.taxAmount)}</div></div>
            <div class="row"><div>Manual Discount</div><div>${formatRs(order.totals.manualDiscountAmount)}</div></div>
            <div class="row"><div>Coupon Discount</div><div>${formatRs(order.totals.couponDiscountAmount)}</div></div>
            <div class="row"><div>Total Discount</div><div>${formatRs(totalDiscount)}</div></div>
            <div class="final"><div>Final Amount</div><div>${formatRs(order.totals.totalAmount)}</div></div>
          </div>

          <div class="center" style="margin-top:20px;font-size:14px;color:#355274;">
            <div>Thank you. Visit again.</div>
            <div style="margin-top:4px;">Follow us on Instagram</div>
            <div style="margin-top:6px;font-weight:700;">@dip_dash_</div>
          </div>
        </div>
      </body>
    </html>
  `;
};

export const openBillInPrintFrame = (billHtml: string) => {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    iframe.remove();
    return false;
  }

  frameWindow.document.open();
  frameWindow.document.write(billHtml);
  frameWindow.document.close();

  window.setTimeout(() => {
    try {
      frameWindow.focus();
      frameWindow.print();
    } finally {
      window.setTimeout(() => iframe.remove(), 800);
    }
  }, 120);

  return true;
};
