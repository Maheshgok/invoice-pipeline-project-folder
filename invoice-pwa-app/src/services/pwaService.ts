// PWA-specific service for handling offline functionality and sync
import { Workbox } from 'workbox-window'

// Type declarations for Background Sync API
declare global {
  interface ServiceWorkerRegistration {
    sync: SyncManager;
  }
  interface SyncManager {
    register(tag: string): Promise<void>;
  }
  interface WindowEventMap {
    'sync': Event;
  }
};

export interface OfflineQueueItem {
  id: string;
  type: 'upload' | 'update' | 'delete';
  data: any;
  timestamp: number;
  retryCount: number;
}

export interface NetworkStatus {
  isOnline: boolean;
  effectiveType: string;
  downlink: number;
  rtt: number;
}

class PWAService {
  private workbox: Workbox | null = null;
  private isOnline = navigator.onLine;
  private offlineQueue: OfflineQueueItem[] = [];
  private syncInProgress = false;
  private networkListeners: ((status: NetworkStatus) => void)[] = [];
  private installPromptEvent: Event | null = null;

  constructor() {
    this.initializeServiceWorker();
    this.setupNetworkListeners();
    this.loadOfflineQueue();
  }

  private initializeServiceWorker() {
    if ('serviceWorker' in navigator) {
      this.workbox = new Workbox('/sw.js');

      // Service worker update available
      this.workbox.addEventListener('waiting', () => {
        this.showUpdateAvailableNotification();
      });

      // Service worker controlling page
      this.workbox.addEventListener('controlling', () => {
        window.location.reload();
      });

      // Register service worker
      this.workbox.register().catch((error) => {
        console.error('Service Worker registration failed:', error);
      });
    }
  }

  private setupNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyNetworkChange();
      this.processPendingSync();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyNetworkChange();
    });

    // Listen for beforeinstallprompt event
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPromptEvent = event;
    });
  }

  private notifyNetworkChange() {
    const networkStatus = this.getNetworkStatus();
    this.networkListeners.forEach(listener => listener(networkStatus));
  }

  public getNetworkStatus(): NetworkStatus {
    const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
    
    return {
      isOnline: this.isOnline,
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink || 0,
      rtt: connection?.rtt || 0
    };
  }

  public onNetworkChange(callback: (status: NetworkStatus) => void) {
    this.networkListeners.push(callback);
    // Immediately call with current status
    callback(this.getNetworkStatus());
  }

  public removeNetworkListener(callback: (status: NetworkStatus) => void) {
    const index = this.networkListeners.indexOf(callback);
    if (index > -1) {
      this.networkListeners.splice(index, 1);
    }
  }

  // Offline queue management
  public addToOfflineQueue(item: Omit<OfflineQueueItem, 'id' | 'timestamp' | 'retryCount'>) {
    const queueItem: OfflineQueueItem = {
      ...item,
      id: this.generateId(),
      timestamp: Date.now(),
      retryCount: 0
    };

    this.offlineQueue.push(queueItem);
    this.saveOfflineQueue();
  }

  private loadOfflineQueue() {
    try {
      const saved = localStorage.getItem('pwa_offline_queue');
      if (saved) {
        this.offlineQueue = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load offline queue:', error);
    }
  }

  private saveOfflineQueue() {
    try {
      localStorage.setItem('pwa_offline_queue', JSON.stringify(this.offlineQueue));
    } catch (error) {
      console.error('Failed to save offline queue:', error);
    }
  }

  private async processPendingSync() {
    if (this.syncInProgress || !this.isOnline || this.offlineQueue.length === 0) {
      return;
    }

    this.syncInProgress = true;
    const itemsToProcess = [...this.offlineQueue];

    for (const item of itemsToProcess) {
      try {
        await this.processOfflineItem(item);
        this.removeFromQueue(item.id);
      } catch (error) {
        console.error('Failed to process offline item:', error);
        item.retryCount++;
        
        // Remove item if retry count exceeds limit
        if (item.retryCount >= 3) {
          this.removeFromQueue(item.id);
        }
      }
    }

    this.saveOfflineQueue();
    this.syncInProgress = false;
  }

  private async processOfflineItem(item: OfflineQueueItem) {
    // Implement specific sync logic based on item type
    switch (item.type) {
      case 'upload':
        // Re-attempt file upload
        break;
      case 'update':
        // Re-attempt data update
        break;
      case 'delete':
        // Re-attempt deletion
        break;
    }
  }

  private removeFromQueue(id: string) {
    this.offlineQueue = this.offlineQueue.filter(item => item.id !== id);
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // PWA Installation
  public canInstall(): boolean {
    return this.installPromptEvent !== null;
  }

  public async promptInstall(): Promise<boolean> {
    if (!this.installPromptEvent) {
      return false;
    }

    try {
      (this.installPromptEvent as any).prompt();
      const result = await (this.installPromptEvent as any).userChoice;
      this.installPromptEvent = null;
      
      return result.outcome === 'accepted';
    } catch (error) {
      console.error('Installation prompt failed:', error);
      return false;
    }
  }

  public isStandalone(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone ||
           document.referrer.includes('android-app://');
  }

  // Service Worker Update
  private showUpdateAvailableNotification() {
    // Implement update notification UI
    console.log('App update available');
  }

  public async skipWaiting() {
    if (this.workbox) {
      this.workbox.messageSkipWaiting();
    }
  }

  // Background Sync
  public async requestBackgroundSync(tag: string, data?: any) {
    if ('serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register(tag);
        
        if (data) {
          // Store data for background sync
          localStorage.setItem(`bg_sync_${tag}`, JSON.stringify(data));
        }
      } catch (error) {
        console.error('Background sync registration failed:', error);
      }
    }
  }

  // Push Notifications
  public async requestNotificationPermission(): Promise<NotificationPermission> {
    if (!('Notification' in window)) {
      return 'denied';
    }

    if (Notification.permission === 'default') {
      return await Notification.requestPermission();
    }

    return Notification.permission;
  }

  public async subscribeToPushNotifications() {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(
          import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
        )
      });

      return subscription;
    } catch (error) {
      console.error('Push subscription failed:', error);
      return null;
    }
  }

  private urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // Cache management
  public async clearCache() {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      );
    }
  }

  public async getCacheSize(): Promise<number> {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return estimate.usage || 0;
    }
    return 0;
  }
}

// Export singleton instance
export const pwaService = new PWAService();
export default pwaService;