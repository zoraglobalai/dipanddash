import { SelectQueryBuilder } from "typeorm";

import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Invoice } from "../invoices/invoice.entity";
import { Customer } from "./customer.entity";

type CustomerSection = "dip_and_dash" | "gaming";
type CustomerScope = "all" | "dip_and_dash" | "snooker";

type PaginationInput = {
  page: number;
  limit: number;
};

type CustomerListInput = PaginationInput & {
  search?: string;
  scope?: CustomerScope;
};

type CustomerStatsInput = {
  scope?: CustomerScope;
  topPage: number;
  topLimit: number;
};

type CustomerCreateInput = {
  name: string;
  phone: string;
  section?: CustomerSection;
  email?: string;
  notes?: string;
  sourceDeviceId?: string;
  createdByUserId?: string;
};

type CustomerUpdateInput = Partial<{
  name: string;
  phone: string;
  section: CustomerSection;
  email: string;
  notes: string;
  isActive: boolean;
}>;

const normalizePhone = (value: string) => value.replace(/[^\d+]/g, "").trim();

const cleanOptionalText = (value?: string | null) => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const getPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit))
});

const scopeToSection = (scope?: CustomerScope): CustomerSection | undefined => {
  if (scope === "snooker") {
    return "gaming";
  }
  if (scope === "dip_and_dash") {
    return "dip_and_dash";
  }
  return undefined;
};

const scopeToInvoiceCondition = (scope?: CustomerScope, alias = "invoice") => {
  if (scope === "snooker") {
    return `${alias}."orderType" = 'snooker'`;
  }
  if (scope === "dip_and_dash") {
    return `${alias}."orderType" != 'snooker'`;
  }
  return "1 = 1";
};

