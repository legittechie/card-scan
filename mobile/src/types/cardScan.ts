export type BusinessCardFields = {
  Name?: string | null;
  Company?: string | null;
  Title?: string | null;
  Phone?: string | null;
  Email?: string | null;
  Website?: string | null;
  Address?: string | null;
  BusinessCategory?: string | null;
  Others?: string | null;
};

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export type JobStatusResponse = {
  job_id: string;
  status: JobStatus;
  result: BusinessCardFields | null;
  raw_ocr_text: string | null;
  error: string | null;
  progress_hint: string | null;
};

export const FIELD_LABELS: { key: keyof BusinessCardFields; label: string }[] = [
  { key: "Name", label: "Name" },
  { key: "Company", label: "Company" },
  { key: "Title", label: "Title" },
  { key: "Phone", label: "Phone" },
  { key: "Email", label: "Email" },
  { key: "Website", label: "Website" },
  { key: "Address", label: "Address" },
  { key: "BusinessCategory", label: "Category" },
];
