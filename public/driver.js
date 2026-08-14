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
      showNotification('New ride available!');
    });
    
    socket.on('ride-updated', () => {
      loadPendingRides();
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
        'in_progress': 'Trip started!',
        'completed': 'Ride completed!',
        'cancelled': 'Ride cancelled'
      };
      showNotification(statusMessages[status] || 'Ride updated');
      await loadPendingRides();
    } else {
      showNotification('Error: ' + (data.error || 'Update failed'));
      console.error('Update error:', data);
    }
  } catch (err) {
    console.error('Error updating ride:', err);
    showNotification('Network error. Please try again.');
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
      
      card.innerHTML = `
        <div class="ride-card-header">
          <div>
            <span class="status-badge ${ride.status}">${statusMap[ride.status] || ride.status}</span>
            <span class="ride-type-badge">${ride.rideType || 'economy'}</span>
          </div>
          <span class="ride-time">${new Date(ride.createdAt).toLocaleTimeString()}</span>
        </div>
        <div class="ride-coords">
          <strong>Pickup:</strong> ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
          <strong class="dropoff-label">Dropoff:</strong> ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
        </div>
        <div class="ride-meta">
          <span>R${fare.toFixed(2)}</span>
          <span>${distance.toFixed(1)} km</span>
          <span>${duration} min</span>
          <span>${riderName}</span>
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

setInterval(loadPendingRides, 5000);

console.log('RideBook Driver App Loaded');
console.log('Driver:', currentUser?.username || 'Not logged in');
console.log('Waiting for ride requests...');