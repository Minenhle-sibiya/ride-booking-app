// ============ CONFIGURATION ============
let currentUser = null;
let socket = null;
let selectedRideType = 'economy';
let selectedPayment = 'cash';
let currentFilter = 'all';

// ============ LOAD USER ============
function loadUser() {
  const userData = localStorage.getItem('ridebook_user');
  if (userData) {
    currentUser = JSON.parse(userData);
    // Update username display if element exists
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
      userNameEl.textContent = '👤 ' + (currentUser.name || currentUser.username);
    }
    return true;
  }
  return false;
}
loadUser();

// ============ MAP INITIALIZATION ============
const map = L.map('map').setView([51.505, -0.09], 13);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// ============ STATE ============
let pickupMarker = null;
let dropoffMarker = null;
let clickState = 'pickup';
let rideMarkers = [];

// ============ DOM REFS ============
const instruction = document.getElementById('instruction');
const rideControls = document.getElementById('ride-controls');
const requestBtn = document.getElementById('request-btn');
const resetBtn = document.getElementById('reset-btn');
const ridesList = document.getElementById('rides-list');

// ============ MARKER ICONS ============
const greenIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const redIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// ============ NOTIFICATIONS ============
function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) {
    // Create container if it doesn't exist
    const newContainer = document.createElement('div');
    newContainer.id = 'notification-container';
    document.body.appendChild(newContainer);
  }
  
  const container2 = document.getElementById('notification-container');
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  container2.appendChild(notif);
  
  setTimeout(() => {
    notif.classList.add('fade-out');
    setTimeout(() => {
      if (notif.parentNode) {
        notif.remove();
      }
    }, 400);
  }, 3500);
}

// ============ SOCKET.IO ============
function initSocket() {
  try {
    socket = io();
    
    socket.on('new-ride', (ride) => {
      if (currentUser && currentUser.role === 'driver') {
        showNotification('🚗 New ride available!', 'info');
      }
    });
    
    socket.on('ride-updated', (ride) => {
      updateRideInList(ride);
    });
    
    socket.on('ride-status-update', (ride) => {
      updateRideInList(ride);
      const statusMessages = {
        'accepted': '✅ Your ride has been accepted!',
        'in_progress': '🚗 Driver is on the way!',
        'completed': '⭐ Ride completed! Please rate your driver.',
        'cancelled': '❌ Your ride has been cancelled.'
      };
      if (statusMessages[ride.status]) {
        showNotification(statusMessages[ride.status], 'success');
      }
    });
    
    console.log('🔌 Socket connected');
  } catch (err) {
    console.log('⚠️ Socket not available (running in demo mode)');
  }
}

// Initialize socket
initSocket();

// ============ RIDE TYPE & FARE CALCULATION ============
document.querySelectorAll('.ride-type-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.ride-type-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    selectedRideType = this.dataset.type;
    updateRideDetails();
  });
});

const paymentMethod = document.getElementById('paymentMethod');
if (paymentMethod) {
  paymentMethod.addEventListener('change', function() {
    selectedPayment = this.value;
  });
}

