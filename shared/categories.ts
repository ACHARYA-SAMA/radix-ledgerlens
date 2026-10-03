/* Repository touch marker. */
export const CATEGORIES = {
  customer_receipt: "Customer receipt",
  vendor_payment: "Vendor payment",
  loan_repayment: "Loan repayment",
  salary_payment: "Salary payment",
  tax_payment: "Tax payment",
  gateway_settlement: "Gateway settlement",
  internal_transfer: "Internal transfer",
  software: "Software & subscriptions",
  utilities: "Utilities",
  rent: "Rent",
  bank_charges: "Bank charges",
  travel: "Travel & transport",
  professional_fees: "Professional fees",
  insurance: "Insurance",
  personal: "Personal drawing",
  other_income: "Other income",
  other_expense: "Other expense",
  uncategorized: "Uncategorized",
} as const;
export type Category = keyof typeof CATEGORIES;
export const isCategory = (value: unknown): value is Category =>
  typeof value === "string" && Object.hasOwn(CATEGORIES, value);
