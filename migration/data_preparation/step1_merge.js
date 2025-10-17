const fs = require('fs');
const path = require('path');
const { parser } = require('stream-json');
const { streamArray } = require('stream-json/streamers/StreamArray');
const ngeohash = require('ngeohash');

// Capital cities data for geohash generation
const capitalCities = {
  'AD': { name: 'Andorra la Vella', lat: 42.5063, lon: 1.5218 },
  'AE': { name: 'Abu Dhabi', lat: 24.4539, lon: 54.3773 },
  'AF': { name: 'Kabul', lat: 34.5553, lon: 69.2075 },
  'AG': { name: 'Saint John\'s', lat: 17.1274, lon: -61.8468 },
  'AI': { name: 'The Valley', lat: 18.2170, lon: -63.0578 },
  'AL': { name: 'Tirana', lat: 41.3275, lon: 19.8187 },
  'AM': { name: 'Yerevan', lat: 40.1792, lon: 44.4991 },
  'AO': { name: 'Luanda', lat: -8.8390, lon: 13.2894 },
  'AQ': { name: 'None', lat: -77.8419, lon: 166.6863 },
  'AR': { name: 'Buenos Aires', lat: -34.6118, lon: -58.3960 },
  'AS': { name: 'Pago Pago', lat: -14.2781, lon: -170.7025 },
  'AT': { name: 'Vienna', lat: 48.2085, lon: 16.3721 },
  'AU': { name: 'Canberra', lat: -35.2809, lon: 149.1300 },
  'AW': { name: 'Oranjestad', lat: 12.5092, lon: -70.0086 },
  'AX': { name: 'Mariehamn', lat: 60.0973, lon: 19.9345 },
  'AZ': { name: 'Baku', lat: 40.4093, lon: 49.8671 },
  'BA': { name: 'Sarajevo', lat: 43.8563, lon: 18.4131 },
  'BB': { name: 'Bridgetown', lat: 13.1939, lon: -59.5432 },
  'BD': { name: 'Dhaka', lat: 23.8041, lon: 90.4152 },
  'BE': { name: 'Brussels', lat: 50.8503, lon: 4.3517 },
  'BF': { name: 'Ouagadougou', lat: 12.3714, lon: -1.5197 },
  'BG': { name: 'Sofia', lat: 42.6977, lon: 23.3219 },
  'BH': { name: 'Manama', lat: 26.2285, lon: 50.5860 },
  'BI': { name: 'Gitega', lat: -3.4264, lon: 29.9306 },
  'BJ': { name: 'Porto-Novo', lat: 6.4969, lon: 2.6283 },
  'BL': { name: 'Gustavia', lat: 17.8957, lon: -62.8489 },
  'BM': { name: 'Hamilton', lat: 32.2942, lon: -64.7839 },
  'BN': { name: 'Bandar Seri Begawan', lat: 4.9431, lon: 114.9425 },
  'BO': { name: 'Sucre', lat: -19.0196, lon: -65.2619 },
  'BQ': { name: 'Kralendijk', lat: 12.1696, lon: -68.2906 },
  'BR': { name: 'Brasília', lat: -15.8267, lon: -47.9218 },
  'BS': { name: 'Nassau', lat: 25.0443, lon: -77.3504 },
  'BT': { name: 'Thimphu', lat: 27.4728, lon: 89.6393 },
  'BV': { name: 'None', lat: -54.4208, lon: 3.3464 },
  'BW': { name: 'Gaborone', lat: -24.6282, lon: 25.9231 },
  'BY': { name: 'Minsk', lat: 53.9006, lon: 27.5590 },
  'BZ': { name: 'Belmopan', lat: 17.2510, lon: -88.7590 },
  'CA': { name: 'Ottawa', lat: 45.4215, lon: -75.6972 },
  'CC': { name: 'West Island', lat: -12.1642, lon: 96.8708 },
  'CD': { name: 'Kinshasa', lat: -4.4419, lon: 15.2663 },
  'CF': { name: 'Bangui', lat: 4.3947, lon: 18.5582 },
  'CG': { name: 'Brazzaville', lat: -4.2634, lon: 15.2429 },
  'CH': { name: 'Bern', lat: 46.9481, lon: 7.4474 },
  'CI': { name: 'Yamoussoukro', lat: 6.8276, lon: -5.2893 },
  'CK': { name: 'Avarua', lat: -21.2367, lon: -159.7777 },
  'CL': { name: 'Santiago', lat: -33.4489, lon: -70.6693 },
  'CM': { name: 'Yaoundé', lat: 3.8480, lon: 11.5021 },
  'CN': { name: 'Beijing', lat: 39.9042, lon: 116.4074 },
  'CO': { name: 'Bogotá', lat: 4.7110, lon: -74.0721 },
  'CR': { name: 'San José', lat: 9.7489, lon: -83.7534 },
  'CU': { name: 'Havana', lat: 23.1136, lon: -82.3666 },
  'CV': { name: 'Praia', lat: 14.9177, lon: -23.5092 },
  'CW': { name: 'Willemstad', lat: 12.1696, lon: -68.9900 },
  'CX': { name: 'Flying Fish Cove', lat: -10.4475, lon: 105.6904 },
  'CY': { name: 'Nicosia', lat: 35.1856, lon: 33.3823 },
  'CZ': { name: 'Prague', lat: 50.0755, lon: 14.4378 },
  'DE': { name: 'Berlin', lat: 52.5200, lon: 13.4050 },
  'DJ': { name: 'Djibouti', lat: 11.8251, lon: 42.5903 },
  'DK': { name: 'Copenhagen', lat: 55.6761, lon: 12.5683 },
  'DM': { name: 'Roseau', lat: 15.2976, lon: -61.3900 },
  'DO': { name: 'Santo Domingo', lat: 18.4861, lon: -69.9312 },
  'DZ': { name: 'Algiers', lat: 36.7538, lon: 3.0588 },
  'EC': { name: 'Quito', lat: -0.1807, lon: -78.4678 },
  'EE': { name: 'Tallinn', lat: 59.4370, lon: 24.7536 },
  'EG': { name: 'Cairo', lat: 30.0444, lon: 31.2357 },
  'EH': { name: 'El Aaiún', lat: 27.1253, lon: -13.1625 },
  'ER': { name: 'Asmara', lat: 15.3229, lon: 38.9251 },
  'ES': { name: 'Madrid', lat: 40.4168, lon: -3.7038 },
  'ET': { name: 'Addis Ababa', lat: 9.1450, lon: 40.4897 },
  'FI': { name: 'Helsinki', lat: 60.1699, lon: 24.9384 },
  'FJ': { name: 'Suva', lat: -18.1248, lon: 178.4501 },
  'FK': { name: 'Stanley', lat: -51.6977, lon: -57.8456 },
  'FM': { name: 'Palikir', lat: 6.9248, lon: 158.1611 },
  'FO': { name: 'Tórshavn', lat: 62.0107, lon: -6.7764 },
  'FR': { name: 'Paris', lat: 48.8566, lon: 2.3522 },
  'GA': { name: 'Libreville', lat: 0.4162, lon: 9.4673 },
  'GB': { name: 'London', lat: 51.5074, lon: -0.1278 },
  'GD': { name: 'Saint George\'s', lat: 12.0561, lon: -61.7486 },
  'GE': { name: 'Tbilisi', lat: 41.7151, lon: 44.8271 },
  'GF': { name: 'Cayenne', lat: 4.9370, lon: -52.3260 },
  'GG': { name: 'Saint Peter Port', lat: 49.4521, lon: -2.5360 },
  'GH': { name: 'Accra', lat: 5.6037, lon: -0.1870 },
  'GI': { name: 'Gibraltar', lat: 36.1408, lon: -5.3536 },
  'GL': { name: 'Nuuk', lat: 64.1836, lon: -51.7214 },
  'GM': { name: 'Banjul', lat: 13.4549, lon: -16.5790 },
  'GN': { name: 'Conakry', lat: 9.6412, lon: -13.5784 },
  'GP': { name: 'Basse-Terre', lat: 15.9980, lon: -61.7270 },
  'GQ': { name: 'Malabo', lat: 3.7523, lon: 8.7741 },
  'GR': { name: 'Athens', lat: 37.9755, lon: 23.7348 },
  'GS': { name: 'King Edward Point', lat: -54.2831, lon: -36.5083 },
  'GT': { name: 'Guatemala City', lat: 14.6349, lon: -90.5069 },
  'GU': { name: 'Hagåtña', lat: 13.4443, lon: 144.7937 },
  'GW': { name: 'Bissau', lat: 11.8816, lon: -15.6178 },
  'GY': { name: 'Georgetown', lat: 6.8013, lon: -58.1551 },
  'HK': { name: 'Hong Kong', lat: 22.3193, lon: 114.1694 },
  'HM': { name: 'None', lat: -53.0818, lon: 73.5042 },
  'HN': { name: 'Tegucigalpa', lat: 14.0723, lon: -87.1921 },
  'HR': { name: 'Zagreb', lat: 45.8150, lon: 15.9819 },
  'HT': { name: 'Port-au-Prince', lat: 18.5944, lon: -72.3074 },
  'HU': { name: 'Budapest', lat: 47.4979, lon: 19.0402 },
  'ID': { name: 'Jakarta', lat: -6.2088, lon: 106.8456 },
  'IE': { name: 'Dublin', lat: 53.3498, lon: -6.2603 },
  'IL': { name: 'Jerusalem', lat: 31.7683, lon: 35.2137 },
  'IM': { name: 'Douglas', lat: 54.1500, lon: -4.4823 },
  'IN': { name: 'New Delhi', lat: 28.6139, lon: 77.2090 },
  'IO': { name: 'Diego Garcia', lat: -7.3362, lon: 72.4110 },
  'IQ': { name: 'Baghdad', lat: 33.3152, lon: 44.3661 },
  'IR': { name: 'Tehran', lat: 35.6892, lon: 51.3890 },
  'IS': { name: 'Reykjavík', lat: 64.1466, lon: -21.9426 },
  'IT': { name: 'Rome', lat: 41.9028, lon: 12.4964 },
  'JE': { name: 'Saint Helier', lat: 49.1858, lon: -2.1101 },
  'JM': { name: 'Kingston', lat: 17.9771, lon: -76.7674 },
  'JO': { name: 'Amman', lat: 31.9539, lon: 35.9106 },
  'JP': { name: 'Tokyo', lat: 35.6762, lon: 139.6503 },
  'KE': { name: 'Nairobi', lat: -1.2921, lon: 36.8219 },
  'KG': { name: 'Bishkek', lat: 42.8746, lon: 74.5698 },
  'KH': { name: 'Phnom Penh', lat: 11.5564, lon: 104.9282 },
  'KI': { name: 'Tarawa', lat: 1.3278, lon: 172.9779 },
  'KM': { name: 'Moroni', lat: -11.7172, lon: 43.2473 },
  'KN': { name: 'Basseterre', lat: 17.2948, lon: -62.7177 },
  'KP': { name: 'Pyongyang', lat: 39.0392, lon: 125.7625 },
  'KR': { name: 'Seoul', lat: 37.5665, lon: 126.9780 },
  'KW': { name: 'Kuwait City', lat: 29.3759, lon: 47.9774 },
  'KY': { name: 'George Town', lat: 19.2866, lon: -81.3744 },
  'KZ': { name: 'Nur-Sultan', lat: 51.1694, lon: 71.4491 },
  'LA': { name: 'Vientiane', lat: 17.9757, lon: 102.6331 },
  'LB': { name: 'Beirut', lat: 33.8938, lon: 35.5018 },
  'LC': { name: 'Castries', lat: 14.0101, lon: -60.9875 },
  'LI': { name: 'Vaduz', lat: 47.1410, lon: 9.5209 },
  'LK': { name: 'Sri Jayawardenepura Kotte', lat: 6.9271, lon: 79.8612 },
  'LR': { name: 'Monrovia', lat: 6.2907, lon: -10.7605 },
  'LS': { name: 'Maseru', lat: -29.3628, lon: 27.4833 },
  'LT': { name: 'Vilnius', lat: 54.6872, lon: 25.2797 },
  'LU': { name: 'Luxembourg', lat: 49.6116, lon: 6.1319 },
  'LV': { name: 'Riga', lat: 56.9496, lon: 24.1052 },
  'LY': { name: 'Tripoli', lat: 32.8872, lon: 13.1913 },
  'MA': { name: 'Rabat', lat: 34.0209, lon: -6.8416 },
  'MC': { name: 'Monaco', lat: 43.7384, lon: 7.4246 },
  'MD': { name: 'Chișinău', lat: 47.0105, lon: 28.8638 },
  'ME': { name: 'Podgorica', lat: 42.4304, lon: 19.2594 },
  'MF': { name: 'Marigot', lat: 18.0708, lon: -63.0501 },
  'MG': { name: 'Antananarivo', lat: -18.8792, lon: 47.5079 },
  'MH': { name: 'Majuro', lat: 7.1315, lon: 171.1845 },
  'MK': { name: 'Skopje', lat: 41.9973, lon: 21.4280 },
  'ML': { name: 'Bamako', lat: 12.6392, lon: -8.0029 },
  'MM': { name: 'Naypyidaw', lat: 19.7633, lon: 96.0785 },
  'MN': { name: 'Ulaanbaatar', lat: 47.8864, lon: 106.9057 },
  'MO': { name: 'Macau', lat: 22.1987, lon: 113.5439 },
  'MP': { name: 'Saipan', lat: 15.2069, lon: 145.7197 },
  'MQ': { name: 'Fort-de-France', lat: 14.6037, lon: -61.0739 },
  'MR': { name: 'Nouakchott', lat: 18.0735, lon: -15.9582 },
  'MS': { name: 'Plymouth', lat: 16.7054, lon: -62.2126 },
  'MT': { name: 'Valletta', lat: 35.8997, lon: 14.5147 },
  'MU': { name: 'Port Louis', lat: -20.1619, lon: 57.5012 },
  'MV': { name: 'Malé', lat: 4.1755, lon: 73.5093 },
  'MW': { name: 'Lilongwe', lat: -13.9626, lon: 33.7741 },
  'MX': { name: 'Mexico City', lat: 19.4326, lon: -99.1332 },
  'MY': { name: 'Kuala Lumpur', lat: 3.1390, lon: 101.6869 },
  'MZ': { name: 'Maputo', lat: -25.9692, lon: 32.5732 },
  'NA': { name: 'Windhoek', lat: -22.9576, lon: 17.0832 },
  'NC': { name: 'Nouméa', lat: -22.2710, lon: 166.4416 },
  'NE': { name: 'Niamey', lat: 13.5116, lon: 2.1254 },
  'NF': { name: 'Kingston', lat: -29.0408, lon: 167.9547 },
  'NG': { name: 'Abuja', lat: 9.0765, lon: 7.3986 },
  'NI': { name: 'Managua', lat: 12.1150, lon: -86.2362 },
  'NL': { name: 'Amsterdam', lat: 52.3676, lon: 4.9041 },
  'NO': { name: 'Oslo', lat: 59.9139, lon: 10.7522 },
  'NP': { name: 'Kathmandu', lat: 27.7172, lon: 85.3240 },
  'NR': { name: 'Yaren', lat: -0.5228, lon: 166.9315 },
  'NU': { name: 'Alofi', lat: -19.0595, lon: -169.9187 },
  'NZ': { name: 'Wellington', lat: -41.2865, lon: 174.7762 },
  'OM': { name: 'Muscat', lat: 23.5859, lon: 58.4059 },
  'PA': { name: 'Panama City', lat: 8.5380, lon: -79.5427 },
  'PE': { name: 'Lima', lat: -12.0464, lon: -77.0428 },
  'PF': { name: 'Papeete', lat: -17.5516, lon: -149.5585 },
  'PG': { name: 'Port Moresby', lat: -9.4438, lon: 147.1803 },
  'PH': { name: 'Manila', lat: 14.5995, lon: 120.9842 },
  'PK': { name: 'Islamabad', lat: 33.6844, lon: 73.0479 },
  'PL': { name: 'Warsaw', lat: 52.2297, lon: 21.0122 },
  'PM': { name: 'Saint-Pierre', lat: 46.7738, lon: -56.1815 },
  'PN': { name: 'Adamstown', lat: -25.0660, lon: -130.1003 },
  'PR': { name: 'San Juan', lat: 18.4655, lon: -66.1057 },
  'PS': { name: 'Ramallah', lat: 31.9038, lon: 35.2034 },
  'PT': { name: 'Lisbon', lat: 38.7223, lon: -9.1393 },
  'PW': { name: 'Ngerulmud', lat: 7.5007, lon: 134.6242 },
  'PY': { name: 'Asunción', lat: -25.2637, lon: -57.5759 },
  'QA': { name: 'Doha', lat: 25.2760, lon: 51.5200 },
  'RE': { name: 'Saint-Denis', lat: -20.8823, lon: 55.4504 },
  'RO': { name: 'Bucharest', lat: 44.4268, lon: 26.1025 },
  'RS': { name: 'Belgrade', lat: 44.7866, lon: 20.4489 },
  'RU': { name: 'Moscow', lat: 55.7558, lon: 37.6176 },
  'RW': { name: 'Kigali', lat: -1.9441, lon: 30.0619 },
  'SA': { name: 'Riyadh', lat: 24.7136, lon: 46.6753 },
  'SB': { name: 'Honiara', lat: -9.4280, lon: 159.9540 },
  'SC': { name: 'Victoria', lat: -4.6796, lon: 55.4920 },
  'SD': { name: 'Khartoum', lat: 15.5007, lon: 32.5599 },
  'SE': { name: 'Stockholm', lat: 59.3293, lon: 18.0686 },
  'SG': { name: 'Singapore', lat: 1.3521, lon: 103.8198 },
  'SH': { name: 'Jamestown', lat: -15.9387, lon: -5.7181 },
  'SI': { name: 'Ljubljana', lat: 46.0569, lon: 14.5058 },
  'SJ': { name: 'Longyearbyen', lat: 78.2232, lon: 15.6267 },
  'SK': { name: 'Bratislava', lat: 48.1486, lon: 17.1077 },
  'SL': { name: 'Freetown', lat: 8.4657, lon: -13.2317 },
  'SM': { name: 'San Marino', lat: 43.9424, lon: 12.4578 },
  'SN': { name: 'Dakar', lat: 14.7167, lon: -17.4677 },
  'SO': { name: 'Mogadishu', lat: 2.0469, lon: 45.3182 },
  'SR': { name: 'Paramaribo', lat: 5.8520, lon: -55.2038 },
  'SS': { name: 'Juba', lat: 4.8594, lon: 31.5713 },
  'ST': { name: 'São Tomé', lat: 0.1864, lon: 6.6131 },
  'SV': { name: 'San Salvador', lat: 13.6929, lon: -89.2182 },
  'SX': { name: 'Philipsburg', lat: 18.0425, lon: -63.0548 },
  'SY': { name: 'Damascus', lat: 33.5138, lon: 36.2765 },
  'SZ': { name: 'Mbabane', lat: -26.3054, lon: 31.1367 },
  'TC': { name: 'Cockburn Town', lat: 21.4612, lon: -71.1419 },
  'TD': { name: 'N\'Djamena', lat: 12.1348, lon: 15.0557 },
  'TF': { name: 'Port-aux-Français', lat: -49.3496, lon: 70.2150 },
  'TG': { name: 'Lomé', lat: 6.1319, lon: 1.2228 },
  'TH': { name: 'Bangkok', lat: 13.7563, lon: 100.5018 },
  'TJ': { name: 'Dushanbe', lat: 38.5598, lon: 68.7870 },
  'TK': { name: 'Fakaofo', lat: -9.3793, lon: -171.2249 },
  'TL': { name: 'Dili', lat: -8.5569, lon: 125.5603 },
  'TM': { name: 'Ashgabat', lat: 37.9601, lon: 58.3261 },
  'TN': { name: 'Tunis', lat: 36.8065, lon: 10.1815 },
  'TO': { name: 'Nuku\'alofa', lat: -21.1789, lon: -175.1982 },
  'TR': { name: 'Ankara', lat: 39.9334, lon: 32.8597 },
  'TT': { name: 'Port of Spain', lat: 10.6596, lon: -61.5089 },
  'TV': { name: 'Funafuti', lat: -8.5243, lon: 179.1942 },
  'TW': { name: 'Taipei', lat: 25.0330, lon: 121.5654 },
  'TZ': { name: 'Dodoma', lat: -6.1630, lon: 35.7516 },
  'UA': { name: 'Kyiv', lat: 50.4501, lon: 30.5234 },
  'UG': { name: 'Kampala', lat: 0.3476, lon: 32.5825 },
  'UM': { name: 'None', lat: 19.2823, lon: 166.6470 },
  'US': { name: 'Washington, D.C.', lat: 38.9072, lon: -77.0369 },
  'UY': { name: 'Montevideo', lat: -34.9011, lon: -56.1645 },
  'UZ': { name: 'Tashkent', lat: 41.2995, lon: 69.2401 },
  'VA': { name: 'Vatican City', lat: 41.9029, lon: 12.4534 },
  'VC': { name: 'Kingstown', lat: 13.1579, lon: -61.2248 },
  'VE': { name: 'Caracas', lat: 10.4806, lon: -66.9036 },
  'VG': { name: 'Road Town', lat: 18.4268, lon: -64.6200 },
  'VI': { name: 'Charlotte Amalie', lat: 18.3419, lon: -64.9307 },
  'VN': { name: 'Hanoi', lat: 21.0285, lon: 105.8542 },
  'VU': { name: 'Port Vila', lat: -17.7334, lon: 168.3273 },
  'WF': { name: 'Mata-Utu', lat: -13.2816, lon: -176.1745 },
  'WS': { name: 'Apia', lat: -13.8506, lon: -171.7513 },
  'YE': { name: 'Sana\'a', lat: 15.3694, lon: 44.1910 },
  'YT': { name: 'Mamoudzou', lat: -12.7806, lon: 45.2278 },
  'ZA': { name: 'Cape Town', lat: -33.9249, lon: 18.4241 },
  'ZM': { name: 'Lusaka', lat: -15.3875, lon: 28.3228 },
  'ZW': { name: 'Harare', lat: -17.8252, lon: 31.0335 },
  // Additional mappings for common issues
  'XK': { name: 'Pristina', lat: 42.6629, lon: 21.1655 } // Kosovo
};

