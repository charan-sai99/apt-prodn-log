import { z } from "zod";
import { isValidIsoDate } from "./time";

export const MAX_QUANTITY = 1000000; // hard ceiling; the per-entry limit is the admin setting enforced in the database

const isoDate = z.string().refine(isValidIsoDate, "Choose a valid date");
const uuid = z.uuid("Invalid selection");

/** Accepts "120", " 120 ", 120. Rejects decimals, negatives, exponents. */
export const quantitySchema = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? String(v) : v.trim()))
  .refine((v) => /^\d{1,7}$/.test(v), "Enter a whole number")
  .transform((v) => Number.parseInt(v, 10))
  .refine((n) => n >= 1, "Quantity must be at least 1")
  .refine((n) => n <= MAX_QUANTITY, `Quantity cannot exceed ${MAX_QUANTITY.toLocaleString("en-IN")}`);

export const entrySchema = z.object({
  machineId: uuid,
  componentId: z.uuid("Choose a component"),
  productionDate: isoDate,
  hourSlot: z.coerce.number().int().min(0, "Choose an hour").max(23, "Choose an hour"),
  quantity: quantitySchema,
  clientRequestId: uuid,
  operatorId: z.uuid().optional().nullable(),
  notes: z.string().trim().max(500, "Keep notes under 500 characters").optional().nullable(),
});
export type EntryInput = z.input<typeof entrySchema>;

export const correctionSchema = z
  .object({
    entryId: uuid,
    requestType: z.enum(["change", "void"]),
    reason: z.string().trim().min(3, "Give a short reason").max(500),
    proposedQuantity: z.union([quantitySchema, z.literal("").transform(() => null), z.null()]).optional(),
    proposedComponentId: z.union([z.uuid(), z.literal("").transform(() => null), z.null()]).optional(),
  })
  .refine(
    (v) => v.requestType === "void" || v.proposedQuantity != null || v.proposedComponentId != null,
    { message: "Enter the correct quantity or component", path: ["proposedQuantity"] },
  );

export const reviewSchema = z
  .object({
    requestId: uuid,
    approve: z.boolean(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .refine((v) => v.approve || (v.note ?? "").length >= 3, {
    message: "Give a reason for rejecting",
    path: ["note"],
  });

export const employeeCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]{2,32}$/, "2–32 letters, numbers, dot, dash or underscore");

export const passwordSchema = z
  .string()
  .min(8, "At least 8 characters")
  .max(72, "At most 72 characters");

export const roleSchema = z.enum(["operator", "supervisor", "admin"]);

export const pinSchema = z.string().regex(/^[0-9]{4}$/, "Exactly 4 digits");

export const createUserSchema = z
  .object({
    displayName: z.string().trim().min(2, "Enter the full name").max(80),
    employeeCode: z.union([employeeCodeSchema, z.literal("")]).optional(),
    designation: z.string().trim().max(60).optional(),
    role: roleSchema,
    email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
    password: z.union([passwordSchema, z.literal("")]).optional(),
    pin: z.union([pinSchema, z.literal("")]).optional(),
  })
  .refine((v) => v.role !== "admin" || (v.email ?? "") !== "", {
    message: "Administrators need an email address",
    path: ["email"],
  })
  .refine((v) => v.role !== "admin" || (v.password ?? "") !== "", {
    message: "Administrators need a password",
    path: ["password"],
  });

/** Default employee code from a name: first word, letters/digits only, upper case. */
export function codeFromName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  const code = first.normalize("NFKD").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12);
  return code.length >= 2 ? code : `EMP${code}`;
}

export const machineSchema = z.object({
  id: z.uuid().optional(),
  machineCode: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9_-]{2,16}$/, "2–16 letters/numbers, e.g. VIM5")),
  machineName: z.string().trim().min(2).max(80),
  machineType: z.enum(["vertical_injection", "horizontal_injection", "other"]),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

export const componentSchema = z.object({
  id: z.uuid().optional(),
  componentName: z.string().trim().min(2, "Enter the component name").max(200),
  componentCode: z.string().trim().max(100).optional().nullable(),
  zohoItemId: z
    .union([z.string().trim().regex(/^\d{5,25}$/, "Zoho Item ID is numeric"), z.literal("")])
    .optional()
    .nullable(),
  description: z.string().trim().max(500).optional().nullable(),
  rawMaterial: z.string().trim().max(80, "Keep it under 80 characters").optional().nullable(),
});

export const shiftSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,4}$/),
  name: z.string().trim().min(2).max(60),
  startHour: z.coerce.number().int().min(0).max(23),
  endHour: z.coerce.number().int().min(0).max(23),
  sortOrder: z.coerce.number().int().min(0).max(99),
  isActive: z.boolean(),
});

export const recordFiltersSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  machine: z.string().max(16).optional(),
  operator: z.uuid().optional(),
  component: z.uuid().optional(),
  shift: z.string().max(4).optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "voided", "all"]).optional(),
});
export type RecordFilters = z.infer<typeof recordFiltersSchema>;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
