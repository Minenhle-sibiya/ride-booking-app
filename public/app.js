console.log('🚗 App.js loading...');

// ============ CONFIGURATION ============
let currentUser = null;
let socket = null;
let selectedRideType = 'economy';
let selectedPayment = 'cash';
let currentFilter = 'all';
let notificationCount = 0;
let driverMarker = null;
let routeLayer = null;
let routeMarkers = [];

// ============ RIDE TRACKING VARIABLES ============
let trackingInterval = null;
let driverCarMarker = null;
let activeTrackingRideId = null;

// ============ LOAD USER ============
function loadUser() {
  const userData = localStorage.getItem('ridebook_user');
  if (userData) {
    currentUser = JSON.parse(userData);
    const userNameEl = document.getElementById('userName');
    if (userNameEl) {
      userNameEl.textContent = currentUser.name || currentUser.username;
    }
    return true;
  }
  return false;
}
loadUser();
console.log('👤 User:', currentUser?.username || 'Not logged in');

// ============ MAP INITIALIZATION - PORT ELIZABETH ============
console.log('🗺️ Initializing map...');
const map = L.map('map').setView([-33.9608, 25.6022], 12);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);
console.log('✅ Map initialized');

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
const pickupSearch = document.getElementById('pickupSearch');
const dropoffSearch = document.getElementById('dropoffSearch');
const searchResults = document.getElementById('searchResults');
let searchType = 'pickup';
let searchTimeout = null;

console.log('📋 DOM elements found:', {
  instruction: !!instruction,
  rideControls: !!rideControls,
  requestBtn: !!requestBtn,
  resetBtn: !!resetBtn,
  ridesList: !!ridesList,
  pickupSearch: !!pickupSearch,
  dropoffSearch: !!dropoffSearch,
  searchResults: !!searchResults
});

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

// ============ IN-APP NOTIFICATIONS ============
function showInAppNotification(title, message, type = 'info') {
    const container = document.getElementById('notification-center');
    if (!container) {
        const newContainer = document.createElement('div');
        newContainer.id = 'notification-center';
        newContainer.className = 'notification-center';
        document.body.appendChild(newContainer);
    }
    
    const container2 = document.getElementById('notification-center');
    const notif = document.createElement('div');
    notif.className = `notification-item ${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    const time = new Date().toLocaleTimeString();
    notificationCount++;
    
    notif.innerHTML = `
        <span class="notif-icon">${icons[type] || 'ℹ️'}</span>
        <div class="notif-content">
            <div class="notif-title">${title}</div>
            <div class="notif-message">${message}</div>
            <div class="notif-time">${time}</div>
        </div>
    `;
    
    container2.prepend(notif);
    
    setTimeout(() => {
        notif.classList.add('fade-out');
        setTimeout(() => {
            if (notif.parentNode) {
                notif.remove();
                notificationCount--;
                updateNotificationBadge();
            }
        }, 400);
    }, 6000);
    
    updateNotificationBadge();
}

function updateNotificationBadge() {
    const badge = document.getElementById('notif-badge');
    if (badge) {
        badge.textContent = notificationCount;
        badge.style.display = notificationCount > 0 ? 'inline' : 'none';
    }
}

// ============ SOCKET.IO ============
function initSocket() {
  try {
    socket = io();
    console.log('🔌 Socket connected');
    
    socket.on('new-ride', (ride) => {
      if (currentUser && currentUser.role === 'driver') {
        showInAppNotification('New Ride Available', `New ride request from ${ride.riderName || 'a rider'}`, 'info');
        loadRides();
      }
    });
    
    socket.on('ride-updated', (ride) => {
      updateRideInList(ride);
      if (currentUser && currentUser.role === 'driver') {
        if (ride.driverId === currentUser.id) {
          showInAppNotification('Ride Updated', `Ride status changed to: ${ride.status}`, 'info');
        }
      }
    });
    
    socket.on('ride-status-update', (ride) => {
      updateRideInList(ride);
      
      const notifications = {
        'accepted': { title: 'Ride Accepted', message: `Your ride has been accepted by ${ride.driverName || 'a driver'}`, type: 'success' },
        'in_progress': { title: 'Driver En Route', message: `${ride.driverName || 'Your driver'} is on the way to pick you up`, type: 'info' },
        'completed': { title: 'Ride Complete', message: 'Your ride is complete! Please rate your driver.', type: 'success' },
        'cancelled': { title: 'Ride Cancelled', message: 'Your ride has been cancelled.', type: 'error' }
      };
      
      const notif = notifications[ride.status];
      if (notif && ride.riderId === currentUser?.id) {
        showInAppNotification(notif.title, notif.message, notif.type);
      }
    });

    // Driver location tracking for car marker
    socket.on('driver-location-update', (data) => {
      if (data.lat && data.lng) {
        // Update the car marker (for tracking)
        updateDriverCarPosition(data.lat, data.lng);
        // Also update the regular driver marker
        updateDriverMarker(data.lat, data.lng);
      }
    });
  } catch (err) {
    console.log('⚠️ Socket not available (running in demo mode)');
  }
}

initSocket();

// ============ DRIVER LOCATION TRACKING ============
function updateDriverMarker(lat, lng) {
  const location = L.latLng(lat, lng);
  
  const driverIcon = L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
  });
  
  if (!driverMarker) {
    driverMarker = L.marker(location, { icon: driverIcon })
      .addTo(map)
      .bindPopup('Driver is on the way!');
  } else {
    driverMarker.setLatLng(location);
  }
  
  if (clickState === 'done' || clickState === 'dropoff') {
    map.setView(location, 14);
  }
}

// ============ RIDE TRACKING FUNCTIONS ============
function updateDriverCarPosition(lat, lng) {
    if (!driverCarMarker) {
        const carIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        driverCarMarker = L.marker([lat, lng], { 
            icon: carIcon,
            title: '🚗 Driver'
        }).addTo(map);
        driverCarMarker.bindPopup('🚗 Driver is here!');
    } else {
        driverCarMarker.setLatLng([lat, lng]);
    }
    
    // Center map on driver if tracking
    if (activeTrackingRideId) {
        map.setView([lat, lng], 15);
    }
}

function startTracking(rideId, driverId) {
    if (trackingInterval) {
        clearInterval(trackingInterval);
    }
    
    activeTrackingRideId = rideId;
    
    // Create car marker if it doesn't exist
    if (!driverCarMarker) {
        const carIcon = L.icon({
            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png',
            shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41]
        });
        driverCarMarker = L.marker([-33.9608, 25.6022], { 
            icon: carIcon,
            title: '🚗 Driver'
        }).addTo(map);
        driverCarMarker.bindPopup('🚗 Driver is here!');
    }
    
    showInAppNotification('Tracking Started', 'Following your driver in real-time', 'info');
    
    // Join the ride room for updates
    if (socket) {
        socket.emit('join-ride', rideId);
    }
}

function stopTracking() {
    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }
    activeTrackingRideId = null;
    
    // Hide car marker
    if (driverCarMarker) {
        map.removeLayer(driverCarMarker);
        driverCarMarker = null;
    }
}

// ============ ROUTE FUNCTIONS ============
async function getRoute(startLat, startLng, endLat, endLng) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&steps=true`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.code === 'Ok') {
            return data;
        } else {
            console.error('Route error:', data);
            return null;
        }
    } catch (error) {
        console.error('Error getting route:', error);
        return null;
    }
}

