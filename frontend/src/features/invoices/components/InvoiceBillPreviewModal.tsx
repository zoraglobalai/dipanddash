import {
  Box,
  HStack,
  Image,
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

import logo from "@/assets/logo.png";
import { AppButton } from "@/components/ui/AppButton";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useModalCloseGuard } from "@/hooks/useModalCloseGuard";
import type { InvoiceDetail, InvoiceLineRow } from "@/types/invoice";

type InvoiceBillPreviewModalProps = {
  isOpen: boolean;
  onClose: () => void;
  invoice: InvoiceDetail | null;
  lines: InvoiceLineRow[];
  loading?: boolean;
};

type InvoiceLineAddOn = {
  addOnId: string | undefined;
  name: string;
  quantity: number;
  unitPrice: number;
};

const toRounded = (value: number) => Math.round(Number.isFinite(value) ? value : 0);

const formatRs = (value: number) =>
  `Rs.${new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0
  }).format(toRounded(value))}`;

const formatDate = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }
  return new Date(value).toISOString().slice(0, 10);
};

const formatPaymentMode = (mode: InvoiceDetail["paymentMode"] | null | undefined) =>
  mode ? mode.toUpperCase() : "-";

const parseLineAddOns = (line: InvoiceLineRow): InvoiceLineAddOn[] => {
  const addOns = (line.meta as { addOns?: unknown } | null)?.addOns;
  if (!Array.isArray(addOns)) {
    return [];
  }

  return addOns
    .map((entry) => {
      const record = entry as Partial<InvoiceLineAddOn>;
      const name = typeof record.name === "string" ? record.name : "";
      const quantity = Number(record.quantity);
      const unitPrice = Number(record.unitPrice);
      if (!name || !Number.isFinite(quantity) || !Number.isFinite(unitPrice)) {
        return null;
      }
      return {
        addOnId: typeof record.addOnId === "string" ? record.addOnId : undefined,
        name,
        quantity,
        unitPrice
      } satisfies InvoiceLineAddOn;
    })
    .filter((entry): entry is InvoiceLineAddOn => Boolean(entry));
};