// Country code fixes - handle case issues and common mistakes
const countryCodeFixes = {
  'us': 'US',
  'uk': 'GB',
  'gb': 'GB',
  'en': 'GB', // Sometimes people use "en" for England
  'xk': 'XK', // Kosovo lowercase
  'kosovo': 'XK',
  'england': 'GB',
  'scotland': 'GB',
  'wales': 'GB',
  'northern ireland': 'GB'
};

// File paths
const usersFilePath = path.join(__dirname, '..', 'connectycube_users.json');
const profilesFilePath = path.join(__dirname, '..', 'connectycube_profiles.json');
const outputFilePath = path.join(__dirname, '..', 'merged.json');

// Statistics
const stats = {
  usersProcessed: 0,
  profilesProcessed: 0,
  mergedUsers: 0,
  usersWithoutProfiles: 0,
  orphanedProfiles: 0,
  geohashesGenerated: 0,
  geohashErrors: 0,
  errors: []
};

/**
 * Load all profiles into memory for quick lookup
 * @returns {Promise<Map>} Map of userId to profile data
 */
async function loadProfiles() {
  console.log('Loading profiles...');
  const profiles = new Map();
  
  try {
    if (!fs.existsSync(profilesFilePath)) {
      console.warn(`Profiles file not found: ${profilesFilePath}`);
      return profiles;
    }

    const profileStream = fs.createReadStream(profilesFilePath)
      .pipe(parser())
      .pipe(streamArray());

    for await (const { value } of profileStream) {
      if (value.userId) {
        profiles.set(value.userId, value);
        stats.profilesProcessed++;
      }
      
      if (stats.profilesProcessed % 1000 === 0) {
        console.log(`Loaded ${stats.profilesProcessed} profiles...`);
      }
    }
    
    console.log(`Total profiles loaded: ${stats.profilesProcessed}`);
    return profiles;
    
  } catch (error) {
    console.error('Error loading profiles:', error.message);
    stats.errors.push({
      type: 'profile_loading',
      error: error.message
    });
    return profiles;
  }
}

