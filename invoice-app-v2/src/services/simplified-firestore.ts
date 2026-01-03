import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  limit,
  DocumentData,
  QuerySnapshot
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'
import { userService } from './userService'

/**
 * SIMPLIFIED: Direct data mapping service
 * Maps backend results to table format without complex fallbacks
 */
export class SimplifiedFirestoreService {
  private unsubscribers: Array<() => void> = []

  /**
   * SIMPLIFIED: Listen to user results and extract journal entries directly
   */
  listenToUserResults(onUpdate: (entries: any[]) => void, onError: (error: Error) => void) {
    const user = authService.getCurrentUser()
    if (!user?.uid) {
      onError(new Error('User not authenticated'))
      return
    }

    console.log('🔥 SIMPLIFIED: Setting up listener for UID:', user.uid)

    const userQuery = query(
      collection(db, userService.getUserDataPath('invoice_results')),
      where('userUID', '==', user.uid),
      limit(50)
    )

    const unsubscribe = onSnapshot(
      userQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        console.log('📡 SIMPLIFIED: Snapshot received:', snapshot.docs.length, 'documents')
        
        const results = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        
        const journalEntries = this.extractJournalEntriesDirectly(results)
        onUpdate(journalEntries)
      },
      onError
    )

    this.unsubscribers.push(unsubscribe)
  }

  /**
   * SIMPLIFIED: Direct extraction from backend data
   */
  private extractJournalEntriesDirectly(results: any[]): any[] {
    const entries: any[] = []
    
    console.log('🎯 SIMPLIFIED: Processing', results.length, 'results')
    
    results.forEach((result, resultIndex) => {
      if (!result.extractedData) {
        console.log('⚠️ SIMPLIFIED: No extracted data for', result.jobId)
        return
      }

      const data = result.extractedData
      const extractedData = data.extracted_data || data
      
      // Extract basic info
      const vendorName = extractedData.vendor_details?.name || extractedData.vendor_name || 'Unknown'
      const invoiceNumber = extractedData.invoice_details?.invoice_number || extractedData.invoice_number || 'N/A'
      const invoiceDate = extractedData.invoice_details?.invoice_date || extractedData.invoice_date || ''
      
      // Get items (this is where HSN codes live)
      const items = extractedData.items || []
      const taxSummary = extractedData.tax_summary || {}
      
      console.log(`✅ SIMPLIFIED: Processing ${result.jobId}`, {
        items: items.length,
        firstItemHsn: items[0]?.hsn_code,
        hasTax: !!taxSummary.grand_total
      })

      let entryIndex = 0

      // Create entries directly from items (where HSN exists)
      items.forEach((item, itemIndex) => {
        if (item.taxable_value && parseFloat(item.taxable_value) > 0) {
          entries.push({
            id: `${result.jobId}_item_${itemIndex}`,
            invoiceId: result.id,
            invoiceNumber,
            vendor: vendorName,
            entryIndex: entryIndex++,
            date: invoiceDate,
            accountName: `Expense - ${item.description || 'General'}`,
            accountCode: '5000',
            accountType: 'Expense',
            debitAmount: parseFloat(item.taxable_value) || 0,
            creditAmount: 0,
            description: item.description || 'Purchase expense',
            narration: item.description || 'Purchase expense',
            reference: invoiceNumber,
            // DIRECT: HSN from source
            hsnCode: item.hsn_code || '',
            itemDescription: item.description || '',
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.unit_price) || 0,
            gstAmount: (parseFloat(item.cgst_amount) || 0) + (parseFloat(item.sgst_amount) || 0) + (parseFloat(item.igst_amount) || 0),
            cgstAmount: parseFloat(item.cgst_amount) || 0,
            sgstAmount: parseFloat(item.sgst_amount) || 0,
            igstAmount: parseFloat(item.igst_amount) || 0,
            taxableAmount: parseFloat(item.taxable_value) || 0,
            lineTotal: parseFloat(item.line_total) || parseFloat(item.taxable_value) || 0,
            isGstApplicable: parseFloat(item.gst_rate || 0) > 0,
            placeOfSupply: extractedData.buyer_details?.place_of_supply || '',
            isBalanced: true,
            userId: result.userEmail,
            createdAt: result.createdAt
          })
          
          console.log(`✅ SIMPLIFIED: Created expense entry with HSN: ${item.hsn_code}`)
        }
      })

      // GST entries
      const firstItemHsn = items[0]?.hsn_code || ''
      
      if (taxSummary.cgst_total && parseFloat(taxSummary.cgst_total) > 0) {
        entries.push({
          id: `${result.jobId}_cgst`,
          invoiceId: result.id,
          invoiceNumber,
          vendor: vendorName,
          entryIndex: entryIndex++,
          date: invoiceDate,
          accountName: 'CGST Input Tax Credit',
          accountCode: '1801',
          accountType: 'Current Asset',
          debitAmount: parseFloat(taxSummary.cgst_total) || 0,
          creditAmount: 0,
          description: 'CGST Input Tax Credit',
          narration: 'CGST Input Tax Credit',
          reference: invoiceNumber,
          hsnCode: firstItemHsn,
          itemDescription: 'GST Input Credit',
          quantity: 0,
          unitPrice: 0,
          gstAmount: parseFloat(taxSummary.cgst_total) || 0,
          cgstAmount: parseFloat(taxSummary.cgst_total) || 0,
          sgstAmount: 0,
          igstAmount: 0,
          taxableAmount: 0,
          lineTotal: parseFloat(taxSummary.cgst_total) || 0,
          isGstApplicable: true,
          placeOfSupply: extractedData.buyer_details?.place_of_supply || '',
          isBalanced: true,
          userId: result.userEmail,
          createdAt: result.createdAt
        })
      }

      if (taxSummary.sgst_total && parseFloat(taxSummary.sgst_total) > 0) {
        entries.push({
          id: `${result.jobId}_sgst`,
          invoiceId: result.id,
          invoiceNumber,
          vendor: vendorName,
          entryIndex: entryIndex++,
          date: invoiceDate,
          accountName: 'SGST Input Tax Credit',
          accountCode: '1802',
          accountType: 'Current Asset',
          debitAmount: parseFloat(taxSummary.sgst_total) || 0,
          creditAmount: 0,
          description: 'SGST Input Tax Credit',
          narration: 'SGST Input Tax Credit',
          reference: invoiceNumber,
          hsnCode: firstItemHsn,
          itemDescription: 'GST Input Credit',
          quantity: 0,
          unitPrice: 0,
          gstAmount: parseFloat(taxSummary.sgst_total) || 0,
          cgstAmount: 0,
          sgstAmount: parseFloat(taxSummary.sgst_total) || 0,
          igstAmount: 0,
          taxableAmount: 0,
          lineTotal: parseFloat(taxSummary.sgst_total) || 0,
          isGstApplicable: true,
          placeOfSupply: extractedData.buyer_details?.place_of_supply || '',
          isBalanced: true,
          userId: result.userEmail,
          createdAt: result.createdAt
        })
      }

      if (taxSummary.igst_total && parseFloat(taxSummary.igst_total) > 0) {
        entries.push({
          id: `${result.jobId}_igst`,
          invoiceId: result.id,
          invoiceNumber,
          vendor: vendorName,
          entryIndex: entryIndex++,
          date: invoiceDate,
          accountName: 'IGST Input Tax Credit',
          accountCode: '1803',
          accountType: 'Current Asset',
          debitAmount: parseFloat(taxSummary.igst_total) || 0,
          creditAmount: 0,
          description: 'IGST Input Tax Credit',
          narration: 'IGST Input Tax Credit',
          reference: invoiceNumber,
          hsnCode: firstItemHsn,
          itemDescription: 'GST Input Credit',
          quantity: 0,
          unitPrice: 0,
          gstAmount: parseFloat(taxSummary.igst_total) || 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: parseFloat(taxSummary.igst_total) || 0,
          taxableAmount: 0,
          lineTotal: parseFloat(taxSummary.igst_total) || 0,
          isGstApplicable: true,
          placeOfSupply: extractedData.buyer_details?.place_of_supply || '',
          isBalanced: true,
          userId: result.userEmail,
          createdAt: result.createdAt
        })
      }

      // Accounts Payable
      if (taxSummary.grand_total && parseFloat(taxSummary.grand_total) > 0) {
        entries.push({
          id: `${result.jobId}_payable`,
          invoiceId: result.id,
          invoiceNumber,
          vendor: vendorName,
          entryIndex: entryIndex++,
          date: invoiceDate,
          accountName: `Accounts Payable - ${vendorName}`,
          accountCode: '2000',
          accountType: 'Current Liability',
          debitAmount: 0,
          creditAmount: parseFloat(taxSummary.grand_total) || 0,
          description: `Purchase from ${vendorName} - Invoice ${invoiceNumber}`,
          narration: `Purchase from ${vendorName} - Invoice ${invoiceNumber}`,
          reference: invoiceNumber,
          hsnCode: firstItemHsn,
          itemDescription: `Invoice from ${vendorName}`,
          quantity: 0,
          unitPrice: 0,
          gstAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 0,
          taxableAmount: parseFloat(taxSummary.taxable_value) || 0,
          lineTotal: parseFloat(taxSummary.grand_total) || 0,
          isGstApplicable: false,
          placeOfSupply: extractedData.buyer_details?.place_of_supply || '',
          isBalanced: true,
          userId: result.userEmail,
          createdAt: result.createdAt
        })
        
        console.log(`✅ SIMPLIFIED: Created payable entry with HSN: ${firstItemHsn}`)
      }
    })

    console.log('🎉 SIMPLIFIED: Created', entries.length, 'total entries')
    return entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }

  /**
   * Clean up listeners
   */
  cleanup() {
    this.unsubscribers.forEach(unsub => unsub())
    this.unsubscribers = []
    console.log('🧹 SIMPLIFIED: Cleaned up listeners')
  }
}

// Create singleton instance
export const simplifiedFirestoreService = new SimplifiedFirestoreService()