const buildBillDocumentHtml = (invoice: InvoiceDetail, lines: InvoiceLineRow[]) => {
  const rowHtml = lines.length
    ? lines
        .map((line) => {
          const addOns = parseLineAddOns(line);
          const addOnRows = addOns
            .map(
              (addOn) => `
                <tr>
                  <td style="padding-left:16px;color:#355274;">+ ${addOn.name}</td>
                  <td style="text-align:center;">${toRounded(addOn.quantity * line.quantity)}</td>
                  <td style="text-align:right;">${formatRs(addOn.unitPrice)}</td>
                  <td style="text-align:right;">${formatRs(addOn.unitPrice * addOn.quantity * line.quantity)}</td>
                </tr>
              `
            )
            .join("");
          const addOnTotal = addOns.reduce(
            (sum, addOn) => sum + addOn.unitPrice * addOn.quantity * line.quantity,
            0
          );
          const baseTotal = line.lineTotal - addOnTotal;
          return `
            <tr>
              <td>${line.nameSnapshot}</td>
              <td style="text-align:center;">${toRounded(line.quantity)}</td>
              <td style="text-align:right;">${formatRs(line.unitPrice)}</td>
              <td style="text-align:right;">${formatRs(baseTotal)}</td>
            </tr>
            ${addOnRows}
          `;
        })
        .join("")
    : `<tr><td colspan="4" style="padding-top:8px;color:#355274;">No items available in invoice payload.</td></tr>`;

  const totalDiscount = toRounded(
    (invoice.itemDiscountAmount ?? 0) +
      (invoice.couponDiscountAmount ?? 0) +
      (invoice.manualDiscountAmount ?? 0)
  );

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${invoice.invoiceNumber}</title>
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
            <img src="${logo}" alt="Dip & Dash logo" style="height:30px;object-fit:contain;" />
            <div style="font-weight:800;font-size:20px;letter-spacing:0.7px;margin-top:8px;">Kensei Food & Beverages Private Limited</div>
            <div style="font-weight:700;font-size:14px;margin-top:4px;">DIP & DASH PERUNGUDI CHENNAI</div>
            <div class="small" style="line-height:1.35;margin-top:6px;">No. 144, Survey No-56/1A, Corporation Road, Seevaram Village, Perungudi,<br/>Chennai, Tamil Nadu - 600096<br/>Phone: 04424960610</div>
          </div>

          <div class="line center small">CIN: U56301TZ2025PTC035161<br/>GSTIN: 33AACCA8432H1ZZ<br/>FSSAI: 22426550000259</div>

          <div class="line">
            <div class="center" style="font-weight:700;letter-spacing:0.8px;">TAX INVOICE</div>
            <div class="row small" style="margin-top:8px;">
              <div><b>Bill No:</b> ${invoice.invoiceNumber}</div>
              <div><b>Bill Dt:</b> ${formatDate(invoice.createdAt)}</div>
            </div>
            <div class="row small" style="margin-top:4px;">
              <div><b>Customer:</b> ${invoice.customer?.name ?? "Walk-in Customer"}</div>
              <div><b>Cashier:</b> ${invoice.staff?.fullName ?? "-"}</div>
            </div>
            <div class="row small" style="margin-top:4px;">
              <div><b>Payment Mode:</b> ${formatPaymentMode(invoice.paymentMode)}</div>
              <div></div>
            </div>
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
              <tbody>${rowHtml}</tbody>
            </table>
          </div>

          <div class="line small">
            <div class="row"><div>Subtotal</div><div>${formatRs(invoice.subtotal)}</div></div>
            <div class="row"><div>Total GST</div><div>${formatRs(invoice.taxAmount)}</div></div>
            <div class="row"><div>Manual Discount</div><div>${formatRs(invoice.manualDiscountAmount)}</div></div>
            <div class="row"><div>Coupon Discount</div><div>${formatRs(invoice.couponDiscountAmount)}</div></div>
            <div class="row"><div>Total Discount</div><div>${formatRs(totalDiscount)}</div></div>
            <div class="final"><div>Final Amount</div><div>${formatRs(invoice.totalAmount)}</div></div>
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

export const InvoiceBillPreviewModal = ({
  isOpen,
  onClose,
  invoice,
  lines,
  loading
}: InvoiceBillPreviewModalProps) => {
  const { isCloseConfirmOpen, requestClose, cancelCloseRequest, confirmClose } = useModalCloseGuard(onClose);

  const openPrintDocument = () => {
    if (!invoice) {
      return;
    }
    const documentHtml = buildBillDocumentHtml(invoice, lines);

    const popup = window.open("", "_blank", "width=850,height=980");
    if (!popup) {
      return;
    }
    popup.document.write(documentHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  const totalDiscount = toRounded(
    (invoice?.itemDiscountAmount ?? 0) +
      (invoice?.couponDiscountAmount ?? 0) +
      (invoice?.manualDiscountAmount ?? 0)
  );

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={requestClose}
        size="4xl"
        isCentered
        scrollBehavior="inside"
        closeOnOverlayClick={false}
        closeOnEsc={false}
      >
        <ModalOverlay />
        <ModalContent borderRadius="18px">
          <ModalHeader>Tax Invoice Preview</ModalHeader>
          <ModalCloseButton />
          <ModalBody bg="#F8F8F8">
            {loading || !invoice ? (
              <Text color="#6E5A51">Loading invoice preview...</Text>
            ) : (
              <Box
                id="invoice-bill-template"
                maxW="780px"
                mx="auto"
                bg="white"
                border="1px dashed"
                borderColor="#C5D2E3"
                borderRadius="12px"
                px={{ base: 4, md: 8 }}
                py={{ base: 4, md: 6 }}
                fontFamily="'Courier New', monospace"
                color="#11223B"
              >
                <VStack spacing={2} align="center">
                  <Image src={logo} alt="Dip & Dash logo" h="30px" objectFit="contain" />
                  <Text fontWeight={800} fontSize="lg" letterSpacing="0.7px" textAlign="center">
                    Kensei Food & Beverages Private Limited
                  </Text>
                  <Text fontWeight={700} fontSize="sm" textAlign="center">
                    DIP & DASH PERUNGUDI CHENNAI
                  </Text>
                  <Text fontSize="sm" textAlign="center" lineHeight={1.35}>
                    No. 144, Survey No-56/1A, Corporation Road, Seevaram Village, Perungudi,
                    <br />
                    Chennai, Tamil Nadu - 600096
                    <br />
                    Phone: 04424960610
                  </Text>
                </VStack>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text fontSize="sm" textAlign="center">
                    CIN: U56301TZ2025PTC035161
                    <br />
                    GSTIN: 33AACCA8432H1ZZ
                    <br />
                    FSSAI: 22426550000259
                  </Text>
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text textAlign="center" fontWeight={700} letterSpacing="0.8px">
                    TAX INVOICE
                  </Text>
                  <HStack justify="space-between" mt={2} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Bill No:
                      </Text>{" "}
                      {invoice.invoiceNumber}
                    </Text>
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Bill Dt:
                      </Text>{" "}
                      {formatDate(invoice.createdAt)}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" mt={1} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Customer:
                      </Text>{" "}
                      {invoice.customer?.name ?? "Walk-in Customer"}
                    </Text>
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Cashier:
                      </Text>{" "}
                      {invoice.staff?.fullName ?? "-"}
                    </Text>
                  </HStack>
                  <HStack justify="space-between" mt={1} fontSize="sm">
                    <Text>
                      <Text as="span" fontWeight={700}>
                        Payment Mode:
                      </Text>{" "}
                      {formatPaymentMode(invoice.paymentMode)}
                    </Text>
                    <Text />
                  </HStack>
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <Text fontWeight={700} mb={2}>
                    Items List
                  </Text>
                  <HStack fontSize="sm" fontWeight={700} px={1}>
                    <Text flex={2}>Item</Text>
                    <Text flex={1} textAlign="center">
                      Qty
                    </Text>
                    <Text flex={1} textAlign="right">
                      Price
                    </Text>
                    <Text flex={1} textAlign="right">
                      Total
                    </Text>
                  </HStack>
                  <VStack align="stretch" spacing={1} mt={1}>
                    {lines.length ? (
                      lines.map((line) => {
                        const addOns = parseLineAddOns(line);
                        const addOnTotal = addOns.reduce(
                          (sum, addOn) => sum + addOn.unitPrice * addOn.quantity * line.quantity,
                          0
                        );
                        const baseTotal = line.lineTotal - addOnTotal;

                        return (
                          <VStack key={line.id} spacing={1} align="stretch">
                            <HStack fontSize="sm" px={1} align="start">
                              <Text flex={2}>{line.nameSnapshot}</Text>
                              <Text flex={1} textAlign="center">
                                {toRounded(line.quantity)}
                              </Text>
                              <Text flex={1} textAlign="right">
                                {formatRs(line.unitPrice)}
                              </Text>
                              <Text flex={1} textAlign="right">
                                {formatRs(baseTotal)}
                              </Text>
                            </HStack>
                            {addOns.map((addOn) => (
                              <HStack key={`${line.id}-${addOn.addOnId ?? addOn.name}`} fontSize="sm" px={1} color="#355274">
                                <Text flex={2} pl={3}>
                                  + {addOn.name}
                                </Text>
                                <Text flex={1} textAlign="center">
                                  {toRounded(addOn.quantity * line.quantity)}
                                </Text>
                                <Text flex={1} textAlign="right">
                                  {formatRs(addOn.unitPrice)}
                                </Text>
                                <Text flex={1} textAlign="right">
                                  {formatRs(addOn.unitPrice * addOn.quantity * line.quantity)}
                                </Text>
                              </HStack>
                            ))}
                          </VStack>
                        );
                      })
                    ) : (
                      <Text fontSize="sm" px={1} color="#355274">
                        No items available in invoice payload.
                      </Text>
                    )}
                  </VStack>
                </Box>

                <Box borderTop="1px dashed" borderColor="#A8BACF" mt={4} pt={3}>
                  <VStack align="stretch" spacing={1} fontSize="sm">
                    <HStack justify="space-between">
                      <Text>Subtotal</Text>
                      <Text>{formatRs(invoice.subtotal)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Total GST</Text>
                      <Text>{formatRs(invoice.taxAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Manual Discount</Text>
                      <Text>{formatRs(invoice.manualDiscountAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Coupon Discount</Text>
                      <Text>{formatRs(invoice.couponDiscountAmount)}</Text>
                    </HStack>
                    <HStack justify="space-between">
                      <Text>Total Discount</Text>
                      <Text>{formatRs(totalDiscount)}</Text>
                    </HStack>
                  </VStack>

                  <HStack
                    justify="space-between"
                    borderTop="1px dashed"
                    borderColor="#A8BACF"
                    mt={2}
                    pt={2}
                    fontSize="2xl"
                    fontWeight={900}
                    color="#001C45"
                  >
                    <Text>Final Amount</Text>
                    <Text>{formatRs(invoice.totalAmount)}</Text>
                  </HStack>
                </Box>

                <VStack mt={6} spacing={1} textAlign="center" color="#355274">
                  <Text fontSize="sm">Thank you. Visit again.</Text>
                  <Text fontSize="sm">Follow us on Instagram</Text>
                  <Text fontSize="sm" fontWeight={700}>
                    @dip_dash_
                  </Text>
                </VStack>
              </Box>
            )}
          </ModalBody>
          <ModalFooter gap={2}>
            <AppButton variant="outline" onClick={requestClose}>
              Close
            </AppButton>
            <AppButton onClick={() => openPrintDocument()} isDisabled={loading || !invoice}>
              Print
            </AppButton>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <ConfirmDialog
        isOpen={isCloseConfirmOpen}
        title="Close bill preview?"
        description="Are you sure you want to close this bill preview?"
        onClose={cancelCloseRequest}
        onConfirm={confirmClose}
      />
    </>
  );
};
