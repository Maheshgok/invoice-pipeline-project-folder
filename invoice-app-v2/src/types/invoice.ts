export interface InvoiceData {
  id: string
  fileName: string
  uploadedAt: Date
  processedAt?: Date
  status: ProcessingStatus
  userEmail: string
  extractedData?: ExtractedInvoiceData
  confidence?: number
  originalFileUrl?: string
  processingError?: string
}

export interface ExtractedInvoiceData {
  vendorName: string
  vendorGSTIN?: string
  vendorAddress?: string
  invoiceNumber: string
  invoiceDate: string
  dueDate?: string
  totalAmount: number
  taxAmount: number
  subtotal: number
  currency: string
  placeOfSupply?: string
  lineItems: InvoiceLineItem[]
  taxBreakdown?: TaxBreakdown[]
  paymentTerms?: string
  purchaseOrder?: string
}

export interface InvoiceLineItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  totalPrice: number
  taxRate?: number
  hsnCode?: string
  unit?: string
}

export interface TaxBreakdown {
  taxType: 'CGST' | 'SGST' | 'IGST' | 'CESS' | 'OTHER'
  rate: number
  amount: number
  taxableAmount: number
}

export type ProcessingStatus = 
  | 'uploading'
  | 'processing' 
  | 'completed'
  | 'failed'
  | 'pending'

export interface InvoiceValidationError {
  field: keyof ExtractedInvoiceData | string
  message: string
  severity: 'error' | 'warning'
}

export interface InvoicePreview {
  id: string
  file: File
  previewUrl: string
  type: 'image' | 'pdf'
  pageCount?: number
  currentPage?: number
}

export interface InvoiceFilter {
  status?: ProcessingStatus[]
  dateRange?: {
    start: Date
    end: Date
  }
  search?: string
  vendorName?: string
  amountRange?: {
    min: number
    max: number
  }
}