async function displayRoute(pickup, dropoff) {
    clearRoute();
    const routeData = await getRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    if (!routeData) {
        showInAppNotification('Route Error', 'Could not find a driving route', 'error');
        return;
    }
    const route = routeData.routes[0];
    const geometry = route.geometry;
    const distance = (route.distance / 1000).toFixed(1);
    const duration = Math.round(route.duration / 60);
    if (geometry && geometry.coordinates) {
        const latlngs = geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        routeLayer = L.polyline(latlngs, {
            color: '#00d4aa',
            weight: 6,
            opacity: 1,
            lineJoin: 'round',
            lineCap: 'round',
            className: 'route-line'
        }).addTo(map);
        
        // Add subtle glow effect
        const glowLayer = L.polyline(latlngs, {
            color: '#00d4aa',
            weight: 12,
            opacity: 0.15,
            lineJoin: 'round',
            lineCap: 'round',
            pane: 'overlayPane'
        }).addTo(map);
        
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50] });
        updateRouteDetails(distance, duration);
        showInAppNotification('Route Found', `${distance} km · ${duration} minutes`, 'success');
    }
}

function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    routeMarkers = [];
}

function updateRouteDetails(distance, duration) {
    const rideDistance = document.getElementById('rideDistance');
    const rideDuration = document.getElementById('rideDuration');
    const rideFare = document.getElementById('rideFare');
    if (rideDistance) rideDistance.textContent = distance;
    if (rideDuration) rideDuration.textContent = duration;
    const perKmRates = { economy: 15.00, premium: 25.00, suv: 30.00, xl: 35.00 };
    const rate = perKmRates[selectedRideType] || perKmRates.economy;
    const baseFare = 25.00;
    const fare = baseFare + (parseFloat(distance) * rate);
    const finalFare = Math.round((fare + 5) * 100) / 100;
    if (rideFare) rideFare.textContent = 'R' + finalFare.toFixed(2);
}

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
  const R = 6371;
  const dLat = (dropoff.lat - pickup.lat) * Math.PI / 180;
  const dLng = (dropoff.lng - pickup.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(pickup.lat * Math.PI/180) * Math.cos(dropoff.lat * Math.PI/180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  
  const perKmRates = { economy: 15.00, premium: 25.00, suv: 30.00, xl: 35.00 };
  const rate = perKmRates[rideType] || perKmRates.economy;
  const baseFare = 25.00;
  const fare = baseFare + (distance * rate);
  const duration = distance * 2;
  
  return {
    distance: Math.round(distance * 100) / 100,
    fare: Math.round((fare + 5) * 100) / 100,
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
  document.getElementById('rideFare').textContent = 'R' + details.fare.toFixed(2);
  rideDetails.classList.remove('hidden');
}

// ============ QUICK CITY BUTTONS ============
document.querySelectorAll('.city-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    const lat = parseFloat(this.dataset.lat);
    const lng = parseFloat(this.dataset.lng);
    map.setView([lat, lng], 12);
    showNotification('Moved to ' + this.textContent, 'info');
    clearRoute();
  });
});

// ============ MAP CLICK HANDLER ============
map.on('click', function(e) {
  console.log('🗺️ Map clicked:', e.latlng);
  
  if (!currentUser) {
    showNotification('Please login first!', 'error');
    return;
  }
  
  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker(e.latlng, { icon: greenIcon })
      .addTo(map)
      .bindPopup('📍 Pickup')
      .openPopup();
    clickState = 'dropoff';
    instruction.textContent = 'Now click to set your dropoff location';
    updateRideDetails();
    clearRoute();
    rideControls.classList.add('hidden');
    console.log('✅ Pickup set');
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup('📍 Dropoff')
      .openPopup();
    clickState = 'done';
    instruction.textContent = 'Ready! Click "Request Ride" to submit.';
    rideControls.classList.remove('hidden');
    updateRideDetails();
    const pickup = pickupMarker.getLatLng();
    const dropoff = dropoffMarker.getLatLng();
    displayRoute(pickup, dropoff);
    console.log('✅ Dropoff set, route displayed');
  }
});

