// ============ CONFIGURATION ============
let currentUser = null;
let socket = null;
let selectedRideType = 'economy';
let selectedPayment = 'cash';
let currentFilter = 'all';
let notificationCount = 0;
let driverMarker = null;

// ============ ROUTE VARIABLES ============
let routeLayer = null;
let routeMarkers = [];

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

// ============ MAP INITIALIZATION - PORT ELIZABETH ============
const map = L.map('map').setView([-33.9608, 25.6022], 12);

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
const pickupSearch = document.getElementById('pickupSearch');
const dropoffSearch = document.getElementById('dropoffSearch');
const searchResults = document.getElementById('searchResults');
let searchType = 'pickup';
let searchTimeout = null;

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
    
    socket.on('new-ride', (ride) => {
      if (currentUser && currentUser.role === 'driver') {
        showInAppNotification(
            'New Ride Available',
            `New ride request from ${ride.riderName || 'a rider'}`,
            'info'
        );
        loadRides();
      }
    });
    
    socket.on('ride-updated', (ride) => {
      updateRideInList(ride);
      if (currentUser && currentUser.role === 'driver') {
        if (ride.driverId === currentUser.id) {
          showInAppNotification(
              'Ride Updated',
              `Ride status changed to: ${ride.status}`,
              'info'
          );
        }
      }
    });
    
    socket.on('ride-status-update', (ride) => {
      updateRideInList(ride);
      
      const notifications = {
        'accepted': {
          title: 'Ride Accepted',
          message: `Your ride has been accepted by ${ride.driverName || 'a driver'}`,
          type: 'success'
        },
        'in_progress': {
          title: 'Driver En Route',
          message: `${ride.driverName || 'Your driver'} is on the way to pick you up`,
          type: 'info'
        },
        'completed': {
          title: 'Ride Complete',
          message: 'Your ride is complete! Please rate your driver.',
          type: 'success'
        },
        'cancelled': {
          title: 'Ride Cancelled',
          message: 'Your ride has been cancelled.',
          type: 'error'
        }
      };
      
      const notif = notifications[ride.status];
      if (notif && ride.riderId === currentUser?.id) {
        showInAppNotification(notif.title, notif.message, notif.type);
      }
    });

    // Driver location tracking
    socket.on('driver-location-update', (data) => {
      if (data.lat && data.lng) {
        updateDriverMarker(data.lat, data.lng);
      }
    });
    
    console.log('Socket connected');
  } catch (err) {
    console.log('Socket not available (running in demo mode)');
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

// ============ ROUTE FUNCTIONS ============
// Get route from OSRM (Open Source Routing Machine)
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

// Display route on map
async function displayRoute(pickup, dropoff) {
    // Remove existing route
    clearRoute();
    
    // Get route data
    const routeData = await getRoute(pickup.lat, pickup.lng, dropoff.lat, dropoff.lng);
    
    if (!routeData) {
        showInAppNotification('Route Error', 'Could not find a driving route', 'error');
        return;
    }
    
    const route = routeData.routes[0];
    const geometry = route.geometry;
    const distance = (route.distance / 1000).toFixed(1); // km
    const duration = Math.round(route.duration / 60); // minutes
    
    // Draw the route
    if (geometry && geometry.coordinates) {
        // Convert coordinates to Leaflet format [lat, lng]
        const latlngs = geometry.coordinates.map(coord => [coord[1], coord[0]]);
        
        routeLayer = L.polyline(latlngs, {
            color: '#7c3aed',
            weight: 5,
            opacity: 0.8,
            dashArray: null,
            lineJoin: 'round'
        }).addTo(map);
        
        // Add route animation
        animateRoute(latlngs);
        
        // Add distance/duration info
        const center = map.getCenter();
        const infoPopup = L.popup({
            closeOnClick: false,
            autoClose: false
        })
        .setLatLng([center.lat + 0.01, center.lng])
        .setContent(`
            <div style="font-size:14px;font-weight:600;color:#1a1a2e;">
                🚗 ${distance} km · ${duration} min
            </div>
        `)
        .openOn(map);
        
        // Store route info
        routeMarkers.push({
            type: 'info',
            popup: infoPopup
        });
        
        // Update ride details with real route data
        updateRouteDetails(distance, duration);
        
        showInAppNotification(
            'Route Found',
            `${distance} km · ${duration} minutes`,
            'success'
        );
        
        // Fit map to show entire route
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

// Animate route (draw line progressively)
function animateRoute(latlngs) {
    if (!routeLayer) return;
    
    let index = 0;
    const totalPoints = latlngs.length;
    
    // Create a copy of the route with only the first point
    const animatedLatLngs = [latlngs[0]];
    routeLayer.setLatLngs(animatedLatLngs);
    
    const interval = setInterval(() => {
        index++;
        if (index < totalPoints) {
            animatedLatLngs.push(latlngs[index]);
            routeLayer.setLatLngs(animatedLatLngs);
        } else {
            clearInterval(interval);
            // Show full route
            routeLayer.setLatLngs(latlngs);
        }
    }, 30); // Speed of animation
}

// Clear route from map
function clearRoute() {
    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }
    
    routeMarkers.forEach(marker => {
        if (marker.popup) {
            map.removeLayer(marker.popup);
        }
        if (marker.marker) {
            map.removeLayer(marker.marker);
        }
    });
    routeMarkers = [];
}

// Update ride details with real route data
function updateRouteDetails(distance, duration) {
    const rideDistance = document.getElementById('rideDistance');
    const rideDuration = document.getElementById('rideDuration');
    const rideFare = document.getElementById('rideFare');
    
    if (rideDistance) rideDistance.textContent = distance;
    if (rideDuration) rideDuration.textContent = duration;
    
    // Update fare based on actual distance
    const perKmRates = {
        economy: 15.00,
        premium: 25.00,
        suv: 30.00,
        xl: 35.00
    };
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
  
  const perKmRates = {
    economy: 15.00,
    premium: 25.00,
    suv: 30.00,
    xl: 35.00
  };
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
  if (!currentUser) {
    showNotification('Please login first!', 'error');
    return;
  }
  
  if (clickState === 'pickup') {
    if (pickupMarker) map.removeLayer(pickupMarker);
    pickupMarker = L.marker(e.latlng, { icon: greenIcon })
      .addTo(map)
      .bindPopup('Pickup')
      .openPopup();
    clickState = 'dropoff';
    instruction.textContent = 'Now click to set your dropoff location';
    updateRideDetails();
    clearRoute(); // Clear any existing route
  } else if (clickState === 'dropoff') {
    if (dropoffMarker) map.removeLayer(dropoffMarker);
    dropoffMarker = L.marker(e.latlng, { icon: redIcon })
      .addTo(map)
      .bindPopup('Dropoff')
      .openPopup();
    clickState = 'done';
    instruction.textContent = 'Ready! Click "Request Ride" to submit.';
    rideControls.classList.remove('hidden');
    updateRideDetails();
    
    // Show route on map
    const pickup = pickupMarker.getLatLng();
    const dropoff = dropoffMarker.getLatLng();
    displayRoute(pickup, dropoff);
  }
});

// ============ ADDRESS SEARCH ============
if (pickupSearch) {
  pickupSearch.addEventListener('input', function() {
    searchType = 'pickup';
    handleSearch(this.value);
  });
}

if (dropoffSearch) {
  dropoffSearch.addEventListener('input', function() {
    searchType = 'dropoff';
    handleSearch(this.value);
  });
}

document.getElementById('searchPickupBtn')?.addEventListener('click', function() {
  searchType = 'pickup';
  handleSearch(pickupSearch.value);
});

document.getElementById('searchDropoffBtn')?.addEventListener('click', function() {
  searchType = 'dropoff';
  handleSearch(dropoffSearch.value);
});

function handleSearch(query) {
  clearTimeout(searchTimeout);
  
  if (!query || query.length < 3) {
    if (searchResults) searchResults.classList.add('hidden');
    return;
  }
  
  searchTimeout = setTimeout(async () => {
    const results = await geocoder.search(query);
    displaySearchResults(results);
  }, 500);
}

function displaySearchResults(results) {
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
    const road = result.address.road || '';
    const displayAddress = road ? `${road}, ${city}` : city;
    
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
    const latlng = L.latLng(result.lat, result.lng);
    
    if (searchType === 'pickup') {
        // Set pickup marker
        if (pickupMarker) map.removeLayer(pickupMarker);
        pickupMarker = L.marker(latlng, { icon: greenIcon })
            .addTo(map)
            .bindPopup('📍 Pickup: ' + result.displayName)
            .openPopup();
        
        // Update state
        if (clickState === 'pickup' || clickState === 'dropoff') {
            clickState = 'dropoff';
            instruction.textContent = 'Now click to set your dropoff location';
        } else if (clickState === 'done') {
            // Keep state but update marker
        }
        
        map.setView(latlng, 15);
        if (pickupSearch) pickupSearch.value = result.displayName;
        
        // Update location status
        const locationStatus = document.getElementById('locationStatus');
        if (locationStatus) {
            locationStatus.textContent = `✅ Pickup set to: ${result.displayName}`;
            locationStatus.className = 'location-status success';
        }
        
        // Clear route when pickup changes
        clearRoute();
        updateRideDetails();
    } else {
        // Set dropoff marker
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
        
        // Show route on map
        if (pickupMarker) {
            const pickup = pickupMarker.getLatLng();
            const dropoff = dropoffMarker.getLatLng();
            displayRoute(pickup, dropoff);
        }
    }
    
    if (searchResults) searchResults.classList.add('hidden');
}

document.addEventListener('click', function(e) {
  if (!e.target.closest('.search-section')) {
    if (searchResults) searchResults.classList.add('hidden');
  }
});

// ============ REQUEST RIDE ============
requestBtn.addEventListener('click', async function() {
  if (!pickupMarker || !dropoffMarker) {
    showInAppNotification('Error', 'Please set both pickup and dropoff locations', 'error');
    return;
  }
  
  if (!currentUser) {
    showInAppNotification('Error', 'Please login first!', 'error');
    return;
  }
  
  let pickupAddress = pickupSearch ? pickupSearch.value : '';
  let dropoffAddress = dropoffSearch ? dropoffSearch.value : '';
  
  if (!pickupAddress) {
    const pickupLatLng = pickupMarker.getLatLng();
    const pickupResult = await geocoder.reverseGeocode(pickupLatLng.lat, pickupLatLng.lng);
    if (pickupResult) {
      pickupAddress = pickupResult.displayName;
      if (pickupSearch) pickupSearch.value = pickupAddress;
    }
  }
  
  if (!dropoffAddress) {
    const dropoffLatLng = dropoffMarker.getLatLng();
    const dropoffResult = await geocoder.reverseGeocode(dropoffLatLng.lat, dropoffLatLng.lng);
    if (dropoffResult) {
      dropoffAddress = dropoffResult.displayName;
      if (dropoffSearch) dropoffSearch.value = dropoffAddress;
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
      address: pickupAddress
    },
    dropoff: {
      lat: dropoff.lat,
      lng: dropoff.lng,
      address: dropoffAddress
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
    requestBtn.textContent = scheduledTime ? 'Scheduling...' : 'Booking...';
    
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
        ? 'Ride scheduled for ' + new Date(scheduledTime).toLocaleString()
        : 'Ride booked! R' + details.fare.toFixed(2);
      showInAppNotification('Success', message, 'success');
      
      if (scheduledInput) scheduledInput.value = '';
    } else {
      showInAppNotification('Error', savedRide.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error requesting ride:', err);
    showInAppNotification('Error', 'Network error. Please try again.', 'error');
  } finally {
    requestBtn.disabled = false;
    requestBtn.textContent = 'Request Ride';
  }
});

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
  
  // Clear route
  clearRoute();
}

resetBtn.addEventListener('click', resetMarkers);

// ============ RIDE LIST FUNCTIONS ============
function addRideToList(ride) {
  const li = document.createElement('li');
  li.id = `ride-${ride._id}`;
  
  const statusMap = {
    pending: 'Pending',
    accepted: 'Accepted',
    in_progress: 'In Progress',
    completed: 'Completed',
    cancelled: 'Cancelled'
  };
  
  const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
  const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
  
  let ratingHTML = '';
  if (ride.status === 'completed' && ride.riderId === currentUser?.id) {
    if (!ride.riderRating) {
      ratingHTML = `
        <div class="rating-section">
          <span>Rate your ride: </span>
          ${[1,2,3,4,5].map(n => 
            `<button class="star-btn" data-rating="${n}" data-ride="${ride._id}">★</button>`
          ).join('')}
        </div>
      `;
    } else {
      ratingHTML = `
        <div class="rating-section">
          <span>Your rating: ${'★'.repeat(ride.riderRating.rating)}</span>
        </div>
      `;
    }
  }
  
  li.innerHTML = `
    <div class="ride-item">
      <div class="ride-header">
        <div>
          <span class="status ${ride.status}">${statusMap[ride.status] || ride.status}</span>
          <span class="ride-type-badge">${ride.rideType || 'economy'}</span>
        </div>
        <span class="ride-time">${new Date(ride.createdAt).toLocaleTimeString()}</span>
      </div>
      <div class="ride-coords">
        <div class="address-line">
          <span style="color:#00d4aa;">▲ Pickup:</span> ${pickupDisplay}
        </div>
        <div class="address-line">
          <span style="color:#e74c3c;">▼ Dropoff:</span> ${dropoffDisplay}
        </div>
      </div>
      <div class="ride-meta">
        <span>R${(ride.estimatedFare || 0).toFixed(2)}</span>
        <span>${(ride.distance || 0).toFixed(1)} km</span>
        <span>${ride.duration || 0} min</span>
      </div>
      ${ratingHTML}
    </div>
  `;
  
  ridesList.prepend(li);
  
  li.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const rating = parseInt(this.dataset.rating);
      const rideId = this.dataset.ride;
      await rateRide(rideId, rating);
    });
  });
  
  // Add click to show route
  li.addEventListener('click', function() {
    const rideId = this.id.replace('ride-', '');
    // Find the ride in the loaded rides
    // Note: You'll need to store rides in a global variable
    // For now, we'll try to use the data from the ride object
    if (ride.pickup && ride.dropoff) {
      displayRoute(ride.pickup, ride.dropoff);
      showInAppNotification(
        'Route Displayed',
        `Showing route for ride ${ride._id.slice(-6)}`,
        'info'
      );
    }
  });
}