export class CustomersService {
  private readonly customerRepository = AppDataSource.getRepository(Customer);
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);

  private applyCustomerScopeFilter(query: SelectQueryBuilder<Customer>, scope?: CustomerScope) {
    const section = scopeToSection(scope);
    if (!section) {
      return;
    }

    if (scope === "snooker") {
      query.andWhere(
        `(
          customer.section = :customerSection
          OR EXISTS (
            SELECT 1
            FROM invoices scoped_invoice
            WHERE scoped_invoice."customerId" = customer.id
              AND scoped_invoice."orderType" = :snookerOrderType
          )
          OR EXISTS (
            SELECT 1
            FROM gaming_bookings booking
            WHERE booking."bookingType" = :snookerBookingType
              AND (
                regexp_replace(COALESCE(booking."primaryCustomerPhone", ''), '[^0-9+]', '', 'g') = customer.phone
                OR EXISTS (
                  SELECT 1
                  FROM jsonb_array_elements(COALESCE(booking."customerGroup", '[]'::jsonb)) AS customer_member
                  WHERE regexp_replace(COALESCE(customer_member->>'phone', ''), '[^0-9+]', '', 'g') = customer.phone
                )
              )
          )
        )`,
        {
          customerSection: section,
          snookerOrderType: "snooker",
          snookerBookingType: "snooker"
        }
      );
      return;
    }

    query.andWhere(
      `(
        customer.section = :customerSection
        OR EXISTS (
          SELECT 1
          FROM invoices scoped_invoice
          WHERE scoped_invoice."customerId" = customer.id
            AND scoped_invoice."orderType" != :snookerOrderType
        )
      )`,
      {
        customerSection: section,
        snookerOrderType: "snooker"
      }
    );
  }

  async listCustomers(input: CustomerListInput) {
    const query = this.customerRepository.createQueryBuilder("customer");

    this.applyCustomerScopeFilter(query, input.scope);

    if (input.search?.trim()) {
      const search = `%${input.search.trim()}%`;
      query.andWhere(
        "(LOWER(customer.name) LIKE LOWER(:search) OR customer.phone LIKE :search OR LOWER(COALESCE(customer.email, '')) LIKE LOWER(:search))",
        { search }
      );
    }

    const total = await query.getCount();
    const invoiceScopeCondition = scopeToInvoiceCondition(input.scope, "invoice");

    const rows = await query
      .clone()
      .leftJoin(Invoice, "invoice", `invoice.customerId = customer.id AND ${invoiceScopeCondition}`)
      .select("customer.id", "id")
      .addSelect("customer.name", "name")
      .addSelect("customer.phone", "phone")
      .addSelect("customer.section", "section")
      .addSelect("customer.email", "email")
      .addSelect("customer.notes", "notes")
      .addSelect("customer.sourceDeviceId", "sourceDeviceId")
      .addSelect("customer.createdByUserId", "createdByUserId")
      .addSelect("customer.isActive", "isActive")
      .addSelect("customer.createdAt", "createdAt")
      .addSelect("customer.updatedAt", "updatedAt")
      .addSelect("COUNT(invoice.id)", "invoiceCount")
      .addSelect(
        "COALESCE(SUM(CASE WHEN invoice.status = 'paid' THEN invoice.totalAmount ELSE 0 END), 0)",
        "totalSpent"
      )
      .addSelect("MAX(invoice.createdAt)", "lastInvoiceAt")
      .groupBy("customer.id")
      .addGroupBy("customer.name")
      .addGroupBy("customer.phone")
      .addGroupBy("customer.section")
      .addGroupBy("customer.email")
      .addGroupBy("customer.notes")
      .addGroupBy("customer.sourceDeviceId")
      .addGroupBy("customer.createdByUserId")
      .addGroupBy("customer.isActive")
      .addGroupBy("customer.createdAt")
      .addGroupBy("customer.updatedAt")
      .orderBy("customer.createdAt", "DESC")
      .offset((input.page - 1) * input.limit)
      .limit(input.limit)
      .getRawMany<{
        id: string;
        name: string;
        phone: string;
        section: CustomerSection;
        email: string | null;
        notes: string | null;
        sourceDeviceId: string | null;
        createdByUserId: string | null;
        isActive: boolean | string | number;
        createdAt: string;
        updatedAt: string;
        invoiceCount: string;
        totalSpent: string;
        lastInvoiceAt: string | null;
      }>();

    const customers = rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      section: row.section,
      email: row.email,
      notes: row.notes,
      sourceDeviceId: row.sourceDeviceId,
      createdByUserId: row.createdByUserId,
      isActive:
        row.isActive === true ||
        row.isActive === "true" ||
        row.isActive === "t" ||
        row.isActive === 1 ||
        row.isActive === "1",
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      invoiceCount: Number(row.invoiceCount ?? 0),
      totalSpent: Number(Number(row.totalSpent ?? 0).toFixed(2)),
      lastInvoiceAt: row.lastInvoiceAt
    }));

    return {
      customers,
      pagination: getPaginationMeta(input.page, input.limit, total)
    };
  }

  async getCustomerStats(input: CustomerStatsInput) {
    const scope = input.scope;
    const topPage = Math.max(1, input.topPage);
    const topLimit = Math.max(1, input.topLimit);
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const invoiceScopeCondition = scopeToInvoiceCondition(scope, "invoice");
    const innerInvoiceScopeCondition = scopeToInvoiceCondition(scope, "inner_invoice");
    const customerCountQuery = this.customerRepository.createQueryBuilder("customer");
    const activeCustomerQuery = this.customerRepository
      .createQueryBuilder("customer")
      .where("customer.isActive = true");
    const newCustomersQuery = this.customerRepository
      .createQueryBuilder("customer")
      .where("customer.createdAt >= :monthStart", { monthStart });
    this.applyCustomerScopeFilter(customerCountQuery, scope);
    this.applyCustomerScopeFilter(activeCustomerQuery, scope);
    this.applyCustomerScopeFilter(newCustomersQuery, scope);

    const topCustomersQuery = this.customerRepository
      .createQueryBuilder("customer")
      .leftJoin(Invoice, "invoice", `invoice.customerId = customer.id AND invoice.status = 'paid' AND ${invoiceScopeCondition}`)
      .select("customer.id", "id")
      .addSelect("customer.name", "name")
      .addSelect("customer.phone", "phone")
      .addSelect("COUNT(invoice.id)", "invoiceCount")
      .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "totalSpent")
      .addSelect("MAX(invoice.createdAt)", "lastInvoiceAt")
      .groupBy("customer.id")
      .addGroupBy("customer.name")
      .addGroupBy("customer.phone")
      .having("COUNT(invoice.id) > 0")
      .orderBy("COALESCE(SUM(invoice.totalAmount), 0)", "DESC")
      .addOrderBy("COUNT(invoice.id)", "DESC")
      .offset((topPage - 1) * topLimit)
      .limit(topLimit);
    this.applyCustomerScopeFilter(topCustomersQuery, scope);

    const [totalCustomers, activeCustomers, newCustomersThisMonth, paidSummary, repeatCustomers, topCustomers] =
      await Promise.all([
        customerCountQuery.getCount(),
        activeCustomerQuery.getCount(),
        newCustomersQuery.getCount(),
        this.invoiceRepository
          .createQueryBuilder("invoice")
          .select("COUNT(DISTINCT invoice.customerId)", "customersWithOrders")
          .addSelect("COUNT(invoice.id)", "paidInvoices")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "revenue")
          .addSelect("COALESCE(AVG(invoice.totalAmount), 0)", "averageOrderValue")
          .where("invoice.status = 'paid'")
          .andWhere(invoiceScopeCondition)
          .andWhere("invoice.customerId IS NOT NULL")
          .getRawOne<{
            customersWithOrders: string;
            paidInvoices: string;
            revenue: string;
            averageOrderValue: string;
          }>(),
        this.invoiceRepository
          .createQueryBuilder("invoice")
          .select("COUNT(*)", "repeatCustomers")
          .from((subQuery) => {
            return subQuery
              .select("inner_invoice.customerId", "customerId")
              .addSelect("COUNT(inner_invoice.id)", "invoiceCount")
              .from(Invoice, "inner_invoice")
              .where("inner_invoice.status = 'paid'")
              .andWhere(innerInvoiceScopeCondition)
              .andWhere("inner_invoice.customerId IS NOT NULL")
              .groupBy("inner_invoice.customerId")
              .having("COUNT(inner_invoice.id) > 1");
          }, "repeat_data")
          .getRawOne<{ repeatCustomers: string }>(),
        topCustomersQuery.getRawMany<{
            id: string;
            name: string;
            phone: string;
            invoiceCount: string;
            totalSpent: string;
            lastInvoiceAt: string | null;
          }>()
      ]);

    return {
      totalCustomers,
      activeCustomers,
      newCustomersThisMonth,
      customersWithOrders: Number(paidSummary?.customersWithOrders ?? 0),
      repeatCustomers: Number(repeatCustomers?.repeatCustomers ?? 0),
      paidInvoices: Number(paidSummary?.paidInvoices ?? 0),
      totalRevenue: Number(Number(paidSummary?.revenue ?? 0).toFixed(2)),
      averageOrderValue: Number(Number(paidSummary?.averageOrderValue ?? 0).toFixed(2)),
      topCustomers: topCustomers.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        invoiceCount: Number(row.invoiceCount ?? 0),
        totalSpent: Number(Number(row.totalSpent ?? 0).toFixed(2)),
        lastInvoiceAt: row.lastInvoiceAt
      })),
      topCustomersPagination: getPaginationMeta(
        topPage,
        topLimit,
        Number(paidSummary?.customersWithOrders ?? 0)
      )
    };
  }

  async searchCustomersByPhone(input: {
    phone?: string;
    search?: string;
    scope?: CustomerScope;
    page: number;
    limit: number;
  }) {
    const query = this.customerRepository
      .createQueryBuilder("customer")
      .orderBy("customer.updatedAt", "DESC")
      .skip((input.page - 1) * input.limit)
      .take(input.limit);

    if (input.phone?.trim()) {
      const normalizedPhone = normalizePhone(input.phone);
      query.andWhere("customer.phone LIKE :phone", { phone: `%${normalizedPhone}%` });
    }

    if (input.search?.trim()) {
      const search = `%${input.search.trim()}%`;
      query.andWhere(
        "(LOWER(customer.name) LIKE LOWER(:search) OR customer.phone LIKE :search OR LOWER(COALESCE(customer.email, '')) LIKE LOWER(:search))",
        { search }
      );
    }
    if (input.scope) {
      this.applyCustomerScopeFilter(query, input.scope);
    }

    const [customers, total] = await query.getManyAndCount();
    return {
      customers,
      pagination: getPaginationMeta(input.page, input.limit, total)
    };
  }

  async getCustomer(id: string) {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new AppError(404, "Customer not found");
    }
    return customer;
  }

  async createCustomer(input: CustomerCreateInput) {
    const normalizedPhone = normalizePhone(input.phone);
    const section = input.section ?? "dip_and_dash";
    if (!normalizedPhone) {
      throw new AppError(422, "Please provide a valid phone number");
    }

    const existing = await this.customerRepository.findOne({
      where: { phone: normalizedPhone, section }
    });
    if (existing) {
      throw new AppError(409, "Customer with this phone number already exists");
    }

    const customer = this.customerRepository.create({
      name: input.name.trim(),
      phone: normalizedPhone,
      section,
      email: cleanOptionalText(input.email) ?? null,
      notes: cleanOptionalText(input.notes) ?? null,
      sourceDeviceId: cleanOptionalText(input.sourceDeviceId) ?? null,
      createdByUserId: input.createdByUserId ?? null,
      isActive: true
    });

    return this.customerRepository.save(customer);
  }

  async upsertCustomerFromPos(input: CustomerCreateInput) {
    const normalizedPhone = normalizePhone(input.phone);
    const section = input.section ?? "dip_and_dash";
    if (!normalizedPhone) {
      throw new AppError(422, "Please provide a valid phone number");
    }

    const existing = await this.customerRepository.findOne({
      where: { phone: normalizedPhone, section }
    });

    if (!existing) {
      const created = this.customerRepository.create({
        name: input.name.trim(),
        phone: normalizedPhone,
        section,
        email: cleanOptionalText(input.email) ?? null,
        notes: cleanOptionalText(input.notes) ?? null,
        sourceDeviceId: cleanOptionalText(input.sourceDeviceId) ?? null,
        createdByUserId: input.createdByUserId ?? null,
        isActive: true
      });
      return this.customerRepository.save(created);
    }

    existing.name = input.name.trim() || existing.name;
    if (input.email !== undefined) {
      existing.email = cleanOptionalText(input.email) ?? null;
    }
    if (input.notes !== undefined) {
      existing.notes = cleanOptionalText(input.notes) ?? null;
    }
    if (input.sourceDeviceId !== undefined) {
      existing.sourceDeviceId = cleanOptionalText(input.sourceDeviceId) ?? null;
    }

    return this.customerRepository.save(existing);
  }

  async updateCustomer(id: string, input: CustomerUpdateInput) {
    const customer = await this.getCustomer(id);
    const nextSection = input.section ?? customer.section;

    if (input.phone !== undefined) {
      const normalizedPhone = normalizePhone(input.phone);
      if (!normalizedPhone) {
        throw new AppError(422, "Please provide a valid phone number");
      }

      const duplicate = await this.customerRepository.findOne({
        where: { phone: normalizedPhone, section: nextSection }
      });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, "Customer with this phone number already exists");
      }
      customer.phone = normalizedPhone;
    }

    if (input.section !== undefined) {
      const duplicate = await this.customerRepository.findOne({
        where: { phone: customer.phone, section: input.section }
      });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, "Customer with this phone number already exists in this business");
      }
      customer.section = input.section;
    }

    if (input.name !== undefined) {
      customer.name = input.name.trim();
    }
    if (input.email !== undefined) {
      customer.email = cleanOptionalText(input.email) ?? null;
    }
    if (input.notes !== undefined) {
      customer.notes = cleanOptionalText(input.notes) ?? null;
    }
    if (input.isActive !== undefined) {
      customer.isActive = input.isActive;
    }

    return this.customerRepository.save(customer);
  }
}
