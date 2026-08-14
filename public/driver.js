// ============ CONFIGURATION ============
let currentUser = null;
let socket = null;

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
    
    socket.on('new-ride', () => {
      loadPendingRides();
      showNotification(' New ride available!', 'info');
    });
    
    socket.on('ride-updated', () => {
      loadPendingRides();
    });
    
    console.log(' Driver socket connected');
  } catch (err) {
    console.log(' Socket not available (running in demo mode)');
  }
}

initSocket();

// ============ NOTIFICATIONS ============
function showNotification(message, type = 'info') {
  const existing = document.querySelector('.driver-notification');
  if (existing) existing.remove();
  
  const notif = document.createElement('div');
  notif.className = 'driver-notification';
  notif.textContent = message;
  notif.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: #1a1a2e;
    color: #fff;
    padding: 12px 20px;
    border-radius: 8px;
    border-left: 4px solid #00d4aa;
    z-index: 1000;
    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
    animation: slideIn 0.3s ease;
    max-width: 350px;
  `;
  document.body.appendChild(notif);
  
  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.5s';
    setTimeout(() => notif.remove(), 500);
  }, 3000);
}

// ============ LOAD PENDING RIDES ============
async function loadPendingRides() {
  if (!currentUser) return;
  
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();
    
    // Filter active rides (not completed or cancelled)
    const activeRides = rides.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    
    // Update count if element exists
    const countNumber = document.getElementById('countNumber');
    if (countNumber) {
      const pendingCount = activeRides.filter(r => r.status === 'pending').length;
      countNumber.textContent = pendingCount;
    }
    
    if (activeRides.length === 0) {
      driverRides.innerHTML = `
        <div class="no-rides">
          <p> No active rides available</p>
          <p style="font-size:0.85rem;color:#666;margin-top:8px;">Check back later for new ride requests</p>
        </div>
      `;
      return;
    }
    
    driverRides.innerHTML = '';
    activeRides.forEach(ride => {
      const card = document.createElement('div');
      card.className = `ride-card ${ride.status}`;
      
      const statusMap = {
        pending: '⏳ Pending',
        accepted: '✅ Accepted',
        in_progress: ' In Progress',
        completed: '✔️ Completed',
        cancelled: '❌ Cancelled'
      };
      
      // Show ride details with pricing
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <div>
            <span class="status-badge ${ride.status}">${statusMap[ride.status] || ride.status}</span>
            <span style="background:#2a2a4a;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;text-transform:capitalize;">${ride.rideType || 'economy'}</span>
          </div>
          <span style="font-size:0.75rem;color:#666;">${new Date(ride.createdAt).toLocaleTimeString()}</span>
        </div>
        <div class="coords">
          <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
          <strong>Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
        </div>
        <div class="ride-meta" style="display:flex;gap:12px;font-size:0.85rem;color:#888;margin-top:6px;">
          <span> $${(ride.estimatedFare || 0).toFixed(2)}</span>
          <span> ${(ride.distance || 0).toFixed(1)} km</span>
          <span> ${ride.duration || 0} min</span>
          ${ride.riderName ? `<span>👤 ${ride.riderName}</span>` : ''}
        </div>
        <div style="margin-top:10px;">
          ${ride.status === 'pending' ? 
            `<button class="accept-btn" onclick="updateRide('${ride._id}', 'accepted')">✅ Accept</button>` : ''}
          ${ride.status === 'accepted' ? 
            `<button class="complete-btn" onclick="updateRide('${ride._id}', 'in_progress')">🚗 Start Trip</button>
             <button class="complete-btn" style="background:#e74c3c;" onclick="updateRide('${ride._id}', 'cancelled')">❌ Cancel</button>` : ''}
          ${ride.status === 'in_progress' ? 
            `<button class="complete-btn" onclick="updateRide('${ride._id}', 'completed')">✅ Complete</button>` : ''}
        </div>
      `;
      driverRides.appendChild(card);
    });
  } catch (err) {
    console.error('Error loading rides:', err);
    driverRides.innerHTML = '<p class="no-rides">❌ Error loading rides. Please refresh.</p>';
  }
}

// ============ UPDATE RIDE ============
async function updateRide(id, status) {
  try {
    // Show loading state on buttons
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = true);
    
    const response = await fetch(`/api/rides/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        status: status,
        driverId: currentUser?.id 
      })
    });
    
    if (response.ok) {
      const statusMessages = {
        'accepted': '✅ Ride accepted!',
        'in_progress': ' Trip started!',
        'completed': '✅ Ride completed!',
        'cancelled': '❌ Ride cancelled'
      };
      showNotification(statusMessages[status] || 'Ride updated', 'success');
      loadPendingRides();
    } else {
      const data = await response.json();
      showNotification('❌ ' + (data.error || 'Update failed'), 'error');
    }
  } catch (err) {
    console.error('Error updating ride:', err);
    showNotification('❌ Network error. Please try again.', 'error');
  } finally {
    const buttons = document.querySelectorAll('button');
    buttons.forEach(btn => btn.disabled = false);
  }
}

// ============ INITIALIZE ============
loadPendingRides();

// Auto-refresh every 5 seconds
setInterval(loadPendingRides, 5000);

console.log(' RideBook Driver App Loaded!');
console.log(' Driver:', currentUser?.username || 'Not logged in');
console.log(' Waiting for ride requests...');