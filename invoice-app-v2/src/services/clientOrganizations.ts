import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDocs, 
  query, 
  where, 
  orderBy,
  Timestamp,
  getDoc 
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

// User's own organization (SSO/outsourcing company/holding company)
export interface UserOrganization {
  id?: string
  company_name: string
  gstin?: string
  business_type: string
  address: string
  contact_person: string
  phone: string
  email: string
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
}

// Client organizations whose invoices are processed
export interface ClientOrganization {
  id?: string
  client_name: string
  client_gstin?: string
  business_type: string
  industry: string
  business_description: string
  capitalization_threshold: number
  common_hsn_codes: string[]
  expense_categories: string[]
  client_address: string
  client_contact_person?: string
  client_phone?: string
  client_email?: string
  is_active: boolean
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
  // For processing context
  processing_notes?: string
}

export interface BusinessType {
  value: string
  label: string
  description: string
  common_hsn_codes: string[]
  expense_categories: string[]
  capitalization_threshold: number
}

// Predefined business types with templates
export const BUSINESS_TYPES: BusinessType[] = [
  {
    value: 'software_it',
    label: 'Software/IT Services',
    description: 'Software development, IT consulting, web services',
    common_hsn_codes: ['998313', '998314', '998315'],
    expense_categories: ['Software Licenses', 'Hardware', 'Office Equipment', 'Professional Services', 'Employee Benefits'],
    capitalization_threshold: 100000
  },
  {
    value: 'manufacturing',
    label: 'Manufacturing',
    description: 'Production and manufacturing of goods',
    common_hsn_codes: ['84713000', '85176290', '39269099'],
    expense_categories: ['Raw Materials', 'Machinery', 'Labor', 'Factory Overhead', 'Quality Control'],
    capitalization_threshold: 200000
  },
  {
    value: 'trading',
    label: 'Trading/Wholesale',
    description: 'Buy and sell goods, wholesale distribution',
    common_hsn_codes: ['48239090', '84713000', '39269099'],
    expense_categories: ['Inventory Purchase', 'Transportation', 'Storage', 'Sales Commission', 'Marketing'],
    capitalization_threshold: 75000
  },
  {
    value: 'retail',
    label: 'Retail',
    description: 'Direct sales to consumers',
    common_hsn_codes: ['48239090', '84713000', '94036000'],
    expense_categories: ['Inventory', 'Store Rent', 'Sales Staff', 'Point of Sale Equipment', 'Customer Service'],
    capitalization_threshold: 50000
  },
  {
    value: 'consulting',
    label: 'Consulting/Professional Services',
    description: 'Business consulting, advisory services',
    common_hsn_codes: ['998399', '84713000', '48239090'],
    expense_categories: ['Professional Development', 'Travel', 'Office Equipment', 'Research Materials', 'Client Entertainment'],
    capitalization_threshold: 25000
  },
  {
    value: 'healthcare',
    label: 'Healthcare',
    description: 'Medical services, healthcare facilities',
    common_hsn_codes: ['90189090', '84713000', '30049099'],
    expense_categories: ['Medical Equipment', 'Pharmaceutical Supplies', 'Professional Services', 'Facility Maintenance', 'Staff Training'],
    capitalization_threshold: 150000
  },
  {
    value: 'construction',
    label: 'Construction/Real Estate',
    description: 'Construction, property development',
    common_hsn_codes: ['25232900', '76109090', '84295900'],
    expense_categories: ['Construction Materials', 'Equipment Rental', 'Labor Contracts', 'Permits and Licenses', 'Safety Equipment'],
    capitalization_threshold: 500000
  },
  {
    value: 'hospitality',
    label: 'Hospitality/Food & Beverage',
    description: 'Hotels, restaurants, catering',
    common_hsn_codes: ['19059090', '84713000', '94036000'],
    expense_categories: ['Food & Beverage Supplies', 'Kitchen Equipment', 'Housekeeping Supplies', 'Marketing', 'Staff Training'],
    capitalization_threshold: 100000
  },
  {
    value: 'education',
    label: 'Education',
    description: 'Schools, training institutes, educational services',
    common_hsn_codes: ['49019990', '84713000', '94036000'],
    expense_categories: ['Educational Materials', 'Office Equipment', 'Utilities', 'Professional Development'],
    capitalization_threshold: 50000
  },
  {
    value: 'other',
    label: 'Other',
    description: 'General business type',
    common_hsn_codes: ['48239090', '84713000'],
    expense_categories: ['Office Expenses', 'Equipment', 'Professional Services', 'Utilities'],
    capitalization_threshold: 50000
  }
]

// User Organization Service - for user's own company
class UserOrganizationService {
  private getUserOrganizationPath(): string {
    const user = authService.getCurrentUser()
    if (!user?.uid) throw new Error('User not authenticated')
    return `users/${user.uid}/user_organization`
  }

  async create(orgData: Omit<UserOrganization, 'id' | 'created_at' | 'updated_at' | 'user_uid'>): Promise<string> {
    try {
      const user = authService.getCurrentUser()
      if (!user?.uid) throw new Error('User not authenticated')

      const orgRef = collection(db, this.getUserOrganizationPath())
      
      const newOrg: Omit<UserOrganization, 'id'> = {
        ...orgData,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        user_uid: user.uid
      }

      const docRef = await addDoc(orgRef, newOrg)
      console.log('🏢 User organization created:', docRef.id)
      return docRef.id
      
    } catch (error) {
      console.error('❌ Error creating user organization:', error)
      throw error
    }
  }

