var map = L.map('map').setView([51.505, -0.09], 13);  // Initial position and zoom

// OpenStreetMap Tile Layer (Land)
var osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

// OpenSeaMap Tile Layer (Sea)
var openSeaMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.de/tiles/osmde/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://openseamap.org/">OpenSeaMap</a> contributors'
});

// Add the OpenStreetMap layer by default
osmLayer.addTo(map);

// Add a layer control to switch between layers
L.control.layers({
    'Land (OSM)': osmLayer,
    'Sea (OpenSeaMap)': openSeaMapLayer
}).addTo(map);

// Fetch the boat's GPS data from the endpoint
async function fetchBoatLocation() {
    try {
        const response = await fetch('http://localhost:3000/gps');
        const gpsData = await response.json();
        
        const boatLat = gpsData.latitude;
        const boatLon = gpsData.longitude;
        
        // Add the boat's location as a marker
        var boatMarker = L.marker([boatLat, boatLon]).addTo(map);
        
        // Add a popup with the Google Maps link
        boatMarker.bindPopup(`
            <b>The Boat Location</b><br>
            Latitude: ${boatLat}<br>
            Longitude: ${boatLon}<br>
        `).openPopup();

        // Center the map to the boat's location
        map.setView([boatLat, boatLon], 13);
    } catch (error) {
        console.error('Failed to fetch boat location:', error);
    }
}

// Call the function to fetch the boat location and add it to the map
fetchBoatLocation();

// Locate the user's position
map.locate({setView: true, maxZoom: 16});

// When the location is found, add a marker and a popup
map.on('locationfound', function(e) {
    var radius = e.accuracy / 2;

    L.marker(e.latlng).addTo(map)
        .bindPopup("You are within " + radius + " meters from this point")
        .openPopup();

    L.circle(e.latlng, radius).addTo(map);  // Add a circle around the location for accuracy
});

// Handle errors if the location is not found
map.on('locationerror', function() {
    alert("Location access denied or failed.");
});

// Add geolocation control
L.control.locate().addTo(map);
