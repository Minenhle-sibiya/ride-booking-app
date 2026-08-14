// ============ CONFIGURATION ============
let currentUser = null;
let socket = null;
let locationInterval = null;
let currentRideId = null;
let driverNotificationCount = 0;

// ============ DOM REFS ============
const driverRides = document.getElementById('driver-rides');

// ============ LOAD USER ============
function loadUser() {
  const userData = localStorage.getItem('ridebook_user');
  if (userData) {
    currentUser = JSON.parse(userData);
    return true;
  }
  return false;
}
loadUser();

// ============ SOCKET.IO ============
function initSocket() {
  try {
    socket = io();
    
    socket.on('new-ride', (ride) => {
      loadPendingRides();
      showDriverNotification(
        'New Ride Available',
        `Ride request from ${ride.riderName || 'a rider'}`,
        'info'
      );
    });
    
    socket.on('ride-updated', (ride) => {
      if (ride.driverId === currentUser?.id) {
        const statusMessages = {
            'accepted': 'You accepted a ride',
            'in_progress': 'Trip started - sharing location',
            'completed': 'Ride completed!',
            'cancelled': 'Ride cancelled'
        };
        showDriverNotification(
            'Ride Update',
            statusMessages[ride.status] || `Status: ${ride.status}`,
            'info'
        );
        loadPendingRides();
      }
    });
    
    // Listen for ride status updates
    socket.on('ride-status-update', (ride) => {
      if (ride.driverId === currentUser?.id) {
        loadPendingRides();
      }
    });
    
    console.log('Driver socket connected');
  } catch (err) {
    console.log('Socket not available (running in demo mode)');
  }
}

initSocket();

// ============ NOTIFICATIONS ============
function showNotification(message) {
  const existing = document.querySelector('.driver-notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = 'driver-notification';
  notif.textContent = message;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.5s';
    setTimeout(() => notif.remove(), 500);
  }, 3000);
}