// ============ ADDRESS SEARCH ============
// Check if geocoder exists
if (typeof geocoder === 'undefined') {
  console.error('❌ Geocoder not loaded! Please check geocoder.js');
  showNotification('Geocoder not loaded! Please refresh.', 'error');
} else {
  console.log('✅ Geocoder found');
}

if (pickupSearch) {
  pickupSearch.addEventListener('input', function() {
    searchType = 'pickup';
    handleSearch(this.value);
  });
  console.log('✅ Pickup search listener attached');
}

if (dropoffSearch) {
  dropoffSearch.addEventListener('input', function() {
    searchType = 'dropoff';
    handleSearch(this.value);
  });
  console.log('✅ Dropoff search listener attached');
}

// Search button listeners
const searchPickupBtn = document.getElementById('searchPickupBtn');
const searchDropoffBtn = document.getElementById('searchDropoffBtn');

if (searchPickupBtn) {
  searchPickupBtn.addEventListener('click', function() {
    console.log('🔍 Search pickup clicked');
    searchType = 'pickup';
    handleSearch(pickupSearch.value);
  });
  console.log('✅ Search pickup button attached');
} else {
  console.error('❌ Search pickup button not found!');
}

if (searchDropoffBtn) {
  searchDropoffBtn.addEventListener('click', function() {
    console.log('🔍 Search dropoff clicked');
    searchType = 'dropoff';
    handleSearch(dropoffSearch.value);
  });
  console.log('✅ Search dropoff button attached');
} else {
  console.error('❌ Search dropoff button not found!');
}

function handleSearch(query) {
  console.log('🔍 Searching for:', query);
  clearTimeout(searchTimeout);
  if (!query || query.length < 3) {
    if (searchResults) searchResults.classList.add('hidden');
    return;
  }
  searchTimeout = setTimeout(async () => {
    try {
      if (typeof geocoder === 'undefined') {
        console.error('❌ Geocoder not available');
        return;
      }
      const results = await geocoder.search(query);
      displaySearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
    }
  }, 500);
}

function displaySearchResults(results) {
  console.log('📋 Displaying results:', results?.length || 0);
  if (!searchResults) return;
  if (!results || results.length === 0) {
    searchResults.innerHTML = `
      <div class="search-result-item" style="color:#666;cursor:default;">
        No locations found. Try a different search.
      </div>
    `;
    searchResults.classList.remove('hidden');
    return;
  }
  searchResults.innerHTML = '';
  results.forEach(result => {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    const city = result.address.city || result.address.suburb || 'Unknown';
    item.innerHTML = `
      <span class="result-address">${result.displayName}</span>
      <span class="result-type">${city}, South Africa</span>
    `;
    item.addEventListener('click', function() {
      selectSearchResult(result);
    });
    searchResults.appendChild(item);
  });
  searchResults.classList.remove('hidden');
}

function selectSearchResult(result) {
    console.log('📍 Selected result:', result.displayName);
    const latlng = L.latLng(result.lat, result.lng);
    
    if (searchType === 'pickup') {
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = L.marker(latlng, { icon: greenIcon })
            .addTo(map)
            .bindPopup('📍 Pickup: ' + result.displayName)
            .openPopup();
        if (clickState === 'pickup' || clickState === 'dropoff') {
            clickState = 'dropoff';
            instruction.textContent = 'Now click to set your dropoff location';
        }
        map.setView(latlng, 15);
        if (pickupSearch) pickupSearch.value = result.displayName;
        clearRoute();
        updateRideDetails();
        rideControls.classList.add('hidden');
        console.log('✅ Pickup set via search');
    } else {
        if (dropoffMarker) map.removeLayer(dropoffMarker);
        dropoffMarker = L.marker(latlng, { icon: redIcon })
            .addTo(map)
            .bindPopup('📍 Dropoff: ' + result.displayName)
            .openPopup();
        clickState = 'done';
        instruction.textContent = 'Ready! Click "Request Ride" to submit.';
        rideControls.classList.remove('hidden');
        map.setView(latlng, 15);
        if (dropoffSearch) dropoffSearch.value = result.displayName;
        updateRideDetails();
        if (pickupMarker) {
            const pickup = pickupMarker.getLatLng();
            const dropoff = dropoffMarker.getLatLng();
            displayRoute(pickup, dropoff);
        }
        console.log('✅ Dropoff set via search');
    }
    if (searchResults) searchResults.classList.add('hidden');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-section')) {
    if (searchResults) searchResults.classList.add('hidden');
  }
});

