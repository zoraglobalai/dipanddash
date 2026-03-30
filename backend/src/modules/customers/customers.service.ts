import { AppDataSource } from "../../database/data-source";
import { AppError } from "../../errors/app-error";
import { Invoice } from "../invoices/invoice.entity";
import { Customer } from "./customer.entity";

type PaginationInput = {
  page: number;
  limit: number;
};

type CustomerListInput = PaginationInput & {
  search?: string;
};

type CustomerCreateInput = {
  name: string;
  phone: string;
  email?: string;
  notes?: string;
  sourceDeviceId?: string;
  createdByUserId?: string;
};

type CustomerUpdateInput = Partial<{
  name: string;
  phone: string;
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

export class CustomersService {
  private readonly customerRepository = AppDataSource.getRepository(Customer);
  private readonly invoiceRepository = AppDataSource.getRepository(Invoice);

  async listCustomers(input: CustomerListInput) {
    const query = this.customerRepository.createQueryBuilder("customer");

    if (input.search?.trim()) {
      const search = `%${input.search.trim()}%`;
      query.andWhere(
        "(LOWER(customer.name) LIKE LOWER(:search) OR customer.phone LIKE :search OR LOWER(COALESCE(customer.email, '')) LIKE LOWER(:search))",
        { search }
      );
    }

    const total = await query.getCount();

    const rows = await query
      .clone()
      .leftJoin(Invoice, "invoice", "invoice.customerId = customer.id")
      .select("customer.id", "id")
      .addSelect("customer.name", "name")
      .addSelect("customer.phone", "phone")
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
      .addGroupBy("customer.email")
      .addGroupBy("customer.notes")
      .addGroupBy("customer.sourceDeviceId")
      .addGroupBy("customer.createdByUserId")
      .addGroupBy("customer.isActive")
      .addGroupBy("customer.createdAt")
      .addGroupBy("customer.updatedAt")
      .orderBy("customer.createdAt", "DESC")
      .skip((input.page - 1) * input.limit)
      .take(input.limit)
      .getRawMany<{
        id: string;
        name: string;
        phone: string;
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

  async getCustomerStats() {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [totalCustomers, activeCustomers, newCustomersThisMonth, paidSummary, repeatCustomers, topCustomers] =
      await Promise.all([
        this.customerRepository.count(),
        this.customerRepository.count({ where: { isActive: true } }),
        this.customerRepository
          .createQueryBuilder("customer")
          .where("customer.createdAt >= :monthStart", { monthStart })
          .getCount(),
        this.invoiceRepository
          .createQueryBuilder("invoice")
          .select("COUNT(DISTINCT invoice.customerId)", "customersWithOrders")
          .addSelect("COUNT(invoice.id)", "paidInvoices")
          .addSelect("COALESCE(SUM(invoice.totalAmount), 0)", "revenue")
          .addSelect("COALESCE(AVG(invoice.totalAmount), 0)", "averageOrderValue")
          .where("invoice.status = 'paid'")
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
              .select("innerInvoice.customerId", "customerId")
              .addSelect("COUNT(innerInvoice.id)", "invoiceCount")
              .from(Invoice, "innerInvoice")
              .where("innerInvoice.status = 'paid'")
              .andWhere("innerInvoice.customerId IS NOT NULL")
              .groupBy("innerInvoice.customerId")
              .having("COUNT(innerInvoice.id) > 1");
          }, "repeat_data")
          .getRawOne<{ repeatCustomers: string }>(),
        this.customerRepository
          .createQueryBuilder("customer")
          .leftJoin(Invoice, "invoice", "invoice.customerId = customer.id AND invoice.status = 'paid'")
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
          .take(5)
          .getRawMany<{
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
      }))
    };
  }

  async searchCustomersByPhone(input: {
    phone?: string;
    search?: string;
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
    if (!normalizedPhone) {
      throw new AppError(422, "Please provide a valid phone number");
    }

    const existing = await this.customerRepository.findOne({
      where: { phone: normalizedPhone }
    });
    if (existing) {
      throw new AppError(409, "Customer with this phone number already exists");
    }

    const customer = this.customerRepository.create({
      name: input.name.trim(),
      phone: normalizedPhone,
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
    if (!normalizedPhone) {
      throw new AppError(422, "Please provide a valid phone number");
    }

    const existing = await this.customerRepository.findOne({
      where: { phone: normalizedPhone }
    });

    if (!existing) {
      const created = this.customerRepository.create({
        name: input.name.trim(),
        phone: normalizedPhone,
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

    if (input.phone !== undefined) {
      const normalizedPhone = normalizePhone(input.phone);
      if (!normalizedPhone) {
        throw new AppError(422, "Please provide a valid phone number");
      }

      const duplicate = await this.customerRepository.findOne({
        where: { phone: normalizedPhone }
      });
      if (duplicate && duplicate.id !== id) {
        throw new AppError(409, "Customer with this phone number already exists");
      }
      customer.phone = normalizedPhone;
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
