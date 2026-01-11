// Minimal types for PWA demo
export interface ProcessingStatus {
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

export interface ExtractedInvoiceData {
  items: any[];
  total: number;
  vendor: string;
}