// ============ REQUEST RIDE ============
if (requestBtn) {
  console.log('✅ Setting up Request button');
  
  // Remove any old listeners by cloning
  const requestBtnParent = requestBtn.parentNode;
  const newRequestBtn = requestBtn.cloneNode(true);
  requestBtnParent.replaceChild(newRequestBtn, requestBtn);
  const requestBtnFinal = document.getElementById('request-btn');

  requestBtnFinal.addEventListener('click', async function() {
    console.log('🔍 Request button clicked!');
    console.log('pickupMarker:', pickupMarker);
    console.log('dropoffMarker:', dropoffMarker);
    console.log('clickState:', clickState);
    
    if (!pickupMarker || !dropoffMarker) {
      showInAppNotification('Error', 'Please set both pickup and dropoff locations', 'error');
      return;
    }
    
    if (!currentUser) {
      showInAppNotification('Error', 'Please login first!', 'error');
      return;
    }
    
    console.log('✅ Both markers set, proceeding with ride request...');
    
    let pickupAddress = pickupSearch ? pickupSearch.value : '';
    let dropoffAddress = dropoffSearch ? dropoffSearch.value : '';
    
    if (!pickupAddress) {
      const pickupLatLng = pickupMarker.getLatLng();
      try {
        const pickupResult = await geocoder.reverseGeocode(pickupLatLng.lat, pickupLatLng.lng);
        if (pickupResult) {
          pickupAddress = pickupResult.displayName;
          if (pickupSearch) pickupSearch.value = pickupAddress;
        }
      } catch (e) {
        console.error('Reverse geocode error:', e);
      }
    }
    
    if (!dropoffAddress) {
      const dropoffLatLng = dropoffMarker.getLatLng();
      try {
        const dropoffResult = await geocoder.reverseGeocode(dropoffLatLng.lat, dropoffLatLng.lng);
        if (dropoffResult) {
          dropoffAddress = dropoffResult.displayName;
          if (dropoffSearch) dropoffSearch.value = dropoffAddress;
        }
      } catch (e) {
        console.error('Reverse geocode error:', e);
      }
    }
    
    const scheduledInput = document.getElementById('scheduledTime');
    const scheduledTime = scheduledInput?.value || null;
    
    const pickup = pickupMarker.getLatLng();
    const dropoff = dropoffMarker.getLatLng();
    const details = calculateRideDetails(pickup, dropoff, selectedRideType);
    
    const rideData = {
      pickup: {
        lat: pickup.lat,
        lng: pickup.lng,
        address: pickupAddress || 'Unknown location'
      },
      dropoff: {
        lat: dropoff.lat,
        lng: dropoff.lng,
        address: dropoffAddress || 'Unknown location'
      },
      rideType: selectedRideType,
      paymentMethod: selectedPayment,
      riderId: currentUser.id,
      estimatedFare: details.fare,
      distance: details.distance,
      duration: details.duration,
      scheduledTime: scheduledTime
    };
    
    console.log('📦 Ride data:', rideData);
    
    try {
      requestBtnFinal.disabled = true;
      requestBtnFinal.textContent = scheduledTime ? '⏳ Scheduling...' : '⏳ Booking...';
      
      const response = await fetch('/api/rides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rideData)
      });
      
      const savedRide = await response.json();
      console.log('✅ Response:', savedRide);
      
      if (response.ok) {
        // ✅ Rides are NOT added to sidebar - only stored
        // addRideToList is now empty - rides only go to history modal
        addRideToMap(savedRide);
        resetMarkersKeepRoute();
        
        const message = scheduledTime 
          ? 'Ride scheduled for ' + new Date(scheduledTime).toLocaleString()
          : 'Ride booked! R' + details.fare.toFixed(2);
        showInAppNotification('Success', message, 'success');
        
        if (scheduledInput) scheduledInput.value = '';
      } else {
        showInAppNotification('Error', savedRide.error || 'Unknown error', 'error');
      }
    } catch (err) {
      console.error('❌ Error requesting ride:', err);
      showInAppNotification('Error', 'Network error. Please try again.', 'error');
    } finally {
      requestBtnFinal.disabled = false;
      requestBtnFinal.textContent = 'Request Ride';
    }
  });
  console.log('✅ Request button setup complete');
} else {
  console.error('❌ Request button not found!');
}

// ============ RESET ============
function resetMarkers() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  instruction.textContent = 'Click the map to set your pickup location';
  rideControls.classList.add('hidden');
  const rideDetails = document.getElementById('ride-details');
  if (rideDetails) rideDetails.classList.add('hidden');
  if (pickupSearch) pickupSearch.value = '';
  if (dropoffSearch) dropoffSearch.value = '';
  if (searchResults) searchResults.classList.add('hidden');
  clearRoute();
  // Stop tracking when resetting
  stopTracking();
  console.log('🔄 Reset markers');
}

// Reset markers but KEEP the route visible (called after ride request)
function resetMarkersKeepRoute() {
  if (pickupMarker) map.removeLayer(pickupMarker);
  if (dropoffMarker) map.removeLayer(dropoffMarker);
  pickupMarker = null;
  dropoffMarker = null;
  clickState = 'pickup';
  instruction.textContent = 'Click the map to set your pickup location';
  rideControls.classList.add('hidden');
  const rideDetails = document.getElementById('ride-details');
  if (rideDetails) rideDetails.classList.add('hidden');
  if (pickupSearch) pickupSearch.value = '';
  if (dropoffSearch) dropoffSearch.value = '';
  if (searchResults) searchResults.classList.add('hidden');
  // NOTE: Route is NOT cleared - it stays visible on the map
  console.log('🔄 Reset markers (route kept)');
}

resetBtn.addEventListener('click', resetMarkers);

// ============ RIDE LIST FUNCTIONS - RIDES ONLY IN HISTORY MODAL ============
// This function is EMPTY - rides do NOT show in sidebar
function addRideToList(ride) {
    // Rides are NOT displayed in the sidebar anymore
    // They only appear in the History Modal
    console.log('📝 Ride created (only in history):', ride._id);
    // Do nothing - rides only go to history modal
}

