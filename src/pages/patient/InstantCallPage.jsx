import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  PhoneArrowUpRightIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  UserIcon,
  BuildingOfficeIcon,
  ArrowRightIcon,
  BoltIcon,
  FireIcon,
  HeartIcon,
  ShieldExclamationIcon,
  ExclamationCircleIcon,
  FaceFrownIcon,
  BeakerIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { doctorServices } from '@/services/firebaseServices';
import { 
  analyzeProblemWithGroq, 
  createInstantCall, 
  cancelInstantCall, 
  subscribeToInstantCall 
} from '@/services/instantCallService';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

const COMMON_SYMPTOM_TAGS = [
  { label: 'High Fever', value: 'High Fever', icon: FireIcon },
  { label: 'Chest Tightness', value: 'Chest Tightness', icon: HeartIcon },
  { label: 'Shortness of Breath', value: 'Shortness of Breath', icon: ShieldExclamationIcon },
  { label: 'Severe Headache', value: 'Severe Headache', icon: ExclamationCircleIcon },
  { label: 'Nausea & Vomiting', value: 'Nausea & Vomiting', icon: FaceFrownIcon },
  { label: 'Cut or Bleeding', value: 'Cut or Bleeding', icon: ExclamationTriangleIcon },
  { label: 'Skin Rash / Itching', value: 'Skin Rash / Itching', icon: SparklesIcon },
  { label: 'Stomach Pain', value: 'Stomach Pain', icon: BeakerIcon }
];

