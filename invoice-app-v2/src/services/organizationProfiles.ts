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
  Timestamp 
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { authService } from './auth'

export interface OrganizationProfile {
  id?: string
  name: string
  gstin: string
  business_type: string
  industry: string
  business_description: string
  capitalization_threshold: number
  common_hsn_codes: string[]
  expense_categories: string[]
  address: string
  contact_person: string
  phone: string
  email: string
  is_default: boolean
  created_at: Timestamp
  updated_at: Timestamp
  user_uid: string
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
    common_hsn_codes: ['998313', '84713000', '85176290'],
    expense_categories: ['Technology Expenses', 'Office Equipment', 'Professional Services', 'Internet & Communications'],
    capitalization_threshold: 50000
  },
  {
    value: 'manufacturing',
    label: 'Manufacturing',
    description: 'Production, assembly, industrial manufacturing',
    common_hsn_codes: ['84218990', '84799090', '39269099'],
    expense_categories: ['Raw Materials', 'Manufacturing Overhead', 'Plant & Equipment', 'Factory Utilities'],
    capitalization_threshold: 100000
  },
  {
    value: 'retail_trading',
    label: 'Retail/Trading',
    description: 'Retail sales, wholesale trading, e-commerce',
    common_hsn_codes: ['48239090', '39269099', '84713000'],
    expense_categories: ['Cost of Goods Sold', 'Store Operations', 'Marketing & Advertising', 'Inventory Management'],
    capitalization_threshold: 25000
  },
  {
    value: 'professional_services',
    label: 'Professional Services',
    description: 'CA, legal, consulting, advisory services',
    common_hsn_codes: ['998721', '998313', '48239090'],
    expense_categories: ['Professional Development', 'Office Expenses', 'Client Entertainment', 'Reference Materials'],
    capitalization_threshold: 30000
  },
  {
    value: 'restaurant_food',
    label: 'Restaurant/Food Business',
    description: 'Restaurants, catering, food processing',
    common_hsn_codes: ['210690', '84186990', '39269099'],
    expense_categories: ['Food & Beverages', 'Kitchen Equipment', 'Restaurant Supplies', 'Packaging Materials'],
    capitalization_threshold: 75000
  },
  {
    value: 'real_estate',
    label: 'Real Estate',
    description: 'Property development, real estate services',
    common_hsn_codes: ['997212', '48239090', '94036000'],
    expense_categories: ['Property Expenses', 'Marketing & Promotion', 'Office Administration', 'Legal & Documentation'],
    capitalization_threshold: 200000
  },
  {
    value: 'healthcare',
    label: 'Healthcare',
    description: 'Medical practice, clinics, healthcare services',
    common_hsn_codes: ['90189099', '48239090', '84713000'],
    expense_categories: ['Medical Equipment', 'Office Supplies', 'Professional Services', 'Utilities'],
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

class OrganizationService {
  
  /**
   * Get user's organization collection path
   */
  private getUserOrganizationPath(): string {
    const user = authService.getCurrentUser()
    if (!user?.uid) throw new Error('User not authenticated')
    return `users/${user.uid}/organizations`
  }

  /**
   * Create a new organization profile
   */
  async createOrganization(organizationData: Omit<OrganizationProfile, 'id' | 'created_at' | 'updated_at' | 'user_uid'>): Promise<string> {
    try {
      const user = authService.getCurrentUser()
      if (!user?.uid) throw new Error('User not authenticated')

      const orgRef = collection(db, this.getUserOrganizationPath())
      
      const newOrg: Omit<OrganizationProfile, 'id'> = {
        ...organizationData,
        created_at: Timestamp.now(),
        updated_at: Timestamp.now(),
        user_uid: user.uid
      }

      const docRef = await addDoc(orgRef, newOrg)
      console.log('🏢 Organization created:', docRef.id)
      return docRef.id
      
    } catch (error) {
      console.error('❌ Error creating organization:', error)
      throw error
    }
  }

  /**
   * Update an organization profile
   */
  async updateOrganization(organizationId: string, updates: Partial<OrganizationProfile>): Promise<void> {
    try {
      const orgRef = doc(db, this.getUserOrganizationPath(), organizationId)
      
      await updateDoc(orgRef, {
        ...updates,
        updated_at: Timestamp.now()
      })
      
      console.log('🏢 Organization updated:', organizationId)
      
    } catch (error) {
      console.error('❌ Error updating organization:', error)
      throw error
    }
  }

  /**
   * Delete an organization profile
   */
  async deleteOrganization(organizationId: string): Promise<void> {
    try {
      const orgRef = doc(db, this.getUserOrganizationPath(), organizationId)
      await deleteDoc(orgRef)
      console.log('🗑️ Organization deleted:', organizationId)
      
    } catch (error) {
      console.error('❌ Error deleting organization:', error)
      throw error
    }
  }

  /**
   * Get all user's organizations
   */
  async getOrganizations(): Promise<OrganizationProfile[]> {
    try {
      const orgRef = collection(db, this.getUserOrganizationPath())
      const q = query(orgRef, orderBy('created_at', 'desc'))
      
      const snapshot = await getDocs(q)
      const organizations: OrganizationProfile[] = []
      
      snapshot.forEach(doc => {
        organizations.push({
          id: doc.id,
          ...doc.data()
        } as OrganizationProfile)
      })
      
      console.log('🏢 Retrieved organizations:', organizations.length)
      return organizations
      
    } catch (error) {
      console.error('❌ Error getting organizations:', error)
      throw error
    }
  }

  /**
   * Get user's default organization
   */
  async getDefaultOrganization(): Promise<OrganizationProfile | null> {
    try {
      const orgRef = collection(db, this.getUserOrganizationPath())
      const q = query(orgRef, where('is_default', '==', true))
      
      const snapshot = await getDocs(q)
      if (snapshot.empty) return null
      
      const doc = snapshot.docs[0]
      return {
        id: doc.id,
        ...doc.data()
      } as OrganizationProfile
      
    } catch (error) {
      console.error('❌ Error getting default organization:', error)
      return null
    }
  }

  /**
   * Set an organization as default
   */
  async setDefaultOrganization(organizationId: string): Promise<void> {
    try {
      const organizations = await this.getOrganizations()
      
      // Remove default from all others
      const updatePromises = organizations.map(org => {
        if (org.id === organizationId) {
          return this.updateOrganization(org.id!, { is_default: true })
        } else if (org.is_default) {
          return this.updateOrganization(org.id!, { is_default: false })
        }
        return Promise.resolve()
      })
      
      await Promise.all(updatePromises)
      console.log('🏢 Default organization set:', organizationId)
      
    } catch (error) {
      console.error('❌ Error setting default organization:', error)
      throw error
    }
  }

  /**
   * Get business type template by value
   */
  getBusinessTypeTemplate(businessType: string): BusinessType | undefined {
    return BUSINESS_TYPES.find(bt => bt.value === businessType)
  }

  /**
   * Create organization from business type template
   */
  createFromTemplate(businessType: string, orgName: string, gstin: string): Omit<OrganizationProfile, 'id' | 'created_at' | 'updated_at' | 'user_uid'> {
    const template = this.getBusinessTypeTemplate(businessType)
    
    if (!template) {
      throw new Error(`Business type template not found: ${businessType}`)
    }

    return {
      name: orgName,
      gstin: gstin,
      business_type: template.value,
      industry: template.label,
      business_description: template.description,
      capitalization_threshold: template.capitalization_threshold,
      common_hsn_codes: [...template.common_hsn_codes],
      expense_categories: [...template.expense_categories],
      address: '',
      contact_person: '',
      phone: '',
      email: '',
      is_default: false
    }
  }
}

export const organizationService = new OrganizationService()