function updateRideInList(updatedRide) {
    // Just refresh the history modal if it's open
    const modal = document.getElementById('historyModal');
    if (modal && modal.style.display === 'flex') {
        loadHistoryModal();
    }
    console.log('🔄 Ride updated:', updatedRide._id);
}

function addRideToMap(ride) {
  L.circleMarker([ride.pickup.lat, ride.pickup.lng], {
    radius: 8,
    color: '#00d4aa',
    fillColor: '#00d4aa',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Pickup (Ride ' + ride._id.slice(-4) + ')');

  L.circleMarker([ride.dropoff.lat, ride.dropoff.lng], {
    radius: 8,
    color: '#e74c3c',
    fillColor: '#e74c3c',
    fillOpacity: 0.7
  }).addTo(map).bindPopup('Dropoff (Ride ' + ride._id.slice(-4) + ')');

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
      body: JSON.stringify({ rating: rating, role: 'rider' })
    });
    if (response.ok) {
      showInAppNotification('Thank You!', 'Rated ' + rating + ' stars!', 'success');
      loadRides();
    } else {
      const data = await response.json();
      showInAppNotification('Error', data.error || 'Rating failed', 'error');
    }
  } catch (err) {
    console.error('Error rating ride:', err);
    showInAppNotification('Error', 'Network error', 'error');
  }
}

// ============ RIDE HISTORY - REMOVED FROM SIDEBAR ============
// These functions are kept for compatibility but history-list is removed from HTML
async function loadRideHistory() {
  // History is now only shown in the modal via loadHistoryModal()
  console.log('📜 History loaded via modal only');
  return;
}

function displayHistory(rides) {
  // This is no longer used - history is shown in the modal
  console.log('📜 History display moved to modal');
  return;
}

// Filter buttons - no longer used but keep for compatibility
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    // Filter buttons are removed from sidebar
    console.log('Filter button clicked (no longer used):', this.dataset.filter);
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
      showInAppNotification('Error', 'Please set a pickup location first', 'error');
      return;
    }
    const name = document.getElementById('favoriteName').value.trim();
    if (!name) {
      showInAppNotification('Error', 'Please enter a location name', 'error');
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
        showInAppNotification('Success', 'Saved "' + name + '" as favorite!', 'success');
        document.getElementById('favoriteName').value = '';
        loadFavorites();
      } else {
        const data = await response.json();
        showInAppNotification('Error', data.error || 'Failed to save', 'error');
      }
    } catch (err) {
      console.error('Error saving favorite:', err);
      showInAppNotification('Error', 'Network error', 'error');
    }
  });
}