function calculateRideDetails(pickup, dropoff, rideType) {
  // Haversine formula for distance
  const R = 6371; // Earth's radius in km
  const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180;
  const dLng = (dropoff.lng - pickup.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(pickup.lat * Math.PI/180) * Math.cos(dropoff.lat * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  const perKmRates = {
    economy: 1.50,
    premium: 2.50,
    suv: 3.00,
    xl: 3.50
  };
  const rate = perKmRates[rideType] || perKmRates.economy;
  const baseFare = 2.50;
  const fare = baseFare + (distance * rate);
  const duration = distance * 2;
  
  return {
    distance: Math.round(distance * 100) / 100,
    fare: Math.round((fare + 1) * 100) / 100,
    duration: Math.round(duration)
  };
}

function updateRideDetails() {
  const rideDetails = document.getElementById('ride-details');
  if (!rideDetails) return;
  
  if (!pickupMarker || !dropoffMarker) {
    rideDetails.classList.add('hidden');
    return;
  }
  
  const pickup = pickupMarker.getLatLng();
  const dropoff = dropoffMarker.getLatLng();
  const details = calculateRideDetails(pickup, dropoff, selectedRideType);
  
  document.getElementById('rideDistance').textContent = details.distance;
  document.getElementById('rideDuration').textContent = details.duration;
  document.getElementById('rideFare').textContent = '$' + details.fare.toFixed(2);
  rideDetails.classList.remove('hidden');
}

// ============ MAP CLICK HANDLER ============
map.on('click', function(e) {
  if (!currentUser) {
    showNotification('🔐 Please login first!', 'error');
    return;
  }
  
  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker(e.latlng, { icon: greenIcon })
      .addTo(map)
      .bindPopup('📍 Pickup')
      .openPopup();
    clickState = 'dropoff';
    instruction.textContent = '📍 Now click to set your dropoff location';
    updateRideDetails();
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup('📍 Dropoff')
      .openPopup();
    clickState = 'done';
    instruction.textContent = '✅ Ready! Click "Request Ride" to submit.';
    rideControls.classList.remove('hidden');
    updateRideDetails();
  }
});

// ============ REQUEST RIDE ============
requestBtn.addEventListener('click', async function() {
  if (!pickupMarker || !dropoffMarker) {
    showNotification('Please set both pickup and dropoff locations', 'error');
    return;
  }
  
  if (!currentUser) {
    showNotification('Please login first!', 'error');
    return;
  }
  
  const scheduledInput = document.getElementById('scheduledTime');
  const scheduledTime = scheduledInput?.value || null;
  
  const pickup = pickupMarker.getLatLng();
  const dropoff = dropoffMarker.getLatLng();
  const details = calculateRideDetails(pickup, dropoff, selectedRideType);
  
  const rideData = {
    pickup: {
      lat: pickup.lat,
      lng: pickup.lng
    },
    dropoff: {
      lat: dropoff.lat,
      lng: dropoff.lng
    },
    rideType: selectedRideType,
    paymentMethod: selectedPayment,
    riderId: currentUser.id,
    estimatedFare: details.fare,
    distance: details.distance,
    duration: details.duration,
    scheduledTime: scheduledTime
  };
  
  try {
    requestBtn.disabled = true;
    requestBtn.textContent = scheduledTime ? '📅 Scheduling...' : '⏳ Booking...';
    
    const response = await fetch('/api/rides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rideData)
    });
    
    const savedRide = await response.json();
    
    if (response.ok) {
      addRideToList(savedRide);
      addRideToMap(savedRide);
      resetMarkers();
      
      const message = scheduledTime 
        ? `📅 Ride scheduled for ${new Date(scheduledTime).toLocaleString()}`
        : `✅ Ride booked! $${details.fare.toFixed(2)}`;
      showNotification(message, 'success');
      
      if (scheduledInput) scheduledInput.value = '';
    } else {
      showNotification('❌ Error: ' + (savedRide.error || 'Unknown error'), 'error');
    }
  } catch (err) {
    console.error('Error requesting ride:', err);
    showNotification('❌ Network error. Please try again.', 'error');
  } finally {
    requestBtn.disabled = false;
    requestBtn.textContent = '🚀 Request Ride';
  }
});

// ============ RESET ============
function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  instruction.textContent = '📍 Click the map to set your pickup location';
  rideControls.classList.add('hidden');
  const rideDetails = document.getElementById('ride-details');
  if (rideDetails) rideDetails.classList.add('hidden');
}

resetBtn.addEventListener('click', resetMarkers);

