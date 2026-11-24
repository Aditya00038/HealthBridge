import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { appointmentServices } from '../../services/firebaseServices';
import { subscribeToWaitingInstantCalls, acceptInstantCall, rejectInstantCall } from '../../services/instantCallService';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import {
  CalendarIcon,
  UsersIcon,
  ClockIcon,
  CheckCircleIcon,
  PlusIcon,
  VideoCameraIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  UserIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  SparklesIcon,
  ChartBarIcon,
  ArrowRightIcon,
  BoltIcon,
  PhoneArrowUpRightIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

// Today's Appointments Management Component  
const TodayAppointments = ({ appointments }) => {
  const [currentPatientIndex, setCurrentPatientIndex] = useState(0);

  // Get today's confirmed appointments sorted by time
  const getTodayAppointments = () => {
    if (!appointments || appointments.length === 0) return [];
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return appointments
      .filter(apt => {
        // Check status - accept confirmed, approved, or pending
        const validStatuses = ['confirmed', 'approved', 'pending'];
        if (!validStatuses.includes(apt.status)) return false;
        
        // Parse date
        let aptDate;
        if (apt.appointmentDate?.seconds) {
          aptDate = new Date(apt.appointmentDate.seconds * 1000);
        } else if (apt.appointmentDate) {
          aptDate = new Date(apt.appointmentDate);
        } else {
          return false;
        }
        
        const aptDateOnly = new Date(aptDate.getFullYear(), aptDate.getMonth(), aptDate.getDate());
        return aptDateOnly.getTime() === today.getTime();
      })
      .sort((a, b) => {
        const timeA = a.appointmentTime || a.time || a.selectedTime || '00:00';
        const timeB = b.appointmentTime || b.time || b.selectedTime || '00:00';
        return timeA.localeCompare(timeB);
      });
  };

  const todayAppointments = getTodayAppointments();
  const currentPatient = todayAppointments[currentPatientIndex];

  // Check if appointment is ongoing based on time
  const getAppointmentStatus = (appointment) => {
    if (!appointment) return 'waiting';
    
    const now = new Date();
    const appointmentTime = appointment.appointmentTime || appointment.time || appointment.selectedTime;
    
    if (!appointmentTime) return 'waiting';
    
    const [hours, minutes] = appointmentTime.split(':').map(Number);
    const aptDateTime = new Date();
    aptDateTime.setHours(hours, minutes, 0, 0);
    
    const diffMinutes = (now - aptDateTime) / (1000 * 60);
    
    // If appointment time has started (within last 30 minutes), show as ongoing
    if (diffMinutes >= 0 && diffMinutes <= 30) {
      return 'ongoing';
    } else if (diffMinutes > 30) {
      return 'overdue';
    } else {
      return 'waiting';
    }
  };

  const status = getAppointmentStatus(currentPatient);

  const getInitials = (name) => {
    if (!name) return 'P';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  if (todayAppointments.length === 0) {
    return (
      <div className="lg:col-span-1">
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl shadow-xl p-8 border border-blue-100">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl mr-3">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            Today's Appointments
          </h2>
          <div className="text-center py-12">
            <div className="bg-white rounded-full p-6 inline-block mb-4 shadow-lg">
              <CalendarIcon className="w-20 h-20 text-blue-300" />
            </div>
            <p className="text-gray-600 text-xl font-semibold mb-2">All Clear!</p>
            <p className="text-gray-500 text-sm">No appointments scheduled for today</p>
            <Link
              to="/doctor/appointments"
              className="mt-6 inline-block px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white rounded-xl shadow-md hover:shadow-lg transition-all"
            >
              View Schedule
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lg:col-span-1">
      <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900 flex items-center">
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2 rounded-xl mr-3">
              <CalendarIcon className="w-6 h-6 text-white" />
            </div>
            Today's Queue
          </h2>
          <span className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-full text-sm font-bold shadow-lg">
            {currentPatientIndex + 1} / {todayAppointments.length}
          </span>
        </div>

        {/* Current Patient Card - Enhanced */}
        <motion.div
          key={currentPatient.id}
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 rounded-2xl p-6 mb-6 border-2 border-blue-200 shadow-lg"
        >
          <div className="flex items-start gap-4 mb-5">
            {currentPatient.patientAvatar ? (
              <img 
                src={currentPatient.patientAvatar} 
                alt={currentPatient.patientName}
                className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-xl"
              />
            ) : (
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-xl">
                {getInitials(currentPatient.patientName)}
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-2xl font-bold text-gray-900">{currentPatient.patientName}</h3>
                <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded">
                  NOW
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                <ClockIcon className="w-5 h-5 text-blue-500" />
                <span className="font-semibold">{currentPatient.appointmentTime || currentPatient.time || currentPatient.selectedTime}</span>
              </div>
              {status === 'ongoing' && (
                <div className="inline-flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  LIVE NOW
                </div>
              )}
              {status === 'overdue' && (
                <div className="inline-flex items-center gap-2 bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md">
                  <ExclamationTriangleIcon className="w-5 h-5" />
                  OVERDUE
                </div>
              )}
              {status === 'waiting' && (
                <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-4 py-2 rounded-xl text-sm font-bold shadow-md">
                  <ClockIcon className="w-5 h-5" />
                  SCHEDULED
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl p-5 mb-4 shadow-inner">
            <h4 className="text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4 text-blue-500" />
              Reason for Visit
            </h4>
            <p className="text-gray-900 leading-relaxed">{currentPatient.reasonForVisit || currentPatient.reason || 'General consultation'}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {currentPatient.appointmentType && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 font-medium mb-1">Type</div>
                <div className="flex items-center gap-2">
                  {currentPatient.appointmentType === 'video' ? (
                    <VideoCameraIcon className="w-5 h-5 text-blue-600" />
                  ) : (
                    <UserIcon className="w-5 h-5 text-green-600" />
                  )}
                  <span className="text-sm font-bold capitalize">{currentPatient.appointmentType}</span>
                </div>
              </div>
            )}
            {currentPatient.phone && (
              <div className="bg-white rounded-xl p-4 shadow-sm">
                <div className="text-xs text-gray-500 font-medium mb-1">Contact</div>
                <div className="text-sm font-bold">{currentPatient.phone}</div>
              </div>
            )}
          </div>

          {(currentPatient.type === 'video' || currentPatient.appointmentType === 'video' || currentPatient.type === 'video_call' || (typeof currentPatient.appointmentNumber === 'string' && currentPatient.appointmentNumber.startsWith('VC'))) && currentPatient.status !== 'completed' && currentPatient.status !== 'cancelled' && (
            <div className="mt-4 pt-4 border-t border-blue-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
                <VideoCameraIcon className="w-4 h-4 text-teal-600" />
                <span>Video Consultation</span>
              </div>
              <Link
                to={`/video-call/${currentPatient.id}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white text-sm font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
              >
                <VideoCameraIcon className="w-4 h-4" />
                <span>Join Video Call</span>
              </Link>
            </div>
          )}
        </motion.div>

        {/* Next Patients Queue - Enhanced */}
        {todayAppointments.length > 1 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-blue-500" />
                Next in Queue
              </h4>
              <span className="text-xs text-gray-500 font-medium">
                {todayAppointments.length - currentPatientIndex - 1} waiting
              </span>
            </div>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-2 custom-scrollbar">
              {todayAppointments.slice(currentPatientIndex + 1).map((apt, idx) => (
                <motion.div
                  key={apt.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: idx * 0.1 }}
                  className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl hover:shadow-md transition-all border border-gray-100"
                >
                  {apt.patientAvatar ? (
                    <img src={apt.patientAvatar} alt={apt.patientName} className="w-12 h-12 rounded-xl object-cover shadow-md" />
                  ) : (
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-400 to-gray-500 flex items-center justify-center text-sm font-bold text-white shadow-md">
                      {getInitials(apt.patientName)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-gray-900 truncate text-base">{apt.patientName}</div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                      <ClockIcon className="w-3 h-3" />
                      <span className="font-medium">{apt.appointmentTime || apt.time}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">
                      #{currentPatientIndex + idx + 2}
                    </div>
                    {(apt.type === 'video' || apt.appointmentType === 'video' || (typeof apt.appointmentNumber === 'string' && apt.appointmentNumber.startsWith('VC'))) && (
                      <Link
                        to={`/video-call/${apt.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm hover:shadow transition-all whitespace-nowrap"
                      >
                        <VideoCameraIcon className="w-3 h-3" />
                        <span>Join</span>
                      </Link>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const DoctorDashboard = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [waitingInstantCalls, setWaitingInstantCalls] = useState([]);
  const [acceptingCallId, setAcceptingCallId] = useState(null);
  const [rejectingCallId, setRejectingCallId] = useState(null);
  const [stats, setStats] = useState({
    patients: 666,
    income: 2111,
    appointments: 14,
    treatments: 402
  });

  useEffect(() => {
    if (user) {
      fetchAppointments();
      const unsubCalls = subscribeToWaitingInstantCalls(user.uid, (calls) => {
        setWaitingInstantCalls(calls || []);
      });
      return () => {
        if (unsubCalls) unsubCalls();
      };
    }
  }, [user]);

  const handleAcceptCall = async (call) => {
    try {
      setAcceptingCallId(call.id);
      toast.loading('Claiming call (First-Come, First-Served)...', { id: 'accept-call' });

      const doctorData = {
        id: user.uid,
        name: userProfile?.name || user?.displayName || 'Doctor'
      };

      const result = await acceptInstantCall(call.id, doctorData, call.collectionName);

      if (result.success) {
        toast.success('Call claimed successfully! Joining room...', { id: 'accept-call' });
        setTimeout(() => {
          navigate(`/video-call/${result.callRoomId}`);
        }, 800);
      } else if (result.reason === 'ALREADY_ACCEPTED') {
        toast.error(`Call was already accepted by Dr. ${result.acceptedBy || 'another doctor'} (FCFS).`, { id: 'accept-call' });
      } else {
        toast.error('Could not claim call. Please try again.', { id: 'accept-call' });
      }
    } catch (err) {
      console.error('Error accepting call:', err);
      toast.error('Failed to claim call.', { id: 'accept-call' });
    } finally {
      setAcceptingCallId(null);
    }
  };

  const handleRejectCall = async (call, reason = 'Currently attending another patient') => {
    try {
      setRejectingCallId(call.id);
      toast.loading('Declining call...', { id: 'reject-call' });

      const doctorData = {
        id: user.uid,
        name: userProfile?.name || user?.displayName || 'Doctor'
      };

      const result = await rejectInstantCall(call.id, doctorData, reason, call.collectionName);

      if (result.success) {
        toast.success('Call request declined. Re-routed to other available doctors.', { id: 'reject-call' });
      } else {
        toast.error('Could not decline call. Please try again.', { id: 'reject-call' });
      }
    } catch (err) {
      console.error('Error declining call:', err);
      toast.error('Failed to decline call.', { id: 'reject-call' });
    } finally {
      setRejectingCallId(null);
    }
  };

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const appointmentData = await appointmentServices.getUserAppointments(user.uid, 'doctor');
      setAppointments(appointmentData);
      
      // Calculate real stats from appointment data
      const uniquePatients = [...new Set(appointmentData.map(a => a.patientId))].length;
      const totalIncome = appointmentData
        .filter(a => a.status === 'completed')
        .reduce((sum, a) => sum + (a.consultationFee || 500), 0);
      const completedTreatments = appointmentData.filter(a => a.status === 'completed').length;
      
      const newStats = {
        patients: uniquePatients,
        income: totalIncome,
        appointments: appointmentData.length,
        treatments: completedTreatments
      };
      
      setStats(newStats);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };
  const getStatusBadge = (status) => {
    const badges = {
      pending: 'bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-semibold',
      confirmed: 'bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-xs font-semibold',
      completed: 'bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-semibold',
      cancelled: 'bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold',
      rejected: 'bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-semibold'
    };
    return badges[status] || 'bg-gray-100 text-gray-800 px-3 py-1 rounded-full text-xs font-semibold';
  };

  const quickActions = [
    {
      name: 'Instant Calls',
      description: 'Review patient requests, accept or decline live calls with AI priority',
      icon: BoltIcon,
      href: '/doctor/instant-calls',
      color: 'bg-gradient-to-r from-rose-500 via-red-500 to-amber-500',
    },
    {
      name: 'Appointment Management',
      description: 'Review and manage patient appointments',
      icon: CalendarIcon,
      href: '/doctor/appointments',
      color: 'bg-gradient-to-r from-orange-500 to-orange-600',
    },
    {
      name: 'View Schedule',
      description: 'Check your appointment schedule',
      icon: CalendarIcon,
      href: '/doctor/schedule',
      color: 'bg-gradient-to-r from-blue-500 to-blue-600',
    },
    {
      name: 'Patient Records',
      description: 'Access patient medical records',
      icon: DocumentTextIcon,
      href: '/doctor/patients',
      color: 'bg-gradient-to-r from-green-500 to-green-600',
    },
    {
      name: 'Medicine Shop',
      description: 'Browse and recommend medicines',
      icon: PlusIcon,
      href: '/medicine-shop',
      color: 'bg-gradient-to-r from-emerald-500 to-emerald-600',
    },
    {
      name: 'Profile Settings',
      description: 'Manage your profile and preferences',
      icon: UserIcon,
      href: '/profile/settings',
      color: 'bg-gradient-to-r from-indigo-500 to-indigo-600',
    }
  ];

  const statCards = [
    {
      name: 'Patients',
      value: stats.patients,
      icon: UsersIcon,
      color: 'text-purple-600',
      bgColor: 'from-purple-100 to-purple-50'
    },
    {
      name: 'Income',
      value: stats.income,
      icon: () => <span className="text-3xl font-bold text-blue-600">₹</span>,
      color: 'text-blue-600',
      bgColor: 'from-blue-100 to-blue-50'
    },
    {
      name: 'Appointments',
      value: stats.appointments,
      icon: CalendarIcon,
      color: 'text-green-600',
      bgColor: 'from-green-100 to-green-50'
    },
    {
      name: 'Treatments',
      value: stats.treatments,
      icon: CheckCircleIcon,
      color: 'text-pink-600',
      bgColor: 'from-pink-100 to-pink-50'
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Enhanced Header Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-10"
        >
          <div className="bg-white rounded-3xl shadow-lg p-8 border border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <UserIcon className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                      Welcome Back, Dr. {userProfile?.name || user?.displayName || 'Doctor'}!
                    </h1>
                    <p className="text-gray-500 mt-1 flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4" />
                      {new Date().toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <SparklesIcon className="w-5 h-5 text-yellow-500" />
                  <p className="text-sm text-gray-600">
                    You have <span className="font-semibold text-blue-600">{stats.appointments}</span> total appointments
                  </p>
                </div>
              </div>
              
              <div className="mt-6 sm:mt-0">
                <Link
                  to="/doctor/profile-setup"
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
                >
                  <PlusIcon className="w-5 h-5 mr-2" />
                  Update Profile
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Real-time Instant Calls Queue (First-Come, First-Served) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className={`rounded-3xl p-6 border shadow-lg transition-all ${
            waitingInstantCalls.length > 0 
              ? 'bg-gradient-to-r from-rose-50 via-amber-50 to-orange-50 border-rose-300' 
              : 'bg-white border-gray-100'
          }`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-xl ${
                  waitingInstantCalls.length > 0 
                    ? 'bg-rose-600 text-white animate-pulse' 
                    : 'bg-emerald-100 text-emerald-700'
                }`}>
                  <BoltIcon className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-900">
                      Instant Call Queue (First-Come, First-Served)
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                      waitingInstantCalls.length > 0
                        ? 'bg-rose-500 text-white animate-pulse'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}>
                      {waitingInstantCalls.length} Waiting
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    Groq AI triaged patient calls • Normal health issues visible to all doctors • Accept or reject with health issue details
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/doctor/instant-calls"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all"
                >
                  <BoltIcon className="w-4 h-4 text-yellow-300" />
                  <span>Open Dedicated Calls Center</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </Link>

                {waitingInstantCalls.length === 0 && (
                  <div className="hidden lg:flex items-center gap-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>System Active • Ready for calls</span>
                  </div>
                )}
              </div>
            </div>

            {/* Waiting Calls List */}
            {waitingInstantCalls.length > 0 && (
              <div className="space-y-4">
                {waitingInstantCalls.map((call) => {
                  const isCritical = call.priority === 'CRITICAL';
                  const isHigh = call.priority === 'HIGH';
                  const isNormal = call.priority === 'LOW' || call.priority === 'MEDIUM';
                  const isAccepting = acceptingCallId === call.id;
                  const isRejecting = rejectingCallId === call.id;

                  return (
                    <div
                      key={call.id}
                      className={`p-5 rounded-2xl bg-white border-2 shadow-sm transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                        isCritical 
                          ? 'border-red-400 shadow-red-100' 
                          : isHigh 
                          ? 'border-orange-300' 
                          : 'border-blue-200'
                      }`}
                    >
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-lg text-xs font-black tracking-wider uppercase ${
                            isCritical 
                              ? 'bg-red-600 text-white animate-pulse' 
                              : isHigh 
                              ? 'bg-orange-500 text-white' 
                              : 'bg-blue-600 text-white'
                          }`}>
                            {call.priority} PRIORITY
                          </span>
                          {isNormal && (
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Normal Health Issue (All Doctors)
                            </span>
                          )}
                          <h3 className="text-base font-extrabold text-gray-900">
                            {call.patientName}
                          </h3>
                          <span className="text-xs text-gray-500 font-medium">
                            • Specialty: <strong className="text-gray-800">{call.recommendedSpecialty || 'General Physician'}</strong>
                          </span>
                        </div>

                        {/* Patient Health Issue & Description */}
                        <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">
                            Health Issue / Problem Description:
                          </div>
                          <p className="text-sm font-semibold text-slate-900 leading-snug">
                            "{call.problemDescription}"
                          </p>
                          {call.symptoms && call.symptoms.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {call.symptoms.map((sym, sIdx) => (
                                <span key={sIdx} className="text-[11px] bg-white border border-slate-300 text-slate-700 px-2 py-0.5 rounded-full font-medium">
                                  {sym}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {call.triageSummary && (
                          <p className="text-xs text-indigo-900 bg-indigo-50/90 p-2.5 rounded-xl border border-indigo-100 font-medium">
                            <span className="font-bold">Groq AI Analysis:</span> {call.triageSummary}
                          </p>
                        )}
                      </div>

                      {/* Doctor Action Controls: Accept (FCFS) or Decline/Reject */}
                      <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-2 flex-shrink-0">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleRejectCall(call)}
                            disabled={isRejecting || isAccepting}
                            className="px-3.5 py-2.5 border border-red-300 hover:bg-red-50 text-red-600 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                            title="Decline this call"
                          >
                            <XMarkIcon className="w-4 h-4" />
                            <span>{isRejecting ? 'Declining...' : 'Reject'}</span>
                          </button>

                          <button
                            onClick={() => handleAcceptCall(call)}
                            disabled={isAccepting || isRejecting}
                            className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-xs rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 whitespace-nowrap"
                          >
                            {isAccepting ? (
                              <>
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                <span>Claiming...</span>
                              </>
                            ) : (
                              <>
                                <BoltIcon className="w-4 h-4 text-yellow-300" />
                                <span>Accept &amp; Join (FCFS)</span>
                              </>
                            )}
                          </button>
                        </div>
                        <span className="text-[11px] text-gray-400 font-medium text-center lg:text-right flex items-center justify-center lg:justify-end gap-1">
                          <ClockIcon className="w-3.5 h-3.5 text-teal-600 inline" />
                          First-Come, First-Served
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Stats Cards - Simplified */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          {statCards.map((stat, index) => (
            <motion.div
              key={stat.name}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 + index * 0.1 }}
              className={`rounded-2xl shadow-md bg-gradient-to-br ${stat.bgColor} p-6 border border-white relative overflow-hidden`}
            >
              {/* Decorative background pattern */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-white opacity-10 rounded-full -mr-12 -mt-12"></div>
              <div className="absolute bottom-0 left-0 w-16 h-16 bg-white opacity-10 rounded-full -ml-8 -mb-8"></div>
              
              <div className="relative z-10 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-white rounded-xl p-3 shadow-md">
                    {typeof stat.icon === 'function' ? (
                      <stat.icon />
                    ) : (
                      <stat.icon className={`w-7 h-7 ${stat.color}`} />
                    )}
                  </div>
                  <ChartBarIcon className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <div className="text-sm text-gray-600 font-medium mb-1">{stat.name}</div>
                  <div className="text-3xl font-bold text-gray-900">{stat.value}</div>
                  <div className="mt-2 flex items-center text-xs text-green-600 font-medium">
                    <ArrowTrendingUpIcon className="w-3 h-3 mr-1" />
                    <span>+12% from last month</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Enhanced Quick Actions and Today's Appointments */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-10">
          {/* Quick Actions - Enhanced */}
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
            className="lg:col-span-2"
          >
            <div className="bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <SparklesIcon className="w-7 h-7 text-yellow-500" />
                    Quick Actions
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">Frequently used features</p>
                </div>
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-full p-3">
                  <ArrowTrendingUpIcon className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {quickActions.map((action, index) => (
                  <motion.div
                    key={action.name}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.7 + index * 0.1 }}
                  >
                    <Link
                      to={action.href}
                      className="block p-6 rounded-2xl border-2 border-gray-100 bg-gradient-to-br from-white to-gray-50 hover:border-blue-200 hover:shadow-lg transition-all"
                    >
                      <div className={`w-14 h-14 rounded-xl ${action.color} flex items-center justify-center mb-4 shadow-lg`}>
                        <action.icon className="w-7 h-7 text-white" />
                      </div>
                      <h3 className="font-bold text-gray-900 mb-2 text-lg">{action.name}</h3>
                      <p className="text-sm text-gray-600 mb-4 leading-relaxed">{action.description}</p>
                      <div className="flex items-center text-sm font-semibold text-blue-600">
                        Access Now
                        <ArrowRightIcon className="w-4 h-4 ml-2" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Today's Appointments Management - Enhanced */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.6 }}
          >
            <TodayAppointments 
              appointments={appointments}
            />
          </motion.div>
        </div>


      </div>
    </div>
  );
};

export default DoctorDashboard;