// ============ LOAD RIDES ============
async function loadRides() {
  try {
    const response = await fetch('/api/rides');
    const rides = await response.json();
    rideMarkers.forEach(marker => map.removeLayer(marker));
    rideMarkers = [];
    rides.forEach(ride => {
      // Rides are NOT added to sidebar list
      // Only add to map
      addRideToMap(ride);
    });
    loadFavorites();
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

loadRides();

console.log('✅ RideBook Rider App Loaded');
console.log('👤 User:', currentUser?.username || 'Not logged in');
console.log('🗺️ Map centered on Port Elizabeth, South Africa');

// ============ AUTO-DETECT USER LOCATION ============
let isLocating = false;
let locationStatus = document.createElement('div');
locationStatus.className = 'location-status';
locationStatus.id = 'locationStatus';
locationStatus.textContent = '📍 Click the location button to detect your position';

const pickupGroup = document.querySelector('.search-input-group');
if (pickupGroup) {
    pickupGroup.appendChild(locationStatus);
}

const detectBtn = document.getElementById('detectLocationBtn');
if (detectBtn) {
    detectBtn.addEventListener('click', async function() {
        await detectUserLocation();
    });
}

async function detectUserLocation() {
    if (isLocating) return;
    const detectBtn = document.getElementById('detectLocationBtn');
    const pickupSearch = document.getElementById('pickupSearch');
    const locationStatus = document.getElementById('locationStatus');
    if (!navigator.geolocation) {
        locationStatus.textContent = '❌ Geolocation is not supported by your browser';
        locationStatus.className = 'location-status error';
        return;
    }
    isLocating = true;
    detectBtn.disabled = true;
    detectBtn.classList.add('loading');
    locationStatus.textContent = '⏳ Detecting your location...';
    locationStatus.className = 'location-status loading';
    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            });
        });
        const { latitude, longitude } = position.coords;
        locationStatus.textContent = `📍 Found: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} - Getting address...`;
        const address = await geocoder.reverseGeocode(latitude, longitude);
        if (address) {
            pickupSearch.value = address.displayName;
            locationStatus.textContent = `✅ Location found: ${address.displayName}`;
            locationStatus.className = 'location-status success';
            const latlng = L.latLng(latitude, longitude);
            if (pickupMarker) map.removeLayer(pickupMarker);
            pickupMarker = L.marker(latlng, { icon: greenIcon })
                .addTo(map)
                .bindPopup('📍 Pickup: ' + address.displayName)
                .openPopup();
            if (clickState === 'pickup' || clickState === 'dropoff') {
                clickState = 'dropoff';
                instruction.textContent = 'Now click to set your dropoff location';
            }
            map.setView(latlng, 15);
            updateRideDetails();
            rideControls.classList.add('hidden');
            showInAppNotification('Location Detected', `Pickup set to: ${address.displayName}`, 'success');
        } else {
            pickupSearch.value = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            locationStatus.textContent = `📍 Location found (coordinates): ${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
            locationStatus.className = 'location-status success';
            const latlng = L.latLng(latitude, longitude);
            if (pickupMarker) map.removeLayer(pickupMarker);
            pickupMarker = L.marker(latlng, { icon: greenIcon })
                .addTo(map)
                .bindPopup('📍 Pickup (auto-detected)')
                .openPopup();
            if (clickState === 'pickup' || clickState === 'dropoff') {
                clickState = 'dropoff';
                instruction.textContent = 'Now click to set your dropoff location';
            }
            map.setView(latlng, 15);
            updateRideDetails();
            rideControls.classList.add('hidden');
            showInAppNotification('Location Detected', 'Pickup set using coordinates', 'info');
        }
    } catch (error) {
        console.error('Location detection error:', error);
        let errorMessage = 'Could not detect location. ';
        if (error.code === 1) {
            errorMessage += 'Please allow location access in your browser.';
        } else if (error.code === 2) {
            errorMessage += 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
            errorMessage += 'Location request timed out. Please try again.';
        } else {
            errorMessage += 'Please enter your address manually.';
        }
        locationStatus.textContent = '❌ ' + errorMessage;
        locationStatus.className = 'location-status error';
        showInAppNotification('Location Error', errorMessage, 'error');
        pickupSearch.focus();
    } finally {
        isLocating = false;
        detectBtn.disabled = false;
        detectBtn.classList.remove('loading');
    }
}

// ============ HANDLE PICKUP EDITING ============
if (pickupSearch) {
    pickupSearch.addEventListener('change', async function() {
        const query = this.value.trim();
        if (!query) return;
        const results = await geocoder.search(query);
        if (results && results.length > 0) {
            const result = results[0];
            const latlng = L.latLng(result.lat, result.lng);
            if (pickupMarker) map.removeLayer(pickupMarker);
            pickupMarker = L.marker(latlng, { icon: greenIcon })
                .addTo(map)
                .bindPopup('📍 Pickup: ' + result.displayName)
                .openPopup();
            if (clickState === 'pickup' || clickState === 'dropoff') {
                clickState = 'dropoff';
                instruction.textContent = 'Now click to set your dropoff location';
            }
            map.setView(latlng, 15);
            updateRideDetails();
            clearRoute();
            rideControls.classList.add('hidden');
            const locationStatus = document.getElementById('locationStatus');
            if (locationStatus) {
                locationStatus.textContent = `✅ Pickup updated to: ${result.displayName}`;
                locationStatus.className = 'location-status success';
            }
        }
    });
}

// ============ RIDE HISTORY MODAL FUNCTIONS ============
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const historyModal = document.getElementById('historyModal');
const closeHistoryBtn = document.getElementById('closeHistoryBtn');

if (viewHistoryBtn) {
    viewHistoryBtn.addEventListener('click', function() {
        loadHistoryModal();
        historyModal.style.display = 'flex';
    });
}

if (closeHistoryBtn) {
    closeHistoryBtn.addEventListener('click', function() {
        historyModal.style.display = 'none';
    });
}

// Close modals on outside click
window.addEventListener('click', function(e) {
    if (e.target === historyModal) {
        historyModal.style.display = 'none';
    }
    if (e.target === document.getElementById('rideDetailModal')) {
        document.getElementById('rideDetailModal').style.display = 'none';
    }
    if (e.target === document.getElementById('receiptModal')) {
        document.getElementById('receiptModal').style.display = 'none';
    }
});

async function loadHistoryModal() {
    const content = document.getElementById('historyModalContent');
    if (!content) return;
    
    content.innerHTML = '<p style="color:#888; text-align:center; padding:20px;">Loading rides...</p>';
    
    try {
        const response = await fetch(`/api/users/${currentUser.username}/rides`);
        const rides = await response.json();
        
        if (rides.length === 0) {
            content.innerHTML = '<p style="color:#666; text-align:center; padding:40px;">🚗 No rides found.<br><span style="font-size:0.85rem; color:#888;">Book your first ride to get started!</span></p>';
            return;
        }
        
        content.innerHTML = '';
        rides.forEach(ride => {
            const div = document.createElement('div');
            div.style.cssText = `
                background: #16213e;
                padding: 14px 18px;
                border-radius: 8px;
                margin-bottom: 10px;
                border-left: 4px solid ${ride.status === 'completed' ? '#00d4aa' : ride.status === 'cancelled' ? '#e74c3c' : ride.status === 'in_progress' ? '#3498db' : '#ffc107'};
                cursor: pointer;
                transition: all 0.3s;
            `;
            div.onmouseover = () => div.style.background = '#1a2a4e';
            div.onmouseout = () => div.style.background = '#16213e';
            
            const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
            const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
            
            const statusMap = {
                pending: '⏳ Pending',
                accepted: '✅ Accepted',
                in_progress: '🚗 In Progress',
                completed: '✔️ Completed',
                cancelled: '❌ Cancelled'
            };
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap;">
                    <div>
                        <strong style="color:#00d4aa; font-size:1rem;">${ride.rideType || 'Economy'}</strong>
                        <span style="font-size:0.75rem; color:#888; margin-left:10px;">${new Date(ride.createdAt).toLocaleDateString()} at ${new Date(ride.createdAt).toLocaleTimeString()}</span>
                    </div>
                    <span class="status ${ride.status}" style="font-size:0.7rem; padding:3px 12px; border-radius:12px;">${statusMap[ride.status] || ride.status}</span>
                </div>
                <div style="font-size:0.85rem; color:#aaa; margin-top:6px;">
                    <div>▲ ${pickupDisplay}</div>
                    <div>▼ ${dropoffDisplay}</div>
                </div>
                <div style="display:flex; gap:15px; font-size:0.8rem; color:#888; margin-top:6px; flex-wrap:wrap;">
                    <span>💰 R${(ride.estimatedFare || 0).toFixed(2)}</span>
                    <span>📏 ${(ride.distance || 0).toFixed(1)} km</span>
                    <span>⏱️ ${ride.duration || 0} min</span>
                    ${ride.driverName ? `<span>🚗 ${ride.driverName}</span>` : ''}
                </div>
            `;
            
            div.addEventListener('click', function() {
                showRideDetail(ride);
            });
            
            content.appendChild(div);
        });
    } catch (err) {
        content.innerHTML = '<p style="color:#e74c3c; text-align:center; padding:20px;">❌ Error loading rides. Please try again.</p>';
        console.error('Error loading history:', err);
    }
}

