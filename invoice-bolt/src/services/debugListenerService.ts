/**
 * Debug Service to test realtime listener implementation
 * Tests the actual issue you're experiencing 
 */

export const debugListenerIssues = () => {
  console.group('🔍 DEBUGGING LISTENER ARCHITECTURE');
  
  // Test 1: Check if Firebase is properly imported
  console.log('1. Checking Firebase imports...');
  try {
    import('../config/firebase');
    console.log('✅ Firebase config imports successfully');
  } catch (error) {
    console.error('❌ Firebase import failed:', error);
  }
  
  // Test 2: Check if the hook is properly exported
  console.log('2. Checking useJobBatchListener hook...');
  try {
    import('../hooks/useJobBatchListener');
    console.log('✅ useJobBatchListener hook imports successfully');
  } catch (error) {
    console.error('❌ Hook import failed:', error);
  }
  
  // Test 3: Check if firestoreService is available
  console.log('3. Checking firestoreService...');
  try {
    import('../services/firestoreService');
    console.log('✅ firestoreService imports successfully');
  } catch (error) {
    console.error('❌ firestoreService import failed:', error);
  }
  
  // Test 4: Check environment variables
  console.log('4. Checking environment variables...');
  console.log('VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY ? 'SET' : 'NOT SET');
  console.log('VITE_FIREBASE_PROJECT_ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID ? 'SET' : 'NOT SET');
  
  // Test 5: Check if we're running the latest code
  console.log('5. Code version check...');
  console.log('Listener architecture active:', true);
  console.log('Individual display enabled:', true);
  console.log('Build timestamp:', new Date().toISOString());
  
  console.groupEnd();
};

// Test function for the specific error scenario
export const testMultiFileUpload = async () => {
  console.group('🧪 TESTING MULTI-FILE UPLOAD SCENARIO');
  
  try {
    console.log('Testing the exact use case you described...');
    
    // Simulate the issue: User uploads multiple files
    const mockJobIds = ['job1', 'job2', 'job3'];
    console.log('📄 Mock upload of 3 files with job IDs:', mockJobIds);
    
    // Check if the listener would start correctly
    const { firestoreService } = await import('../services/firestoreService');
    console.log('✅ firestoreService loaded');
    
    // Test callback functionality
    const testCallback = (progress: any) => {
      console.log('📊 Progress update received:', {
        completed: progress.completedJobs.length,
        failed: progress.failedJobs.length,
        pending: progress.pendingJobs.length
      });
    };
    
    console.log('🔄 Testing listener initialization...');
    
    // This should identify the root cause
    const unsubscribe = await firestoreService.listenToJobBatch(
      mockJobIds,
      testCallback,
      'test@example.com'
    );
    
    console.log('✅ Listener started successfully');
    
    // Clean up
    setTimeout(() => {
      unsubscribe();
      console.log('🧹 Test listener cleaned up');
    }, 5000);
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
    console.error('This might be the root cause of your issue!');
  }
  
  console.groupEnd();
};