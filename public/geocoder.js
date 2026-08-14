// ============ GEOCODING SERVICE ============
// Using OpenStreetMap Nominatim (free, no API key needed)

class Geocoder {
    constructor() {
        this.baseUrl = 'https://nominatim.openstreetmap.org/search';
        this.cache = {};
    }

    async search(query) {
        if (!query || query.length < 3) {
            return [];
        }
        
        // Check cache
        const cacheKey = query.toLowerCase();
        if (this.cache[cacheKey]) {
            return this.cache[cacheKey];
        }
        
        try {
            const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=10&countrycodes=za`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RideBook App'
                }
            });
            
            if (!response.ok) {
                throw new Error('Geocoding request failed');
            }
            
            const data = await response.json();
            
            const results = data.map(item => ({
                lat: parseFloat(item.lat),
                lng: parseFloat(item.lon),
                displayName: item.display_name,
                address: {
                    road: item.address?.road || '',
                    suburb: item.address?.suburb || '',
                    city: item.address?.city || item.address?.town || item.address?.village || '',
                    state: item.address?.state || '',
                    country: item.address?.country || 'South Africa',
                    postcode: item.address?.postcode || ''
                }
            }));
            
            // Cache results
            this.cache[cacheKey] = results;
            return results;
        } catch (error) {
            console.error('Geocoding error:', error);
            return [];
        }
    }

    async reverseGeocode(lat, lng) {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'RideBook App'
                }
            });
            
            if (!response.ok) {
                throw new Error('Reverse geocoding failed');
            }
            
            const data = await response.json();
            
            if (data && data.display_name) {
                return {
                    displayName: data.display_name,
                    address: {
                        road: data.address?.road || '',
                        suburb: data.address?.suburb || '',
                        city: data.address?.city || data.address?.town || data.address?.village || '',
                        state: data.address?.state || '',
                        country: data.address?.country || 'South Africa',
                        postcode: data.address?.postcode || ''
                    }
                };
            }
            return null;
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            return null;
        }
    }
}

const geocoder = new Geocoder();

async reverseGeocode(lat, lng) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=18`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'RideBook App'
            }
        });
        
        if (!response.ok) {
            throw new Error('Reverse geocoding failed');
        }
        
        const data = await response.json();
        
        if (data && data.display_name) {
            let displayName = data.display_name;
            displayName = displayName.replace(/, South Africa$/, '');
            displayName = displayName.replace(/, South Africa$/, '');
            
            return {
                displayName: displayName,
                address: {
                    road: data.address?.road || '',
                    suburb: data.address?.suburb || '',
                    city: data.address?.city || data.address?.town || data.address?.village || '',
                    state: data.address?.state || '',
                    country: data.address?.country || 'South Africa',
                    postcode: data.address?.postcode || ''
                }
            };
        }
        return null;
    } catch (error) {
        console.error('Reverse geocoding error:', error);
        return null;
    }
}