// ============ RIDE DETAILS ============
function showRideDetail(ride) {
    const modal = document.getElementById('rideDetailModal');
    const content = document.getElementById('rideDetailContent');
    
    const statusMap = {
        pending: '⏳ Pending',
        accepted: '✅ Accepted',
        in_progress: '🚗 In Progress',
        completed: '✔️ Completed',
        cancelled: '❌ Cancelled'
    };
    
    const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
    const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
    
    let ratingDisplay = '';
    if (ride.riderRating) {
        ratingDisplay = `
            <div style="background:#0f0f1a; padding:10px; border-radius:6px; margin-top:8px;">
                <strong>⭐ Your Rating:</strong> ${'★'.repeat(ride.riderRating.rating)} 
                ${ride.riderRating.feedback ? ` - "${ride.riderRating.feedback}"` : ''}
            </div>
        `;
    }
    
    let driverInfo = ride.driverName ? `
        <div style="background:#0f0f1a; padding:10px; border-radius:6px; margin-top:8px;">
            <strong>🚗 Driver:</strong> ${ride.driverName}
            ${ride.driverPhone ? ` · 📞 ${ride.driverPhone}` : ''}
        </div>
    ` : '';
    
    let trackButton = '';
    if (ride.status === 'accepted' || ride.status === 'in_progress') {
        trackButton = `
            <button id="trackRideBtn" style="width:100%; padding:10px; background:#00d4aa; color:#1a1a2e; border:none; border-radius:6px; cursor:pointer; font-weight:600; margin-top:10px;">
                🚗 Track Driver
            </button>
        `;
    }
    
    let receiptButton = '';
    if (ride.status === 'completed') {
        receiptButton = `
            <button id="viewReceiptBtn" style="width:100%; padding:10px; background:#6c63ff; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:600; margin-top:8px;">
                🧾 View Receipt
            </button>
        `;
    }
    
    content.innerHTML = `
        <div style="background:#16213e; padding:16px; border-radius:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h3 style="color:#00d4aa;">${ride.rideType || 'Economy'}</h3>
                <span class="status ${ride.status}" style="font-size:0.9rem; padding:4px 12px;">${statusMap[ride.status] || ride.status}</span>
            </div>
            
            <div style="background:#0f0f1a; padding:10px; border-radius:6px; margin-bottom:8px;">
                <div style="color:#00d4aa; font-size:0.9rem;">▲ <strong>Pickup</strong></div>
                <div style="color:#ccc; margin-left:16px;">${pickupDisplay}</div>
            </div>
            
            <div style="background:#0f0f1a; padding:10px; border-radius:6px; margin-bottom:8px;">
                <div style="color:#e74c3c; font-size:0.9rem;">▼ <strong>Dropoff</strong></div>
                <div style="color:#ccc; margin-left:16px;">${dropoffDisplay}</div>
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin:10px 0;">
                <div style="background:#0f0f1a; padding:8px; border-radius:6px; text-align:center;">
                    <div style="color:#888; font-size:0.7rem;">Fare</div>
                    <div style="color:#00d4aa; font-weight:bold;">R${(ride.estimatedFare || 0).toFixed(2)}</div>
                </div>
                <div style="background:#0f0f1a; padding:8px; border-radius:6px; text-align:center;">
                    <div style="color:#888; font-size:0.7rem;">Distance</div>
                    <div style="color:#00d4aa; font-weight:bold;">${(ride.distance || 0).toFixed(1)} km</div>
                </div>
                <div style="background:#0f0f1a; padding:8px; border-radius:6px; text-align:center;">
                    <div style="color:#888; font-size:0.7rem;">Duration</div>
                    <div style="color:#00d4aa; font-weight:bold;">${ride.duration || 0} min</div>
                </div>
            </div>
            
            <div style="font-size:0.8rem; color:#666; text-align:center; margin-top:4px;">
                📅 ${new Date(ride.createdAt).toLocaleString()}
            </div>
            
            ${driverInfo}
            ${ratingDisplay}
            ${trackButton}
            ${receiptButton}
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Track button handler
    setTimeout(() => {
        const trackBtn = document.getElementById('trackRideBtn');
        if (trackBtn) {
            trackBtn.addEventListener('click', function() {
                if (ride.driverId) {
                    startTracking(ride._id, ride.driverId);
                    showInAppNotification('Tracking Started', 'Looking for driver location...', 'info');
                    modal.style.display = 'none';
                    historyModal.style.display = 'none';
                } else {
                    showInAppNotification('Error', 'Driver not yet assigned', 'error');
                }
            });
        }
        
        const receiptBtn = document.getElementById('viewReceiptBtn');
        if (receiptBtn) {
            receiptBtn.addEventListener('click', function() {
                showReceipt(ride);
            });
        }
    }, 100);
}

// ============ RECEIPT ============
function showReceipt(ride) {
    const modal = document.getElementById('receiptModal');
    const content = document.getElementById('receiptContent');
    
    const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
    const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
    
    content.innerHTML = `
        <div id="receiptPaper" style="background:#ffffff; color:#1a1a2e; padding:20px; border-radius:8px; font-family: 'Courier New', monospace;">
            <div style="text-align:center; border-bottom:2px dashed #1a1a2e; padding-bottom:15px; margin-bottom:15px;">
                <h2 style="color:#00d4aa; margin:0;">🚗 RideBook</h2>
                <p style="color:#666; font-size:0.85rem; margin:4px 0;">South Africa's Ride-Hailing Service</p>
            </div>
            
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:15px;">
                <div>
                    <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Ride ID</div>
                    <div style="font-weight:bold;">#${ride._id.slice(-8)}</div>
                </div>
                <div>
                    <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Date</div>
                    <div style="font-weight:bold;">${new Date(ride.createdAt).toLocaleString()}</div>
                </div>
                <div>
                    <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Type</div>
                    <div style="font-weight:bold;">${ride.rideType || 'Economy'}</div>
                </div>
                <div>
                    <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Status</div>
                    <div style="font-weight:bold; color:#00d4aa;">${ride.status.toUpperCase()}</div>
                </div>
            </div>
            
            <div style="border-top:1px solid #eee; padding-top:12px; margin-bottom:12px;">
                <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Pickup</div>
                <div style="margin-bottom:8px;">${pickupDisplay}</div>
                
                <div style="color:#888; font-size:0.7rem; text-transform:uppercase;">Dropoff</div>
                <div>${dropoffDisplay}</div>
            </div>
            
            <div style="border-top:1px solid #eee; padding-top:12px; margin-bottom:12px;">
                <div style="display:flex; justify-content:space-between; padding:4px 0;">
                    <span style="color:#888;">Distance</span>
                    <span>${(ride.distance || 0).toFixed(1)} km</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:4px 0;">
                    <span style="color:#888;">Duration</span>
                    <span>${ride.duration || 0} min</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:4px 0;">
                    <span style="color:#888;">Base Fare</span>
                    <span>R25.00</span>
                </div>
                <div style="display:flex; justify-content:space-between; padding:4px 0; border-top:1px solid #eee; margin-top:4px; padding-top:8px;">
                    <span style="font-weight:bold;">Total</span>
                    <span style="font-weight:bold; color:#00d4aa; font-size:1.2rem;">R${(ride.estimatedFare || 0).toFixed(2)}</span>
                </div>
            </div>
            
            <div style="border-top:1px solid #eee; padding-top:12px; text-align:center; color:#888; font-size:0.75rem;">
                <p>Thank you for riding with RideBook!</p>
                <p style="margin-top:4px;">📍 South Africa</p>
            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    
    // Download PDF button
    const downloadBtn = document.getElementById('downloadPdfBtn');
    if (downloadBtn) {
        downloadBtn.onclick = function() {
            downloadReceiptPDF(ride);
        };
    }
}

