import { auth } from '../config/firebase';

/**
 * Firebase Configuration Tester
 * Helps debug Firebase authentication setup issues
 */
export class FirebaseConfigTester {
  
  static testConfiguration(): { isValid: boolean; issues: string[]; config: any } {
    const issues: string[] = [];
    const config = auth.app.options;
    
    console.log('🔧 Firebase Configuration Test');
    console.log('═══════════════════════════════');
    
    // Test API Key
    if (!config.apiKey) {
      issues.push('Missing API Key');
    } else if (config.apiKey.startsWith('AIza')) {
      console.log('✅ API Key format looks correct');
    } else {
      issues.push('API Key format appears invalid');
    }
    
    // Test Auth Domain
    if (!config.authDomain) {
      issues.push('Missing Auth Domain');
    } else if (config.authDomain === 'watch-mail-trial.firebaseapp.com') {
      console.log('✅ Auth Domain looks correct');
    } else {
      issues.push('Auth Domain may be incorrect');
    }
    
    // Test Project ID
    if (!config.projectId) {
      issues.push('Missing Project ID');
    } else if (config.projectId === 'watch-mail-trial') {
      console.log('✅ Project ID is correct');
    } else {
      issues.push('Project ID mismatch');
    }
    
    // Test App ID
    if (!config.appId) {
      issues.push('Missing App ID - This is likely the main issue!');
    } else if (config.appId.startsWith('1:812016027146:web:')) {
      console.log('✅ App ID format looks correct');
    } else {
      issues.push('App ID format appears invalid');
    }
    
    console.log('\n📊 Configuration Status:');
    console.log('API Key:', config.apiKey ? '✅ Present' : '❌ Missing');
    console.log('Auth Domain:', config.authDomain || '❌ Missing');
    console.log('Project ID:', config.projectId || '❌ Missing');
    console.log('App ID:', config.appId ? '✅ Present' : '❌ Missing');
    console.log('Storage Bucket:', config.storageBucket || '❌ Missing');
    console.log('Messaging Sender ID:', config.messagingSenderId || '❌ Missing');
    
    const isValid = issues.length === 0;
    
    if (!isValid) {
      console.log('\n❌ Configuration Issues:');
      issues.forEach(issue => console.log(`  - ${issue}`));
      console.log('\n🔗 To fix: https://console.firebase.google.com/project/watch-mail-trial/settings/general/');
    } else {
      console.log('\n✅ Firebase configuration appears valid!');
    }
    
    return { isValid, issues, config };
  }
  
  static async testAuthentication(): Promise<void> {
    try {
      console.log('\n🔐 Testing Firebase Authentication Setup...');
      
      // Test if auth is initialized
      if (auth) {
        console.log('✅ Firebase Auth initialized');
        console.log('📱 Current user:', auth.currentUser?.email || 'None');
      } else {
        console.log('❌ Firebase Auth not initialized');
        return;
      }
      
      // Test auth domain accessibility
      const authDomain = auth.app.options.authDomain;
      if (authDomain) {
        console.log('🌐 Testing auth domain accessibility...');
        try {
          const response = await fetch(`https://${authDomain}/__/firebase/init.js`);
          if (response.ok) {
            console.log('✅ Auth domain is accessible');
          } else {
            console.log('⚠️  Auth domain returned:', response.status);
          }
        } catch (error) {
          console.log('❌ Auth domain not accessible:', error);
        }
      }
      
    } catch (error) {
      console.log('❌ Authentication test failed:', error);
    }
  }
}

// Auto-run tests in development
if (import.meta.env.DEV) {
  console.log('🧪 Running Firebase configuration tests...');
  FirebaseConfigTester.testConfiguration();
  FirebaseConfigTester.testAuthentication();
}