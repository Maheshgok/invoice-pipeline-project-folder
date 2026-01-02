import React, { useState, useEffect } from 'react'
import {
  clientOrganizationService,
  userOrganizationService,
  ClientOrganization,
  UserOrganization,
  BUSINESS_TYPES
} from '../../services/clientOrganizations'
import { toast } from 'react-hot-toast'

interface ClientOrganizationManagerProps {
  onClientSelect?: (clientId: string) => void
  selectedClientId?: string
  showUserOrg?: boolean
}

const ClientOrganizationManager: React.FC<ClientOrganizationManagerProps> = ({
  onClientSelect,
  selectedClientId,
  showUserOrg = false
}) => {
  const [clientOrganizations, setClientOrganizations] = useState<ClientOrganization[]>([])
  const [userOrganization, setUserOrganization] = useState<UserOrganization | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [loading, setLoading] = useState(true)

  // Form state for new client
  const [newClient, setNewClient] = useState({
    client_name: '',
    client_gstin: '',
    business_type: '',
    client_address: '',
    processing_notes: ''
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const [clients, userOrg] = await Promise.all([
        clientOrganizationService.getAll(),
        showUserOrg ? userOrganizationService.get() : Promise.resolve(null)
      ])
      
      setClientOrganizations(clients)
      setUserOrganization(userOrg)
    } catch (error) {
      console.error('❌ Error loading organizations:', error)
      toast.error('Failed to load organizations')
    } finally {
      setLoading(false)
    }
  }

  const handleAddClient = async () => {
    if (!newClient.client_name || !newClient.business_type) {
      toast.error('Please fill in required fields')
      return
    }

    try {
      const businessType = BUSINESS_TYPES.find(bt => bt.value === newClient.business_type)
      if (!businessType) throw new Error('Invalid business type')

      const clientData = {
        client_name: newClient.client_name,
        client_gstin: newClient.client_gstin,
        business_type: businessType.value,
        industry: businessType.label,
        business_description: businessType.description,
        capitalization_threshold: businessType.capitalization_threshold,
        common_hsn_codes: businessType.common_hsn_codes,
        expense_categories: businessType.expense_categories,
        client_address: newClient.client_address,
        client_contact_person: '',
        client_phone: '',
        client_email: '',
        processing_notes: newClient.processing_notes,
        is_active: true
      }

      await clientOrganizationService.create(clientData)
      toast.success(`Client "${newClient.client_name}" added successfully`)
      
      // Reset form and reload data
      setNewClient({
        client_name: '',
        client_gstin: '',
        business_type: '',
        client_address: '',
        processing_notes: ''
      })
      setShowAddForm(false)
      loadData()
    } catch (error) {
      console.error('❌ Error adding client:', error)
      toast.error('Failed to add client organization')
    }
  }

  const handleClientSelect = (clientId: string) => {
    if (onClientSelect) {
      onClientSelect(clientId)
      const client = clientOrganizations.find(c => c.id === clientId)
      if (client) {
        toast.success(`Selected: ${client.client_name} (${client.industry})`)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* User Organization (if enabled) */}
      {showUserOrg && (
        <div className="bg-gray-50 p-4 rounded-lg border-l-4 border-gray-400">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Your Organization</h3>
          {userOrganization ? (
            <div className="text-sm text-gray-700">
              <p><strong>{userOrganization.company_name}</strong></p>
              <p>Type: {userOrganization.business_type}</p>
              {userOrganization.gstin && <p>GSTIN: {userOrganization.gstin}</p>}
            </div>
          ) : (
            <p className="text-sm text-gray-500">No user organization configured</p>
          )}
        </div>
      )}

      {/* Client Organizations */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-gray-900">
            Client Organizations
            <span className="text-sm text-gray-500 ml-2">({clientOrganizations.length})</span>
          </h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
          >
            {showAddForm ? 'Cancel' : '+ Add Client'}
          </button>
        </div>

        {/* Add Client Form */}
        {showAddForm && (
          <div className="bg-blue-50 p-4 rounded-lg mb-4 border">
            <h4 className="font-medium text-gray-900 mb-3">Add New Client Organization</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Name *
                </label>
                <input
                  type="text"
                  value={newClient.client_name}
                  onChange={(e) => setNewClient({...newClient, client_name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Client Company Name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Business Type *
                </label>
                <select
                  value={newClient.business_type}
                  onChange={(e) => setNewClient({...newClient, business_type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select Business Type</option>
                  {BUSINESS_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label} - {type.description}
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client GSTIN
                </label>
                <input
                  type="text"
                  value={newClient.client_gstin}
                  onChange={(e) => setNewClient({...newClient, client_gstin: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Optional GSTIN"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Processing Notes
                </label>
                <input
                  type="text"
                  value={newClient.processing_notes}
                  onChange={(e) => setNewClient({...newClient, processing_notes: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Special processing instructions"
                />
              </div>
            </div>
            
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleAddClient}
                className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
              >
                Add Client
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Client Organizations List */}
        {clientOrganizations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>No client organizations configured</p>
            <p className="text-sm">Add client organizations to process their invoices with proper business context</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientOrganizations.map((client) => (
              <div
                key={client.id}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedClientId === client.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
                onClick={() => handleClientSelect(client.id!)}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-medium text-gray-900 truncate">
                    {client.client_name}
                  </h4>
                  {selectedClientId === client.id && (
                    <div className="text-blue-500">
                      ✓
                    </div>
                  )}
                </div>
                
                <div className="space-y-1 text-sm text-gray-600">
                  <p><strong>Industry:</strong> {client.industry}</p>
                  {client.client_gstin && (
                    <p><strong>GSTIN:</strong> {client.client_gstin}</p>
                  )}
                  <p><strong>Capitalization:</strong> ₹{client.capitalization_threshold.toLocaleString()}</p>
                  <p><strong>HSN Codes:</strong> {client.common_hsn_codes.slice(0, 3).join(', ')}
                    {client.common_hsn_codes.length > 3 && '...'}
                  </p>
                </div>
                
                {client.processing_notes && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                    <strong>Notes:</strong> {client.processing_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default ClientOrganizationManager