import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  MapPinIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  StarIcon,
  PhoneIcon,
  ClockIcon,
  MapIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  HeartIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  LifebuoyIcon,
  SparklesIcon,
  CurrencyRupeeIcon,
  DevicePhoneMobileIcon,
  HomeModernIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { StarIcon as StarIconSolid } from '@heroicons/react/24/solid';
import { 
  getFacilitiesByCity, 
  getAvailableCities, 
  getUserLocation, 
  calculateDistance,
  searchGooglePlaces
} from '@/services/locationServices';
import { getCampsByLocation } from '@/services/campServices';
import { useAuth } from '@/contexts/AuthContext';
import { registerForCamp, unregisterFromCamp } from '@/services/campServices';
import { Link } from 'react-router-dom';
import HospitalMapLeaflet from '@/components/map/HospitalMapLeaflet';
import toast from 'react-hot-toast';

const CITY_COORDINATES = {
  pune: { lat: 18.5204, lng: 73.8567 },
  mumbai: { lat: 19.0760, lng: 72.8777 },
  delhi: { lat: 28.6139, lng: 77.2090 },
  bangalore: { lat: 12.9716, lng: 77.5946 },
  chennai: { lat: 13.0827, lng: 80.2707 },
  hyderabad: { lat: 17.3850, lng: 78.4867 },
  kolkata: { lat: 22.5726, lng: 88.3639 },
  ahmedabad: { lat: 23.0225, lng: 72.5714 },
  jaipur: { lat: 26.9124, lng: 75.7873 }
};

