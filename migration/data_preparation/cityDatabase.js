/**
 * Enhanced City Database for Precise Geohash Generation
 * 
 * This database contains coordinates for major cities worldwide,
 * with special focus on Turkey and European countries.
 * 
 * Features:
 * - All 81 Turkish provinces
 * - Major European cities with variants
 * - English/local name alternatives
 * - Case-insensitive matching support
 * 
 * Usage:
 * const { cityDatabase, capitalCities, countryCodeFixes } = require('./cityDatabase');
 */

// Enhanced city database for precise geohash generation
const cityDatabase = {
  // Turkey - All 81 provinces (with variants)
  'TR': {
    'İstanbul': { lat: 41.0082, lon: 28.9784 },
    'Istanbul': { lat: 41.0082, lon: 28.9784 }, // Non-Turkish keyboard variant
    'Ankara': { lat: 39.9334, lon: 32.8597 },
    'İzmir': { lat: 38.4192, lon: 27.1287 },
    'Izmir': { lat: 38.4192, lon: 27.1287 }, // Non-Turkish keyboard variant
    'Bursa': { lat: 40.1885, lon: 29.0610 },
    'Antalya': { lat: 36.8969, lon: 30.7133 },
    'Adana': { lat: 37.0000, lon: 35.3213 },
    'Konya': { lat: 37.8667, lon: 32.4833 },
    'Şanlıurfa': { lat: 37.1591, lon: 38.7969 },
    'Gaziantep': { lat: 37.0662, lon: 37.3833 },
    'Kocaeli': { lat: 40.8533, lon: 29.8815 },
    'Mersin': { lat: 36.8000, lon: 34.6333 },
    'Diyarbakır': { lat: 37.9144, lon: 40.2306 },
    'Hatay': { lat: 36.4018, lon: 36.3498 },
    'Manisa': { lat: 38.6191, lon: 27.4289 },
    'Kayseri': { lat: 38.7312, lon: 35.4787 },
    'Samsun': { lat: 41.2928, lon: 36.3313 },
    'Balıkesir': { lat: 39.6484, lon: 27.8826 },
    'Kahramanmaraş': { lat: 37.5858, lon: 36.9371 },
    'Van': { lat: 38.4891, lon: 43.4089 },
    'Aydın': { lat: 37.8444, lon: 27.8458 },
    'Denizli': { lat: 37.7765, lon: 29.0864 },
    'Şahinbey': { lat: 37.0662, lon: 37.3833 },
    'Adapazarı': { lat: 40.7569, lon: 30.3781 },
    'Malatya': { lat: 38.3552, lon: 38.3095 },
    'Erzurum': { lat: 39.9000, lon: 41.2700 },
    'Trabzon': { lat: 41.0015, lon: 39.7178 },
    'Ordu': { lat: 40.9839, lon: 37.8764 },
    'Muğla': { lat: 37.2153, lon: 28.3636 },
    'Elazığ': { lat: 38.6810, lon: 39.2264 },
    'Kütahya': { lat: 39.4242, lon: 29.9833 },
    'Tokat': { lat: 40.3167, lon: 36.5500 },
    'Sivas': { lat: 39.7477, lon: 37.0179 },
    'Rize': { lat: 41.0201, lon: 40.5234 },
    'Batman': { lat: 37.8812, lon: 41.1351 },
    'Edirne': { lat: 41.6818, lon: 26.5623 },
    'Isparta': { lat: 37.7648, lon: 30.5566 },
    'Çorum': { lat: 40.5506, lon: 34.9556 },
    'Afyonkarahisar': { lat: 38.7507, lon: 30.5567 },
    'Zonguldak': { lat: 41.4564, lon: 31.7987 },
    'Uşak': { lat: 38.6823, lon: 29.4082 },
    'Düzce': { lat: 40.8438, lon: 31.1565 },
    'Osmaniye': { lat: 37.0742, lon: 36.2464 },
    'Çanakkale': { lat: 40.1553, lon: 26.4142 },
    'Kırıkkale': { lat: 39.8468, lon: 33.5153 },
    'Mardin': { lat: 37.3212, lon: 40.7245 },
    'Kastamonu': { lat: 41.3887, lon: 33.7827 },
    'Bolu': { lat: 40.7394, lon: 31.6061 },
    'Burdur': { lat: 37.7200, lon: 30.2900 },
    'Aksaray': { lat: 38.3687, lon: 34.0370 },
    'Tekirdağ': { lat: 40.9833, lon: 27.5167 },
    'Karaman': { lat: 37.1759, lon: 33.2287 },
    'Kırklareli': { lat: 41.7333, lon: 27.2167 },
    'Bilecik': { lat: 40.1500, lon: 29.9830 },
    'Amasya': { lat: 40.6499, lon: 35.8353 },
    'Yozgat': { lat: 39.8181, lon: 34.8147 },
    'Karabük': { lat: 41.2061, lon: 32.6204 },
    'Giresun': { lat: 40.9128, lon: 38.3895 },
    'Nevşehir': { lat: 38.6939, lon: 34.6857 },
    'Sinop': { lat: 42.0231, lon: 35.1531 },
    'Kırşehir': { lat: 39.1425, lon: 34.1709 },
    'Adıyaman': { lat: 37.7648, lon: 38.2786 },
    'Artvin': { lat: 41.1828, lon: 41.8183 },
    'Yalova': { lat: 40.6500, lon: 29.2667 },
    'Çankırı': { lat: 40.6013, lon: 33.6134 },
    'Bartın': { lat: 41.5811, lon: 32.4610 },
    'Ağrı': { lat: 39.7191, lon: 43.0503 },
    'Iğdır': { lat: 39.9237, lon: 44.0128 },
    'Niğde': { lat: 37.9667, lon: 34.6833 },
    'Kars': { lat: 40.5992, lon: 43.0864 },
    'Siirt': { lat: 37.9333, lon: 41.9500 },
    'Erzincan': { lat: 39.7500, lon: 39.5000 },
    'Bitlis': { lat: 38.3938, lon: 42.1232 },
    'Şırnak': { lat: 37.4187, lon: 42.4918 },
    'Kilis': { lat: 36.7184, lon: 37.1212 },
    'Muş': { lat: 38.9462, lon: 41.7539 },
    'Gümüşhane': { lat: 40.4386, lon: 39.5086 },
    'Bingöl': { lat: 38.8847, lon: 40.4986 },
    'Hakkâri': { lat: 37.5833, lon: 43.7333 },
    'Ardahan': { lat: 41.1105, lon: 42.7022 },
    'Tunceli': { lat: 39.1079, lon: 39.5401 },
    'Bayburt': { lat: 40.2552, lon: 40.2249 }
  },
  
  // European cities
  'DE': {
    'Berlin': { lat: 52.5200, lon: 13.4050 },
    'Hamburg': { lat: 53.5511, lon: 9.9937 },
    'München': { lat: 48.1351, lon: 11.5820 },
    'Munich': { lat: 48.1351, lon: 11.5820 }, // English variant
    'Köln': { lat: 50.9375, lon: 6.9603 },
    'Cologne': { lat: 50.9375, lon: 6.9603 }, // English variant
    'Frankfurt am Main': { lat: 50.1109, lon: 8.6821 },
    'Frankfurt': { lat: 50.1109, lon: 8.6821 }, // Short variant - from missed cities
    'Stuttgart': { lat: 48.7758, lon: 9.1829 },
    'Düsseldorf': { lat: 51.2277, lon: 6.7735 },
    'Dusseldorf': { lat: 51.2277, lon: 6.7735 }, // Non-umlaut variant
    'Dortmund': { lat: 51.5136, lon: 7.4653 },
    'Essen': { lat: 51.4556, lon: 7.0116 },
    'Leipzig': { lat: 51.3397, lon: 12.3731 },
    'Bremen': { lat: 53.0793, lon: 8.8017 },
    'Dresden': { lat: 51.0504, lon: 13.7373 },
    'Hannover': { lat: 52.3759, lon: 9.7320 },
    'Hanover': { lat: 52.3759, lon: 9.7320 }, // English variant
    'Nürnberg': { lat: 49.4521, lon: 11.0767 },
    'Nuremberg': { lat: 49.4521, lon: 11.0767 }, // English variant - from missed cities
    'Duisburg': { lat: 51.4344, lon: 6.7623 },
    'Limburg an der Lahn': { lat: 50.3836, lon: 8.0503 } // From missed cities list
  },
  
  'FR': {
    'Paris': { lat: 48.8566, lon: 2.3522 },
    'Marseille': { lat: 43.2965, lon: 5.3698 },
    'Marseilles': { lat: 43.2965, lon: 5.3698 }, // English variant
    'Lyon': { lat: 45.7640, lon: 4.8357 },
    'Lyons': { lat: 45.7640, lon: 4.8357 }, // English variant
    'Toulouse': { lat: 43.6047, lon: 1.4442 },
    'Nice': { lat: 43.7102, lon: 7.2620 },
    'Nantes': { lat: 47.2184, lon: -1.5536 },
    'Strasbourg': { lat: 48.5734, lon: 7.7521 },
    'Montpellier': { lat: 43.6108, lon: 3.8767 },
    'Bordeaux': { lat: 44.8378, lon: -0.5792 },
    'Lille': { lat: 50.6292, lon: 3.0573 },
    'Rennes': { lat: 48.1173, lon: -1.6778 },
    'Reims': { lat: 49.2583, lon: 4.0317 },
    'Le Havre': { lat: 49.4944, lon: 0.1079 },
    'Saint-Étienne': { lat: 45.4397, lon: 4.3872 },
    'Toulon': { lat: 43.1242, lon: 5.9280 },
    'Gravelines': { lat: 50.9869, lon: 2.1250 } // From missed cities list
  },
  
  'GB': {
    'London': { lat: 51.5074, lon: -0.1278 },
    'Birmingham': { lat: 52.4862, lon: -1.8904 },
    'Manchester': { lat: 53.4808, lon: -2.2426 },
    'Glasgow': { lat: 55.8642, lon: -4.2518 },
    'Liverpool': { lat: 53.4084, lon: -2.9916 },
    'Leeds': { lat: 53.8008, lon: -1.5491 },
    'Sheffield': { lat: 53.3811, lon: -1.4701 },
    'Edinburgh': { lat: 55.9533, lon: -3.1883 },
    'Bristol': { lat: 51.4545, lon: -2.5879 },
    'Cardiff': { lat: 51.4816, lon: -3.1791 },
    'Leicester': { lat: 52.6369, lon: -1.1398 },
    'Coventry': { lat: 52.4068, lon: -1.5197 },
    'Hull': { lat: 53.7457, lon: -0.3367 },
    'Bradford': { lat: 53.7960, lon: -1.7594 },
    'Belfast': { lat: 54.5973, lon: -5.9301 },
    'Erith': { lat: 51.4833, lon: 0.1833 }, // From missed cities list
    'Rainham': { lat: 51.5167, lon: 0.1833 } // From missed cities list
  },
  
  'IT': {
    'Roma': { lat: 41.9028, lon: 12.4964 },
    'Rome': { lat: 41.9028, lon: 12.4964 }, // English variant
    'Milano': { lat: 45.4642, lon: 9.1900 },
    'Milan': { lat: 45.4642, lon: 9.1900 }, // English variant - from missed cities
    'Napoli': { lat: 40.8518, lon: 14.2681 },
    'Naples': { lat: 40.8518, lon: 14.2681 }, // English variant
    'Torino': { lat: 45.0703, lon: 7.6869 },
    'Turin': { lat: 45.0703, lon: 7.6869 }, // English variant
    'Palermo': { lat: 38.1157, lon: 13.3613 },
    'Genova': { lat: 44.4056, lon: 8.9463 },
    'Genoa': { lat: 44.4056, lon: 8.9463 }, // English variant
    'Bologna': { lat: 44.4949, lon: 11.3426 },
    'Firenze': { lat: 43.7696, lon: 11.2558 },
    'Florence': { lat: 43.7696, lon: 11.2558 }, // English variant
    'Bari': { lat: 41.1177, lon: 16.8719 },
    'Catania': { lat: 37.5079, lon: 15.0830 },
    'Venezia': { lat: 45.4408, lon: 12.3155 },
    'Venice': { lat: 45.4408, lon: 12.3155 }, // English variant
    'Verona': { lat: 45.4384, lon: 10.9916 },
    'Messina': { lat: 38.1938, lon: 15.5540 },
    'Padova': { lat: 45.4064, lon: 11.8768 },
    'Padua': { lat: 45.4064, lon: 11.8768 }, // English variant
    'Trieste': { lat: 45.6495, lon: 13.7768 }
  },
  
  'ES': {
    'Madrid': { lat: 40.4168, lon: -3.7038 },
    'Barcelona': { lat: 41.3851, lon: 2.1734 },
    'Valencia': { lat: 39.4699, lon: -0.3763 },
    'Sevilla': { lat: 37.3891, lon: -5.9845 },
    'Zaragoza': { lat: 41.6488, lon: -0.8891 },
    'Málaga': { lat: 36.7213, lon: -4.4214 },
    'Murcia': { lat: 37.9922, lon: -1.1307 },
    'Palma': { lat: 39.5696, lon: 2.6502 },
    'Las Palmas': { lat: 28.1248, lon: -15.4300 },
    'Bilbao': { lat: 43.2627, lon: -2.9253 },
    'Alicante': { lat: 38.3452, lon: -0.4810 },
    'Córdoba': { lat: 37.8882, lon: -4.7794 },
    'Valladolid': { lat: 41.6523, lon: -4.7245 },
    'Vigo': { lat: 42.2406, lon: -8.7207 },
    'Gijón': { lat: 43.5322, lon: -5.6611 }
  },
  
  'NL': {
    'Amsterdam': { lat: 52.3676, lon: 4.9041 },
    'Rotterdam': { lat: 51.9244, lon: 4.4777 },
    'Den Haag': { lat: 52.0705, lon: 4.3007 },
    'The Hague': { lat: 52.0705, lon: 4.3007 }, // English variant
    'Utrecht': { lat: 52.0907, lon: 5.1214 },
    'Eindhoven': { lat: 51.4416, lon: 5.4697 },
    'Tilburg': { lat: 51.5555, lon: 5.0913 },
    'Groningen': { lat: 53.2194, lon: 6.5665 },
    'Almere': { lat: 52.3508, lon: 5.2647 },
    'Breda': { lat: 51.5719, lon: 4.7683 },
    'Nijmegen': { lat: 51.8426, lon: 5.8518 },
    'Naaldwijk': { lat: 51.9956, lon: 4.2139 } // From missed cities list
  }
  // Add more countries as needed
};

