/**
 * Lightweight reverse geocoder — bundled city list, no API calls.
 * ~300 major world cities for instant lat/lon → "near City, Country" resolution.
 */

// Compact format: [lat, lon, "City", "Country Code"]
type CityEntry = [number, number, string, string];

const CITIES: CityEntry[] = [
  // North America
  [40.71,-74.01,"New York","US"],[34.05,-118.24,"Los Angeles","US"],[41.88,-87.63,"Chicago","US"],
  [29.76,-95.37,"Houston","US"],[33.45,-112.07,"Phoenix","US"],[29.42,-98.49,"San Antonio","US"],
  [32.72,-117.16,"San Diego","US"],[32.78,-96.80,"Dallas","US"],[30.27,-97.74,"Austin","US"],
  [37.77,-122.42,"San Francisco","US"],[47.61,-122.33,"Seattle","US"],[39.74,-104.99,"Denver","US"],
  [38.91,-77.04,"Washington DC","US"],[42.36,-71.06,"Boston","US"],[25.76,-80.19,"Miami","US"],
  [33.75,-84.39,"Atlanta","US"],[36.17,-115.14,"Las Vegas","US"],[45.50,-122.68,"Portland","US"],
  [35.23,-80.84,"Charlotte","US"],[44.98,-93.27,"Minneapolis","US"],[36.16,-86.78,"Nashville","US"],
  [39.10,-94.58,"Kansas City","US"],[38.25,-85.76,"Louisville","US"],[35.47,-97.52,"Oklahoma City","US"],
  [21.31,-157.86,"Honolulu","US"],[61.22,-149.90,"Anchorage","US"],
  [43.65,-79.38,"Toronto","CA"],[45.50,-73.57,"Montreal","CA"],[49.28,-123.12,"Vancouver","CA"],
  [51.05,-114.07,"Calgary","CA"],[53.55,-113.49,"Edmonton","CA"],[45.42,-75.70,"Ottawa","CA"],
  [19.43,-99.13,"Mexico City","MX"],[20.67,-103.35,"Guadalajara","MX"],[25.67,-100.31,"Monterrey","MX"],
  // Central America & Caribbean
  [14.63,-90.51,"Guatemala City","GT"],[13.69,-89.19,"San Salvador","SV"],
  [12.11,-86.24,"Managua","NI"],[9.93,-84.08,"San José","CR"],[8.98,-79.52,"Panama City","PA"],
  [18.47,-69.90,"Santo Domingo","DO"],[23.11,-82.37,"Havana","CU"],[18.01,-76.80,"Kingston","JM"],
  // South America
  [-23.55,-46.63,"São Paulo","BR"],[-22.91,-43.17,"Rio de Janeiro","BR"],[-15.79,-47.88,"Brasília","BR"],
  [-12.97,-38.51,"Salvador","BR"],[-3.12,-60.02,"Manaus","BR"],[-8.05,-34.87,"Recife","BR"],
  [-34.60,-58.38,"Buenos Aires","AR"],[-31.42,-64.18,"Córdoba","AR"],
  [-33.45,-70.67,"Santiago","CL"],[-12.05,-77.04,"Lima","PE"],[4.71,-74.07,"Bogotá","CO"],
  [10.49,-66.88,"Caracas","VE"],[-0.18,-78.47,"Quito","EC"],[-16.50,-68.15,"La Paz","BO"],
  [-25.26,-57.58,"Asunción","PY"],[-34.88,-56.17,"Montevideo","UY"],[6.80,-58.16,"Georgetown","GY"],
  // Europe — Western
  [51.51,-0.13,"London","GB"],[53.48,-2.24,"Manchester","GB"],[55.95,-3.19,"Edinburgh","GB"],
  [51.45,-2.59,"Bristol","GB"],[52.49,-1.90,"Birmingham","GB"],
  [48.86,2.35,"Paris","FR"],[43.30,5.37,"Marseille","FR"],[45.76,4.84,"Lyon","FR"],
  [52.52,13.41,"Berlin","DE"],[48.14,11.58,"Munich","DE"],[50.94,6.96,"Cologne","DE"],
  [53.55,9.99,"Hamburg","DE"],[50.11,8.68,"Frankfurt","DE"],[48.78,9.18,"Stuttgart","DE"],
  [40.42,-3.70,"Madrid","ES"],[41.39,2.17,"Barcelona","ES"],[37.39,-5.98,"Seville","ES"],
  [39.47,-0.38,"Valencia","ES"],
  [41.90,12.50,"Rome","IT"],[45.46,9.19,"Milan","IT"],[40.85,14.27,"Naples","IT"],
  [43.77,11.25,"Florence","IT"],[45.44,12.32,"Venice","IT"],
  [38.72,-9.14,"Lisbon","PT"],[41.15,-8.61,"Porto","PT"],
  [52.37,4.90,"Amsterdam","NL"],[51.92,4.48,"Rotterdam","NL"],
  [50.85,4.35,"Brussels","BE"],[50.63,3.07,"Lille","FR"],
  [47.38,8.54,"Zurich","CH"],[46.95,7.45,"Bern","CH"],[46.20,6.14,"Geneva","CH"],
  [48.21,16.37,"Vienna","AT"],[47.07,15.44,"Graz","AT"],
  [53.34,-6.26,"Dublin","IE"],
  // Europe — Nordic
  [59.33,18.07,"Stockholm","SE"],[57.71,11.97,"Gothenburg","SE"],
  [55.68,12.57,"Copenhagen","DK"],[60.17,24.94,"Helsinki","FI"],
  [59.91,10.75,"Oslo","NO"],[60.39,5.32,"Bergen","NO"],
  [64.14,-21.90,"Reykjavik","IS"],
  // Europe — Eastern
  [52.23,21.01,"Warsaw","PL"],[50.06,19.94,"Kraków","PL"],[51.11,17.04,"Wrocław","PL"],
  [52.41,16.93,"Poznań","PL"],[54.35,18.65,"Gdańsk","PL"],
  [50.08,14.44,"Prague","CZ"],[49.19,16.61,"Brno","CZ"],
  [48.15,17.11,"Bratislava","SK"],[47.50,19.04,"Budapest","HU"],
  [44.43,26.10,"Bucharest","RO"],[46.77,23.60,"Cluj-Napoca","RO"],
  [42.70,23.32,"Sofia","BG"],[43.21,27.91,"Varna","BG"],
  [37.98,23.73,"Athens","GR"],[40.64,22.94,"Thessaloniki","GR"],
  [44.79,20.47,"Belgrade","RS"],[43.86,18.41,"Sarajevo","BA"],
  [41.33,19.82,"Tirana","AL"],[45.81,15.98,"Zagreb","HR"],
  [46.06,14.51,"Ljubljana","SI"],
  // Europe — Baltic & Eastern
  [56.95,24.11,"Riga","LV"],[54.69,25.28,"Vilnius","LT"],[59.44,24.75,"Tallinn","EE"],
  [55.75,37.62,"Moscow","RU"],[59.93,30.32,"St Petersburg","RU"],[56.84,60.60,"Yekaterinburg","RU"],
  [55.03,82.92,"Novosibirsk","RU"],[50.45,30.52,"Kyiv","UA"],[49.84,24.03,"Lviv","UA"],
  [46.84,29.60,"Chișinău","MD"],[53.90,27.57,"Minsk","BY"],
  // Middle East
  [41.01,28.98,"Istanbul","TR"],[39.93,32.85,"Ankara","TR"],[38.42,27.14,"İzmir","TR"],
  [25.20,55.27,"Dubai","AE"],[24.45,54.65,"Abu Dhabi","AE"],
  [32.09,34.78,"Tel Aviv","IL"],[31.77,35.23,"Jerusalem","IL"],
  [33.89,35.50,"Beirut","LB"],[33.51,36.29,"Damascus","SY"],
  [30.04,31.24,"Cairo","EG"],[31.20,29.92,"Alexandria","EG"],
  [24.69,46.72,"Riyadh","SA"],[21.42,39.83,"Jeddah","SA"],[21.39,39.86,"Mecca","SA"],
  [29.38,47.99,"Kuwait City","KW"],[26.23,50.59,"Manama","BH"],[25.29,51.53,"Doha","QA"],
  [23.61,58.54,"Muscat","OM"],[33.31,44.37,"Baghdad","IQ"],
  [35.69,51.39,"Tehran","IR"],[32.65,51.68,"Isfahan","IR"],
  // Africa
  [36.75,3.06,"Algiers","DZ"],[33.97,-6.85,"Rabat","MA"],[33.59,-7.62,"Casablanca","MA"],
  [36.81,10.18,"Tunis","TN"],[32.90,13.18,"Tripoli","LY"],
  [6.52,3.38,"Lagos","NG"],[9.06,7.49,"Abuja","NG"],[5.56,-0.19,"Accra","GH"],
  [6.69,-1.62,"Kumasi","GH"],[14.69,-17.44,"Dakar","SN"],[6.37,2.39,"Cotonou","BJ"],
  [5.35,-4.01,"Abidjan","CI"],[12.64,-8.00,"Bamako","ML"],[12.37,-1.52,"Ouagadougou","BF"],
  [13.51,2.11,"Niamey","NE"],[4.05,9.77,"Douala","CM"],[3.87,11.52,"Yaoundé","CM"],
  [-4.32,15.31,"Kinshasa","CD"],[-1.29,36.82,"Nairobi","KE"],[0.31,32.58,"Kampala","UG"],
  [-6.17,35.74,"Dodoma","TZ"],[-6.79,39.28,"Dar es Salaam","TZ"],[-1.94,29.87,"Kigali","RW"],
  [9.02,38.75,"Addis Ababa","ET"],[2.05,45.34,"Mogadishu","SO"],[15.50,32.56,"Khartoum","SD"],
  [-25.75,28.19,"Pretoria","ZA"],[-33.93,18.42,"Cape Town","ZA"],[-26.20,28.04,"Johannesburg","ZA"],
  [-29.86,31.03,"Durban","ZA"],[-17.83,31.05,"Harare","ZW"],[-15.39,28.32,"Lusaka","ZM"],
  [-13.97,33.79,"Lilongwe","MW"],[-25.97,32.57,"Maputo","MZ"],
  [-18.92,47.52,"Antananarivo","MG"],[-20.16,57.50,"Port Louis","MU"],
  // South Asia
  [28.61,77.21,"New Delhi","IN"],[19.08,72.88,"Mumbai","IN"],[12.97,77.59,"Bangalore","IN"],
  [13.08,80.27,"Chennai","IN"],[22.57,88.36,"Kolkata","IN"],[17.39,78.49,"Hyderabad","IN"],
  [23.02,72.57,"Ahmedabad","IN"],[18.52,73.86,"Pune","IN"],[26.85,80.95,"Lucknow","IN"],
  [23.81,90.41,"Dhaka","BD"],[27.72,85.32,"Kathmandu","NP"],[6.93,79.85,"Colombo","LK"],
  [33.69,73.04,"Islamabad","PK"],[24.86,67.01,"Karachi","PK"],[31.55,74.35,"Lahore","PK"],
  [34.53,69.17,"Kabul","AF"],
  // East Asia
  [39.90,116.41,"Beijing","CN"],[31.23,121.47,"Shanghai","CN"],[23.13,113.26,"Guangzhou","CN"],
  [22.54,114.06,"Shenzhen","CN"],[30.57,104.07,"Chengdu","CN"],[29.56,106.55,"Chongqing","CN"],
  [39.12,117.20,"Tianjin","CN"],[34.26,108.94,"Xi'an","CN"],[22.20,113.55,"Macau","MO"],
  [22.32,114.17,"Hong Kong","HK"],
  [35.68,139.69,"Tokyo","JP"],[34.69,135.50,"Osaka","JP"],[35.18,136.91,"Nagoya","JP"],
  [43.06,141.35,"Sapporo","JP"],[33.59,130.40,"Fukuoka","JP"],
  [37.57,126.98,"Seoul","KR"],[35.18,129.08,"Busan","KR"],
  [25.03,121.57,"Taipei","TW"],[47.92,106.92,"Ulaanbaatar","MN"],
  // Southeast Asia
  [1.35,103.82,"Singapore","SG"],[13.76,100.50,"Bangkok","TH"],[18.79,98.98,"Chiang Mai","TH"],
  [3.14,101.69,"Kuala Lumpur","MY"],[21.03,105.85,"Hanoi","VN"],[10.82,106.63,"Ho Chi Minh City","VN"],
  [14.60,120.98,"Manila","PH"],[10.31,123.89,"Cebu","PH"],
  [-6.21,106.85,"Jakarta","ID"],[-8.65,115.22,"Bali","ID"],[-7.80,110.36,"Yogyakarta","ID"],
  [16.87,96.20,"Yangon","MM"],[11.56,104.92,"Phnom Penh","KH"],[17.97,102.63,"Vientiane","LA"],
  // Oceania
  [-33.87,151.21,"Sydney","AU"],[-37.81,144.96,"Melbourne","AU"],[-27.47,153.03,"Brisbane","AU"],
  [-31.95,115.86,"Perth","AU"],[-34.93,138.60,"Adelaide","AU"],[-35.28,149.13,"Canberra","AU"],
  [-36.85,174.76,"Auckland","NZ"],[-41.29,174.78,"Wellington","NZ"],
  [-17.73,177.98,"Suva","FJ"],
];

/**
 * Find the nearest city to given coordinates.
 * Returns { name, country, distance } or null if no cities loaded.
 */
export function nearestCity(lat: number, lon: number): { name: string; country: string; distanceKm: number } | null {
  let best: CityEntry | null = null;
  let bestDist = Infinity;

  for (const city of CITIES) {
    const d = haversineKm(lat, lon, city[0], city[1]);
    if (d < bestDist) {
      bestDist = d;
      best = city;
    }
  }

  if (!best) return null;
  return { name: best[2], country: best[3], distanceKm: Math.round(bestDist) };
}

/**
 * Format a human-readable location from lat/lon.
 * Returns e.g., "near Poznań, PL" or "Poznań, PL" if very close.
 */
export function locationLabel(lat: number, lon: number): string {
  const result = nearestCity(lat, lon);
  if (!result) return '';

  if (result.distanceKm < 10) {
    return `${result.name}, ${result.country}`;
  }
  return `near ${result.name}, ${result.country}`;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}
