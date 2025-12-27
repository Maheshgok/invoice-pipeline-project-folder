import { userService } from './userService'
import toast from 'react-hot-toast'

/**
 * Service to handle invoice analysis operations with consumption tracking
 */
class AnalysisService {
  /**
   * Check if user can perform analysis based on their package
   */
  async canPerformAnalysis(userUid?: string): Promise<boolean> {
    try {
      return await userService.canPerformAnalysis(userUid)
    } catch (error) {
      console.error('❌ Error checking analysis permission:', error)
      return false
    }
  }

  /**
   * Process invoice analysis with consumption tracking
   */
  async processInvoiceAnalysis(file: File, userUid?: string): Promise<any> {
    try {
      // Check if user can perform analysis
      const canAnalyze = await this.canPerformAnalysis(userUid)
      if (!canAnalyze) {
        const usageStats = await userService.getUserUsageStats(userUid)
        
        if (usageStats?.subscriptionStatus === 'expired') {
          toast.error('Your subscription has expired. Please renew to continue.')
          throw new Error('Subscription expired')
        } else if (usageStats?.remainingCredits === 0) {
          toast.error('You have reached your analysis limit. Please upgrade your package.')
          throw new Error('Analysis limit reached')
        } else {
          toast.error('Analysis not allowed. Please check your subscription status.')
          throw new Error('Analysis not allowed')
        }
      }

      // Increment analysis count (this also validates consumption limits)
      const analysisAllowed = await userService.recordAnalysisCompletion(userUid)
      if (!analysisAllowed) {
        toast.error('Analysis limit reached. Please upgrade your package.')
        throw new Error('Analysis limit reached')
      }

      // TODO: Integrate with your existing analysis API
      // For now, return mock data
      console.log('🔍 Processing invoice analysis for file:', file.name)
      
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Mock successful analysis result
      const analysisResult = {
        success: true,
        invoiceData: {
          invoiceNumber: `INV-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          totalAmount: Math.random() * 1000 + 100,
          currency: 'USD',
          vendorName: 'Sample Vendor',
          confidence: 0.95
        },
        usedCredit: true
      }

      // Update user stats after successful analysis
      const updatedStats = await userService.getUserUsageStats(userUid)
      if (updatedStats) {
        console.log('📊 Updated usage stats:', updatedStats)
        
        // Show usage notification
        if (updatedStats.packageType === 'consumption_based' || updatedStats.packageType === 'hybrid') {
          const remainingCredits = updatedStats.remainingCredits
          if (remainingCredits <= 5 && remainingCredits > 0) {
            toast(`⚠️ Only ${remainingCredits} analysis credits remaining!`, {
              icon: '⚠️',
              duration: 5000,
              style: {
                background: '#FEF3C7',
                color: '#92400E',
                border: '1px solid #F59E0B'
              }
            })
          } else if (remainingCredits === 0) {
            toast.error('You have used all your analysis credits!')
          }
        }
      }

      return analysisResult

    } catch (error) {
      console.error('❌ Error processing invoice analysis:', error)
      throw error
    }
  }

  /**
   * Get user's current usage statistics
   */
  async getUserUsageStats(userUid?: string) {
    try {
      return await userService.getUserUsageStats(userUid)
    } catch (error) {
      console.error('❌ Error getting usage stats:', error)
      return null
    }
  }

  /**
   * Check if user needs to renew subscription or upgrade package
   */
  async checkSubscriptionStatus(userUid?: string): Promise<{
    needsAttention: boolean
    message: string
    type: 'warning' | 'error' | 'info'
  }> {
    try {
      const usageStats = await this.getUserUsageStats(userUid)
      if (!usageStats) {
        return {
          needsAttention: true,
          message: 'Unable to check subscription status',
          type: 'error'
        }
      }

      // Check subscription expiry
      if (usageStats.subscriptionStatus === 'expired') {
        return {
          needsAttention: true,
          message: 'Your subscription has expired. Please renew to continue.',
          type: 'error'
        }
      }

      // Check time-based expiry warning (15 days)
      if (usageStats.daysRemaining && usageStats.daysRemaining <= 15) {
        return {
          needsAttention: true,
          message: `Your subscription expires in ${usageStats.daysRemaining} days.`,
          type: 'warning'
        }
      }

      // Check consumption-based credits
      if ((usageStats.packageType === 'consumption_based' || usageStats.packageType === 'hybrid') && 
          usageStats.analysisLimit > 0) {
        const remainingCredits = usageStats.remainingCredits
        
        if (remainingCredits === 0) {
          return {
            needsAttention: true,
            message: 'You have used all your analysis credits. Please upgrade your package.',
            type: 'error'
          }
        } else if (remainingCredits <= 10) {
          return {
            needsAttention: true,
            message: `Only ${remainingCredits} analysis credits remaining.`,
            type: 'warning'
          }
        }
      }

      return {
        needsAttention: false,
        message: 'Your subscription is active',
        type: 'info'
      }

    } catch (error) {
      console.error('❌ Error checking subscription status:', error)
      return {
        needsAttention: true,
        message: 'Error checking subscription status',
        type: 'error'
      }
    }
  }
}

// Create and export singleton instance
export const analysisService = new AnalysisService()
export default analysisService