// ============ DOWNLOAD PDF ============
function downloadReceiptPDF(ride) {
    const receiptElement = document.getElementById('receiptPaper');
    if (!receiptElement) return;
    
    const printWindow = window.open('', '_blank', 'width=600,height=800');
    if (!printWindow) {
        showInAppNotification('Error', 'Please allow popups to download PDF', 'error');
        return;
    }
    
    printWindow.document.write(`
        <html>
            <head>
                <title>Ride Receipt</title>
                <style>
                    body { font-family: 'Courier New', monospace; padding: 40px; }
                    .receipt { max-width: 500px; margin: 0 auto; }
                    h2 { color: #00d4aa; }
                    .divider { border-top: 2px dashed #333; margin: 15px 0; }
                    .total { font-size: 1.2rem; font-weight: bold; color: #00d4aa; }
                    @media print {
                        body { padding: 20px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="receipt">
                    ${receiptElement.innerHTML}
                    <div class="divider"></div>
                    <p style="text-align:center; color:#888; font-size:0.75rem; margin-top:20px;">
                        Downloaded on ${new Date().toLocaleString()}
                    </p>
                </div>
                <div class="no-print" style="text-align:center; margin-top:20px;">
                    <button onclick="window.print()" style="background:#00d4aa; color:#1a1a2e; border:none; padding:10px 20px; border-radius:6px; cursor:pointer; font-weight:600;">
                        🖨️ Print / Save as PDF
                    </button>
                </div>
                <script>
                    setTimeout(() => {
                        window.print();
                    }, 1000);
                <\/script>
            </body>
        </html>
    `);
    printWindow.document.close();
}

// ============ CLOSE MODAL FUNCTIONS ============
const closeDetailBtn = document.getElementById('closeDetailBtn');
if (closeDetailBtn) {
    closeDetailBtn.addEventListener('click', function() {
        document.getElementById('rideDetailModal').style.display = 'none';
    });
}

const closeReceiptBtn = document.getElementById('closeReceiptBtn');
if (closeReceiptBtn) {
    closeReceiptBtn.addEventListener('click', function() {
        document.getElementById('receiptModal').style.display = 'none';
    });
}

console.log('🚗 App.js fully loaded!');