// ============ IN-APP NOTIFICATIONS FOR DRIVER ============
function showDriverNotification(title, message, type = 'info') {
    const container = document.querySelector('.driver-notification-center');
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.className = 'driver-notification-center';
        newContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 99999;
            max-width: 380px;
            width: 100%;
        `;
        document.body.appendChild(newContainer);
    }
    
    const container2 = document.querySelector('.driver-notification-center');
    const notif = document.createElement('div');
    const borderColor = type === 'success' ? '#00d4aa' : type === 'error' ? '#e74c3c' : '#3498db';
    notif.style.cssText = `
        background: #1a1a2e;
        color: #ffffff;
        padding: 14px 18px;
        border-radius: 10px;
        margin-bottom: 10px;
        border-left: 4px solid ${borderColor};
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        animation: slideInRight 0.4s ease;
    `;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notif.innerHTML = `
        <div style="display:flex;align-items:flex-start;gap:12px;">
            <span style="font-size:1.2rem;">${icons[type] || 'ℹ️'}</span>
            <div style="flex:1;">
                <div style="font-weight:600;font-size:0.9rem;color:#00d4aa;margin-bottom:3px;">${title}</div>
                <div style="font-size:0.85rem;color:#cccccc;line-height:1.4;">${message}</div>
                <div style="font-size:0.7rem;color:#666666;margin-top:4px;">${new Date().toLocaleTimeString()}</div>
            </div>
        </div>
    `;
    
    container2.prepend(notif);
    
    setTimeout(() => {
        notif.style.opacity = '0';
        notif.style.transition = 'opacity 0.4s';
        setTimeout(() => {
            if (notif.parentNode) {
                notif.remove();
            }
        }, 400);
    }, 6000);
    
    driverNotificationCount++;
    updateDriverBadge();
}

function updateDriverBadge() {
    const badge = document.getElementById('driver-notif-badge');
    if (badge) {
        badge.textContent = driverNotificationCount;
        badge.style.display = driverNotificationCount > 0 ? 'inline' : 'none';
    }
}

// ============ LOCATION SHARING ============
function startSharingLocation(rideId) {
  currentRideId = rideId;
  
  if (navigator.geolocation) {
    if (locationInterval) {
      clearInterval(locationInterval);
    }
    
    showDriverNotification(
      'Location Sharing',
      'Sharing your location with the rider',
      'info'
    );
    
    locationInterval = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          if (socket && currentRideId) {
            socket.emit('driver-location', {
              rideId: currentRideId,
              driverId: currentUser?.id,
              lat: latitude,
              lng: longitude
            });
          }
        },
        (error) => {
          console.error('Location error:', error);
        },
        { enableHighAccuracy: true }
      );
    }, 3000);
  } else {
    showDriverNotification(
      'Error',
      'Geolocation not supported on this device',
      'error'
    );
  }
}

function stopSharingLocation() {
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
  currentRideId = null;
  showDriverNotification(
    'Location Sharing',
    'Location sharing stopped',
    'info'
  );
}

// ============ UPDATE RIDE ============
async function updateRide(id, status) {
  try {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    console.log('Updating ride', id, 'to status:', status);
    
    const response = await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: status,
        driverId: currentUser?.id 
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      const statusMessages = {
        'accepted': 'Ride accepted!',
        'in_progress': 'Trip started! Sharing location...',
        'completed': 'Ride completed!',
        'cancelled': 'Ride cancelled'
      };
      
      showDriverNotification(
        'Success',
        statusMessages[status] || 'Ride updated',
        'success'
      );
      
      // Start sharing location when trip starts
      if (status === 'in_progress') {
        startSharingLocation(id);
      }
      
      // Stop sharing when trip completes or cancels
      if (status === 'completed' || status === 'cancelled') {
        stopSharingLocation();
      }
      
      await loadPendingRides();
    } else {
      showDriverNotification(
        'Error',
        data.error || 'Update failed',
        'error'
      );
      console.error('Update error:', data);
    }
  } catch (err) {
    console.error('Error updating ride:', err);
    showDriverNotification(
      'Error',
      'Network error. Please try again.',
      'error'
    );
  } finally {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);
  }
}

// ============ LOAD PENDING RIDES ============
async function loadPendingRides() {
  if (!currentUser) {
    console.log('No user logged in');
    return;
  }
  
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();
    
    const activeRides = rides.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    
    const countNumber = document.getElementById('countNumber');
    if (countNumber) {
      const pendingCount = activeRides.filter(r => r.status === 'pending').length;
      countNumber.textContent = pendingCount;
    }
    
    if (activeRides.length === 0) {
      driverRides.innerHTML = `
        <div class="no-rides">
          <p>No active rides available</p>
          <p>Check back later for new ride requests</p>
        </div>
      `;
      return;
    }
    
    driverRides.innerHTML = '';
    activeRides.forEach(ride => {
      const card = document.createElement('div');
      card.className = `ride-card ${ride.status}`;
      
      const statusMap = {
        pending: 'Pending',
        accepted: 'Accepted',
        in_progress: 'In Progress',
        completed: 'Completed',
        cancelled: 'Cancelled'
      };
      
      const fare = ride.estimatedFare || 0;
      const distance = ride.distance || 0;
      const duration = ride.duration || 0;
      const riderName = ride.riderName || 'Unknown Rider';
      
      // Get address or coordinates
      const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
      const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
      
      card.innerHTML = `
        <div class="ride-card-header">
          <div>
            <span class="status-badge ${ride.status}">${statusMap[ride.status] || ride.status}</span>
            <span class="ride-type-badge">${ride.rideType || 'economy'}</span>
          </div>
          <span class="ride-time">${new Date(ride.createdAt).toLocaleTimeString()}</span>
        </div>
        <div class="ride-coords">
          <div><strong>Pickup:</strong> ${pickupDisplay}</div>
          <div><strong class="dropoff-label">Dropoff:</strong> ${dropoffDisplay}</div>
        </div>
        <div class="ride-meta">
          <span>R${fare.toFixed(2)}</span>
          <span>${distance.toFixed(1)} km</span>
          <span>${duration} min</span>
          <span>👤 ${riderName}</span>
        </div>
        <div class="ride-actions">
          ${ride.status === 'pending' ? 
            `<button class="btn-accept" onclick="updateRide('${ride._id}', 'accepted')">Accept</button>` : ''}
          ${ride.status === 'accepted' ? 
            `<button class="btn-start" onclick="updateRide('${ride._id}', 'in_progress')">Start Trip</button>
             <button class="btn-cancel" onclick="updateRide('${ride._id}', 'cancelled')">Cancel</button>` : ''}
          ${ride.status === 'in_progress' ? 
            `<button class="btn-complete" onclick="updateRide('${ride._id}', 'completed')">Complete</button>` : ''}
        </div>
        ${ride.status === 'in_progress' ? `
          <div style="margin-top:8px;font-size:0.75rem;color:#3498db;border-top:1px solid #2a2a4a;padding-top:8px;">
            📍 Sharing live location with rider
          </div>
        ` : ''}
      `;
      driverRides.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading rides:', err);
    driverRides.innerHTML = `
      <div class="no-rides">
        <p>Error loading rides</p>
        <p>Please refresh the page</p>
      </div>
    `;
  }
}

// ============ INITIALIZE ============
loadPendingRides();

// Auto-refresh every 5 seconds
setInterval(loadPendingRides, 5000);

console.log('RideBook Driver App Loaded');
console.log('Driver:', currentUser?.username || 'Not logged in');
console.log('Waiting for ride requests...');