function updateRideInList(updatedRide) {
  const existing = document.getElementById(`ride-${updatedRide._id}`);
  if (existing) {
    existing.remove();
  }
  addRideToList(updatedRide);
  loadRideHistory();
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
      body: JSON.stringify({ 
        rating: rating, 
        role: 'rider' 
      })
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
    historyList.innerHTML = '<p class="no-rides">No rides found</p>';
    return;
  }
  
  historyList.innerHTML = '';
  filtered.forEach(ride => {
    const div = document.createElement('div');
    div.className = `history-item ${ride.status}`;
    
    const statusMap = {
      pending: 'Pending',
      accepted: 'Accepted',
      in_progress: 'In Progress',
      completed: 'Completed',
      cancelled: 'Cancelled'
    };
    
    const pickupDisplay = ride.pickup?.address || `${ride.pickup.lat.toFixed(4)}, ${ride.pickup.lng.toFixed(4)}`;
    const dropoffDisplay = ride.dropoff?.address || `${ride.dropoff.lat.toFixed(4)}, ${ride.dropoff.lng.toFixed(4)}`;
    
    div.innerHTML = `
      <div class="history-header">
        <span><strong>${ride.rideType || 'Economy'}</strong></span>
        <span class="status ${ride.status}">${statusMap[ride.status] || ride.status}</span>
      </div>
      <div class="history-coords">
        <div>▲ ${pickupDisplay}</div>
        <div>▼ ${dropoffDisplay}</div>
      </div>
      <div class="history-meta">
        <span>R${(ride.estimatedFare || 0).toFixed(2)}</span>
        <span>${(ride.distance || 0).toFixed(1)} km</span>
        <span>${ride.duration || 0} min</span>
      </div>
      <div class="history-date">
        ${new Date(ride.createdAt).toLocaleString()}
      </div>
    `;
    historyList.appendChild(div);
  });
}

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
      addRideToList(ride);
      addRideToMap(ride);
    });
    
    loadRideHistory();
    loadFavorites();
  } catch (err) {
    console.error('Error loading rides:', err);
  }
}