// Capital cities data for geohash generation (fallback)
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

/**
 * Get city coordinates with case-insensitive matching
 * @param {string} city - City name
 * @param {string} country - Country code
 * @returns {Object|null} Coordinates object or null if not found
 */
function getCityCoordinates(city, country) {
  if (!city || !country || !cityDatabase[country]) {
    return null;
  }
  
  // First try exact match
  let cityCoords = cityDatabase[country][city];
  
  // If no exact match, try case-insensitive search
  if (!cityCoords) {
    const cityKey = Object.keys(cityDatabase[country])
      .find(key => key.toLowerCase() === city.toLowerCase());
    if (cityKey) {
      cityCoords = cityDatabase[country][cityKey];
    }
  }
  
  return cityCoords || null;
}

/**
 * Get capital city coordinates
 * @param {string} country - Country code
 * @returns {Object|null} Capital coordinates or null if not found
 */
function getCapitalCoordinates(country) {
  return capitalCities[country] || null;
}

/**
 * Fix country code variations
 * @param {string} country - Country code
 * @returns {string} Fixed country code
 */
function fixCountryCode(country) {
  if (!country) return country;
  
  const lowerCountry = country.toLowerCase();
  return countryCodeFixes[lowerCountry] || country;
}

module.exports = {
  cityDatabase,
  capitalCities,
  countryCodeFixes,
  getCityCoordinates,
  getCapitalCoordinates,
  fixCountryCode
};