/**
 * Generate geohash for a profile based on country and city
 * @param {Object} profile - Profile data
 * @returns {string} 7-character geohash or empty string
 */
function generateGeohash(profile) {
  if (!profile) {
    return '';
  }

  try {
    let country = profile.country;
    const city = profile.city;

    // Fix country code if needed
    if (country) {
      const lowerCountry = country.toLowerCase();
      if (countryCodeFixes[lowerCountry]) {
        country = countryCodeFixes[lowerCountry];
        profile.country = country; // Update the profile with fixed country code
      }
    }

    // Generate geohash using capital city coordinates
    if (country && capitalCities[country]) {
      const capital = capitalCities[country];
      const geohash = ngeohash.encode(capital.lat, capital.lon, 7);
      stats.geohashesGenerated++;
      return geohash;
    } else {
      stats.geohashErrors++;
      return '';
    }
  } catch (error) {
    stats.geohashErrors++;
    stats.errors.push({
      type: 'geohash_generation',
      error: error.message,
      country: profile.country,
      city: profile.city
    });
    return '';
  }
}

/**
 * Merge user data with profile data
 * @param {Object} user - User data from connectycube_users.json
 * @param {Object} profile - Profile data from connectycube_profiles.json
 * @returns {Object} Merged user object
 */
function mergeUserData(user, profile) {
  // If profile exists, add geohash
  if (profile) {
    profile.geohash = generateGeohash(profile);
  }

  const merged = {
    // Base user data
    ...user,
    // Add profile data if exists (now with geohash)
    profile: profile || null
  };
  
  return merged;
}