loadRides();

console.log('RideBook Rider App Loaded');
console.log('User:', currentUser?.username || 'Not logged in');
console.log('Map centered on Port Elizabeth, South Africa');

// ============ AUTO-DETECT USER LOCATION ============
let isLocating = false;
let locationStatus = document.createElement('div');
locationStatus.className = 'location-status';
locationStatus.id = 'locationStatus';
locationStatus.textContent = '📍 Click the location button to detect your position';

// Insert status after pickup search
const pickupGroup = document.querySelector('.search-input-group');
if (pickupGroup) {
    pickupGroup.appendChild(locationStatus);
}

// Detect location button
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
            
            if (pickupMarker) {
                map.removeLayer(pickupMarker);
            }
            
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
            
            showInAppNotification(
                'Location Detected',
                `Pickup set to: ${address.displayName}`,
                'success'
            );
            
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
            
            showInAppNotification(
                'Location Detected',
                'Pickup set using coordinates',
                'info'
            );
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
        
        showInAppNotification(
            'Location Error',
            errorMessage,
            'error'
        );
        
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
            
            // Clear route when pickup changes
            clearRoute();
            
            const locationStatus = document.getElementById('locationStatus');
            if (locationStatus) {
                locationStatus.textContent = `✅ Pickup updated to: ${result.displayName}`;
                locationStatus.className = 'location-status success';
            }
        }
    });
}