// ============ RIDE LIST FUNCTIONS ============
function addRideToList(ride) {
  const li = document.createElement('li');
  li.id = `ride-${ride._id}`;
  
  const statusMap = {
    pending: '⏳ Pending',
    accepted: '✅ Accepted',
    in_progress: '🚗 In Progress',
    completed: '✔️ Completed',
    cancelled: '❌ Cancelled'
  };
  
  let ratingHTML = '';
  if (ride.status === 'completed' && ride.riderId === currentUser?.id) {
    if (!ride.riderRating) {
      ratingHTML = `
        <div class="rating-section" style="margin-top:8px;">
          <span style="color:#aaa;font-size:0.85rem;">Rate your ride: </span>
          ${[1,2,3,4,5].map(n => 
            `<button class="star-btn" data-rating="${n}" data-ride="${ride._id}" style="background:none;border:none;font-size:1.2rem;cursor:pointer;padding:2px 4px;">⭐</button>`
          ).join('')}
        </div>
      `;
    } else {
      ratingHTML = `
        <div class="rating-section" style="margin-top:8px;">
          <span style="color:#aaa;font-size:0.85rem;">Your rating: ${'⭐'.repeat(ride.riderRating.rating)}</span>
        </div>
      `;
    }
  }
  
  li.innerHTML = `
    <div class="ride-item">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <span class="status ${ride.status}">${statusMap[ride.status] || ride.status}</span>
          <span class="ride-type-badge" style="background:#2a2a4a;padding:2px 8px;border-radius:10px;font-size:0.7rem;margin-left:6px;text-transform:capitalize;">${ride.rideType || 'economy'}</span>
        </div>
        <span style="font-size:0.75rem;color:#666;">${new Date(ride.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="ride-coords" style="font-size:0.85rem;color:#aaa;margin:6px 0;">
        📍 Pickup: ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}<br>
        📍 Dropoff: ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
      </div>
      <div class="ride-meta" style="display:flex;gap:12px;font-size:0.8rem;color:#888;">
        <span> $${(ride.estimatedFare || 0).toFixed(2)}</span>
        <span> ${(ride.distance || 0).toFixed(1)} km</span>
        <span> ${ride.duration || 0} min</span>
      </div>
      ${ratingHTML}
    </div>
  `;
  
  ridesList.prepend(li);
  
  // Add rating listeners
  li.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const rating = parseInt(this.dataset.rating);
      const rideId = this.dataset.ride;
      await rateRide(rideId, rating);
    });
  });
}

function updateRideInList(updatedRide) {
  const existing = document.getElementById(`ride-${updatedRide._id}`);
  if (existing) {
    existing.remove();
  }
  addRideToList(updatedRide);
  // Also update in history if visible
  loadRideHistory();
}

function addRideToMap(ride) {
  // Draw a teal circle at the pickup location
  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 8,
    color: '#00d4aa',
    fillColor: '#00d4aa',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Pickup (Ride ' + ride._id.slice(-4) + ')');

  // Draw a red circle at the dropoff location
  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Dropoff (Ride ' + ride._id.slice(-4) + ')');

  // Connect pickup and dropoff with a purple dashed line
  L.polyline([
    [ride.pickup.lat, ride.pickup.lng],
    [ride.dropoff.lat, ride.dropoff.lng]
  ], { color: '#7c3aed', weight: 2, dashArray: '5, 10' }).addTo(map);
}

