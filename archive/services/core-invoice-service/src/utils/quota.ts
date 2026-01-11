import { db } from '../index'

export async function validateUsageQuota(userId: string, filesCount: number): Promise<{ allowed: boolean, remaining: number }> {
  try {
    // Get user's current package
    const userDoc = await db.collection('users').doc(userId).get()
    if (!userDoc.exists) {
      throw new Error('User not found')
    }
    
    const userData = userDoc.data()!
    const packageId = userData.packageId
    
    if (!packageId) {
      // User has no package, apply default limits
      return { allowed: filesCount <= 5, remaining: Math.max(0, 5 - filesCount) }
    }
    
    // Get package details
    const packageDoc = await db.collection('packages').doc(packageId).get()
    if (!packageDoc.exists) {
      throw new Error('Package not found')
    }
    
    const packageData = packageDoc.data()!
    
    if (packageData.isUnlimited) {
      return { allowed: true, remaining: Infinity }
    }
    
    // Count current month usage
    const thisMonth = new Date()
    thisMonth.setDate(1)
    thisMonth.setHours(0, 0, 0, 0)
    
    const usageQuery = await db.collectionGroup('invoice_results')
      .where('userUID', '==', userId)
      .where('createdAt', '>=', thisMonth)
      .get()
    
    const currentUsage = usageQuery.size
    const remaining = Math.max(0, packageData.analysisLimit - currentUsage)
    
    return {
      allowed: filesCount <= remaining,
      remaining: remaining - filesCount
    }
  } catch (error) {
    console.error('Error validating usage quota:', error)
    // Default to allowing small uploads on error
    return { allowed: filesCount <= 3, remaining: 3 - filesCount }
  }
}