/**
 * Process users and merge with profiles
 * @param {Map} profiles - Map of profiles by userId
 * @returns {Promise<void>}
 */
async function processUsers(profiles) {
  console.log('Starting user processing...');
  
  try {
    // Check if users file exists
    if (!fs.existsSync(usersFilePath)) {
      throw new Error(`Users file not found: ${usersFilePath}`);
    }

    // Create write stream for output
    const writeStream = fs.createWriteStream(outputFilePath);
    writeStream.write('[\n');

    const userStream = fs.createReadStream(usersFilePath)
      .pipe(parser())
      .pipe(streamArray());

    let isFirstUser = true;

    for await (const { value } of userStream) {
      try {
        stats.usersProcessed++;
        
        // Get user ID from user.id field
        const userId = value.user?.id;
        
        if (!userId) {
          console.warn(`User without ID found at index ${stats.usersProcessed}`);
          stats.errors.push({
            type: 'missing_user_id',
            user: value,
            index: stats.usersProcessed
          });
          continue;
        }

        // Find matching profile
        const profile = profiles.get(userId);
        
        if (profile) {
          stats.mergedUsers++;
          // Remove profile from map to track orphaned profiles later
          profiles.delete(userId);
        } else {
          stats.usersWithoutProfiles++;
        }

        // Merge user and profile data
        const mergedUser = mergeUserData(value, profile);

        // Write to output file
        if (!isFirstUser) {
          writeStream.write(',\n');
        }
        writeStream.write(JSON.stringify(mergedUser, null, 2));
        isFirstUser = false;

        // Progress logging
        if (stats.usersProcessed % 1000 === 0) {
          console.log(`Processed ${stats.usersProcessed} users, merged: ${stats.mergedUsers}`);
        }

      } catch (error) {
        console.error(`Error processing user ${stats.usersProcessed}:`, error.message);
        stats.errors.push({
          type: 'user_processing',
          error: error.message,
          userIndex: stats.usersProcessed
        });
      }
    }

    writeStream.write('\n]');
    writeStream.end();

    // Count orphaned profiles (profiles without matching users)
    stats.orphanedProfiles = profiles.size;

    console.log('User processing completed');

  } catch (error) {
    console.error('Error processing users:', error.message);
    throw error;
  }
}