const LocatePage = () => {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [selectedCity, setSelectedCity] = useState('pune');
  const [userLocation, setUserLocation] = useState(null);
  const [viewMode, setViewMode] = useState('split'); // 'split' | 'map' | 'cards'
  const [loading, setLoading] = useState(false);
  const [facilities, setFacilities] = useState([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedFacilityDetails, setSelectedFacilityDetails] = useState(null);
  const [firestoreCamps, setFirestoreCamps] = useState([]);

  // Load facilities when city or type changes
  useEffect(() => {
    loadFacilities();
  }, [selectedCity, selectedType]);

  // Get user location on mount and reload facilities
  useEffect(() => {
    getUserLocation()
      .then(location => {
        setUserLocation(location);
        // Reload facilities with new location
        loadFacilities();
      })
      .catch(error => {
        console.log('Location access denied:', error);
        // Still try to load facilities without location
        loadFacilities();
      });
  }, []);

  const loadFacilities = () => {
    setLoading(true);
    (async () => {
      try {
        let googlePlacesResults = [];
        let firestoreCampsResults = [];
        
        // Get location for fetching camps
        const cityDataForCoords = getFacilitiesByCity(selectedCity);
        const loc = userLocation || (cityDataForCoords && cityDataForCoords[0] && cityDataForCoords[0].coordinates) || null;
        
        console.log('Loading facilities with location:', loc);
        
        // Fetch Firestore camps if location available
        if (loc) {
          try {
            const camps = await getCampsByLocation(loc.lat, loc.lng, 50);
            console.log('Fetched Firestore camps:', camps.length, camps);
            // Filter by selectedType if not 'all'
            firestoreCampsResults = selectedType === 'all' 
              ? camps 
              : camps.filter(camp => camp.type === selectedType);
            console.log('Filtered camps for type', selectedType, ':', firestoreCampsResults.length);
            
            // Format Firestore camps to match facility structure
            firestoreCampsResults = firestoreCampsResults.map(camp => {
              // Default images for different camp types
              const campImages = {
                blood_donation: 'https://images.unsplash.com/photo-1615461065639-012b1b6a89b3?w=400&h=250&fit=crop',
                dental_camp: 'https://images.unsplash.com/photo-1606811971618-4486d14f3f99?w=400&h=250&fit=crop',
                treatment_camp: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop',
                vaccination: 'https://images.unsplash.com/photo-1632053002928-9323ee37e3b3?w=400&h=250&fit=crop',
                eye_camp: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=400&h=250&fit=crop'
              };
              
              return {
                id: `firestore-${camp.id}`,
                firestoreCampId: camp.id,
                name: camp.title,
                type: camp.type,
                specialty: camp.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                rating: 5.0,
                reviews: camp.registered || 0,
                distance: `${camp.distance} km`,
                address: camp.location.address,
                phone: 'N/A',
                hours: `${camp.startTime} - ${camp.endTime}`,
                image: campImages[camp.type] || 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop',
                services: ['Health Camp', camp.type.replace('_', ' ')],
                coordinates: camp.location.coordinates,
                organizerName: camp.organizerName,
                organizerSpecialty: camp.organizerSpecialty,
                description: camp.description,
                date: camp.date,
                capacity: camp.capacity,
                registered: camp.registered,
                registeredPatients: camp.registeredPatients || [],
                isFirestoreCamp: true
              };
            });
            
            setFirestoreCamps(firestoreCampsResults);
          } catch (error) {
            console.error('Error fetching Firestore camps:', error);
          }
        }
        
        // If selectedType is one of the camp types, search Google Places for camp keywords
        if (selectedType && selectedType !== 'all' && campKeywords[selectedType]) {
          if (!loc) {
            const cityDataFallback = getFacilitiesByCity(selectedCity);
            setFacilities([...firestoreCampsResults, ...cityDataFallback]);
            setLoading(false);
            return;
          }

          // Use API to find nearby camp events (8km radius)
          const results = await searchGooglePlaces(campKeywords[selectedType], loc, 8000, selectedType);
          googlePlacesResults = results;
        } else {
          // Load local city healthcare facilities (including hospitals and clinics)
          const cityFacilities = getFacilitiesByCity(selectedCity);
          googlePlacesResults = selectedType === 'all' 
            ? cityFacilities 
            : cityFacilities.filter(f => f.type === selectedType);
        }

        // Merge Firestore camps with city healthcare results
        const allFacilities = [...firestoreCampsResults, ...googlePlacesResults];
        setFacilities(allFacilities);

        if (userLocation) {
          calculateDistances(userLocation);
        }

        setLoading(false);
      } catch (err) {
        console.error('Error loading facilities:', err);
        setLoading(false);
      }
    })();
  };

  const calculateDistances = (location) => {
    setFacilities(prev => prev.map(facility => ({
      ...facility,
      distance: `${calculateDistance(
        location.lat,
        location.lng,
        facility.coordinates.lat,
        facility.coordinates.lng
      ).toFixed(1)} km`
    })));
  };

  const handleRegisterForCamp = async (campId, facility) => {
    if (!user) {
      toast.error('Please login to register for camps');
      return;
    }

    try {
      const isRegistered = facility.registeredPatients?.includes(user.uid);
      
      if (isRegistered) {
        await unregisterFromCamp(campId, user.uid);
        toast.success('Successfully unregistered from camp');
      } else {
        await registerForCamp(campId, user.uid, user.displayName || 'Anonymous');
        toast.success('Successfully registered for camp!');
      }
      
      // Reload facilities to update registration status
      loadFacilities();
    } catch (error) {
      toast.error(error.message || 'Failed to register for camp');
    }
  };

  const availableCities = [
    { id: 'mumbai', name: 'Mumbai, Maharashtra' },
    { id: 'delhi', name: 'Delhi NCR' },
    { id: 'bangalore', name: 'Bangalore, Karnataka' },
    { id: 'chennai', name: 'Chennai, Tamil Nadu' },
    { id: 'hyderabad', name: 'Hyderabad, Telangana' },
    { id: 'pune', name: 'Pune, Maharashtra' },
    { id: 'kolkata', name: 'Kolkata, West Bengal' },
    { id: 'ahmedabad', name: 'Ahmedabad, Gujarat' },
    { id: 'jaipur', name: 'Jaipur, Rajasthan' }
  ];

  const oldMockData = [
    {
      id: 1,
      name: 'City Medical Center',
      type: 'hospital',
      specialty: 'Multi-Specialty Hospital',
      rating: 4.8,
      reviews: 324,
      distance: '0.5 km',
      address: '123 Healthcare Ave, Downtown',
      phone: '+1 (555) 123-4567',
      hours: '24/7',
      doctors: 45,
      image: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=400',
      coordinates: { lat: 40.7128, lng: -74.0060 },
      services: ['Emergency', 'ICU', 'Surgery', 'Diagnostics']
    },
    {
      id: 2,
      name: 'Dr. Sarah Johnson',
      type: 'doctor',
      specialty: 'Cardiologist',
      rating: 4.9,
      reviews: 156,
      distance: '0.8 km',
      address: '456 Medical Plaza, Suite 201',
      phone: '+1 (555) 234-5678',
      hours: 'Mon-Fri: 9AM-6PM',
      experience: '15 years',
      image: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?w=400',
      coordinates: { lat: 40.7138, lng: -74.0070 },
      services: ['Heart Checkup', 'ECG', 'Angiography']
    },
    {
      id: 3,
      name: 'Green Valley Clinic',
      type: 'clinic',
      specialty: 'Primary Care Clinic',
      rating: 4.6,
      reviews: 89,
      distance: '1.2 km',
      address: '789 Wellness Street',
      phone: '+1 (555) 345-6789',
      hours: 'Mon-Sat: 8AM-8PM',
      doctors: 8,
      image: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?w=400',
      coordinates: { lat: 40.7118, lng: -74.0050 },
      services: ['General Checkup', 'Vaccinations', 'Lab Tests']
    },
    {
      id: 4,
      name: 'Dr. Michael Chen',
      type: 'doctor',
      specialty: 'Pediatrician',
      rating: 4.9,
      reviews: 203,
      distance: '1.5 km',
      address: '321 Kids Care Center',
      phone: '+1 (555) 456-7890',
      hours: 'Mon-Fri: 8AM-5PM',
      experience: '12 years',
      image: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?w=400',
      coordinates: { lat: 40.7148, lng: -74.0080 },
      services: ['Child Care', 'Vaccinations', 'Growth Monitoring']
    },
    {
      id: 5,
      name: 'Memorial Hospital',
      type: 'hospital',
      specialty: 'General Hospital',
      rating: 4.7,
      reviews: 445,
      distance: '2.1 km',
      address: '555 Memorial Drive',
      phone: '+1 (555) 567-8901',
      hours: '24/7',
      doctors: 78,
      image: 'https://images.unsplash.com/photo-1586773860418-d37222d8fce3?w=400',
      coordinates: { lat: 40.7108, lng: -74.0040 },
      services: ['Emergency', 'Surgery', 'Maternity', 'ICU']
    },
    {
      id: 6,
      name: 'Sunrise Family Clinic',
      type: 'clinic',
      specialty: 'Family Medicine',
      rating: 4.5,
      reviews: 67,
      distance: '2.3 km',
      address: '890 Sunrise Boulevard',
      phone: '+1 (555) 678-9012',
      hours: 'Mon-Sat: 9AM-7PM',
      doctors: 5,
      image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=400',
      coordinates: { lat: 40.7158, lng: -74.0090 },
      services: ['Family Care', 'Chronic Disease', 'Women\'s Health']
    },
    {
      id: 7,
      name: 'Dr. Emily Rodriguez',
      type: 'doctor',
      specialty: 'Dermatologist',
      rating: 4.8,
      reviews: 134,
      distance: '2.8 km',
      address: '234 Skin Care Plaza',
      phone: '+1 (555) 789-0123',
      hours: 'Tue-Sat: 10AM-6PM',
      experience: '10 years',
      image: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?w=400',
      coordinates: { lat: 40.7098, lng: -74.0030 },
      services: ['Skin Treatment', 'Cosmetic Procedures', 'Acne Care']
    },
    {
      id: 8,
      name: 'Central Diagnostic Center',
      type: 'clinic',
      specialty: 'Diagnostic & Imaging',
      rating: 4.7,
      reviews: 178,
      distance: '3.0 km',
      address: '567 Diagnostic Road',
      phone: '+1 (555) 890-1234',
      hours: 'Mon-Sun: 7AM-9PM',
      doctors: 12,
      image: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=400',
      coordinates: { lat: 40.7168, lng: -74.0100 },
      services: ['X-Ray', 'MRI', 'CT Scan', 'Ultrasound']
    }
  ]; // End of old mock data - now removed

  const handleLocateMe = async () => {
    try {
      toast.loading('Detecting your GPS location...', { id: 'gps-loc' });
      const loc = await getUserLocation();
      setUserLocation(loc);
      calculateDistances(loc);
      toast.success('Location detected! Sorted by distance.', { id: 'gps-loc' });
    } catch (err) {
      toast.error('Unable to fetch location. Please check browser permissions.', { id: 'gps-loc' });
    }
  };

  // Comprehensive facility types including Hospitals, Clinics, and Camps
  const types = [
    { id: 'all', name: 'All Facilities', icon: MapPinIcon, color: 'gray' },
    { id: 'hospital', name: 'Hospitals', icon: HeartIcon, color: 'red' },
    { id: 'clinic', name: 'Clinics', icon: BuildingOfficeIcon, color: 'green' },
    { id: 'blood_donation', name: 'Blood Donation', icon: UserGroupIcon, color: 'red' },
    { id: 'dental_camp', name: 'Dental Camps', icon: BuildingOfficeIcon, color: 'orange' },
    { id: 'treatment_camp', name: 'Treatment Camps', icon: ShieldCheckIcon, color: 'emerald' },
    { id: 'vaccination', name: 'Vaccination Camps', icon: LifebuoyIcon, color: 'purple' },
    { id: 'eye_camp', name: 'Eye Camps', icon: SparklesIcon, color: 'teal' }
  ];

  // Map camp types to Google Places keywords
  const campKeywords = {
    blood_donation: 'blood donation camp',
    dental_camp: 'dental camp',
    treatment_camp: 'health camp',
    vaccination: 'vaccination camp',
    eye_camp: 'eye camp'
  };

  // Filter facilities by search query and type
  const filteredFacilities = facilities
    .filter(facility => {
      const name = (facility.name || '').toString().toLowerCase();
      const specialty = (facility.specialty || '').toString().toLowerCase();
      const address = (facility.address || '').toString().toLowerCase();
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || name.includes(q) || specialty.includes(q) || address.includes(q);
      const matchesType = selectedType === 'all' || facility.type === selectedType;
      return matchesSearch && matchesType;
    });

  const renderStars = (rating) => {
    const stars = [];
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;

    for (let i = 0; i < fullStars; i++) {
      stars.push(
        <StarIconSolid key={i} className="w-5 h-5 text-yellow-400" />
      );
    }
    if (hasHalfStar) {
      stars.push(
        <StarIconSolid key="half" className="w-5 h-5 text-yellow-400 opacity-50" />
      );
    }
    const remainingStars = 5 - Math.ceil(rating);
    for (let i = 0; i < remainingStars; i++) {
      stars.push(
        <StarIcon key={`empty-${i}`} className="w-5 h-5 text-gray-300" />
      );
    }
    return stars;
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'doctor':
        return 'from-blue-500 to-blue-600';
      case 'clinic':
        return 'from-green-500 to-green-600';
      case 'hospital':
        return 'from-red-500 to-red-600';
      case 'blood_donation':
        return 'from-red-400 to-red-600';
      case 'dental_camp':
        return 'from-orange-400 to-orange-600';
      case 'treatment_camp':
        return 'from-emerald-400 to-emerald-600';
      case 'vaccination':
        return 'from-purple-400 to-purple-600';
      case 'eye_camp':
        return 'from-teal-400 to-teal-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'doctor':
        return UserGroupIcon;
      case 'clinic':
        return BuildingOfficeIcon;
      case 'hospital':
        return HeartIcon;
      case 'blood_donation':
        return UserGroupIcon;
      case 'dental_camp':
        return BuildingOfficeIcon;
      case 'treatment_camp':
        return ShieldCheckIcon;
      case 'vaccination':
        return LifebuoyIcon;
      case 'eye_camp':
        return SparklesIcon;
      default:
        return MapPinIcon;
    }
  };

  const formatLabel = (label) => {
    if (!label) return '';
    return label
      .toString()
      .replace(/([A-Z])/g, ' $1')
      .replace(/^\w/, (char) => char.toUpperCase());
  };

  const getActiveSupportServices = (facility) => {
    if (!facility?.supportServices) return [];
    return Object.entries(facility.supportServices)
      .filter(([, value]) => Boolean(value))
      .map(([key]) => formatLabel(key));
  };

  const handleViewDetails = (facility) => {
    setSelectedFacilityDetails(facility);
    setShowDetailsModal(true);
  };

  const closeDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedFacilityDetails(null);
  };

  const activeSupportServices = selectedFacilityDetails ? getActiveSupportServices(selectedFacilityDetails) : [];

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Clean Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold uppercase tracking-wider flex items-center gap-1">
                <HeartIcon className="w-3.5 h-3.5 text-red-600" />
                Hospital &amp; Care Locator
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-700 text-xs font-bold uppercase tracking-wider">
                Leaflet Interactive Maps
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
              Locate Hospitals &amp; Healthcare Resources
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Find verified hospitals, 24/7 emergency departments, specialty clinics, and community health camps near you.
            </p>
          </div>

          <Link
            to="/chatbot"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all whitespace-nowrap self-start md:self-auto"
          >
            <SparklesIcon className="w-4 h-4" />
            Ask Health AI Assistant
          </Link>
        </motion.div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
          </div>
        ) : (
          <>
            {/* Search, Filter & Location Bar */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-xl shadow-md border border-gray-200 p-4 mb-6"
            >
              {/* City Selector and Locate Me */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-semibold text-gray-700 mb-1.5 flex items-center">
                    <div className="w-5 h-5 bg-teal-100 rounded-md flex items-center justify-center mr-1.5">
                      <GlobeAltIcon className="w-3.5 h-3.5 text-teal-600" />
                    </div>
                    Select City / Region
                  </label>
                  <select
                    value={selectedCity}
                    onChange={(e) => setSelectedCity(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 bg-white text-sm font-medium hover:border-teal-500 transition-all"
                  >
                    {availableCities.map(city => (
                      <option key={city.id} value={city.id}>
                        {city.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={handleLocateMe}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-semibold text-sm transition-all shadow-sm"
                  >
                    <MapPinIcon className="w-4 h-4 text-blue-600" />
                    {userLocation ? 'Update GPS Location' : 'Detect My Location'}
                  </button>
                </div>
              </div>

              {/* Search Input */}
              <div className="relative mb-3">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-teal-600" />
                <input
                  type="text"
                  placeholder="Search hospital name, specialty (e.g., Cardiology, Emergency), or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 placeholder-gray-400 text-sm font-medium"
                />
              </div>

              {/* Type Filter & View Mode Toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-100">
                <div className="flex flex-wrap gap-1.5">
                  {types.map((type) => {
                    const IconComponent = type.icon;
                    const isActive = selectedType === type.id;
                    const count = facilities.filter(f => type.id === 'all' || f.type === type.id).length;
                    return (
                      <button
                        key={type.id}
                        onClick={() => setSelectedType(type.id)}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold text-xs transition-all ${
                          isActive
                            ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-sm'
                            : 'bg-gray-50 border border-gray-200 text-gray-700 hover:border-teal-500 hover:bg-teal-50'
                        }`}
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        <span>{type.name}</span>
                        <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                          isActive ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-700'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* View Mode Toggle */}
                <div className="flex items-center bg-gray-100 p-1 rounded-lg border border-gray-200 self-start sm:self-auto">
                  <button
                    onClick={() => setViewMode('split')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                      viewMode === 'split' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    Split View
                  </button>
                  <button
                    onClick={() => setViewMode('map')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                      viewMode === 'map' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Map Only
                  </button>
                  <button
                    onClick={() => setViewMode('cards')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1 ${
                      viewMode === 'cards' ? 'bg-white text-teal-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Cards Only
                  </button>
                </div>
              </div>
            </motion.div>

            {/* Interactive Leaflet Map Section */}
            {(viewMode === 'split' || viewMode === 'map') && (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6 bg-white p-3 rounded-2xl shadow-md border border-gray-200"
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-teal-500 animate-pulse"></span>
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Interactive Leaflet Hospital Map
                    </span>
                    <span className="text-xs text-gray-500">
                      ({filteredFacilities.length} facilities mapped in {selectedCity.toUpperCase()})
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    Click any marker to view hospital details &amp; directions
                  </span>
                </div>

                <HospitalMapLeaflet
                  facilities={filteredFacilities}
                  userLocation={userLocation}
                  selectedFacility={selectedLocation}
                  onSelectFacility={(facility) => {
                    setSelectedLocation(facility);
                  }}
                  center={userLocation || CITY_COORDINATES[selectedCity] || CITY_COORDINATES.pune}
                  zoom={12}
                  className={viewMode === 'map' ? 'h-[620px] w-full rounded-xl' : 'h-[440px] w-full rounded-xl'}
                />
              </motion.div>
            )}

            {/* Results Header (if not map only) */}
            {viewMode !== 'map' && (
              <div className="mb-4 flex items-center justify-between">
                <p className="text-gray-700 text-sm font-semibold">
                  Found <span className="text-teal-600 font-bold">{filteredFacilities.length}</span> healthcare facilities &amp; camps
                  {userLocation && <span className="text-blue-600 font-normal ml-1">• Sorted by distance from you</span>}
                </p>
                {selectedLocation && (
                  <span className="text-xs text-teal-700 bg-teal-50 px-2 py-1 rounded-md font-medium">
                    Selected: {selectedLocation.name}
                  </span>
                )}
              </div>
            )}

            {/* Facilities Cards Grid (if not map only) */}
            {viewMode !== 'map' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFacilities.map((facility, index) => {
            const TypeIcon = getTypeIcon(facility.type);
            return (
              <motion.div
                key={facility.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden hover:shadow-lg hover:border-teal-400 transition-all duration-300 group cursor-pointer"
                onClick={() => setSelectedLocation(facility)}
              >
                {/* Compact Image */}
                <div className="relative h-40 overflow-hidden">
                  <img
                    src={facility.image}
                    alt={facility.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute top-3 left-3 px-3 py-1 rounded-lg bg-teal-600 text-white text-xs font-bold flex items-center gap-1 shadow-md">
                    <TypeIcon className="w-3 h-3" />
                    {formatLabel(facility.type)}
                  </div>
                  <div className="absolute top-3 right-3 px-3 py-1 rounded-lg bg-white text-gray-900 text-xs font-bold flex items-center gap-1 shadow-md">
                    <MapPinIcon className="w-3 h-3 text-teal-600" />
                    {facility.distance}
                  </div>
                </div>

                {/* Compact Content */}
                <div className="p-4">
                  {/* Name and Specialty */}
                  <h3 className="text-lg font-bold text-gray-900 mb-1 group-hover:text-teal-600 transition-colors">
                    {facility.name}
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">{facility.specialty}</p>

                  {/* Compact Rating */}
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex items-center bg-amber-50 px-2 py-1 rounded-lg border border-amber-200">
                      <StarIconSolid className="w-4 h-4 text-amber-500 mr-1" />
                      <span className="text-sm font-bold text-gray-900">{facility.rating}</span>
                    </div>
                    <span className="text-xs text-gray-600">({facility.reviews} reviews)</span>
                  </div>

                  {/* Compact Details */}
                  <div className="space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-gray-600">
                      <MapIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      <span className="text-xs truncate">{facility.address}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <ClockIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                      <span className="text-xs">{facility.hours}</span>
                    </div>
                    {facility.doctors && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <UserGroupIcon className="w-4 h-4 text-teal-600 flex-shrink-0" />
                        <span className="text-xs font-semibold">{facility.doctors} doctors</span>
                      </div>
                    )}
                    {facility.emergencySupport?.availability && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <ShieldCheckIcon className="w-4 h-4 text-rose-500 flex-shrink-0" />
                        <span className="text-xs">{facility.emergencySupport.availability}</span>
                      </div>
                    )}
                    {facility.waitingTime?.opd && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <ClockIcon className="w-4 h-4 text-indigo-500 flex-shrink-0" />
                        <span className="text-xs">OPD wait {facility.waitingTime.opd}</span>
                      </div>
                    )}
                    {facility.languages && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <GlobeAltIcon className="w-4 h-4 text-cyan-600 flex-shrink-0" />
                        <span className="text-xs">
                          {facility.languages.slice(0, 2).join(', ')}
                          {facility.languages.length > 2 ? ` +${facility.languages.length - 2} more` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Compact Services Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {facility.services.slice(0, 2).map((service, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 bg-teal-50 text-teal-700 text-xs rounded-md font-semibold"
                      >
                        {service}
                      </span>
                    ))}
                    {facility.services.length > 2 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-md font-semibold">
                        +{facility.services.length - 2}
                      </span>
                    )}
                  </div>

                  {/* Organizer Info for Firestore Camps */}
                  {facility.isFirestoreCamp && facility.organizerName && (
                    <div className="mb-3 p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                      <div className="flex items-center gap-2 text-sm">
                        <UserGroupIcon className="w-4 h-4 text-indigo-600" />
                        <span className="text-gray-700">
                          Organized by <strong>{facility.organizerName}</strong>
                        </span>
                      </div>
                      {facility.organizerSpecialty && (
                        <p className="text-xs text-gray-600 mt-1 ml-6">{facility.organizerSpecialty}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-600">
                        <span className="flex items-center gap-1">
                          <UserGroupIcon className="w-3 h-3" />
                          {facility.registered}/{facility.capacity} registered
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {facility.date?.toDate?.()?.toLocaleDateString() || 'TBD'}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Compact Action Buttons */}
                  <div className="flex gap-2">
                    {facility.isFirestoreCamp ? (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRegisterForCamp(facility.firestoreCampId, facility);
                          }}
                          disabled={facility.registered >= facility.capacity && !facility.registeredPatients?.includes(user?.uid)}
                          className={`flex-1 ${
                            facility.registeredPatients?.includes(user?.uid)
                              ? 'bg-red-600 hover:bg-red-700'
                              : facility.registered >= facility.capacity
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700'
                          } text-white py-2.5 rounded-lg font-bold text-sm hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                          <UserGroupIcon className="w-4 h-4" />
                          {facility.registeredPatients?.includes(user?.uid) 
                            ? 'Unregister' 
                            : facility.registered >= facility.capacity 
                            ? 'Full' 
                            : 'Register'}
                        </button>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(facility);
                          }}
                          className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg font-bold text-sm hover:bg-indigo-700 hover:shadow-lg transition-all duration-300 flex items-center justify-center"
                        >
                          <MapIcon className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetails(facility);
                          }}
                          className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600 text-white py-2.5 rounded-lg font-bold text-sm hover:from-teal-700 hover:to-cyan-700 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                        >
                          <MapIcon className="w-4 h-4" />
                          View Details
                        </button>
                        {facility.phone && facility.phone !== 'N/A' && (
                          <a
                            href={`tel:${facility.phone}`}
                            onClick={(e) => e.stopPropagation()}
                            className="px-4 py-2.5 bg-green-600 text-white rounded-lg font-bold text-sm hover:bg-green-700 hover:shadow-lg transition-all duration-300 flex items-center justify-center"
                            title="Call Hospital"
                          >
                            <PhoneIcon className="w-4 h-4" />
                          </a>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {filteredFacilities.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <MapPinIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No facilities found</h3>
          <p className="text-gray-600">Try adjusting your search or filters</p>
        </motion.div>
      )}
    </>
  )}

        {/* Details Modal */}
        {showDetailsModal && selectedFacilityDetails && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={closeDetailsModal}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            >
              {/* Modal Header */}
              <div className="relative h-64 overflow-hidden rounded-t-2xl">
                <img
                  src={selectedFacilityDetails.image}
                  alt={selectedFacilityDetails.name}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent"></div>
                <button
                  onClick={closeDetailsModal}
                  className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-white rounded-full flex items-center justify-center transition-all shadow-lg"
                >
                  <svg className="w-6 h-6 text-gray-800" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="absolute bottom-4 left-6 right-6">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-3 py-1 rounded-lg bg-teal-600 text-white text-sm font-bold flex items-center gap-1">
                      {formatLabel(selectedFacilityDetails.type)}
                    </span>
                    {selectedFacilityDetails.distance && (
                      <span className="px-3 py-1 rounded-lg bg-white text-gray-900 text-sm font-bold flex items-center gap-1">
                        <MapPinIcon className="w-4 h-4 text-teal-600" />
                        {selectedFacilityDetails.distance}
                      </span>
                    )}
                  </div>
                  <h2 className="text-3xl font-bold text-white mb-1">{selectedFacilityDetails.name}</h2>
                  <p className="text-white text-lg">{selectedFacilityDetails.specialty}</p>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {/* Rating */}
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-200">
                  <div className="flex items-center bg-amber-50 px-4 py-2 rounded-xl border border-amber-200">
                    <StarIconSolid className="w-6 h-6 text-amber-500 mr-2" />
                    <span className="text-2xl font-bold text-gray-900">{selectedFacilityDetails.rating}</span>
                  </div>
                  <div>
                    <div className="flex items-center mb-1">
                      {renderStars(selectedFacilityDetails.rating)}
                    </div>
                    <span className="text-sm text-gray-600">{selectedFacilityDetails.reviews} reviews</span>
                  </div>
                </div>

                {/* Contact Information */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Contact Information</h3>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-teal-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <PhoneIcon className="w-5 h-5 text-teal-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Phone Number</p>
                        <a href={`tel:${selectedFacilityDetails.phone}`} className="text-lg font-semibold text-teal-600 hover:text-teal-700">
                          {selectedFacilityDetails.phone}
                        </a>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <MapIcon className="w-5 h-5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Address</p>
                        <p className="text-base font-medium text-gray-900">{selectedFacilityDetails.address}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <ClockIcon className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm text-gray-600 mb-1">Working Hours</p>
                        <p className="text-base font-medium text-gray-900">{selectedFacilityDetails.hours}</p>
                      </div>
                    </div>
                    {selectedFacilityDetails.doctors && (
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <UserGroupIcon className="w-5 h-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Medical Staff</p>
                          <p className="text-base font-medium text-gray-900">{selectedFacilityDetails.doctors} doctors available</p>
                        </div>
                      </div>
                    )}
                    {selectedFacilityDetails.website && (
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                          <GlobeAltIcon className="w-5 h-5 text-green-600" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 mb-1">Website</p>
                          <a 
                            href={selectedFacilityDetails.website} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-base font-medium text-green-600 hover:text-green-700 underline"
                          >
                            Visit Website
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Emergency & Critical Care */}
                {selectedFacilityDetails.emergencySupport && (
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <ShieldCheckIcon className="w-6 h-6 text-rose-500" />
                      Emergency &amp; Critical Care
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl">
                        <div className="flex items-center gap-3 mb-3">
                          <LifebuoyIcon className="w-6 h-6 text-rose-600" />
                          <div>
                            <p className="text-xs font-semibold text-rose-600 uppercase">Emergency Hotline</p>
                            <p className="text-base font-bold text-gray-900">{selectedFacilityDetails.emergencySupport.hotline}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">{selectedFacilityDetails.emergencySupport.notes}</p>
                      </div>
                      <div className="p-4 bg-white border border-gray-200 rounded-xl">
                        <div className="flex items-center gap-3 mb-3">
                          <ShieldCheckIcon className="w-6 h-6 text-teal-600" />
                          <div>
                            <p className="text-xs font-semibold text-teal-600 uppercase">Availability</p>
                            <p className="text-base font-bold text-gray-900">{selectedFacilityDetails.emergencySupport.availability}</p>
                          </div>
                        </div>
                        <div className="space-y-2 text-sm text-gray-700">
                          <div className="flex items-center gap-2">
                            <PhoneIcon className="w-4 h-4 text-teal-600" />
                            <span>Ambulance Desk: {selectedFacilityDetails.emergencySupport.ambulance}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <HeartIcon className="w-4 h-4 text-rose-500" />
                            <span>{selectedFacilityDetails.emergencySupport.traumaLevel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bed Availability */}
                {selectedFacilityDetails.bedAvailability && (
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <HomeModernIcon className="w-6 h-6 text-indigo-500" />
                      Bed Availability Snapshot
                    </h3>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                        <p className="text-xs font-semibold text-indigo-600 uppercase">Total Beds</p>
                        <p className="text-2xl font-bold text-gray-900">{selectedFacilityDetails.bedAvailability.total}</p>
                      </div>
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                        <p className="text-xs font-semibold text-indigo-600 uppercase">ICU Beds</p>
                        <p className="text-2xl font-bold text-gray-900">{selectedFacilityDetails.bedAvailability.icu}</p>
                      </div>
                      <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                        <p className="text-xs font-semibold text-indigo-600 uppercase">Ventilators</p>
                        <p className="text-2xl font-bold text-gray-900">{selectedFacilityDetails.bedAvailability.ventilators}</p>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-3">{selectedFacilityDetails.bedAvailability.lastUpdated}</p>
                  </div>
                )}

                {/* Services */}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 mb-4">Available Services</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedFacilityDetails.services.map((service, idx) => (
                      <span
                        key={idx}
                        className="px-4 py-2 bg-teal-50 text-teal-700 text-sm rounded-lg font-semibold border border-teal-200"
                      >
                        {service}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Insurance & Payment */}
                {(selectedFacilityDetails.acceptedInsurance || selectedFacilityDetails.paymentOptions) && (
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <CurrencyRupeeIcon className="w-6 h-6 text-emerald-600" />
                      Insurance &amp; Payment
                    </h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      {selectedFacilityDetails.acceptedInsurance && (
                        <div className="p-4 bg-white border border-gray-200 rounded-xl">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Insurance Partners</h4>
                          <div className="flex flex-wrap gap-2">
                            {selectedFacilityDetails.acceptedInsurance.map((plan) => (
                              <span key={plan} className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-full border border-emerald-200">
                                {plan}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {selectedFacilityDetails.paymentOptions && (
                        <div className="p-4 bg-white border border-gray-200 rounded-xl">
                          <h4 className="text-sm font-semibold text-gray-700 mb-3">Payment Options</h4>
                          <ul className="space-y-2 text-sm text-gray-700">
                            {selectedFacilityDetails.paymentOptions.map((option) => (
                              <li key={option} className="flex items-center gap-2">
                                <CurrencyRupeeIcon className="w-4 h-4 text-emerald-600" />
                                {option}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Amenities & Patient Support */}
                {(selectedFacilityDetails.amenities || selectedFacilityDetails.specialPrograms || activeSupportServices.length > 0 || selectedFacilityDetails.languages || selectedFacilityDetails.patientExperience) && (
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <SparklesIcon className="w-6 h-6 text-indigo-500" />
                      Patient Amenities &amp; Support
                    </h3>
                    {selectedFacilityDetails.amenities && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">On-site Amenities</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFacilityDetails.amenities.map((amenity) => (
                            <span key={amenity} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-full border border-indigo-100">
                              {amenity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedFacilityDetails.specialPrograms && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Special Programs</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFacilityDetails.specialPrograms.map((program) => (
                            <span key={program} className="px-3 py-1 bg-purple-50 text-purple-700 text-xs font-semibold rounded-full border border-purple-100">
                              {program}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeSupportServices.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Support Services</h4>
                        <div className="flex flex-wrap gap-2">
                          {activeSupportServices.map((service) => (
                            <span key={service} className="px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full border border-teal-100">
                              {service}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedFacilityDetails.languages && (
                      <div className="mb-4">
                        <h4 className="text-sm font-semibold text-gray-700 mb-2">Languages Supported</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedFacilityDetails.languages.map((language) => (
                            <span key={language} className="px-3 py-1 bg-cyan-50 text-cyan-700 text-xs font-semibold rounded-full border border-cyan-100">
                              {language}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedFacilityDetails.patientExperience && (
                      <div className="grid md:grid-cols-3 gap-4">
                        {Object.entries(selectedFacilityDetails.patientExperience).map(([key, value]) => (
                          <div key={key} className="p-4 bg-white border border-gray-200 rounded-xl">
                            <p className="text-xs font-semibold text-gray-500 uppercase">{formatLabel(key)}</p>
                            <p className="text-sm font-medium text-gray-800 mt-1">{typeof value === 'boolean' ? (value ? 'Available' : 'Not available') : value}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Telehealth & Remote Care */}
                {selectedFacilityDetails.telehealth && (
                  <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <DevicePhoneMobileIcon className="w-6 h-6 text-teal-600" />
                      Telehealth &amp; Remote Care
                    </h3>
                    <div className="p-4 bg-teal-50 border border-teal-100 rounded-xl">
                      <p className="text-sm text-gray-700 mb-2">{selectedFacilityDetails.telehealth.description}</p>
                      <p className="text-sm font-semibold text-gray-800 mb-2">
                        Status: <span className="text-teal-700">{selectedFacilityDetails.telehealth.available ? 'Available' : 'Limited availability'}</span>
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedFacilityDetails.telehealth.bookingUrl && (
                          <a
                            href={selectedFacilityDetails.telehealth.bookingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-gradient-to-r from-teal-600 to-cyan-600 text-white text-sm font-semibold rounded-lg hover:from-teal-700 hover:to-cyan-700"
                          >
                            Book a Teleconsult
                          </a>
                        )}
                        <a
                          href={`tel:${selectedFacilityDetails.phone}`}
                          className="px-4 py-2 bg-white border border-teal-200 text-teal-700 text-sm font-semibold rounded-lg hover:bg-teal-100"
                        >
                          Call to Schedule
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <a
                    href={`tel:${selectedFacilityDetails.phone}`}
                    className="flex-1 bg-gradient-to-r from-green-600 to-green-700 text-white py-4 rounded-xl font-bold text-base hover:from-green-700 hover:to-green-800 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <PhoneIcon className="w-5 h-5" />
                    Call Now
                  </a>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedFacilityDetails.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-gradient-to-r from-teal-600 to-cyan-600 text-white py-4 rounded-xl font-bold text-base hover:from-teal-700 hover:to-cyan-700 hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
                  >
                    <MapIcon className="w-5 h-5" />
                    Get Directions
                  </a>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LocatePage;
