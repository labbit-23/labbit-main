// lib/notificationsHelper.js

const NotificationsHelper = {
  // Request permission to display notifications
  requestPermission() {
    if (Notification.permission === 'default') {
      return Notification.requestPermission();
    }
    return Promise.resolve(Notification.permission);
  },

  // Show an in-browser notification
  showNotification(title, options = {}) {
    if (Notification.permission === 'granted') {
      new Notification(title, options);
    }
  },

  // Register a service worker for push notifications
  async registerServiceWorker(scriptUrl) {
    if ('serviceWorker' in navigator) {
      return navigator.serviceWorker.register(scriptUrl);
    }
    return null;
  },

  // Subscribe for push notifications (to be sent from backend)
  async subscribeUserToPush() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: '<Your Public VAPID Key>'
    });
    // Send subscription to your backend
    // await sendSubscriptionToServer(subscription);
    return subscription;
  },

  // Unified notify function, context-aware
  notify(type, payload) {
    switch(type) {
      case "visitAssigned":
        NotificationsHelper.showNotification(
          "New Visit Assigned",
          { body: `You have a new assigned visit: ${payload.details}` }
        );
        break;
      case "newUnassignedVisit":
        NotificationsHelper.showNotification(
          "Unassigned Visit Available",
          { body: "A new unassigned visit is available for you." }
        );
        break;
      case "adminMessage":
        NotificationsHelper.showNotification(
          "Admin Message",
          { body: payload.message }
        );
        break;
      case "quickBookingCreated":
        NotificationsHelper.showNotification(
            "New Quick Booking",
            { body: `A new Quick Booking has been created.` }
        );
        break;

      // Add more notification types as needed
      default:
        NotificationsHelper.showNotification(
          "Notification",
          { body: payload.message || "" }
        );
        break;
    }
  }
};

export default NotificationsHelper;