// ============ RATINGS ============
async function rateRide(rideId, rating) {
  try {
    const response = await fetch(`/api/rides/${rideId}/rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        rating: rating, 
        role: 'rider' 
      })
    });
    
    if (response.ok) {
      showNotification(`⭐ Rated ${rating} stars! Thank you!`, 'success');
      loadRides();
    } else {
      const data = await response.json();
      showNotification('❌ ' + (data.error || 'Rating failed'), 'error');
    }
  } catch (err) {
    console.error('Error rating ride:', err);
    showNotification('❌ Network error', 'error');
  }
}

// ============ RIDE HISTORY ============
async function loadRideHistory() {
  if (!currentUser) return;
  
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  
  try {
    const response = await fetch(`/api/users/${currentUser.username}/rides`);
    const rides = await response.json();
    
    if (response.ok) {
      displayHistory(rides);
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

function displayHistory(rides) {
  const historyList = document.getElementById('history-list');
  if (!historyList) return;
  
  let filtered = rides;
  if (currentFilter !== 'all') {
    filtered = rides.filter(r => r.status === currentFilter);
  }
  
  if (filtered.length === 0) {
    historyList.innerHTML = '<p style="color:#666;font-style:italic;">No rides found</p>';
    return;
  }
  
  historyList.innerHTML = '';
  filtered.forEach(ride => {
    const div = document.createElement('div');
    div.className = `history-item ${ride.status}`;
    
    const statusMap = {
      pending: '⏳ Pending',
      accepted: '✅ Accepted',
      in_progress: '🚗 In Progress',
      completed: '✔️ Completed',
      cancelled: '❌ Cancelled'
    };
    
    div.innerHTML = `
      <div class="history-header" style="display:flex;justify-content:space-between;margin-bottom:4px;">
        <span><strong>${ride.rideType || 'Economy'}</strong></span>
        <span class="status ${ride.status}" style="font-size:0.75rem;">${statusMap[ride.status] || ride.status}</span>
      </div>
      <div style="font-size:0.85rem;color:#aaa;">
         ${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}
        → ${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}
      </div>
      <div style="display:flex;gap:12px;font-size:0.85rem;color:#888;margin-top:4px;">
        <span> $${(ride.estimatedFare || 0).toFixed(2)}</span>
        <span> ${(ride.distance || 0).toFixed(1)} km</span>
        <span> ${ride.duration || 0} min</span>
      </div>
      <div style="font-size:0.75rem;color:#666;margin-top:4px;">
        ${new Date(ride.createdAt).toLocaleString()}
      </div>
    `;
    historyList.appendChild(div);
  });
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentFilter = this.dataset.filter;
    loadRideHistory();
  });
});

// ============ FAVORITE LOCATIONS ============
async function loadFavorites() {
  if (!currentUser) return;
  
  const select = document.getElementById('favoritesSelect');
  if (!select) return;
  
  try {
    const response = await fetch(`/api/users/${currentUser.username}`);
    const data = await response.json();
    
    select.innerHTML = '<option value="">Select a saved location...</option>';
    
    if (data.favorites && data.favorites.length > 0) {
      data.favorites.forEach(fav => {
        const option = document.createElement('option');
        option.value = JSON.stringify({ lat: fav.lat, lng: fav.lng });
        option.textContent = fav.name;
        select.appendChild(option);
      });
    }
    
    select.onchange = function() {
      if (this.value) {
        const location = JSON.parse(this.value);
        const latlng = L.latLng(location.lat, location.lng);
        map.setView(latlng, 15);
        
        if (clickState === 'pickup' || clickState === 'dropoff') {
          map.fire('click', { latlng: latlng });
        }
      }
    };
  } catch (err) {
    console.error('Error loading favorites:', err);
  }
}

const saveFavoriteBtn = document.getElementById('saveFavoriteBtn');
if (saveFavoriteBtn) {
  saveFavoriteBtn.addEventListener('click', async function() {
    if (!pickupMarker) {
      showNotification('Please set a pickup location first', 'error');
      return;
    }
    
    const name = document.getElementById('favoriteName').value.trim();
    if (!name) {
      showNotification('Please enter a location name', 'error');
      return;
    }
    
    const lat = pickupMarker.getLatLng().lat;
    const lng = pickupMarker.getLatLng().lng;
    
    try {
      const response = await fetch(`/api/users/${currentUser.username}/favorites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, lat, lng })
      });
      
      if (response.ok) {
        showNotification(` Saved "${name}" as favorite!`, 'success');
        document.getElementById('favoriteName').value = '';
        loadFavorites();
      } else {
        const data = await response.json();
        showNotification('❌ ' + (data.error || 'Failed to save'), 'error');
      }
    } catch (err) {
      console.error('Error saving favorite:', err);
      showNotification('❌ Network error', 'error');
    }
  });
}

// ============ LOAD RIDES ============
async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();
    
    // Clear existing ride markers
    rideMarkers.forEach(marker => map.removeLayer(marker));
    rideMarkers = [];
    
    rides.forEach(ride => {
      addRideToList(ride);
      addRideToMap(ride);
    });
    
    // Load history and favorites
    loadRideHistory();
    loadFavorites();
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

// Load rides as soon as the page opens
loadRides();

console.log(' RideBook Rider App Loaded!');
console.log(' User:', currentUser?.username || 'Not logged in');
console.log(' Click the map to start booking rides');