const InstantCallPage = () => {
  const navigate = useNavigate();
  const { user, userProfile } = useAuth();

  // Form states
  const [problemDescription, setProblemDescription] = useState('');
  const [selectedSymptoms, setSelectedSymptoms] = useState([]);
  const [targetType, setTargetType] = useState('any'); // 'any' or 'specific'
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctorsList, setDoctorsList] = useState([]);
  const [loadingDoctors, setLoadingDoctors] = useState(false);

  // Call status states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [triageResult, setTriageResult] = useState(null);
  const [waitingSeconds, setWaitingSeconds] = useState(0);

  const timerRef = useRef(null);
  const unsubscribeCallRef = useRef(null);

  // Fetch approved doctors for selection
  useEffect(() => {
    const fetchDoctors = async () => {
      setLoadingDoctors(true);
      try {
        const docs = await doctorServices.getAllDoctors(true);
        setDoctorsList(docs || []);
      } catch (err) {
        console.error('Error fetching doctors:', err);
      } finally {
        setLoadingDoctors(false);
      }
    };
    fetchDoctors();
  }, []);

  // Timer for waiting room
  useEffect(() => {
    if (activeCall && activeCall.status === 'waiting') {
      timerRef.current = setInterval(() => {
        setWaitingSeconds(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setWaitingSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [activeCall]);

  // Clean up Firestore listener on unmount
  useEffect(() => {
    return () => {
      if (unsubscribeCallRef.current) {
        unsubscribeCallRef.current();
      }
    };
  }, []);

  const toggleSymptom = (symptom) => {
    const isSelected = selectedSymptoms.includes(symptom);
    const nextSymptoms = isSelected 
      ? selectedSymptoms.filter(s => s !== symptom)
      : [...selectedSymptoms, symptom];

    setSelectedSymptoms(nextSymptoms);

    setProblemDescription(prev => {
      const prevTrimmed = (prev || '').trim();

      // Check if description was empty or composed only of previous symptoms
      const wasJustSymptoms = !prevTrimmed || (
        selectedSymptoms.length > 0 &&
        selectedSymptoms.every(s => prevTrimmed.toLowerCase().includes(s.toLowerCase())) &&
        prevTrimmed.split(/,\s*|\.\s*/).every(part => {
          const p = part.trim().toLowerCase();
          return !p || selectedSymptoms.some(s => s.toLowerCase() === p);
        })
      );

      if (wasJustSymptoms) {
        return nextSymptoms.join(', ');
      }

      if (!isSelected) {
        // Adding symptom to existing description
        if (!prevTrimmed.toLowerCase().includes(symptom.toLowerCase())) {
          const punctuation = prevTrimmed.endsWith('.') || prevTrimmed.endsWith(',') ? '' : ',';
          return `${prevTrimmed}${punctuation} ${symptom}`.trim();
        }
        return prev;
      } else {
        // Removing symptom from existing description
        const escaped = symptom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        let updated = prev.replace(new RegExp(`(,\\s*)?${escaped}(\\s*,)?`, 'gi'), (match, p1, p2) => {
          return (p1 && p2) ? ', ' : '';
        }).trim();
        updated = updated.replace(/^,\s*/, '').replace(/,\s*$/, '').trim();
        return updated;
      }
    });
  };

  const filteredDoctors = doctorsList.filter(doc => {
    const name = (doc.name || '').toLowerCase();
    const specialty = (doc.specialization || doc.specialty || '').toLowerCase();
    const query = doctorSearch.toLowerCase().trim();
    return !query || name.includes(query) || specialty.includes(query);
  });

  const handleStartInstantCall = async (e) => {
    e.preventDefault();

    if (!problemDescription.trim()) {
      toast.error('Please describe your medical problem or symptoms.');
      return;
    }

    if (targetType === 'specific' && !selectedDoctor) {
      toast.error('Please select a doctor or choose "Any Available Doctor".');
      return;
    }

    try {
      setIsAnalyzing(true);
      toast.loading('Groq AI analyzing your symptoms & assigning medical priority...', { id: 'triage-loading' });

      // Step 1: AI Triage with Groq API
      const triage = await analyzeProblemWithGroq(problemDescription, selectedSymptoms);
      setTriageResult(triage);
      toast.success(`Priority Assessed: ${triage.priority} (${triage.priorityLabel})`, { id: 'triage-loading' });

      // Step 2: Create Instant Call in Firestore
      const patientName = userProfile?.name || user?.displayName || 'Patient';
      const patientPhone = userProfile?.phone || user?.phoneNumber || '';

      const callData = await createInstantCall({
        patientId: user.uid,
        patientName,
        patientPhone,
        problemDescription,
        symptoms: selectedSymptoms,
        triage,
        targetDoctorId: targetType === 'specific' ? selectedDoctor.id : 'any',
        targetDoctorName: targetType === 'specific' ? selectedDoctor.name : 'Any Available Doctor'
      });

      setActiveCall(callData);
      setIsAnalyzing(false);

      // Step 3: Listen for Doctor Acceptance (First-Come, First-Served)
      if (unsubscribeCallRef.current) unsubscribeCallRef.current();

      unsubscribeCallRef.current = subscribeToInstantCall(callData.callId, (updatedCall) => {
        setActiveCall(updatedCall);

        if (updatedCall.status === 'accepted') {
          toast.success(`Connected! Dr. ${updatedCall.acceptedByDoctorName || 'Doctor'} accepted your call. Joining room...`, { duration: 4000 });
          
          // Delay briefly for user to see the success state, then redirect to Video Call room
          setTimeout(() => {
            navigate(`/video-call/${updatedCall.callRoomId}`);
          }, 1500);
        } else if (updatedCall.status === 'cancelled') {
          toast.error('Call request was cancelled.');
          setActiveCall(null);
        }
      }, callData.collectionName);

    } catch (err) {
      console.error('Instant call request failed:', err);
      setIsAnalyzing(false);
      toast.error(err.message || 'Failed to initiate instant call. Please try again.', { id: 'triage-loading' });
    }
  };

  const handleCancelCall = async () => {
    if (!activeCall) return;
    try {
      await cancelInstantCall(activeCall.callId, activeCall.collectionName);
      if (unsubscribeCallRef.current) unsubscribeCallRef.current();
      setActiveCall(null);
      setTriageResult(null);
      toast.success('Instant call request cancelled.');
    } catch (err) {
      toast.error('Failed to cancel call.');
    }
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPriorityBadgeStyle = (priority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-500 text-white animate-pulse shadow-red-500/30';
      case 'HIGH':
        return 'bg-orange-500 text-white shadow-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500 text-white shadow-amber-500/30';
      default:
        return 'bg-emerald-500 text-white shadow-emerald-500/30';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900">
            Instant Video Consultation
          </h1>
          <p className="text-sm text-gray-600 mt-1">
            Describe your problem. Groq AI evaluates medical priority and broadcasts your request to doctors for an immediate live consultation.
          </p>
        </div>

        {/* ACTIVE WAITING ROOM MODAL / VIEW */}
        <AnimatePresence>
          {activeCall && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden mb-8"
            >
              {/* Waiting Room Banner */}
              <div className={`p-6 text-white text-center ${
                activeCall.priority === 'CRITICAL' 
                  ? 'bg-gradient-to-r from-red-600 to-rose-700' 
                  : 'bg-gradient-to-r from-teal-600 to-emerald-700'
              }`}>
                <div className="inline-flex p-3 rounded-2xl bg-white/20 mb-3 backdrop-blur-sm animate-bounce">
                  <PhoneArrowUpRightIcon className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-black tracking-tight mb-1">
                  {activeCall.status === 'accepted' ? 'Doctor Connected!' : 'Paging Doctors...'}
                </h2>
                <p className="text-sm opacity-90 max-w-lg mx-auto">
                  {activeCall.status === 'accepted' 
                    ? `Dr. ${activeCall.acceptedByDoctorName} has accepted. Entering video consultation...`
                    : 'Call request broadcasted on a First-Come, First-Served basis. Please stay on this screen.'}
                </p>

                {activeCall.status === 'waiting' && (
                  <div className="mt-4 inline-flex items-center gap-2 bg-black/25 px-4 py-1.5 rounded-full text-sm font-mono font-bold tracking-wider">
                    <ClockIcon className="w-4 h-4" />
                    <span>Elapsed: {formatTimer(waitingSeconds)}</span>
                  </div>
                )}
              </div>

              {/* Triage Summary & First-Aid Card */}
              <div className="p-6 sm:p-8 space-y-6">
                
                {/* Priority & Specialty Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Groq AI Assigned Priority
                    </p>
                    <div className="flex items-center gap-2">
                      <span className={`px-3 py-1 rounded-lg text-xs font-extrabold uppercase shadow-sm ${getPriorityBadgeStyle(activeCall.priority)}`}>
                        {activeCall.priority}
                      </span>
                      <span className="font-semibold text-gray-900 text-sm">
                        {activeCall.priorityLabel}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                      Target Doctor / Specialty
                    </p>
                    <p className="font-bold text-gray-900 text-sm flex items-center gap-1.5">
                      <BuildingOfficeIcon className="w-4 h-4 text-teal-600" />
                      {activeCall.targetDoctorName} ({activeCall.recommendedSpecialty})
                    </p>
                  </div>
                </div>

                {/* AI Triage Note */}
                <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
                  <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <SparklesIcon className="w-4 h-4 text-indigo-600" />
                    AI Clinical Triage Summary
                  </h4>
                  <p className="text-sm text-indigo-950 font-medium">
                    {activeCall.triageSummary}
                  </p>
                </div>

                {/* First Aid Tip */}
                {activeCall.firstAidAdvice && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                        Immediate Guidance while waiting
                      </h4>
                      <p className="text-sm text-amber-900 mt-0.5">
                        {activeCall.firstAidAdvice}
                      </p>
                    </div>
                  </div>
                )}

                {/* Patient Problem */}
                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                    Your Reported Problem
                  </p>
                  <p className="text-sm text-gray-800 bg-gray-50 p-3 rounded-xl border border-gray-200">
                    "{activeCall.problemDescription}"
                  </p>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleCancelCall}
                    disabled={activeCall.status === 'accepted'}
                    className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm rounded-xl border border-rose-200 transition-all disabled:opacity-50"
                  >
                    Cancel Call Request
                  </button>

                  <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                    <span>Broadcasting live to available doctors...</span>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* INITIATION FORM (Visible when no active call) */}
        {!activeCall && (
          <form onSubmit={handleStartInstantCall} className="bg-white rounded-3xl shadow-md border border-gray-200 p-6 sm:p-8 space-y-6">
            
            {/* Step 1: Problem Description */}
            <div>
              <label className="block text-sm font-bold text-gray-900 mb-1.5">
                1. Describe Your Problem or Symptoms <span className="text-rose-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                Be specific about what you are feeling, when it started, and how severe it is.
              </p>
              <textarea
                rows={3}
                value={problemDescription}
                onChange={(e) => setProblemDescription(e.target.value)}
                placeholder="e.g. Sudden high fever with severe throat pain since morning, difficulty swallowing..."
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 text-gray-900 text-sm font-medium placeholder-gray-400"
                required
              />

              {/* Quick Tag Pills */}
              <div className="mt-3">
                <span className="text-xs font-semibold text-gray-600 mb-1.5 block">
                  Quick Symptoms (click to toggle):
                </span>
                <div className="flex flex-wrap gap-2">
                  {COMMON_SYMPTOM_TAGS.map((tag) => {
                    const isSelected = selectedSymptoms.includes(tag.value);
                    const IconComponent = tag.icon;
                    return (
                      <button
                        key={tag.value}
                        type="button"
                        onClick={() => toggleSymptom(tag.value)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                          isSelected
                            ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                            : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                        }`}
                      >
                        <IconComponent className={`w-3.5 h-3.5 ${isSelected ? 'text-white' : 'text-teal-600'}`} />
                        <span>{tag.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 2: Target Doctor Selection */}
            <div className="border-t border-gray-100 pt-6">
              <label className="block text-sm font-bold text-gray-900 mb-2">
                2. Choose Call Mode
              </label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setTargetType('any');
                    setSelectedDoctor(null);
                  }}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    targetType === 'any'
                      ? 'border-teal-600 bg-teal-50/60 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <BoltIcon className="w-5 h-5 text-teal-600" />
                    <span className="font-bold text-gray-900 text-sm">
                      Any Available Doctor (Fastest)
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Broadcast to all active doctors. First doctor to accept joins immediately (First-Come, First-Served).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setTargetType('specific')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${
                    targetType === 'specific'
                      ? 'border-teal-600 bg-teal-50/60 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <UserIcon className="w-5 h-5 text-teal-600" />
                    <span className="font-bold text-gray-900 text-sm">
                      Choose Specific Doctor
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Search and target a doctor of your choice by name or specialization.
                  </p>
                </button>
              </div>

              {/* Specific Doctor Search and List */}
              {targetType === 'specific' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="relative">
                    <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={doctorSearch}
                      onChange={(e) => setDoctorSearch(e.target.value)}
                      placeholder="Search doctor by name or specialty (e.g., General, Cardiology)..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-300 text-xs text-gray-900 focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                    />
                  </div>

                  {loadingDoctors ? (
                    <div className="py-4 text-center">
                      <LoadingSpinner />
                    </div>
                  ) : filteredDoctors.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-4">No matching doctors found.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                      {filteredDoctors.map((doc) => {
                        const isSelected = selectedDoctor?.id === doc.id;
                        return (
                          <div
                            key={doc.id}
                            onClick={() => setSelectedDoctor(doc)}
                            className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                              isSelected
                                ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                                : 'bg-white hover:border-teal-400 border-gray-200 text-gray-800'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-bold">{doc.name || 'Dr. HealthBridge'}</p>
                              <p className={`text-[11px] ${isSelected ? 'text-teal-100' : 'text-gray-500'}`}>
                                {doc.specialization || doc.specialty || 'General Physician'}
                              </p>
                            </div>
                            {isSelected && (
                              <CheckCircleIcon className="w-5 h-5 text-white flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedDoctor && (
                    <p className="text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200">
                      Selected: <strong>{selectedDoctor.name}</strong> ({selectedDoctor.specialization || 'General Physician'})
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Launch Button */}
            <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <ShieldCheckIcon className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>Encrypted video room • Medical triage guided by Groq AI</span>
              </div>

              <button
                type="submit"
                disabled={isAnalyzing}
                className="px-6 py-3.5 bg-gradient-to-r from-rose-600 via-red-600 to-amber-600 hover:from-rose-700 hover:to-amber-700 text-white font-extrabold text-sm rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Triaging with Groq AI...</span>
                  </>
                ) : (
                  <>
                    <BoltIcon className="w-5 h-5 text-yellow-300" />
                    <span>Start Instant Call (FCFS)</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>

          </form>
        )}

      </div>
    </div>
  );
};

export default InstantCallPage;
