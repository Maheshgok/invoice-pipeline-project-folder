/**
 * Security Validation Service
 * Comprehensive security checks and validation for the invoice processing system
 */

import { auth } from '../config/firebase';

export interface SecurityValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  details: {
    authenticationStatus: 'valid' | 'invalid' | 'missing';
    tokenStatus: 'valid' | 'expired' | 'invalid' | 'missing';
    userPermissions: string[];
    sessionValidUntil?: Date;
  };
}

export interface FileValidationResult {
  isValid: boolean;
  errors: string[];
  fileInfo: {
    name: string;
    size: number;
    type: string;
    lastModified: number;
  };
}

export class SecurityValidator {
  // Maximum file size (10MB)
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;
  
  // Allowed MIME types
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf'
  ];
  
  // Allowed file extensions
  private static readonly ALLOWED_EXTENSIONS = [
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'
  ];

  /**
   * Comprehensive authentication validation
   */
  static async validateAuthentication(): Promise<SecurityValidationResult> {
    const result: SecurityValidationResult = {
      isValid: false,
      errors: [],
      warnings: [],
      details: {
        authenticationStatus: 'missing',
        tokenStatus: 'missing',
        userPermissions: []
      }
    };

    try {
      // Check if user is authenticated
      const currentUser = auth.currentUser;
      if (!currentUser) {
        result.errors.push('User not authenticated');
        result.details.authenticationStatus = 'missing';
        return result;
      }

      result.details.authenticationStatus = 'valid';

      // Validate token
      try {
        const idToken = await currentUser.getIdToken();
        if (!idToken) {
          result.errors.push('No authentication token available');
          result.details.tokenStatus = 'missing';
          return result;
        }

        // Decode token to check expiration
        const tokenPayload = JSON.parse(atob(idToken.split('.')[1]));
        const expirationTime = new Date(tokenPayload.exp * 1000);
        const now = new Date();

        if (expirationTime <= now) {
          result.errors.push('Authentication token has expired');
          result.details.tokenStatus = 'expired';
          return result;
        }

        result.details.tokenStatus = 'valid';
        result.details.sessionValidUntil = expirationTime;
        
        // Check if token expires soon (within 5 minutes)
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        if (expirationTime <= fiveMinutesFromNow) {
          result.warnings.push('Authentication token expires soon');
        }

        // Validate required user properties
        if (!currentUser.email) {
          result.errors.push('User email not available');
          return result;
        }

        if (!currentUser.emailVerified) {
          result.warnings.push('User email not verified');
        }

        // Check user permissions (based on email domain or other criteria)
        result.details.userPermissions = this.getUserPermissions(currentUser.email);

        result.isValid = result.errors.length === 0;
        return result;

      } catch (tokenError) {
        result.errors.push(`Token validation failed: ${tokenError}`);
        result.details.tokenStatus = 'invalid';
        return result;
      }

    } catch (error) {
      result.errors.push(`Authentication validation failed: ${error}`);
      return result;
    }
  }

  /**
   * Validate file for upload
   */
  static validateFile(file: File): FileValidationResult {
    const result: FileValidationResult = {
      isValid: false,
      errors: [],
      fileInfo: {
        name: file.name,
        size: file.size,
        type: file.type,
        lastModified: file.lastModified
      }
    };

    // Check file size
    if (file.size > this.MAX_FILE_SIZE) {
      result.errors.push(`File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size of ${this.MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (file.size === 0) {
      result.errors.push('File is empty');
    }

    // Check MIME type
    if (!this.ALLOWED_MIME_TYPES.includes(file.type)) {
      result.errors.push(`File type '${file.type}' is not allowed`);
    }

    // Check file extension
    const fileExtension = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
    if (!this.ALLOWED_EXTENSIONS.includes(fileExtension)) {
      result.errors.push(`File extension '${fileExtension}' is not allowed`);
    }

    // Check for potentially malicious filename patterns
    if (this.hasSuspiciousFilename(file.name)) {
      result.errors.push('Filename contains potentially unsafe characters');
    }

    result.isValid = result.errors.length === 0;
    return result;
  }

  /**
   * Validate multiple files for batch upload
   */
  static validateFiles(files: File[]): { validFiles: File[], invalidFiles: { file: File, errors: string[] }[] } {
    const validFiles: File[] = [];
    const invalidFiles: { file: File, errors: string[] }[] = [];

    for (const file of files) {
      const validation = this.validateFile(file);
      if (validation.isValid) {
        validFiles.push(file);
      } else {
        invalidFiles.push({ file, errors: validation.errors });
      }
    }

    return { validFiles, invalidFiles };
  }

  /**
   * Get user permissions based on email or other criteria
   */
  private static getUserPermissions(email: string): string[] {
    const permissions: string[] = ['upload', 'view_results'];
    
    // Add additional permissions based on email domain or other criteria
    if (email.endsWith('@gmail.com') || email.endsWith('@company.com')) {
      permissions.push('full_access');
    }

    return permissions;
  }

  /**
   * Check for suspicious filename patterns
   */
  private static hasSuspiciousFilename(filename: string): boolean {
    // Check for path traversal attempts
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return true;
    }

    // Check for executable extensions
    const suspiciousExtensions = ['.exe', '.bat', '.cmd', '.sh', '.js', '.html', '.php'];
    const lowerFilename = filename.toLowerCase();
    
    return suspiciousExtensions.some(ext => lowerFilename.endsWith(ext));
  }

  /**
   * Validate Firebase configuration
   */
  static validateFirebaseConfig(): { isValid: boolean, errors: string[] } {
    const errors: string[] = [];

    const requiredVars = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_AUTH_DOMAIN', 
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_STORAGE_BUCKET',
      'VITE_FIREBASE_MESSAGING_SENDER_ID',
      'VITE_FIREBASE_APP_ID'
    ];

    for (const varName of requiredVars) {
      if (!import.meta.env[varName]) {
        errors.push(`Missing required environment variable: ${varName}`);
      }
    }

    // Validate Firebase project ID format
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
    if (projectId && !/^[a-z0-9-]+$/.test(projectId)) {
      errors.push('Invalid Firebase project ID format');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Generate security report
   */
  static async generateSecurityReport(): Promise<{
    authentication: SecurityValidationResult;
    firebaseConfig: { isValid: boolean, errors: string[] };
    timestamp: Date;
  }> {
    const [authValidation, configValidation] = await Promise.all([
      this.validateAuthentication(),
      Promise.resolve(this.validateFirebaseConfig())
    ]);

    return {
      authentication: authValidation,
      firebaseConfig: configValidation,
      timestamp: new Date()
    };
  }
}