  async get(): Promise<UserOrganization | null> {
    try {
      const querySnapshot = await getDocs(collection(db, this.getUserOrganizationPath()))
      if (querySnapshot.empty) return null
      
      const doc = querySnapshot.docs[0] // User should have only one organization
      return {
        id: doc.id,
        ...doc.data()
      } as UserOrganization
    } catch (error) {
      console.error('❌ Error fetching user organization:', error)
      throw error
    }
  }

  async update(orgId: string, updates: Partial<UserOrganization>): Promise<void> {
    try {
      const orgRef = doc(db, this.getUserOrganizationPath(), orgId)
      
      await updateDoc(orgRef, {
        ...updates,
        updated_at: Timestamp.now()
      })
      
      console.log('🏢 User organization updated:', orgId)
      
    } catch (error) {
      console.error('❌ Error updating user organization:', error)
      throw error
    }
  }
}

// Client Organization Service - for client businesses whose invoices are processed
class ClientOrganizationService {
  private getClientOrganizationPath(): string {
    const user = authService.getCurrentUser()
    if (!user?.uid) throw new Error('User not authenticated')
    return `users/${user.uid}/client_organizations`
  }

  async create(clientData: Omit<ClientOrganization, 'id' | 'created_at' | 'updated_at' | 'user_uid'>): Promise<string> {
    try {
      const user = authService.getCurrentUser()
      if (!user?.uid) throw new Error('User not authenticated')

      const clientRef = collection(db, this.getClientOrganizationPath())
      
      const newClient: Omit<ClientOrganization, 'id'> = {
        ...clientData,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        user_uid: user.uid,
        is_active: true
      }

      const docRef = await addDoc(clientRef, newClient)
      console.log('🏢 Client organization created:', docRef.id)
      return docRef.id
      
    } catch (error) {
      console.error('❌ Error creating client organization:', error)
      throw error
    }
  }

  async getAll(): Promise<ClientOrganization[]> {
    try {
      const q = query(
        collection(db, this.getClientOrganizationPath()),
        where('is_active', '==', true),
        orderBy('created_at', 'desc')
      )
      const querySnapshot = await getDocs(q)
      
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ClientOrganization[]
    } catch (error) {
      console.error('❌ Error fetching client organizations:', error)
      throw error
    }
  }

  async getById(clientId: string): Promise<ClientOrganization | null> {
    try {
      const docRef = doc(db, this.getClientOrganizationPath(), clientId)
      const docSnap = await getDoc(docRef)
      
      if (!docSnap.exists()) return null
      
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as ClientOrganization
    } catch (error) {
      console.error('❌ Error fetching client organization:', error)
      throw error
    }
  }

  async update(clientId: string, updates: Partial<ClientOrganization>): Promise<void> {
    try {
      const clientRef = doc(db, this.getClientOrganizationPath(), clientId)
      
      await updateDoc(clientRef, {
        ...updates,
        updated_at: Timestamp.now()
      })
      
      console.log('🏢 Client organization updated:', clientId)
      
    } catch (error) {
      console.error('❌ Error updating client organization:', error)
      throw error
    }
  }

  async deactivate(clientId: string): Promise<void> {
    try {
      const clientRef = doc(db, this.getClientOrganizationPath(), clientId)
      
      await updateDoc(clientRef, {
        is_active: false,
        updated_at: Timestamp.now()
      })
      
      console.log('🏢 Client organization deactivated:', clientId)
      
    } catch (error) {
      console.error('❌ Error deactivating client organization:', error)
      throw error
    }
  }

  async createFromTemplate(businessType: string, clientName: string, clientGstin?: string): Promise<ClientOrganization> {
    const template = BUSINESS_TYPES.find(bt => bt.value === businessType)
    if (!template) throw new Error('Invalid business type')

    const clientData = {
      client_name: clientName,
      client_gstin: clientGstin || '',
      business_type: template.value,
      industry: template.label,
      business_description: template.description,
      capitalization_threshold: template.capitalization_threshold,
      common_hsn_codes: template.common_hsn_codes,
      expense_categories: template.expense_categories,
      client_address: '',
      client_contact_person: '',
      client_phone: '',
      client_email: ''
    }

    const id = await this.create(clientData)
    return { id, ...clientData } as ClientOrganization
  }

  // Get business context for AI processing
  async getProcessingContext(clientId: string): Promise<string> {
    const client = await this.getById(clientId)
    if (!client) throw new Error('Client organization not found')

    return `Business Context for ${client.client_name}:
- Industry: ${client.industry}
- Business Type: ${client.business_type}
- Description: ${client.business_description}
- Capitalization Threshold: ₹${client.capitalization_threshold.toLocaleString()}
- Common HSN Codes: ${client.common_hsn_codes.join(', ')}
- Expense Categories: ${client.expense_categories.join(', ')}
- GSTIN: ${client.client_gstin || 'Not provided'}
${client.processing_notes ? `- Processing Notes: ${client.processing_notes}` : ''}`
  }
}

// Export singleton instances
export const userOrganizationService = new UserOrganizationService()
export const clientOrganizationService = new ClientOrganizationService()

// Legacy export for backward compatibility (maps to client organizations)
export const organizationProfileService = clientOrganizationService

// Type alias for backward compatibility
export type OrganizationProfile = ClientOrganization