/**
 * Print merge statistics
 */
function printStats() {
  console.log('\n=== Merge Statistics ===');
  console.log(`Users processed: ${stats.usersProcessed}`);
  console.log(`Profiles loaded: ${stats.profilesProcessed}`);
  console.log(`Users with profiles: ${stats.mergedUsers}`);
  console.log(`Users without profiles: ${stats.usersWithoutProfiles}`);
  console.log(`Orphaned profiles: ${stats.orphanedProfiles}`);
  
  if (stats.usersProcessed > 0) {
    const mergeRate = ((stats.mergedUsers / stats.usersProcessed) * 100).toFixed(2);
    console.log(`Merge rate: ${mergeRate}%`);
  }

  console.log('\n=== Geohash Statistics ===');
  console.log(`Geohashes generated: ${stats.geohashesGenerated}`);
  console.log(`Geohash errors: ${stats.geohashErrors}`);
  
  if (stats.mergedUsers > 0) {
    const geohashRate = ((stats.geohashesGenerated / stats.mergedUsers) * 100).toFixed(2);
    console.log(`Geohash success rate: ${geohashRate}%`);
  }
  
  if (stats.errors.length > 0) {
    console.log('\n=== Errors ===');
    stats.errors.forEach((error, index) => {
      console.log(`${index + 1}. Type: ${error.type}`);
      console.log(`   Error: ${error.error}`);
      if (error.userIndex) {
        console.log(`   User Index: ${error.userIndex}`);
      }
      if (error.country) {
        console.log(`   Country: ${error.country}, City: ${error.city || 'N/A'}`);
      }
    });
  }

  console.log(`\nOutput file created: ${outputFilePath}`);
}

/**
 * Main merge function
 * @returns {Promise<void>}
 */
async function merge() {
  console.log('Starting merge process...');
  const startTime = Date.now();
  
  try {
    // Load all profiles into memory
    const profiles = await loadProfiles();
    
    // Process users and merge with profiles
    await processUsers(profiles);
    
  } catch (error) {
    console.error('Merge failed:', error.message);
    throw error;
  } finally {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log(`\nMerge completed in ${duration.toFixed(2)} seconds`);
    printStats();
  }
}

// Export function for testing
module.exports = {
  merge,
  loadProfiles,
  mergeUserData,
  stats
};

// Run merge if this file is executed directly
if (require.main === module) {
  merge().catch(console.error);
}